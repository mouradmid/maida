import type { NextFunction, Request, Response } from 'express';

type Role = 'SUPER_ADMIN' | 'GERANT' | 'SERVEUR';

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }
    next();
  };
}
