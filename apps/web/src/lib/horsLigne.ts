// File d'attente hors ligne de la caisse : les commandes prises sans réseau
// sont stockées localement puis rejouées dès que la connexion revient.
// Chaque commande porte une clé d'idempotence : la resynchroniser deux fois
// ne crée jamais de doublon côté serveur.
import { api, ErreurReseau, type TableCaisse } from './api';
import { reseauCoupe, sAbonnerReseau } from './reseau';

export interface CommandeEnAttente {
  cleIdempotence: string;
  creeLe: string;
  description: string;
  total: number;
  donnees: {
    canal: 'SUR_PLACE' | 'EMPORTER';
    tableId?: string;
    noteCuisine?: string;
    lignes: Array<{
      produitId: string;
      quantite: number;
      options?: Array<{ groupeOptionId: string; optionValeurId: string }>;
      suite?: number;
    }>;
  };
}

export interface PaiementEnAttente {
  clePaiement: string;
  creeLe: string;
  description: string;
  montant: number;
  moyenPaiement: 'ESPECES' | 'CARTE' | 'CHEQUE' | 'AUTRE';
  montantRecu?: number;
  // Cible du paiement : une addition connue du serveur, OU une commande
  // locale (l'additionId sera résolu après la synchronisation des commandes).
  additionId?: string;
  cleCommandeLocale?: string;
}

const CLE_FILE = 'maida.commandesEnAttente';
const CLE_FILE_PAIEMENTS = 'maida.paiementsEnAttente';
// Correspondance clé de commande locale → additionId serveur, persistée pour
// survivre à une coupure qui reviendrait en plein milieu d'une synchronisation.
const CLE_MAP_ADDITIONS = 'maida.additionsSynchronisees';
const CLE_CACHE = 'maida.cache.';

type Abonne = () => void;
const abonnes = new Set<Abonne>();
let syncEnCours = false;
let minuterie: ReturnType<typeof setInterval> | null = null;

function notifier() {
  for (const abonne of abonnes) abonne();
}

export function sAbonnerFileAttente(abonne: Abonne): () => void {
  abonnes.add(abonne);
  return () => abonnes.delete(abonne);
}

export function lireFileAttente(): CommandeEnAttente[] {
  try {
    return JSON.parse(localStorage.getItem(CLE_FILE) ?? '[]') as CommandeEnAttente[];
  } catch {
    return [];
  }
}

function ecrireFileAttente(file: CommandeEnAttente[]) {
  localStorage.setItem(CLE_FILE, JSON.stringify(file));
  notifier();
}

/**
 * Clé d'idempotence, générée AVANT l'envoi. La caisse la joint à sa requête en
 * ligne et la réutilise si elle doit retomber sur la file : une requête partie
 * mais restée sans réponse (réseau muet, délai dépassé) ne peut donc pas créer
 * un doublon — le serveur reconnaît la clé et renvoie l'existant.
 */
export function nouvelleCle(prefixe: 'hl' | 'hlp'): string {
  return `${prefixe}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function mettreEnAttente(
  commande: Omit<CommandeEnAttente, 'cleIdempotence' | 'creeLe'>,
  cleIdempotence: string = nouvelleCle('hl'),
): CommandeEnAttente {
  const entree: CommandeEnAttente = {
    ...commande,
    cleIdempotence,
    creeLe: new Date().toISOString(),
  };
  ecrireFileAttente([...lireFileAttente(), entree]);
  return entree;
}

// --- File des paiements hors ligne ---

export function lirePaiementsEnAttente(): PaiementEnAttente[] {
  try {
    return JSON.parse(localStorage.getItem(CLE_FILE_PAIEMENTS) ?? '[]') as PaiementEnAttente[];
  } catch {
    return [];
  }
}

function ecrirePaiementsEnAttente(file: PaiementEnAttente[]) {
  localStorage.setItem(CLE_FILE_PAIEMENTS, JSON.stringify(file));
  notifier();
}

export function mettrePaiementEnAttente(
  paiement: Omit<PaiementEnAttente, 'clePaiement' | 'creeLe'>,
): PaiementEnAttente {
  const entree: PaiementEnAttente = {
    ...paiement,
    clePaiement: `hlp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    creeLe: new Date().toISOString(),
  };
  ecrirePaiementsEnAttente([...lirePaiementsEnAttente(), entree]);
  return entree;
}

