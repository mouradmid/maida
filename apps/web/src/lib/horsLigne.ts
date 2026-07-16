// File d'attente hors ligne de la caisse : les commandes prises sans réseau
// sont stockées localement puis rejouées dès que la connexion revient.
// Chaque commande porte une clé d'idempotence : la resynchroniser deux fois
// ne crée jamais de doublon côté serveur.
import { api, ErreurReseau } from './api';

export interface CommandeEnAttente {
  cleIdempotence: string;
  creeLe: string;
  description: string;
  donnees: {
    canal: 'SUR_PLACE' | 'EMPORTER';
    tableId?: string;
    noteCuisine?: string;
    lignes: Array<{
      produitId: string;
      quantite: number;
      options?: Array<{ groupeOptionId: string; optionValeurId: string }>;
    }>;
  };
}

const CLE_FILE = 'maida.commandesEnAttente';
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

export function mettreEnAttente(commande: Omit<CommandeEnAttente, 'cleIdempotence' | 'creeLe'>): CommandeEnAttente {
  const entree: CommandeEnAttente = {
    ...commande,
    cleIdempotence: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    creeLe: new Date().toISOString(),
  };
  ecrireFileAttente([...lireFileAttente(), entree]);
  return entree;
}

// Rejoue la file dans l'ordre. S'arrête à la première coupure réseau ;
// une erreur métier (produit désactivé pendant la coupure...) est signalée
// mais n'empêche pas les commandes suivantes de partir.
export async function synchroniser(): Promise<{ envoyees: number; erreurs: string[] }> {
  if (syncEnCours) return { envoyees: 0, erreurs: [] };
  syncEnCours = true;
  const erreurs: string[] = [];
  let envoyees = 0;
  try {
    for (const entree of lireFileAttente()) {
      try {
        await api.creerCommande({
          ...entree.donnees,
          cleIdempotence: entree.cleIdempotence,
          creeLeHorsLigne: entree.creeLe,
        });
        envoyees += 1;
        ecrireFileAttente(lireFileAttente().filter((e) => e.cleIdempotence !== entree.cleIdempotence));
      } catch (err) {
        if (err instanceof ErreurReseau) break; // toujours hors ligne, on réessaiera
        // Erreur métier : la commande ne pourra jamais partir telle quelle,
        // on la retire pour ne pas bloquer la file, et on prévient.
        erreurs.push(
          `${entree.description} : ${err instanceof Error ? err.message : 'erreur inconnue'}`,
        );
        ecrireFileAttente(lireFileAttente().filter((e) => e.cleIdempotence !== entree.cleIdempotence));
      }
    }
  } finally {
    syncEnCours = false;
  }
  return { envoyees, erreurs };
}

// À appeler une fois au démarrage de l'espace caisse.
export function demarrerSynchronisation(onResultat?: (r: { envoyees: number; erreurs: string[] }) => void) {
  const lancer = async () => {
    if (lireFileAttente().length === 0) return;
    const resultat = await synchroniser();
    if ((resultat.envoyees > 0 || resultat.erreurs.length > 0) && onResultat) onResultat(resultat);
  };
  window.addEventListener('online', lancer);
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
