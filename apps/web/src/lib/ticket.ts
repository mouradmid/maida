// Modèle neutre de ticket.
//
// Un ticket est décrit UNE fois sous forme de blocs, puis rendu de deux façons :
//  - en HTML, pour l'impression via le navigateur (lib/impression.ts) ;
//  - en octets ESC/POS, pour parler directement à l'imprimante thermique
//    (lib/escpos.ts), sans boîte de dialogue.
//
// Sans ce modèle, chaque ticket existerait en double et les deux versions
// finiraient par diverger.

import type { AdditionDetail, Commande, ModePaiement } from './api';
import { LIBELLES_MOYEN } from './libelles';

export type BlocTicket =
  // Titre centré, en très gros (destination cuisine) ou en gros (nom du resto).
  | { t: 'titre'; texte: string; taille: 'enorme' | 'grand' }
  // Ligne centrée d'information (date, serveur, adresse).
  | { t: 'centre'; texte: string; petit?: boolean }
  // Article vu par la cuisine : quantité et nom, lisibles de loin.
  | { t: 'article'; texte: string }
  // Précision sous un article (« > sans oignons »).
  | { t: 'option'; texte: string }
  // Encadré d'un service (« SUITE 2 · À SUIVRE »).
  | { t: 'cadre'; texte: string }
  // Libellé à gauche, montant à droite.
  | { t: 'colonnes'; libelle: string; valeur: string; gras?: boolean; petit?: boolean }
  // Consigne mise en avant (note pour la cuisine).
  | { t: 'note'; texte: string }
  | { t: 'separateur' };

export interface Ticket {
  titre: string;
  blocs: BlocTicket[];
}

