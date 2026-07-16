import bcrypt from 'bcryptjs';
import { Router } from 'express';
import type { Utilisateur } from '../generated/prisma/client';
import { AUTH_COOKIE_NAME, signToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';

export const authRouter = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 8 * 60 * 60 * 1000,
};

function toPublicUser(utilisateur: Utilisateur) {
  return {
    id: utilisateur.id,
    email: utilisateur.email,
    nom: utilisateur.nom,
    prenom: utilisateur.prenom,
    role: utilisateur.role,
    droits: utilisateur.droits,
    compteClientId: utilisateur.compteClientId,
    etablissementId: utilisateur.etablissementId,
  };
}

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email et mot de passe requis' });
    return;
  }

  const utilisateur = await prisma.utilisateur.findUnique({
    where: { email },
    include: { compteClient: { select: { statut: true } } },
  });

  if (!utilisateur || !utilisateur.motDePasseHash || utilisateur.statut !== 'ACTIF') {
    res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    return;
  }

  const motDePasseValide = await bcrypt.compare(password, utilisateur.motDePasseHash);
  if (!motDePasseValide) {
    res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    return;
  }

  if (utilisateur.compteClient?.statut === 'SUSPENDU') {
    res.status(403).json({ error: 'Ce compte est suspendu. Contactez Maïda pour le réactiver.' });
    return;
  }

  const token = signToken({ sub: utilisateur.id, role: utilisateur.role });
  res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json(toPublicUser(utilisateur));
});

authRouter.post('/login-pin', async (req, res) => {
  const { etablissementId, codePin } = req.body ?? {};

  if (typeof etablissementId !== 'string' || typeof codePin !== 'string') {
    res.status(400).json({ error: 'Établissement et code PIN requis' });
    return;
  }

  const serveurs = await prisma.utilisateur.findMany({
    where: {
      etablissementId,
      role: 'SERVEUR',
      statut: 'ACTIF',
      codePinHash: { not: null },
      compteClient: { statut: 'ACTIF' },
    },
  });

  let serveurTrouve: Utilisateur | null = null;
  for (const serveur of serveurs) {
    if (serveur.codePinHash && (await bcrypt.compare(codePin, serveur.codePinHash))) {
      serveurTrouve = serveur;
      break;
    }
  }

  if (!serveurTrouve) {
    res.status(401).json({ error: 'Code PIN incorrect' });
    return;
  }

  const token = signToken({ sub: serveurTrouve.id, role: serveurTrouve.role });
  res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json(toPublicUser(serveurTrouve));
});

// Provisoire : permet au terminal caisse de choisir son établissement au login.
// Plus tard, chaque terminal sera associé à son établissement automatiquement.
authRouter.get('/etablissements', async (_req, res) => {
  const etablissements = await prisma.etablissement.findMany({
    where: { statut: 'ACTIF', compteClient: { statut: 'ACTIF' } },
    select: { id: true, nom: true, ville: true },
    orderBy: { nom: 'asc' },
  });
  res.json(etablissements);
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: req.user!.id },
    include: { compteClient: { select: { statut: true } } },
  });

  if (!utilisateur || utilisateur.statut !== 'ACTIF') {
    res.status(401).json({ error: 'Non authentifié' });
    return;
  }

  if (utilisateur.compteClient?.statut === 'SUSPENDU') {
    res.status(403).json({ error: 'Ce compte est suspendu. Contactez Maïda pour le réactiver.' });
    return;
  }

  res.json(toPublicUser(utilisateur));
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME);
  res.status(204).send();
});
