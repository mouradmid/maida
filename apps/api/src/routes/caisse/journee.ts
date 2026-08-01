import { Router } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { arrondi, getContexteServeur, getJourneeOuverte, resoudreResponsable } from './partage';

export const journeeRouter = Router();

const INCLUDE_JOURNEE = {
  ouvertePar: { select: { nom: true, prenom: true } },
  clotureePar: { select: { nom: true, prenom: true, role: true } },
  clotureDemandeePar: { select: { nom: true, prenom: true } },
} satisfies Prisma.JourneeCaisseInclude;

type JourneeAvecActeurs = Prisma.JourneeCaisseGetPayload<{ include: typeof INCLUDE_JOURNEE }>;

function toPublicJournee(j: JourneeAvecActeurs) {
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
  };
}

async function totauxJournee(journeeCaisseId: string) {
  const groupes = await prisma.paiement.groupBy({
    by: ['moyenPaiement'],
    where: { journeeCaisseId },
    _sum: { montant: true },
    _count: { _all: true },
  });
  const parMoyen = groupes.map((g) => ({
    moyenPaiement: g.moyenPaiement,
    montant: arrondi(Number(g._sum.montant ?? 0)),
    nombre: g._count._all,
  }));
  const total = arrondi(parMoyen.reduce((s, m) => s + m.montant, 0));
  return { parMoyen, total };
}

journeeRouter.get('/journee', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const journee = await prisma.journeeCaisse.findFirst({
    where: { etablissementId, statut: 'OUVERTE' },
    include: INCLUDE_JOURNEE,
    orderBy: { ouverteLe: 'desc' },
  });

  if (!journee) {
    const derniere = await prisma.journeeCaisse.findFirst({
      where: { etablissementId, statut: 'CLOTUREE' },
      include: INCLUDE_JOURNEE,
      orderBy: { clotureeLe: 'desc' },
    });
    res.json({
      journee: null,
      derniereCloture: derniere
        ? { ...toPublicJournee(derniere), totaux: await totauxJournee(derniere.id) }
        : null,
    });
    return;
  }

  const totaux = await totauxJournee(journee.id);
  const especesEncaissees = totaux.parMoyen.find((m) => m.moyenPaiement === 'ESPECES')?.montant ?? 0;
  const additionsOuvertes = await prisma.addition.count({
    where: { etablissementId, statut: 'OUVERTE' },
  });

  res.json({
    journee: toPublicJournee(journee),
    totaux,
    especesAttendues: arrondi(Number(journee.fondDeCaisse) + especesEncaissees),
    additionsOuvertes,
  });
});

journeeRouter.post('/journee/ouverture', async (req, res) => {
  const { fondDeCaisse } = req.body ?? {};

  if (typeof fondDeCaisse !== 'number' || !Number.isFinite(fondDeCaisse) || fondDeCaisse < 0) {
    res.status(400).json({ error: 'Le fond de caisse doit être un nombre positif ou nul' });
    return;
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const existante = await getJourneeOuverte(etablissementId);
  if (existante) {
    res.status(409).json({ error: 'Une journée de caisse est déjà ouverte' });
    return;
  }

  const journee = await prisma.journeeCaisse.create({
    data: { etablissementId, fondDeCaisse: arrondi(fondDeCaisse), ouverteParId: req.user!.id },
    include: INCLUDE_JOURNEE,
  });

  res.status(201).json(toPublicJournee(journee));
});

journeeRouter.post('/journee/cloture', async (req, res) => {
  const { especesComptees, commentaire, codeGerant } = req.body ?? {};

  if (typeof especesComptees !== 'number' || !Number.isFinite(especesComptees) || especesComptees < 0) {
    res
      .status(400)
      .json({ error: 'Le montant des espèces comptées doit être un nombre positif ou nul' });
    return;
  }
  if (commentaire !== undefined && typeof commentaire !== 'string') {
    res.status(400).json({ error: 'Commentaire invalide' });
    return;
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const journee = await getJourneeOuverte(etablissementId);
  if (!journee) {
    res.status(409).json({ error: 'Aucune journée de caisse ouverte' });
    return;
  }

  // On ne clôture pas avec des tables non soldées : tout doit être encaissé ou annulé.
  const additionsOuvertes = await prisma.addition.count({
    where: { etablissementId, statut: 'OUVERTE' },
  });
  if (additionsOuvertes > 0) {
    res.status(409).json({
      error: `Il reste ${additionsOuvertes} addition${additionsOuvertes > 1 ? 's' : ''} ouverte${additionsOuvertes > 1 ? 's' : ''}. Encaissez-les ou annulez-les avant de clôturer.`,
    });
    return;
  }

  const resolution = await resoudreResponsable({
    serveurId: req.user!.id,
    etablissementId,
    droit: 'CLOTURER',
    codeGerant,
    messageDroitManquant:
      "Vous n'avez pas le droit de clôturer la caisse. Un gérant doit valider avec son code.",
  });
  if (!resolution.ok) {
    res.status(resolution.status).json(resolution.body);
    return;
  }

  const totaux = await totauxJournee(journee.id);
  const especesEncaissees = totaux.parMoyen.find((m) => m.moyenPaiement === 'ESPECES')?.montant ?? 0;
  const especesAttendues = arrondi(Number(journee.fondDeCaisse) + especesEncaissees);
  const ecart = arrondi(especesComptees - especesAttendues);
  const commentaireFinal =
    typeof commentaire === 'string' && commentaire.trim() ? commentaire.trim() : null;

  const journeeMaj = await prisma.journeeCaisse.update({
    where: { id: journee.id },
    data: {
      statut: 'CLOTUREE',
      clotureeLe: new Date(),
      especesAttendues,
      especesComptees: arrondi(especesComptees),
      ecart,
      commentaire: commentaireFinal,
      clotureeParId: resolution.responsableId,
      clotureDemandeeParId: resolution.demandeeParId,
    },
    include: INCLUDE_JOURNEE,
  });

  res.json({ ...toPublicJournee(journeeMaj), totaux });
});