function dateHeure(date: string | Date) {
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const arrondir = (n: number) => Math.round(n * 100) / 100;

// Un article vu par la cuisine : la quantité et le nom en gros, les options
// dessous.
function blocsArticleCuisine(l: {
  quantite: number;
  quantiteAnnulee: number;
  nomProduit: string;
  options: Array<{ valeur: string }>;
}): BlocTicket[] {
  return [
    { t: 'article', texte: `${l.quantite - l.quantiteAnnulee} x ${l.nomProduit.toUpperCase()}` },
    ...l.options.map((o): BlocTicket => ({ t: 'option', texte: `> ${o.valeur}` })),
  ];
}

// Bon cuisine : sans les prix. Quand la commande couvre plusieurs services,
// chaque suite est encadrée avec son état — « à préparer » maintenant, ou
// « à suivre » en attendant la réclame.
export function ticketCuisine(commande: Commande): Ticket {
  const destination = commande.table ? `TABLE ${commande.table.numero}` : 'À EMPORTER';
  const actives = commande.lignes.filter((l) => l.quantite - l.quantiteAnnulee > 0);
  const suites = [...new Set(actives.map((l) => l.suite))].sort((a, b) => a - b);

  const corps: BlocTicket[] =
    suites.length <= 1 && (suites[0] ?? 1) <= commande.suiteReclamee
      ? actives.flatMap(blocsArticleCuisine)
      : suites.flatMap((suite) => [
          {
            t: 'cadre' as const,
            texte: `SUITE ${suite} · ${
              suite <= commande.suiteReclamee ? 'À PRÉPARER' : 'À SUIVRE — ATTENDRE LA RÉCLAME'
            }`,
          },
          ...actives.filter((l) => l.suite === suite).flatMap(blocsArticleCuisine),
        ]);

  return {
    titre: `Cuisine ${destination}`,
    blocs: [
      { t: 'centre', texte: '— CUISINE —', petit: true },
      { t: 'titre', texte: destination, taille: 'enorme' },
      { t: 'centre', texte: `${dateHeure(commande.creeLe)} · ${commande.serveur.prenom}`, petit: true },
      { t: 'separateur' },
      ...corps,
      ...(commande.noteCuisine
        ? ([{ t: 'separateur' }, { t: 'note', texte: `NOTE : ${commande.noteCuisine}` }] as BlocTicket[])
        : []),
    ],
  };
}

// Bon de réclame : la table demande la suite N, la cuisine lance ces plats.
export function ticketReclame(
  destination: string,
  suite: number,
  lignes: Array<{
    quantite: number;
    quantiteAnnulee: number;
    nomProduit: string;
    options: Array<{ valeur: string }>;
  }>,
): Ticket {
  return {
    titre: `Réclame ${destination}`,
    blocs: [
      { t: 'centre', texte: '— CUISINE —', petit: true },
      { t: 'titre', texte: 'RÉCLAME', taille: 'enorme' },
      { t: 'titre', texte: destination.toUpperCase(), taille: 'enorme' },
      { t: 'centre', texte: dateHeure(new Date()), petit: true },
      { t: 'cadre', texte: `SUITE ${suite} · À PRÉPARER MAINTENANT` },
      ...lignes.filter((l) => l.quantite - l.quantiteAnnulee > 0).flatMap(blocsArticleCuisine),
    ],
  };
}

export interface InfosEnTete {
  nom: string;
  adresse: string | null;
  ville: string | null;
}

function blocsEnTete(etablissement: InfosEnTete): BlocTicket[] {
  const adresse = [etablissement.adresse, etablissement.ville].filter(Boolean).join(', ');
  return [
    { t: 'titre', texte: etablissement.nom, taille: 'grand' },
    ...(adresse ? [{ t: 'centre' as const, texte: adresse, petit: true }] : []),
  ];
}

// Ticket client : l'addition complète, avec TVA, paiements et reste à payer.
export function ticketClient(detail: AdditionDetail, etablissement: InfosEnTete): Ticket {
  const lignes: BlocTicket[] = detail.commandes
    .flatMap((c) => c.lignes)
    .filter((l) => l.quantite - l.quantiteAnnulee > 0)
    .flatMap((l) => {
      const quantiteFacturable = l.quantite - l.quantiteAnnulee - l.quantiteOfferte;
      const blocs: BlocTicket[] = [];
      if (quantiteFacturable > 0) {
        blocs.push({
          t: 'colonnes',
          libelle: `${quantiteFacturable} x ${l.nomProduit}`,
          valeur: `${l.prixUnitaire * quantiteFacturable} DA`,
        });
        if (l.options.length > 0) {
          blocs.push({ t: 'option', texte: `(${l.options.map((o) => o.valeur).join(', ')})` });
        }
      }
      if (l.quantiteOfferte > 0) {
        blocs.push({
          t: 'colonnes',
          libelle: `${l.quantiteOfferte} x ${l.nomProduit} — OFFERT`,
          valeur: '0 DA',
        });
      }
      return blocs;
    });

  const remises: BlocTicket[] = detail.remises
    .filter((r) => r.type === 'REMISE')
    .map((r) => ({
      t: 'colonnes',
      libelle: `Remise${r.pourcentage ? ` ${r.pourcentage} %` : ''} (${r.motif})`,
      valeur: `-${r.montant} DA`,
    }));

  // Récapitulatif TVA : les prix sont TTC, la TVA est extraite et les remises
  // réparties au prorata du TTC de chaque taux.
  const ttcParTaux = new Map<number, number>();
  for (const l of detail.commandes.flatMap((c) => c.lignes)) {
    const quantiteFacturable = l.quantite - l.quantiteAnnulee - l.quantiteOfferte;
    if (quantiteFacturable > 0 && l.tauxTva !== null) {
      ttcParTaux.set(l.tauxTva, (ttcParTaux.get(l.tauxTva) ?? 0) + l.prixUnitaire * quantiteFacturable);
    }
  }
  const totalVentile = [...ttcParTaux.values()].reduce((s, v) => s + v, 0);
  const recapTva: BlocTicket[] = [...ttcParTaux.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([taux, ttcBrut]) => {
      const ttc = Math.max(
        0,
        arrondir(ttcBrut - (totalVentile > 0 ? (detail.montantRemises * ttcBrut) / totalVentile : 0)),
      );
      const ht = arrondir(ttc / (1 + taux / 100));
      return {
        t: 'colonnes',
        libelle: `TVA ${taux} % (HT ${ht})`,
        valeur: `${arrondir(ttc - ht)} DA`,
        petit: true,
      };
    });

  const paiements: BlocTicket[] = detail.paiements.map((p) => {
    const rendu =
      p.montantRecu !== null && p.montantRecu > p.montant
        ? ` (reçu ${p.montantRecu}, rendu ${arrondir(p.montantRecu - p.montant)})`
        : '';
    return {
      t: 'colonnes',
      libelle: `${LIBELLES_MOYEN[p.moyenPaiement]}${rendu}`,
      valeur: `${p.montant} DA`,
      petit: true,
    };
  });

  return {
    titre: `Ticket ${detail.table ? `table ${detail.table.numero}` : 'à emporter'}`,
    blocs: [
      ...blocsEnTete(etablissement),
      { t: 'separateur' },
      {
        t: 'centre',
        texte: `${dateHeure(new Date())} · ${detail.table ? `Table ${detail.table.numero}` : 'À emporter'}`,
        petit: true,
      },
      { t: 'separateur' },
      ...lignes,
      { t: 'separateur' },
      ...remises,
      { t: 'colonnes', libelle: 'TOTAL', valeur: `${detail.total} DA`, gras: true },
      ...recapTva,
      ...(paiements.length > 0
        ? ([
            { t: 'colonnes', libelle: 'Payé', valeur: `${detail.totalPaye} DA` },
            ...paiements,
          ] as BlocTicket[])
        : []),
      ...(detail.solde > 0
        ? ([
            {
              t: 'colonnes',
              libelle: 'RESTE À PAYER',
              valeur: `${detail.solde} DA`,
              gras: true,
            },
          ] as BlocTicket[])
        : []),
      { t: 'separateur' },
      { t: 'centre', texte: 'Merci de votre visite !' },
    ],
  };
}

// Reçu d'un encaissement hors ligne : sans le détail des lignes (l'addition
// complète vit sur le serveur), mais le client repart avec une preuve.
export function ticketRecuHorsLigne(
  etablissement: InfosEnTete,
  libelle: string,
  montant: number,
  moyen: ModePaiement,
  montantRecu: number | null,
): Ticket {
  const rendu = montantRecu !== null && montantRecu > montant ? arrondir(montantRecu - montant) : null;
  const detailMoyen = `${LIBELLES_MOYEN[moyen]}${
    montantRecu !== null ? ` (reçu ${montantRecu}${rendu !== null ? `, rendu ${rendu}` : ''})` : ''
  }`;

  return {
    titre: `Reçu ${libelle}`,
    blocs: [
      ...blocsEnTete(etablissement),
      { t: 'separateur' },
      { t: 'centre', texte: `${dateHeure(new Date())} · ${libelle}`, petit: true },
      { t: 'separateur' },
      { t: 'colonnes', libelle: 'PAYÉ', valeur: `${montant} DA`, gras: true },
      { t: 'colonnes', libelle: detailMoyen, valeur: '', petit: true },
      { t: 'separateur' },
      { t: 'centre', texte: 'Merci de votre visite !' },
    ],
  };
}