export function nombreEnAttente(): number {
  return lireFileAttente().length + lirePaiementsEnAttente().length;
}

function lireMapAdditions(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CLE_MAP_ADDITIONS) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function memoriserAddition(cleCommande: string, additionId: string) {
  const map = lireMapAdditions();
  map[cleCommande] = additionId;
  // On borne la taille : seules les entrées récentes servent à la résolution.
  const cles = Object.keys(map);
  if (cles.length > 200) {
    for (const cle of cles.slice(0, cles.length - 200)) delete map[cle];
  }
  localStorage.setItem(CLE_MAP_ADDITIONS, JSON.stringify(map));
}

export interface ResultatSync {
  commandes: number;
  paiements: number;
  erreurs: string[];
}

// Rejoue les files dans l'ordre : les commandes d'abord (leur synchronisation
// donne l'additionId), puis les paiements. S'arrête à la première coupure
// réseau ; une erreur métier est signalée mais ne bloque pas la suite.
export async function synchroniser(): Promise<ResultatSync> {
  if (syncEnCours) return { commandes: 0, paiements: 0, erreurs: [] };
  // Réseau connu comme muet : on ne rejoue rien, la sonde préviendra du retour.
  if (reseauCoupe()) return { commandes: 0, paiements: 0, erreurs: [] };
  syncEnCours = true;
  const erreurs: string[] = [];
  let commandes = 0;
  let paiements = 0;
  try {
    for (const entree of lireFileAttente()) {
      try {
        const commande = await api.creerCommande({
          ...entree.donnees,
          cleIdempotence: entree.cleIdempotence,
          creeLeHorsLigne: entree.creeLe,
        });
        memoriserAddition(entree.cleIdempotence, commande.additionId);
        commandes += 1;
        ecrireFileAttente(lireFileAttente().filter((e) => e.cleIdempotence !== entree.cleIdempotence));
      } catch (err) {
        if (err instanceof ErreurReseau) {
          syncEnCours = false;
          return { commandes, paiements, erreurs }; // toujours hors ligne
        }
        erreurs.push(
          `${entree.description} : ${err instanceof Error ? err.message : 'erreur inconnue'}`,
        );
        ecrireFileAttente(lireFileAttente().filter((e) => e.cleIdempotence !== entree.cleIdempotence));
      }
    }

    const mapAdditions = lireMapAdditions();
    for (const entree of lirePaiementsEnAttente()) {
      const additionId = entree.additionId ?? mapAdditions[entree.cleCommandeLocale ?? ''];
      const retirer = () =>
        ecrirePaiementsEnAttente(
          lirePaiementsEnAttente().filter((e) => e.clePaiement !== entree.clePaiement),
        );
      if (!additionId) {
        // La commande cible n'a jamais pu être synchronisée (erreur métier).
        erreurs.push(`${entree.description} : la commande liée n'a pas pu être synchronisée`);
        retirer();
        continue;
      }
      try {
        await api.creerPaiement(additionId, {
          mode: 'MONTANT',
          montant: entree.montant,
          moyenPaiement: entree.moyenPaiement,
          montantRecu: entree.montantRecu,
          cleIdempotence: entree.clePaiement,
          creeLeHorsLigne: entree.creeLe,
        });
        paiements += 1;
        retirer();
      } catch (err) {
        if (err instanceof ErreurReseau) break;
        erreurs.push(
          `${entree.description} : ${err instanceof Error ? err.message : 'erreur inconnue'}`,
        );
        retirer();
      }
    }
  } finally {
    syncEnCours = false;
  }
  return { commandes, paiements, erreurs };
}

