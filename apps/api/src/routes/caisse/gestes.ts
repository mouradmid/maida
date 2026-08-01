import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { arrondi, getContexteServeur, resoudreResponsable } from './partage';
import { INCLUDE_ADDITION, calculerTotaux } from './vues';

// Gestes commerciaux : remise sur l'addition et article offert. Tracés au nom
// de qui les accorde (droit REMISER ou validation par code gérant).

export const gestesRouter = Router();

gestesRouter.post('/additions/:id/remise', async (req, res) => {
  const { mode, valeur, motif, commentaire, codeGerant } = req.body ?? {};

  if (mode !== 'POURCENTAGE' && mode !== 'MONTANT') {
    res.status(400).json({ error: 'Mode de remise invalide (POURCENTAGE ou MONTANT)' });
    return;
  }
  if (typeof valeur !== 'number' || !Number.isFinite(valeur) || valeur <= 0) {
    res.status(400).json({ error: 'Valeur de remise invalide' });
    return;
  }
  if (mode === 'POURCENTAGE' && (!Number.isInteger(valeur) || valeur > 100)) {
    res.status(400).json({ error: 'Le pourcentage doit être un entier entre 1 et 100' });
    return;
  }
  if (typeof motif !== 'string' || !motif.trim() || motif.length > 100) {
    res.status(400).json({ error: 'Le motif de la remise est obligatoire' });
    return;
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const addition = await prisma.addition.findUnique({
    where: { id: req.params.id },
    include: INCLUDE_ADDITION,
  });
  if (!addition || addition.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Addition introuvable' });
    return;
  }
  if (addition.statut !== 'OUVERTE') {
    res.status(400).json({ error: 'Cette addition est déjà soldée' });
    return;
  }

  const resolution = await resoudreResponsable({
    serveurId: req.user!.id,
    etablissementId,
    droit: 'REMISER',
    codeGerant,
    messageDroitManquant:
      "Vous n'avez pas le droit d'accorder une remise. Un gérant doit valider avec son code.",
  });
  if (!resolution.ok) {
    res.status(resolution.status).json(resolution.body);
    return;
  }

  const { solde } = calculerTotaux(addition);
  const montantRemise = mode === 'POURCENTAGE' ? arrondi((solde * valeur) / 100) : arrondi(valeur);
  if (montantRemise <= 0) {
    res.status(400).json({ error: 'Le montant de la remise est nul' });
    return;
  }
  if (montantRemise > solde + 0.01) {
    res.status(400).json({ error: `La remise dépasse le solde restant (${solde} DA)` });
    return;
  }

  const resultat = await prisma.$transaction(async (tx) => {
    await tx.remise.create({
      data: {
        type: 'REMISE',
        montant: montantRemise,
        pourcentage: mode === 'POURCENTAGE' ? valeur : null,
        motif: motif.trim(),
        commentaire: typeof commentaire === 'string' && commentaire.trim() ? commentaire.trim() : null,
        etablissementId,
        additionId: addition.id,
        accordeeParId: resolution.responsableId,
        demandeeParId: resolution.demandeeParId,
      },
    });

    const soldeRestant = Math.max(0, arrondi(solde - montantRemise));
    if (soldeRestant <= 0.01) {
      await tx.addition.update({
        where: { id: addition.id },
        data: { statut: 'PAYEE', fermeeLe: new Date() },
      });
    }
    return { soldeRestant, cloturee: soldeRestant <= 0.01 };
  });

  res.status(201).json({
    montant: montantRemise,
    soldeRestant: resultat.soldeRestant,
    additionCloturee: resultat.cloturee,
  });
});

interface LigneAOffrir {
  ligneCommandeId: string;
  quantite: number;
}

gestesRouter.post('/additions/:id/offert', async (req, res) => {
  const { lignes, motif, commentaire, codeGerant } = req.body ?? {};

  if (!Array.isArray(lignes) || lignes.length === 0) {
    res.status(400).json({ error: 'Sélectionnez au moins un article à offrir' });
    return;
  }
  for (const l of lignes as LigneAOffrir[]) {
    if (typeof l?.ligneCommandeId !== 'string' || !Number.isInteger(l?.quantite) || l.quantite <= 0) {
      res.status(400).json({ error: 'Lignes à offrir invalides' });
      return;
    }
  }
  if (typeof motif !== 'string' || !motif.trim() || motif.length > 100) {
    res.status(400).json({ error: "Le motif de l'offert est obligatoire" });
    return;
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const addition = await prisma.addition.findUnique({
    where: { id: req.params.id },
    include: INCLUDE_ADDITION,
  });
  if (!addition || addition.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Addition introuvable' });
    return;
  }
  if (addition.statut !== 'OUVERTE') {
    res.status(400).json({ error: 'Cette addition est déjà soldée' });
    return;
  }

  const lignesParId = new Map(addition.commandes.flatMap((c) => c.lignes).map((l) => [l.id, l]));
  for (const cible of lignes as LigneAOffrir[]) {
    const ligne = lignesParId.get(cible.ligneCommandeId);
    if (!ligne) {
      res.status(400).json({ error: 'Article invalide pour cette addition' });
      return;
    }
    const offrable =
      ligne.quantite - ligne.quantitePayee - ligne.quantiteAnnulee - ligne.quantiteOfferte;
    if (cible.quantite > offrable) {
      res.status(400).json({
        error: `Quantité non offrable pour ${ligne.nomProduit} (reste ${offrable})`,
      });
      return;
    }
  }

  const resolution = await resoudreResponsable({
    serveurId: req.user!.id,
    etablissementId,
    droit: 'REMISER',
    codeGerant,
    messageDroitManquant:
      "Vous n'avez pas le droit d'offrir un article. Un gérant doit valider avec son code.",
  });
  if (!resolution.ok) {
    res.status(resolution.status).json(resolution.body);
    return;
  }

  const motifFinal = motif.trim();
  const commentaireFinal =
    typeof commentaire === 'string' && commentaire.trim() ? commentaire.trim() : null;

  const resultat = await prisma.$transaction(async (tx) => {
    for (const cible of lignes as LigneAOffrir[]) {
      const ligne = lignesParId.get(cible.ligneCommandeId)!;
      await tx.ligneCommande.update({
        where: { id: ligne.id },
        data: { quantiteOfferte: { increment: cible.quantite } },
      });
      await tx.remise.create({
        data: {
          type: 'OFFERT',
          montant: arrondi(Number(ligne.prixUnitaire) * cible.quantite),
          quantite: cible.quantite,
          motif: motifFinal,
          commentaire: commentaireFinal,
          etablissementId,
          additionId: addition.id,
          ligneCommandeId: ligne.id,
          accordeeParId: resolution.responsableId,
          demandeeParId: resolution.demandeeParId,
        },
      });
    }

    // Si plus rien à encaisser après les offerts, l'addition se solde (libère la table).
    const additionApres = await tx.addition.findUniqueOrThrow({
      where: { id: addition.id },
      include: INCLUDE_ADDITION,
    });
    const { solde } = calculerTotaux(additionApres);
    if (solde <= 0.01) {
      await tx.addition.update({
        where: { id: addition.id },
        data: { statut: 'PAYEE', fermeeLe: new Date() },
      });
    }
    return { soldeRestant: solde, cloturee: solde <= 0.01 };
  });

  res.status(201).json({
    soldeRestant: resultat.soldeRestant,
    additionCloturee: resultat.cloturee,
  });
});
