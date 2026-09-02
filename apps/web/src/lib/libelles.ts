// Libellés métier partagés par l'interface, les tickets et les exports.
// Un seul endroit à corriger quand un intitulé change.

import type { ModePaiement, StatutReservation } from './api';

export const LIBELLES_MOYEN: Record<ModePaiement, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  CHEQUE: 'Chèque',
  AUTRE: 'Autre',
};

// Ordre d'affichage stable des moyens de paiement (colonnes d'export, totaux) :
// on ne dépend pas de l'ordre dans lequel la base les renvoie.
export const MOYENS_PAIEMENT: ModePaiement[] = ['ESPECES', 'CARTE', 'CHEQUE', 'AUTRE'];

// Statuts de réservation : un intitulé et une couleur par statut, pour la
// caisse, l'espace gérant et les exports. Les deux écrans en tenaient chacun
// leur copie, et elles avaient fini par diverger — le même statut s'affichait
// « Client arrivé » d'un côté et « Venu » de l'autre.
export const LIBELLES_STATUT_RESERVATION: Record<StatutReservation, { texte: string; classes: string }> =
  {
    A_VENIR: { texte: 'À venir', classes: 'bg-sky-100 text-sky-800' },
    ARRIVEE: { texte: 'Client arrivé', classes: 'bg-green-100 text-green-800' },
    ANNULEE: { texte: 'Annulée', classes: 'bg-stone-100 text-stone-500' },
    NO_SHOW: { texte: 'No-show', classes: 'bg-red-100 text-red-800' },
  };
