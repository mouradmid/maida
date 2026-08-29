import type { Request } from 'express';
import { prisma } from '../../lib/prisma';

// Helpers transverses de l'espace gérant : contexte de l'établissement
// administré et lecture de la période demandée par les historiques.

export const arrondi = (n: number) => Math.round(n * 100) / 100;

/**
 * L'établissement sur lequel porte la requête.
 *
 * Une enseigne peut tenir plusieurs restaurants sous le même compte client. Le
 * gérant en choisit un pour sa session (jeton `etab`) ; à défaut, c'est son
 * établissement de rattachement. **Le choix est revalidé ici à chaque
 * requête** : il doit appartenir au compte client du gérant et être actif,
 * sinon on retombe sur son rattachement. C'est cette vérification, et non le
 * contenu du jeton, qui garantit l'étanchéité entre clients.
 */
export async function getContexteGerant(gerantId: string, etablissementChoisiId?: string) {
  const gerant = await prisma.utilisateur.findUnique({ where: { id: gerantId } });
  if (!gerant?.etablissementId || !gerant?.compteClientId) {
    throw new Error('Gérant sans établissement associé');
  }

  if (etablissementChoisiId && etablissementChoisiId !== gerant.etablissementId) {
    const choisi = await prisma.etablissement.findFirst({
      where: {
        id: etablissementChoisiId,
        compteClientId: gerant.compteClientId,
        statut: 'ACTIF',
      },
      select: { id: true },
    });
    if (choisi) {
      return { compteClientId: gerant.compteClientId, etablissementId: choisi.id };
    }
  }

  return { compteClientId: gerant.compteClientId, etablissementId: gerant.etablissementId };
}

/**
 * Raccourci pour les routes : le contexte tel que la requête le définit.
 * Toutes les routes gérant passent par là — c'est le seul point où la
 * sélection d'établissement entre en jeu.
 */
export function contexteDe(req: Request) {
  return getContexteGerant(req.user!.id, req.user!.etablissementChoisiId);
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
