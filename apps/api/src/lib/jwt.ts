import jwt from 'jsonwebtoken';

export const AUTH_COOKIE_NAME = 'maida_token';

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
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
