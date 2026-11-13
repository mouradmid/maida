// Libellés métier partagés par l'interface, les tickets et les exports.
// Un seul endroit à corriger quand un intitulé change.

import type {
  ModePaiement,
  OccasionReservation,
  RestrictionAlimentaire,
  StatutReservation,
} from './api';

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

// Occasions et restrictions alimentaires d'une réservation : mêmes mots sur la
// page publique, à la caisse et dans l'espace gérant. L'ordre des clés est
// celui de l'affichage.
export const LIBELLES_OCCASION: Record<OccasionReservation, { texte: string; icone: string }> = {
  ANNIVERSAIRE: { texte: 'Anniversaire', icone: '🎂' },
  ROMANTIQUE: { texte: 'Dîner en amoureux', icone: '❤️' },
  AFFAIRES: { texte: "Repas d'affaires", icone: '💼' },
  FAMILLE: { texte: 'Repas de famille', icone: '👨‍👩‍👧' },
  FETE: { texte: 'Fête, célébration', icone: '🎉' },
  AUTRE: { texte: 'Autre occasion', icone: '✨' },
};

export const LIBELLES_RESTRICTION: Record<RestrictionAlimentaire, string> = {
  VEGETARIEN: 'Végétarien',
  VEGAN: 'Végan',
  SANS_GLUTEN: 'Sans gluten',
  SANS_LACTOSE: 'Sans lactose',
  ALLERGIE_ARACHIDES: 'Allergie arachides',
  ALLERGIE_FRUITS_A_COQUE: 'Allergie fruits à coque',
  ALLERGIE_FRUITS_DE_MER: 'Allergie fruits de mer',
};

export const OCCASIONS = Object.keys(LIBELLES_OCCASION) as OccasionReservation[];
export const RESTRICTIONS = Object.keys(LIBELLES_RESTRICTION) as RestrictionAlimentaire[];

// Jours de la semaine dans l'ordre d'un restaurant (lundi d'abord), avec leur
// numéro JavaScript (0 = dimanche).
export const JOURS_SEMAINE: Array<{ numero: number; court: string; long: string }> = [
  { numero: 1, court: 'Lun', long: 'Lundi' },
  { numero: 2, court: 'Mar', long: 'Mardi' },
  { numero: 3, court: 'Mer', long: 'Mercredi' },
  { numero: 4, court: 'Jeu', long: 'Jeudi' },
  { numero: 5, court: 'Ven', long: 'Vendredi' },
  { numero: 6, court: 'Sam', long: 'Samedi' },
  { numero: 0, court: 'Dim', long: 'Dimanche' },
];
