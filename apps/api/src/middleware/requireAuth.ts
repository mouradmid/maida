import type { NextFunction, Request, Response } from 'express';
import { AUTH_COOKIE_NAME, verifyToken } from '../lib/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: 'SUPER_ADMIN' | 'GERANT' | 'SERVEUR';
        // Établissement choisi pour cette session (gérant multi-établissement).
        // Une simple préférence : elle est revalidée à chaque requête contre
        // les établissements du compte client.
        etablissementChoisiId?: string;
        // Date d'émission de la session, pour la comparer à un éventuel
        // changement de mot de passe.
        emiseLe: Date;
      };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Non authentifié' });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      etablissementChoisiId: payload.etab,
      emiseLe: new Date((payload.iat ?? 0) * 1000),
    };
    next();
  } catch {
    res.status(401).json({ error: 'Session invalide ou expirée' });
  }
}
