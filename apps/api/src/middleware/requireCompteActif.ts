import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// Coupe l'accès des utilisateurs dont le compte client est suspendu par
// l'éditeur. Le super-admin n'a pas de compte client : il n'est jamais bloqué.
export async function requireCompteActif(req: Request, res: Response, next: NextFunction) {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: req.user!.id },
    select: { compteClient: { select: { statut: true } } },
  });

  if (utilisateur?.compteClient?.statut === 'SUSPENDU') {
    res.status(403).json({ error: 'Ce compte est suspendu. Contactez Maïda pour le réactiver.' });
    return;
  }

  next();
}
