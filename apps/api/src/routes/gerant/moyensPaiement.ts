import { Router } from 'express';
import { ModePaiement } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { getContexteGerant } from './partage';

// Moyens de paiement acceptés par l'établissement. La liste des moyens
// possibles est dérivée de l'énumération Prisma : en ajouter un au schéma
// suffit à le proposer au gérant.

export const moyensPaiementRouter = Router();

const MOYENS_PAIEMENT_VALIDES = Object.values(ModePaiement);

moyensPaiementRouter.get('/moyens-paiement', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const etablissement = await prisma.etablissement.findUnique({
    where: { id: etablissementId },
    select: { moyensPaiementActifs: true },
  });

  res.json({ actifs: etablissement?.moyensPaiementActifs ?? [], tous: MOYENS_PAIEMENT_VALIDES });
});

moyensPaiementRouter.patch('/moyens-paiement', async (req, res) => {
  const { actifs } = req.body ?? {};

  if (
    !Array.isArray(actifs) ||
    actifs.length === 0 ||
    actifs.some(
      (m: unknown) => typeof m !== 'string' || !MOYENS_PAIEMENT_VALIDES.includes(m as ModePaiement),
    ) ||
    new Set(actifs).size !== actifs.length
  ) {
    res.status(400).json({ error: 'Il faut garder au moins un moyen de paiement actif, sans doublon' });
    return;
  }

  const { etablissementId } = await getContexteGerant(req.user!.id);

  const etablissement = await prisma.etablissement.update({
    where: { id: etablissementId },
    data: { moyensPaiementActifs: actifs },
    select: { moyensPaiementActifs: true },
  });

  res.json({ actifs: etablissement.moyensPaiementActifs, tous: MOYENS_PAIEMENT_VALIDES });
});
