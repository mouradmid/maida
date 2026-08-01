import { Prisma } from '../../generated/prisma/client';
import { arrondi } from './partage';

// Formes de données partagées par plusieurs écrans de la caisse : ce qu'on
// charge en base (SELECT_/INCLUDE_) et ce qu'on renvoie au front (toPublic…).

// --- Totaux d'une addition ---
//
// Le strict nécessaire au calcul : n'importe quelle addition chargée avec au
// moins ces champs convient, qu'elle vienne du plan de salle ou de l'encaissement.
export const SELECT_TOTAUX = {
  commandes: {
    select: {
      lignes: {
        select: { prixUnitaire: true, quantite: true, quantiteAnnulee: true, quantiteOfferte: true },
      },
    },
  },
  paiements: { select: { montant: true } },
  remises: { select: { type: true, montant: true } },
} satisfies Prisma.AdditionSelect;

export function calculerTotaux(addition: Prisma.AdditionGetPayload<{ select: typeof SELECT_TOTAUX }>) {
  // Les quantités annulées et offertes ne comptent pas dans le facturable,
  // et les remises sur l'addition se déduisent ensuite du total.
  const totalBrut = addition.commandes
    .flatMap((c) => c.lignes)
    .reduce(
      (s, l) => s + Number(l.prixUnitaire) * (l.quantite - l.quantiteAnnulee - l.quantiteOfferte),
      0,
    );
  const montantRemises = addition.remises
    .filter((r) => r.type === 'REMISE')
    .reduce((s, r) => s + Number(r.montant), 0);
  const total = Math.max(0, arrondi(totalBrut - montantRemises));
  const totalPaye = addition.paiements.reduce((s, p) => s + Number(p.montant), 0);
  const solde = Math.max(0, arrondi(total - totalPaye));
  return {
    total,
    totalPaye: arrondi(totalPaye),
    solde,
    montantRemises: arrondi(montantRemises),
  };
}

// --- Commandes ---

export const INCLUDE_COMMANDE = {
  lignes: { include: { options: true } },
  serveur: { select: { nom: true, prenom: true } },
  addition: { include: { table: { select: { numero: true } } } },
} satisfies Prisma.CommandeInclude;

export function toPublicCommande(commande: {
  id: string;
  canal: string;
  noteCuisine: string | null;
  statut: string;
  suiteReclamee: number;
  creeLe: Date;
  serveur: { nom: string; prenom: string };
  addition: { id: string; statut: string; table: { numero: string } | null };
  lignes: Array<{
    id: string;
    nomProduit: string;
    prixUnitaire: unknown;
    tauxTva: number | null;
    suite: number;
    quantite: number;
    quantitePayee: number;
    quantiteAnnulee: number;
    quantiteOfferte: number;
    options: Array<{ id: string; nomGroupe: string; valeur: string }>;
  }>;
}) {
  const lignes = commande.lignes.map((l) => ({
    id: l.id,
    nomProduit: l.nomProduit,
    prixUnitaire: Number(l.prixUnitaire),
    tauxTva: l.tauxTva,
    suite: l.suite,
    quantite: l.quantite,
    quantitePayee: l.quantitePayee,
    quantiteAnnulee: l.quantiteAnnulee,
    quantiteOfferte: l.quantiteOfferte,
    options: l.options.map((o) => ({ nomGroupe: o.nomGroupe, valeur: o.valeur })),
  }));
  // Les quantités annulées et offertes ne comptent pas dans le total facturable.
  const total = lignes.reduce(
    (somme, l) => somme + l.prixUnitaire * (l.quantite - l.quantiteAnnulee - l.quantiteOfferte),
    0,
  );

  return {
    id: commande.id,
    canal: commande.canal,
    noteCuisine: commande.noteCuisine,
    additionId: commande.addition.id,
    additionStatut: commande.addition.statut,
    table: commande.addition.table,
    statut: commande.statut,
    suiteReclamee: commande.suiteReclamee,
    creeLe: commande.creeLe,
    serveur: commande.serveur,
    lignes,
    total,
  };
}

// --- Additions ---

export const INCLUDE_ADDITION = {
  table: { select: { numero: true } },
  commandes: { include: { lignes: true } },
  paiements: true,
  remises: true,
} satisfies Prisma.AdditionInclude;
