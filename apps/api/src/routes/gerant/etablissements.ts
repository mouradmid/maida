import { Router } from 'express';
import { AUTH_COOKIE_NAME, COOKIE_OPTIONS, signToken } from '../../lib/jwt';
import { prisma } from '../../lib/prisma';
import { contexteDe } from './partage';

// Une enseigne peut tenir plusieurs restaurants sous un même compte client. Le
// gérant les administre tous depuis le même identifiant et bascule de l'un à
// l'autre : le choix vit dans sa session, donc deux appareils peuvent rester
// ouverts sur deux restaurants différents.

export const etablissementsRouter = Router();

etablissementsRouter.get('/etablissements', async (req, res) => {
  const { compteClientId, etablissementId } = await contexteDe(req);

  const etablissements = await prisma.etablissement.findMany({
    where: { compteClientId, statut: 'ACTIF' },
    select: { id: true, nom: true, ville: true },
    orderBy: { creeLe: 'asc' },
  });

  res.json({
    actuelId: etablissementId,
    etablissements,
  });
});

etablissementsRouter.post('/etablissement', async (req, res) => {
  const { etablissementId } = req.body ?? {};

  if (typeof etablissementId !== 'string' || !etablissementId) {
    res.status(400).json({ error: 'Établissement requis' });
    return;
  }

  const { compteClientId } = await contexteDe(req);

  // Le seul verrou qui compte : l'établissement demandé doit appartenir au
  // compte client du gérant. Sans ce contrôle, un identifiant deviné donnerait
  // accès aux données d'un autre restaurant.
  const cible = await prisma.etablissement.findFirst({
    where: { id: etablissementId, compteClientId, statut: 'ACTIF' },
    select: { id: true, nom: true, ville: true },
  });
  if (!cible) {
    res.status(404).json({ error: 'Établissement introuvable' });
    return;
  }

  // Nouvelle session portant le choix. `iat` repart à maintenant : sans effet
  // sur la révocation, qui compare à la date du changement de mot de passe.
  const token = signToken({ sub: req.user!.id, role: 'GERANT', etab: cible.id });
  res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json(cible);
});
