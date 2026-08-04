import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sessionRevoquee } from '../lib/securite';

/**
 * Vérifie, à chaque requête, que l'accès est toujours légitime :
 *
 *  - l'utilisateur existe encore et n'a pas été désactivé (un serveur qui
 *    quitte l'établissement doit perdre la main tout de suite, pas à
 *    l'expiration de son jeton — sinon il garde jusqu'à huit heures le droit
 *    d'encaisser, d'annuler et d'offrir) ;
 *  - son compte client n'a pas été suspendu par l'éditeur ;
 *  - sa session est postérieure au dernier changement de mot de passe.
 *
 * C'est le prix d'une lecture en base par requête, assumé : un jeton signé ne
 * sait pas qu'on vient de licencier quelqu'un. Le super-admin n'a pas de compte
 * client, il n'est jamais bloqué à ce titre.
 */
export async function requireCompteActif(req: Request, res: Response, next: NextFunction) {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: req.user!.id },
    select: {
      statut: true,
      sessionsInvalidesAvant: true,
      compteClient: { select: { statut: true } },
    },
  });

  if (!utilisateur || utilisateur.statut !== 'ACTIF') {
    res.status(401).json({ error: 'Accès révoqué. Reconnectez-vous.' });
    return;
  }

  // Le mot de passe a changé depuis l'ouverture de cette session : elle tombe.
  if (sessionRevoquee(req.user!.emiseLe, utilisateur.sessionsInvalidesAvant)) {
    res.status(401).json({ error: 'Mot de passe modifié. Reconnectez-vous.' });
    return;
  }

  if (utilisateur.compteClient?.statut === 'SUSPENDU') {
    res.status(403).json({ error: 'Ce compte est suspendu. Contactez Maïda pour le réactiver.' });
    return;
  }

  next();
}
