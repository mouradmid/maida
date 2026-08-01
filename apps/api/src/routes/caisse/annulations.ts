import { Router } from 'express';
import { rendreAuStock } from '../../lib/commandes';
import { prisma } from '../../lib/prisma';
import { getContexteServeur, resoudreResponsable } from './partage';
import { INCLUDE_COMMANDE, toPublicCommande } from './vues';

export const annulationsRouter = Router();

interface LigneAAnnuler {
  ligneCommandeId: string;
  quantite: number;
}

annulationsRouter.post('/commandes/:id/annulation', async (req, res) => {
  const {
    portee,
    lignes,
    motif,
    commentaire,
    codeGerant,
    apresPreparation: dejaPrepareDeclare,
  } = req.body ?? {};

  if (portee !== 'COMMANDE' && portee !== 'LIGNES') {
    res.status(400).json({ error: 'Portée invalide (COMMANDE ou LIGNES)' });
    return;
  }
  if (typeof motif !== 'string' || !motif.trim() || motif.length > 100) {
    res.status(400).json({ error: "Le motif d'annulation est obligatoire" });
    return;
  }
  if (commentaire !== undefined && typeof commentaire !== 'string') {
    res.status(400).json({ error: 'Commentaire invalide' });
    return;
  }
  if (dejaPrepareDeclare !== undefined && typeof dejaPrepareDeclare !== 'boolean') {
    res.status(400).json({ error: 'Indicateur « déjà préparé » invalide' });
    return;
  }
  if (portee === 'LIGNES') {
    if (!Array.isArray(lignes) || lignes.length === 0) {
      res.status(400).json({ error: 'Sélectionnez au moins un article à annuler' });
      return;
    }
    for (const l of lignes as LigneAAnnuler[]) {
      if (typeof l?.ligneCommandeId !== 'string' || !Number.isInteger(l?.quantite) || l.quantite <= 0) {
        res.status(400).json({ error: 'Lignes à annuler invalides' });
        return;
      }
    }
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const resolution = await resoudreResponsable({
    serveurId: req.user!.id,
    etablissementId,
    droit: 'ANNULER',
    codeGerant,
    messageDroitManquant: "Vous n'avez pas le droit d'annuler. Un gérant doit valider avec son code.",
  });
  if (!resolution.ok) {
    res.status(resolution.status).json(resolution.body);
    return;
  }
  const annuleeParId = resolution.responsableId;
  const demandeeParId = resolution.demandeeParId;

  const commande = await prisma.commande.findFirst({
    where: { id: req.params.id, etablissementId },
    include: { lignes: true },
  });
  if (!commande) {
    res.status(404).json({ error: 'Commande introuvable' });
    return;
  }
  if (commande.statut === 'ANNULEE') {
    res.status(409).json({ error: 'Cette commande est déjà annulée' });
    return;
  }

  // Quantité annulable = commandée − déjà payée − déjà annulée − déjà offerte.
  const annulablesParId = new Map(
    commande.lignes.map((l) => [
      l.id,
      l.quantite - l.quantitePayee - l.quantiteAnnulee - l.quantiteOfferte,
    ]),
  );

  let cibles: Array<{ ligneCommandeId: string; quantite: number }>;
  if (portee === 'COMMANDE') {
    cibles = commande.lignes
      .filter((l) => (annulablesParId.get(l.id) ?? 0) > 0)
      .map((l) => ({ ligneCommandeId: l.id, quantite: annulablesParId.get(l.id)! }));
    if (cibles.length === 0) {
      res
        .status(400)
        .json({ error: 'Plus rien à annuler sur cette commande (articles déjà payés ou annulés)' });
      return;
    }
  } else {
    cibles = lignes as LigneAAnnuler[];
    for (const cible of cibles) {
      const annulable = annulablesParId.get(cible.ligneCommandeId);
      if (annulable === undefined) {
        res.status(400).json({ error: 'Article invalide pour cette commande' });
        return;
      }
      if (cible.quantite > annulable) {
        const ligne = commande.lignes.find((l) => l.id === cible.ligneCommandeId)!;
        res.status(400).json({
          error: `Quantité non annulable pour ${ligne.nomProduit} (reste ${annulable}, le payé ne s'annule pas)`,
        });
        return;
      }
    }
  }

  const lignesParId = new Map(commande.lignes.map((l) => [l.id, l]));
  // C'est le serveur qui déclare si le plat était déjà préparé : lui seul le
  // sait, la cuisine travaillant sur les bons imprimés. Sans déclaration (vieux
  // client en cache), on suppose que non, comme avant l'écran cuisine.
  const apresPreparation = dejaPrepareDeclare ?? false;
  const motifFinal = motif.trim();
  const commentaireFinal =
    typeof commentaire === 'string' && commentaire.trim() ? commentaire.trim() : null;

  const commandeMaj = await prisma.$transaction(async (tx) => {
    for (const cible of cibles) {
      await tx.ligneCommande.update({
        where: { id: cible.ligneCommandeId },
        data: { quantiteAnnulee: { increment: cible.quantite } },
      });
    }

    // Annulation avant préparation : la portion n'a pas été consommée, on la
    // rend au stock des produits suivis. Après préparation, c'est une perte sèche.
    if (!apresPreparation) {
      await rendreAuStock(
        tx,
        cibles.map((c) => ({
          produitId: lignesParId.get(c.ligneCommandeId)!.produitId,
          quantite: c.quantite,
        })),
      );
    }

    if (portee === 'COMMANDE') {
      const quantiteTotale = cibles.reduce((s, c) => s + c.quantite, 0);
      const montantTotal = cibles.reduce(
        (s, c) => s + Number(lignesParId.get(c.ligneCommandeId)!.prixUnitaire) * c.quantite,
        0,
      );
      await tx.annulation.create({
        data: {
          etablissementId,
          commandeId: commande.id,
          quantite: quantiteTotale,
          montant: Math.round(montantTotal * 100) / 100,
          motif: motifFinal,
          commentaire: commentaireFinal,
          apresPreparation,
          annuleeParId,
          demandeeParId,
        },
      });
    } else {
      for (const cible of cibles) {
        const ligne = lignesParId.get(cible.ligneCommandeId)!;
        await tx.annulation.create({
          data: {
            etablissementId,
            commandeId: commande.id,
            ligneCommandeId: ligne.id,
            quantite: cible.quantite,
            montant: Math.round(Number(ligne.prixUnitaire) * cible.quantite * 100) / 100,
            motif: motifFinal,
            commentaire: commentaireFinal,
            apresPreparation,
            annuleeParId,
            demandeeParId,
          },
        });
      }
    }

    // Si plus aucune quantité active, la commande entière passe en ANNULEE.
    const lignesApres = await tx.ligneCommande.findMany({ where: { commandeId: commande.id } });
    const toutAnnule = lignesApres.every((l) => l.quantite - l.quantiteAnnulee === 0);
    if (toutAnnule) {
      await tx.commande.update({ where: { id: commande.id }, data: { statut: 'ANNULEE' } });
    }

    // Si l'addition n'a plus rien à encaisser, on la clôture (libère la table).
    const addition = await tx.addition.findUnique({
      where: { id: commande.additionId },
      include: { commandes: { include: { lignes: true } }, paiements: true },
    });
    if (addition && addition.statut === 'OUVERTE') {
      const lignesAddition = addition.commandes.flatMap((c) => c.lignes);
      const resteAPayer = lignesAddition.some(
        (l) => l.quantite - l.quantitePayee - l.quantiteAnnulee - l.quantiteOfferte > 0,
      );
      if (!resteAPayer) {
        await tx.addition.update({
          where: { id: addition.id },
          data: { statut: 'PAYEE', fermeeLe: new Date() },
        });
      }
    }

    return tx.commande.findUniqueOrThrow({ where: { id: commande.id }, include: INCLUDE_COMMANDE });
  });

  res.status(201).json(toPublicCommande(commandeMaj));
});
