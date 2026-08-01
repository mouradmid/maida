import { Router } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { getContexteAvecDroit, getContexteServeur } from './partage';

// Ce que la caisse a besoin de savoir de son établissement : en-tête des
// tickets, moyens de paiement, menu du jour et gestion du stock au comptoir.

export const etablissementRouter = Router();

// Infos affichées sur le ticket client.
etablissementRouter.get('/etablissement', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const etablissement = await prisma.etablissement.findUnique({
    where: { id: etablissementId },
    select: { nom: true, adresse: true, ville: true },
  });

  res.json(etablissement);
});

etablissementRouter.get('/moyens-paiement', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const etablissement = await prisma.etablissement.findUnique({
    where: { id: etablissementId },
    select: { moyensPaiementActifs: true },
  });

  res.json({ actifs: etablissement?.moyensPaiementActifs ?? [] });
});

etablissementRouter.get('/menu', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const categories = await prisma.categorie.findMany({
    where: { etablissementId, statut: 'ACTIF' },
    select: {
      id: true,
      nom: true,
      produits: {
        where: { statut: 'ACTIF' },
        select: {
          id: true,
          nom: true,
          description: true,
          prix: true,
          tempsPreparationMinutes: true,
          disponible: true,
          suiviQuantite: true,
          quantiteRestante: true,
          groupesOptions: {
            select: {
              id: true,
              nom: true,
              obligatoire: true,
              valeurs: { select: { id: true, valeur: true }, orderBy: { creeLe: 'asc' } },
            },
            orderBy: { creeLe: 'asc' },
          },
        },
        orderBy: { nom: 'asc' },
      },
    },
    // Ordre de création : le gérant construit son menu dans l'ordre du repas
    // (entrées, plats, desserts), on le respecte à la caisse.
    orderBy: { creeLe: 'asc' },
  });

  res.json(
    categories.map((c) => ({
      ...c,
      produits: c.produits.map((p) => ({ ...p, prix: Number(p.prix) })),
    })),
  );
});

// Gestion du stock depuis la caisse (droit GERER_STOCK) : marquer une rupture,
// activer/désactiver le suivi de quantité, ajuster la quantité restante.
etablissementRouter.patch('/produits/:id/stock', async (req, res) => {
  const { etablissementId, aLeDroit } = await getContexteAvecDroit(req.user!.id, 'GERER_STOCK');
  if (!aLeDroit) {
    res.status(403).json({ error: "Vous n'avez pas le droit de gérer le stock" });
    return;
  }

  const { disponible, suiviQuantite, quantiteRestante } = req.body ?? {};
  const data: Prisma.ProduitUpdateInput = {};

  if (disponible !== undefined) {
    if (typeof disponible !== 'boolean') {
      res.status(400).json({ error: 'disponible doit être un booléen' });
      return;
    }
    data.disponible = disponible;
  }
  if (suiviQuantite !== undefined) {
    if (typeof suiviQuantite !== 'boolean') {
      res.status(400).json({ error: 'suiviQuantite doit être un booléen' });
      return;
    }
    data.suiviQuantite = suiviQuantite;
  }
  if (quantiteRestante !== undefined) {
    if (
      quantiteRestante !== null &&
      (!Number.isInteger(quantiteRestante) || quantiteRestante < 0 || quantiteRestante > 100_000)
    ) {
      res.status(400).json({ error: 'quantiteRestante doit être un entier positif (ou null)' });
      return;
    }
    data.quantiteRestante = quantiteRestante;
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'Aucune modification fournie' });
    return;
  }

  const produit = await prisma.produit.findFirst({
    where: { id: req.params.id, etablissementId },
    select: { id: true },
  });
  if (!produit) {
    res.status(404).json({ error: 'Produit introuvable' });
    return;
  }

  const maj = await prisma.produit.update({
    where: { id: produit.id },
    data,
    select: { id: true, disponible: true, suiviQuantite: true, quantiteRestante: true },
  });
  res.json(maj);
});
