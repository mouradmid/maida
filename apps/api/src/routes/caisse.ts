import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const caisseRouter = Router();

caisseRouter.use(requireAuth, requireRole('SERVEUR'));

async function getContexteServeur(serveurId: string) {
  const serveur = await prisma.utilisateur.findUnique({ where: { id: serveurId } });
  if (!serveur?.etablissementId) {
    throw new Error('Serveur sans établissement associé');
  }
  return { etablissementId: serveur.etablissementId };
}

caisseRouter.get('/menu', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const categories = await prisma.categorie.findMany({
    where: { etablissementId, statut: 'ACTIF' },
    select: {
      id: true,
      nom: true,
      produits: {
        where: { statut: 'ACTIF' },
        select: { id: true, nom: true, description: true, prix: true },
        orderBy: { nom: 'asc' },
      },
    },
    orderBy: { nom: 'asc' },
  });

  res.json(
    categories.map((c) => ({
      ...c,
      produits: c.produits.map((p) => ({ ...p, prix: Number(p.prix) })),
    })),
  );
});

function toPublicCommande(commande: {
  id: string;
  canal: string;
  numeroTable: string | null;
  statut: string;
  creeLe: Date;
  serveur: { nom: string; prenom: string };
  lignes: Array<{ id: string; nomProduit: string; prixUnitaire: unknown; quantite: number }>;
}) {
  const lignes = commande.lignes.map((l) => ({
    id: l.id,
    nomProduit: l.nomProduit,
    prixUnitaire: Number(l.prixUnitaire),
    quantite: l.quantite,
  }));
  const total = lignes.reduce((somme, l) => somme + l.prixUnitaire * l.quantite, 0);

  return {
    id: commande.id,
    canal: commande.canal,
    numeroTable: commande.numeroTable,
    statut: commande.statut,
    creeLe: commande.creeLe,
    serveur: commande.serveur,
    lignes,
    total,
  };
}

caisseRouter.get('/commandes', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const commandes = await prisma.commande.findMany({
    where: { etablissementId },
    include: { lignes: true, serveur: { select: { nom: true, prenom: true } } },
    orderBy: { creeLe: 'desc' },
    take: 50,
  });

  res.json(commandes.map(toPublicCommande));
});

caisseRouter.post('/commandes', async (req, res) => {
  const { canal, numeroTable, lignes } = req.body ?? {};

  if (canal !== 'SUR_PLACE' && canal !== 'EMPORTER') {
    res.status(400).json({ error: 'Canal invalide' });
    return;
  }
  if (!Array.isArray(lignes) || lignes.length === 0) {
    res.status(400).json({ error: 'La commande doit contenir au moins un produit' });
    return;
  }
  for (const ligne of lignes) {
    if (typeof ligne?.produitId !== 'string' || !Number.isInteger(ligne?.quantite) || ligne.quantite <= 0) {
      res.status(400).json({ error: 'Chaque ligne doit avoir un produitId et une quantité entière positive' });
      return;
    }
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const produitIds = [...new Set(lignes.map((l: { produitId: string }) => l.produitId))];
  const produits = await prisma.produit.findMany({
    where: { id: { in: produitIds }, etablissementId, statut: 'ACTIF' },
  });
  const produitsParId = new Map(produits.map((p) => [p.id, p]));

  for (const id of produitIds) {
    if (!produitsParId.has(id)) {
      res.status(400).json({ error: `Produit invalide ou indisponible: ${id}` });
      return;
    }
  }

  const commande = await prisma.commande.create({
    data: {
      canal,
      numeroTable: typeof numeroTable === 'string' && numeroTable.trim() ? numeroTable : null,
      etablissementId,
      serveurId: req.user!.id,
      lignes: {
        create: lignes.map((l: { produitId: string; quantite: number }) => {
          const produit = produitsParId.get(l.produitId)!;
          return {
            produitId: produit.id,
            nomProduit: produit.nom,
            prixUnitaire: produit.prix,
            quantite: l.quantite,
          };
        }),
      },
    },
    include: { lignes: true, serveur: { select: { nom: true, prenom: true } } },
  });

  res.status(201).json(toPublicCommande(commande));
});
