import type { Request } from 'express';
import { prisma } from '../../lib/prisma';

// Helpers transverses de l'espace gérant : contexte de l'établissement
// administré et lecture de la période demandée par les historiques.

export const arrondi = (n: number) => Math.round(n * 100) / 100;

export async function getContexteGerant(gerantId: string) {
  const gerant = await prisma.utilisateur.findUnique({ where: { id: gerantId } });
  if (!gerant?.etablissementId || !gerant?.compteClientId) {
    throw new Error('Gérant sans établissement associé');
  }
  return { compteClientId: gerant.compteClientId, etablissementId: gerant.etablissementId };
}

// Période optionnelle (?debut=&fin=) des historiques du gérant. Renvoie le
// filtre de date Prisma à appliquer, `plage` absente si aucune borne n'est
// demandée (l'historique reste alors complet), ou `erreur` à renvoyer en 400
// si les bornes sont incomplètes, illisibles ou inversées.
export function plagePeriode(query: Request['query']): {
  plage?: { gte: Date; lte: Date };
  erreur?: string;
} {
  const { debut, fin } = query;
  if (debut === undefined && fin === undefined) return {};
  if (typeof debut !== 'string' || typeof fin !== 'string') {
    return { erreur: 'Période incomplète (debut et fin)' };
  }
  const dateDebut = new Date(debut);
  const dateFin = new Date(fin);
  if (Number.isNaN(dateDebut.getTime()) || Number.isNaN(dateFin.getTime()) || dateDebut > dateFin) {
    return { erreur: 'Période invalide' };
  }
  return { plage: { gte: dateDebut, lte: dateFin } };
}
