import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { DroitUtilisateur } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { getContexteGerant } from './partage';

export const equipeRouter = Router();

const SELECT_SERVEUR = {
  id: true,
  nom: true,
  prenom: true,
  statut: true,
  droits: true,
  creeLe: true,
} as const;

equipeRouter.get('/serveurs', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const serveurs = await prisma.utilisateur.findMany({
    where: { etablissementId, role: 'SERVEUR' },
    select: SELECT_SERVEUR,
    orderBy: { creeLe: 'desc' },
  });

  res.json(serveurs);
});

// Liste dérivée de l'énumération Prisma : ajouter un droit au schéma suffit
// désormais à le rendre attribuable. GERER_STOCK avait été oublié ici alors que
// l'écran « Équipe » le proposait déjà — le gérant recevait un 400.
const DROITS_VALIDES = Object.values(DroitUtilisateur);

equipeRouter.patch('/serveurs/:id/droits', async (req, res) => {
  const { droits } = req.body ?? {};

  if (!Array.isArray(droits) || droits.some((d) => !DROITS_VALIDES.includes(d as DroitUtilisateur))) {
    res.status(400).json({ error: 'Droits invalides' });
    return;
  }

  const { etablissementId } = await getContexteGerant(req.user!.id);

  const serveur = await prisma.utilisateur.findFirst({
    where: { id: req.params.id, etablissementId, role: 'SERVEUR' },
  });
  if (!serveur) {
    res.status(404).json({ error: 'Serveur introuvable' });
    return;
  }

  const majApres = await prisma.utilisateur.update({
    where: { id: serveur.id },
    data: { droits: [...new Set(droits as DroitUtilisateur[])] },
    select: SELECT_SERVEUR,
  });

  res.json(majApres);
});

equipeRouter.post('/serveurs', async (req, res) => {
  const { nom, prenom, codePin } = req.body ?? {};

  if (typeof nom !== 'string' || !nom.trim() || typeof prenom !== 'string' || !prenom.trim()) {
    res.status(400).json({ error: 'Nom et prénom requis' });
    return;
  }
  if (typeof codePin !== 'string' || !/^\d{4}$/.test(codePin)) {
    res.status(400).json({ error: 'Le code PIN doit contenir exactement 4 chiffres' });
    return;
  }

  const { compteClientId, etablissementId } = await getContexteGerant(req.user!.id);

  const serveursExistants = await prisma.utilisateur.findMany({
    where: { etablissementId, role: 'SERVEUR', codePinHash: { not: null } },
    select: { codePinHash: true },
  });

  for (const s of serveursExistants) {
    if (s.codePinHash && (await bcrypt.compare(codePin, s.codePinHash))) {
      res.status(409).json({ error: 'Ce code PIN est déjà utilisé dans cet établissement' });
      return;
    }
  }

  const codePinHash = await bcrypt.hash(codePin, 12);

  const serveur = await prisma.utilisateur.create({
    data: {
      role: 'SERVEUR',
      nom,
      prenom,
      codePinHash,
      compteClientId,
      etablissementId,
    },
  });

  res.status(201).json({
    id: serveur.id,
    nom: serveur.nom,
    prenom: serveur.prenom,
    role: serveur.role,
    statut: serveur.statut,
  });
});
