// Libellés métier partagés par l'interface, les tickets et les exports.
// Un seul endroit à corriger quand un intitulé change.

import type { ModePaiement } from './api';

export const LIBELLES_MOYEN: Record<ModePaiement, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  CHEQUE: 'Chèque',
  AUTRE: 'Autre',
};

// Ordre d'affichage stable des moyens de paiement (colonnes d'export, totaux) :
// on ne dépend pas de l'ordre dans lequel la base les renvoie.
export const MOYENS_PAIEMENT: ModePaiement[] = ['ESPECES', 'CARTE', 'CHEQUE', 'AUTRE'];
