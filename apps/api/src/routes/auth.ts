import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Utilisateur } from '../generated/prisma/client';
import { AUTH_COOKIE_NAME, signToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { journaliserConnexion, normaliserCodeTerminal } from '../lib/securite';
import { requireAuth } from '../middleware/requireAuth';

export const authRouter = Router();

const enTest = process.env.NODE_ENV === 'test';

// Connexion par mot de passe : limitée par IP. Seules les tentatives ÉCHOUÉES
// comptent, l'usage normal n'est jamais bloqué.
const limiteMotDePasse = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: enTest ? 10_000 : 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

// Connexion par PIN : limitée par ÉTABLISSEMENT, pas par IP.
//
// Toute l'équipe partage le wifi du restaurant : compter par IP revenait à
// bloquer la caisse entière parce qu'un serveur s'était trompé dix fois. À
// l'inverse, compter par établissement isole vraiment l'acharnement sur un
// code — et une connexion réussie remet le compteur à zéro (voir plus bas),
// donc une équipe qui travaille ne se bloque jamais elle-même.
const limitePin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: enTest ? 10_000 : 15,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const id = (req.body as { etablissementId?: unknown })?.etablissementId;
    return typeof id === 'string' && id ? `etab:${id}` : `ip:${req.ip}`;
  },
  message: {
    error:
      'Trop de codes PIN incorrects sur cette caisse. Patientez quelques minutes, ou connectez-vous en gérant.',
  },
});

// Rattachement d'une tablette à son établissement : limité par IP, c'est le
// seul repère disponible avant de savoir de quel restaurant il s'agit.
const limiteTerminal = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: enTest ? 10_000 : 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

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

authRouter.post('/login', limiteMotDePasse, async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email et mot de passe requis' });
    return;
  }

  const utilisateur = await prisma.utilisateur.findUnique({
    where: { email },
    include: { compteClient: { select: { statut: true } }, etablissement: { select: { nom: true } } },
  });

  if (!utilisateur || !utilisateur.motDePasseHash || utilisateur.statut !== 'ACTIF') {
    await journaliserConnexion(req, {
      type: 'MOT_DE_PASSE',
      resultat: 'IDENTIFIANTS_INVALIDES',
      acteur: email,
    });
    res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    return;
  }

  const motDePasseValide = await bcrypt.compare(password, utilisateur.motDePasseHash);
  if (!motDePasseValide) {
    await journaliserConnexion(req, {
      type: 'MOT_DE_PASSE',
      resultat: 'IDENTIFIANTS_INVALIDES',
      acteur: email,
      utilisateurId: utilisateur.id,
    });
    res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    return;
  }

  if (utilisateur.compteClient?.statut === 'SUSPENDU') {
    await journaliserConnexion(req, {
      type: 'MOT_DE_PASSE',
      resultat: 'COMPTE_SUSPENDU',
      acteur: email,
      utilisateurId: utilisateur.id,
    });
    res.status(403).json({ error: 'Ce compte est suspendu. Contactez Maïda pour le réactiver.' });
    return;
  }

  await journaliserConnexion(req, {
    type: 'MOT_DE_PASSE',
    resultat: 'REUSSIE',
    acteur: `${utilisateur.prenom} ${utilisateur.nom}`,
    utilisateurId: utilisateur.id,
    etablissementId: utilisateur.etablissementId,
    etablissement: utilisateur.etablissement?.nom ?? null,
  });

  const token = signToken({ sub: utilisateur.id, role: utilisateur.role });
  res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json(toPublicUser(utilisateur));
});

/**
 * Rattache une tablette à son établissement, une fois pour toutes.
 *
 * Remplace l'ancienne liste publique des établissements, qui exposait le
 * portefeuille client de Maïda à qui voulait le lire.
 */
authRouter.post('/terminal', limiteTerminal, async (req, res) => {
  const { code } = req.body ?? {};

  if (typeof code !== 'string' || !code.trim()) {
    res.status(400).json({ error: "Code d'installation requis" });
    return;
  }

  const etablissement = await prisma.etablissement.findUnique({
    where: { codeTerminal: normaliserCodeTerminal(code) },
    select: {
      id: true,
      nom: true,
      ville: true,
      statut: true,
      compteClient: { select: { statut: true } },
    },
  });

  // Un code inconnu et un établissement fermé se ressemblent volontairement :
  // rien ne doit permettre de deviner qu'un code existe.
  if (
    !etablissement ||
    etablissement.statut !== 'ACTIF' ||
    etablissement.compteClient.statut !== 'ACTIF'
  ) {
    res.status(404).json({ error: "Code d'installation inconnu" });
    return;
  }

  res.json({ id: etablissement.id, nom: etablissement.nom, ville: etablissement.ville });
});

authRouter.post('/login-pin', limitePin, async (req, res) => {
  const { etablissementId, codePin } = req.body ?? {};

  if (typeof etablissementId !== 'string' || typeof codePin !== 'string') {
    res.status(400).json({ error: 'Établissement et code PIN requis' });
    return;
  }

  const etablissement = await prisma.etablissement.findUnique({
    where: { id: etablissementId },
    select: { nom: true },
  });

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
    await journaliserConnexion(req, {
      type: 'PIN',
      resultat: 'IDENTIFIANTS_INVALIDES',
      etablissementId,
      etablissement: etablissement?.nom ?? null,
    });
    res.status(401).json({ error: 'Code PIN incorrect' });
    return;
  }

  // Quelqu'un connaît un code valide : l'équipe travaille, ce n'est pas une
  // attaque. On efface le compteur d'échecs pour que des doigts maladroits ne
  // finissent jamais par verrouiller la caisse en plein service.
  limitePin.resetKey(`etab:${etablissementId}`);

  await journaliserConnexion(req, {
    type: 'PIN',
    resultat: 'REUSSIE',
    utilisateurId: serveurTrouve.id,
    acteur: `${serveurTrouve.prenom} ${serveurTrouve.nom}`,
    etablissementId,
    etablissement: etablissement?.nom ?? null,
  });

  const token = signToken({ sub: serveurTrouve.id, role: serveurTrouve.role });
  res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json(toPublicUser(serveurTrouve));
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
