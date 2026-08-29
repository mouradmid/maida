import { Router, type Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import {
  arrondi,
  getContexteServeur,
  lireCleIdempotence,
  lireDateHorsLigne,
  resoudreResponsable,
} from './partage';
import { INCLUDE_ADDITION, calculerTotaux } from './vues';

// Gestes commerciaux : remise sur l'addition et article offert. Tracés au nom
// de qui les accorde (droit REMISER ou validation par code gérant).
//
// Un geste peut aussi être accordé pendant une coupure réseau, puis rejoué à la
// reconnexion : il porte alors une clé d'idempotence et l'heure réelle du
// geste. Le rejeu ne réapplique rien — il renvoie l'état actuel de l'addition.

export const gestesRouter = Router();

// Renvoie l'état de l'addition si ce geste a déjà été appliqué (réponse 200,
// même forme que la création). Retourne false si la clé est inconnue.
async function repondreGesteExistant(
  cle: string,
  etablissementId: string,
  res: Response,
): Promise<boolean> {
  const existant = await prisma.remise.findUnique({
    where: { cleIdempotence: cle },
    include: { addition: { include: INCLUDE_ADDITION } },
  });
  if (!existant) return false;
  if (existant.etablissementId !== etablissementId) {
    res.status(409).json({ error: "Clé d'idempotence déjà utilisée" });
    return true;
  }
  const { solde } = calculerTotaux(existant.addition);
  res.status(200).json({
    montant: Number(existant.montant),
    soldeRestant: solde,
    additionCloturee: existant.addition.statut === 'PAYEE',
  });
  return true;
}

gestesRouter.post('/additions/:id/remise', async (req, res) => {
  const { mode, valeur, motif, commentaire, codeGerant, cleIdempotence, creeLeHorsLigne } =
    req.body ?? {};

  const cle = lireCleIdempotence(cleIdempotence);
  if (cle === false) {
    res.status(400).json({ error: "Clé d'idempotence invalide" });
    return;
  }
  const creeLeFinal = lireDateHorsLigne(creeLeHorsLigne);
  if (creeLeFinal === false) {
    res.status(400).json({ error: 'Date du geste hors ligne invalide' });
    return;
  }
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

  // Rejeu d'une remise déjà synchronisée. À vérifier AVANT le contrôle « déjà
  // soldée » : une remise couvrant tout le solde ferme l'addition, et son rejeu
  // se heurterait sinon à sa propre conséquence.
  if (cle) {
    const rejoue = await repondreGesteExistant(cle, etablissementId, res);
    if (rejoue) return;
  }

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

  try {
    const resultat = await prisma.$transaction(async (tx) => {
      await tx.remise.create({
        data: {
          type: 'REMISE',
          montant: montantRemise,
          pourcentage: mode === 'POURCENTAGE' ? valeur : null,
          motif: motif.trim(),
          commentaire: typeof commentaire === 'string' && commentaire.trim() ? commentaire.trim() : null,
          cleIdempotence: cle ?? null,
          creeLe: creeLeFinal,
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
  } catch (error) {
    // Deux synchronisations simultanées du même geste hors ligne.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && cle) {
      const rejoue = await repondreGesteExistant(cle, etablissementId, res);
      if (rejoue) return;
    }
    throw error;
  }
});

interface LigneAOffrir {
  ligneCommandeId: string;
  quantite: number;
}

gestesRouter.post('/additions/:id/offert', async (req, res) => {
  const { lignes, motif, commentaire, codeGerant, cleIdempotence, creeLeHorsLigne } = req.body ?? {};

  const cle = lireCleIdempotence(cleIdempotence);
  if (cle === false) {
    res.status(400).json({ error: "Clé d'idempotence invalide" });
    return;
  }
  const creeLeFinal = lireDateHorsLigne(creeLeHorsLigne);
  if (creeLeFinal === false) {
    res.status(400).json({ error: 'Date du geste hors ligne invalide' });
    return;
  }
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

  // Rejeu d'un offert déjà synchronisé (cf. la remise : même raison de vérifier
  // avant le contrôle « déjà soldée »).
  if (cle) {
    const rejoue = await repondreGesteExistant(cle, etablissementId, res);
    if (rejoue) return;
  }

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

  try {
    const resultat = await prisma.$transaction(async (tx) => {
      let premiere = true;
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
            // La clé ne va que sur la première ligne : toutes naissent dans cette
            // transaction, donc sa présence prouve que l'offert entier est passé.
            cleIdempotence: premiere ? (cle ?? null) : null,
            creeLe: creeLeFinal,
            etablissementId,
            additionId: addition.id,
            ligneCommandeId: ligne.id,
            accordeeParId: resolution.responsableId,
            demandeeParId: resolution.demandeeParId,
          },
        });
        premiere = false;
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
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && cle) {
      const rejoue = await repondreGesteExistant(cle, etablissementId, res);
      if (rejoue) return;
    }
    throw error;
  }
});
