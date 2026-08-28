import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { arrondi, getContexteGerant, plagePeriode } from './partage';

// Historique des journées de caisse (clôtures), avec les encaissements
// rattachés à chacune.

export const journeesRouter = Router();

// Période optionnelle (?debut=&fin=) : sans elle, on renvoie les 90 dernières
// journées comme avant. Le filtre porte sur l'ouverture de la journée, seule
// date toujours renseignée (une journée en cours n'a pas de clôture).
journeesRouter.get('/journees', async (req, res) => {
  const { plage: ouverteLe, erreur } = plagePeriode(req.query);
  if (erreur) {
    res.status(400).json({ error: erreur });
    return;
  }

  const { etablissementId } = await getContexteGerant(req.user!.id);

  const journees = await prisma.journeeCaisse.findMany({
    where: { etablissementId, ouverteLe },
    include: {
      ouvertePar: { select: { nom: true, prenom: true } },
      clotureePar: { select: { nom: true, prenom: true, role: true } },
      clotureDemandeePar: { select: { nom: true, prenom: true } },
    },
    orderBy: { ouverteLe: 'desc' },
    // Sans période, on plafonne à 90 journées pour l'affichage. Avec une période
    // explicite (export comptable), on laisse passer jusqu'à un an de journées.
    take: ouverteLe ? 400 : 90,
  });

  const totaux = await prisma.paiement.groupBy({
    by: ['journeeCaisseId', 'moyenPaiement'],
    where: { journeeCaisseId: { in: journees.map((j) => j.id) } },
    _sum: { montant: true },
    _count: { _all: true },
  });
  const totauxParJournee = new Map<
    string,
    Array<{ moyenPaiement: string; montant: number; nombre: number }>
  >();
  for (const t of totaux) {
    if (!t.journeeCaisseId) continue;
    const liste = totauxParJournee.get(t.journeeCaisseId) ?? [];
    liste.push({
      moyenPaiement: t.moyenPaiement,
      montant: arrondi(Number(t._sum.montant ?? 0)),
      nombre: t._count._all,
    });
    totauxParJournee.set(t.journeeCaisseId, liste);
  }

  res.json(
    journees.map((j) => {
      const parMoyen = totauxParJournee.get(j.id) ?? [];
      return {
        id: j.id,
        statut: j.statut,
        fondDeCaisse: Number(j.fondDeCaisse),
        ouverteLe: j.ouverteLe,
        clotureeLe: j.clotureeLe,
        especesAttendues: j.especesAttendues !== null ? Number(j.especesAttendues) : null,
        especesComptees: j.especesComptees !== null ? Number(j.especesComptees) : null,
        ecart: j.ecart !== null ? Number(j.ecart) : null,
        commentaire: j.commentaire,
        ouvertePar: j.ouvertePar,
        clotureePar: j.clotureePar,
        clotureDemandeePar: j.clotureDemandeePar,
        totaux: {
          parMoyen,
          total: arrondi(parMoyen.reduce((s, m) => s + m.montant, 0)),
        },
      };
    }),
  );
});
