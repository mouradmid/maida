import jwt from 'jsonwebtoken';

export const AUTH_COOKIE_NAME = 'maida_token';

// Partagées par la connexion et par le changement d'établissement d'un gérant :
// les deux réémettent le même cookie de session.
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 8 * 60 * 60 * 1000,
};

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET doit être défini dans .env');
  }
  return secret;
}

const JWT_SECRET: string = getSecret();

export interface TokenPayload {
  sub: string;
  role: 'SUPER_ADMIN' | 'GERANT' | 'SERVEUR';
  // Établissement sur lequel travaille cette session. N'existe que pour un
  // gérant qui en administre plusieurs et a choisi lequel regarder : la
  // sélection vit donc dans la session, pas en base — deux appareils peuvent
  // ainsi être ouverts sur deux restaurants différents. Absent = l'établissement
  // de rattachement de la personne. Toujours revalidé côté serveur : un jeton
  // trafiqué ne donne accès à rien.
  etab?: string;
  // Posé par jsonwebtoken à la signature (en secondes). Sert à savoir si une
  // session est antérieure à un changement de mot de passe.
  iat?: number;
}

// L'algorithme est imposé à la vérification : un jeton ne doit jamais pouvoir
// choisir lui-même comment il est contrôlé.
const ALGORITHME = 'HS256' as const;

// Deux sortes de jetons sont signées avec le même secret : les sessions et les
// preuves de rattachement des tablettes. L'audience les sépare, pour qu'aucune
// ne puisse être présentée à la place de l'autre.
const AUDIENCE_SESSION = 'session';
const AUDIENCE_TERMINAL = 'terminal';

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '8h',
    algorithm: ALGORITHME,
    audience: AUDIENCE_SESSION,
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: [ALGORITHME],
    audience: AUDIENCE_SESSION,
  }) as TokenPayload;
}

/**
 * Preuve qu'une tablette a été rattachée à un établissement avec son code
 * d'installation. Elle est exigée pour taper un code PIN : sans elle,
 * l'identifiant d'un restaurant (qui figure en clair sur ses QR codes) ne
 * suffit plus pour essayer des codes depuis Internet. Sans expiration — la
 * tablette reste rattachée tant qu'on ne la détache pas.
 */
export function signerJetonTerminal(etablissementId: string): string {
  return jwt.sign({ etab: etablissementId }, JWT_SECRET, {
    algorithm: ALGORITHME,
    audience: AUDIENCE_TERMINAL,
  });
}

/** L'établissement de la tablette, ou null si la preuve est absente ou fausse. */
export function lireJetonTerminal(jeton: unknown): string | null {
  if (typeof jeton !== 'string' || !jeton) return null;
  try {
    const { etab } = jwt.verify(jeton, JWT_SECRET, {
      algorithms: [ALGORITHME],
      audience: AUDIENCE_TERMINAL,
    }) as { etab?: unknown };
    return typeof etab === 'string' && etab ? etab : null;
  } catch {
    return null;
  }
}