// À appeler une fois au démarrage de l'espace caisse.
export function demarrerSynchronisation(onResultat?: (r: ResultatSync) => void) {
  const lancer = async () => {
    if (nombreEnAttente() === 0) return;
    const resultat = await synchroniser();
    if (
      (resultat.commandes > 0 || resultat.paiements > 0 || resultat.erreurs.length > 0) &&
      onResultat
    ) {
      onResultat(resultat);
    }
  };
  window.addEventListener('online', lancer);
  // Le retour du réseau détecté par la sonde déclenche la synchronisation sans
  // attendre le prochain tour de minuterie : le service reprend tout de suite.
  sAbonnerReseau(() => {
    if (!reseauCoupe()) lancer();
  });
  if (!minuterie) {
    minuterie = setInterval(lancer, 15_000);
  }
  lancer();
}

// --- Cache local de secours (menu, tables, utilisateur) ---

export function sauvegarderCache(cle: string, valeur: unknown) {
  try {
    localStorage.setItem(CLE_CACHE + cle, JSON.stringify(valeur));
  } catch {
    // stockage plein ou indisponible : le cache est un confort, pas une exigence
  }
}

export function lireCache<T>(cle: string): T | null {
  try {
    const brut = localStorage.getItem(CLE_CACHE + cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}

// --- Ce qui reste encaissable pendant une coupure ---

export interface CibleHorsLigne {
  cle: string;
  libelle: string;
  // Montant facturable connu, avant déduction des paiements en file.
  total: number;
  // Déjà encaissé hors ligne sur cette addition (paiements encore en file).
  dejaPaye: number;
  solde: number;
  // Cible du paiement : une addition connue du serveur, ou une commande prise
  // hors ligne dont l'addition n'existe pas encore.
  additionId?: string;
  cleCommandeLocale?: string;
  tableId?: string;
}

/**
 * Reconstruit les additions encaissables à partir du dernier état connu des
 * tables (qui porte le solde de chaque addition ouverte) et des commandes
 * prises hors ligne. Les paiements déjà mis en file sont déduits — un
 * encaissement partiel hors ligne laisse donc bien un reste à payer.
 */
export function ciblesHorsLigne(): CibleHorsLigne[] {
  const arrondi = (n: number) => Math.round(n * 100) / 100;
  const tables = lireCache<TableCaisse[]>('tables') ?? [];

  const entrees: CibleHorsLigne[] = tables
    .filter((t) => t.addition !== null)
    .map((t) => ({
      cle: t.addition!.id,
      libelle: `Table ${t.numero}`,
      total: t.addition!.solde,
      dejaPaye: 0,
      solde: t.addition!.solde,
      additionId: t.addition!.id,
      tableId: t.id,
    }));

  // Les commandes locales s'ajoutent à l'addition de leur table, ou créent leur
  // propre entrée (nouvelle table occupée hors ligne, ou vente à emporter).
  for (const commande of lireFileAttente()) {
    const tableId = commande.donnees.canal === 'SUR_PLACE' ? commande.donnees.tableId : undefined;
    const existante = tableId ? entrees.find((e) => e.tableId === tableId) : undefined;
    if (existante) {
      existante.total = arrondi(existante.total + commande.total);
      if (!existante.additionId && !existante.cleCommandeLocale) {
        existante.cleCommandeLocale = commande.cleIdempotence;
      }
      continue;
    }
    const table = tableId ? tables.find((t) => t.id === tableId) : undefined;
    const heure = new Date(commande.creeLe).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    entrees.push({
      cle: commande.cleIdempotence,
      libelle: table ? `Table ${table.numero}` : `À emporter (${heure})`,
      total: commande.total,
      dejaPaye: 0,
      solde: commande.total,
      cleCommandeLocale: commande.cleIdempotence,
      tableId,
    });
  }

  const paiements = lirePaiementsEnAttente();
  for (const entree of entrees) {
    entree.dejaPaye = arrondi(
      paiements
        .filter(
          (p) =>
            (entree.additionId && p.additionId === entree.additionId) ||
            (entree.cleCommandeLocale && p.cleCommandeLocale === entree.cleCommandeLocale),
        )
        .reduce((s, p) => s + p.montant, 0),
    );
    entree.solde = Math.max(0, arrondi(entree.total - entree.dejaPaye));
  }

  // Une addition soldée hors ligne disparaît des cibles encaissables.
  return entrees.filter((e) => e.solde > 0.01);
}
