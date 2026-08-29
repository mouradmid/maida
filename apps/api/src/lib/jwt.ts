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

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
