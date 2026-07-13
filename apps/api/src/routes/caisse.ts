import { Router } from 'express';
import type { Prisma } from '../generated/prisma/client';
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
        select: {
          id: true,
          nom: true,
          description: true,
          prix: true,
          tempsPreparationMinutes: true,
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
    orderBy: { nom: 'asc' },
  });

  res.json(
    categories.map((c) => ({
      ...c,
      produits: c.produits.map((p) => ({ ...p, prix: Number(p.prix) })),
    })),
  );
});

caisseRouter.get('/tables', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const tables = await prisma.table.findMany({
    where: { etablissementId, statut: 'ACTIF' },
    select: { id: true, numero: true, nombreCouverts: true, forme: true },
    orderBy: { numero: 'asc' },
  });

  res.json(tables);
});

function toPublicCommande(commande: {
  id: string;
  canal: string;
  noteCuisine: string | null;
  statut: string;
  creeLe: Date;
  serveur: { nom: string; prenom: string };
  table: { numero: string } | null;
  lignes: Array<{
    id: string;
    nomProduit: string;
    prixUnitaire: unknown;
    quantite: number;
    options: Array<{ id: string; nomGroupe: string; valeur: string }>;
  }>;
}) {
  const lignes = commande.lignes.map((l) => ({
    id: l.id,
    nomProduit: l.nomProduit,
    prixUnitaire: Number(l.prixUnitaire),
    quantite: l.quantite,
    options: l.options.map((o) => ({ nomGroupe: o.nomGroupe, valeur: o.valeur })),
  }));
  const total = lignes.reduce((somme, l) => somme + l.prixUnitaire * l.quantite, 0);

  return {
    id: commande.id,
    canal: commande.canal,
    noteCuisine: commande.noteCuisine,
    table: commande.table,
    statut: commande.statut,
    creeLe: commande.creeLe,
    serveur: commande.serveur,
    lignes,
    total,
  };
}

const INCLUDE_COMMANDE = {
  lignes: { include: { options: true } },
  serveur: { select: { nom: true, prenom: true } },
  table: { select: { numero: true } },
} satisfies Prisma.CommandeInclude;

caisseRouter.get('/commandes', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const commandes = await prisma.commande.findMany({
    where: { etablissementId },
    include: INCLUDE_COMMANDE,
    orderBy: { creeLe: 'desc' },
    take: 50,
  });

  res.json(commandes.map(toPublicCommande));
});

interface LigneEntree {
  produitId: string;
  quantite: number;
  options?: Array<{ groupeOptionId: string; optionValeurId: string }>;
}

caisseRouter.post('/commandes', async (req, res) => {
  const { canal, tableId, noteCuisine, lignes } = req.body ?? {};

  if (canal !== 'SUR_PLACE' && canal !== 'EMPORTER') {
    res.status(400).json({ error: 'Canal invalide' });
    return;
  }
  if (canal === 'SUR_PLACE' && typeof tableId !== 'string') {
    res.status(400).json({ error: 'La table est requise pour une commande sur place' });
    return;
  }
  if (noteCuisine !== undefined && typeof noteCuisine !== 'string') {
    res.status(400).json({ error: 'La note cuisine doit être du texte' });
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
    if (
      ligne.options !== undefined &&
      (!Array.isArray(ligne.options) ||
        ligne.options.some(
          (o: unknown) =>
            typeof (o as { groupeOptionId?: unknown })?.groupeOptionId !== 'string' ||
            typeof (o as { optionValeurId?: unknown })?.optionValeurId !== 'string',
        ))
    ) {
      res.status(400).json({ error: 'Options de ligne invalides' });
      return;
    }
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  if (canal === 'SUR_PLACE') {
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table || table.etablissementId !== etablissementId || table.statut !== 'ACTIF') {
      res.status(400).json({ error: 'Table invalide' });
      return;
    }
  }

  const lignesEntree = lignes as LigneEntree[];
  const produitIds = [...new Set(lignesEntree.map((l) => l.produitId))];
  const produits = await prisma.produit.findMany({
    where: { id: { in: produitIds }, etablissementId, statut: 'ACTIF' },
    include: { groupesOptions: { include: { valeurs: true } } },
  });
  const produitsParId = new Map(produits.map((p) => [p.id, p]));

  for (const id of produitIds) {
    if (!produitsParId.has(id)) {
      res.status(400).json({ error: `Produit invalide ou indisponible: ${id}` });
      return;
    }
  }

  const lignesAvecOptions: Array<{
    produitId: string;
    nomProduit: string;
    prixUnitaire: (typeof produits)[number]['prix'];
    quantite: number;
    options: Array<{ optionValeurId: string; nomGroupe: string; valeur: string }>;
  }> = [];

  for (const ligne of lignesEntree) {
    const produit = produitsParId.get(ligne.produitId)!;
    const optionsFournies = ligne.options ?? [];
    const groupesChoisis = new Set<string>();
    const optionsResolues: Array<{ optionValeurId: string; nomGroupe: string; valeur: string }> = [];

    for (const choix of optionsFournies) {
      const groupe = produit.groupesOptions.find((g) => g.id === choix.groupeOptionId);
      if (!groupe) {
        res.status(400).json({ error: `Groupe d'option invalide pour ${produit.nom}` });
        return;
      }
      if (groupesChoisis.has(groupe.id)) {
        res.status(400).json({ error: `Une seule valeur autorisée par groupe (${groupe.nom})` });
        return;
      }
      const valeur = groupe.valeurs.find((v) => v.id === choix.optionValeurId);
      if (!valeur) {
        res.status(400).json({ error: `Valeur d'option invalide pour ${groupe.nom}` });
        return;
      }
      groupesChoisis.add(groupe.id);
      optionsResolues.push({ optionValeurId: valeur.id, nomGroupe: groupe.nom, valeur: valeur.valeur });
    }

    const groupesObligatoiresManquants = produit.groupesOptions.filter(
      (g) => g.obligatoire && !groupesChoisis.has(g.id),
    );
    if (groupesObligatoiresManquants.length > 0) {
      res.status(400).json({
        error: `Sélection requise pour ${produit.nom}: ${groupesObligatoiresManquants.map((g) => g.nom).join(', ')}`,
      });
      return;
    }

    lignesAvecOptions.push({
      produitId: produit.id,
      nomProduit: produit.nom,
      prixUnitaire: produit.prix,
      quantite: ligne.quantite,
      options: optionsResolues,
    });
  }

  const commande = await prisma.commande.create({
    data: {
      canal,
      tableId: canal === 'SUR_PLACE' ? tableId : null,
      noteCuisine: typeof noteCuisine === 'string' && noteCuisine.trim() ? noteCuisine.trim() : null,
      etablissementId,
      serveurId: req.user!.id,
      lignes: {
        create: lignesAvecOptions.map((l) => ({
          produitId: l.produitId,
          nomProduit: l.nomProduit,
          prixUnitaire: l.prixUnitaire,
          quantite: l.quantite,
          options: {
            create: l.options.map((o) => ({
              optionValeurId: o.optionValeurId,
              nomGroupe: o.nomGroupe,
              valeur: o.valeur,
            })),
          },
        })),
      },
    },
    include: INCLUDE_COMMANDE,
  });

  res.status(201).json(toPublicCommande(commande));
});
