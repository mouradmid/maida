import type { NextFunction, Request, Response } from 'express';
import { AUTH_COOKIE_NAME, verifyToken } from '../lib/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: 'SUPER_ADMIN' | 'GERANT' | 'SERVEUR' };
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
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Session invalide ou expirée' });
  }
}
