import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { contexteDe } from './partage';

export const categoriesRouter = Router();

categoriesRouter.get('/categories', async (req, res) => {
  const { etablissementId } = await contexteDe(req);

  const categories = await prisma.categorie.findMany({
    where: { etablissementId },
    select: { id: true, nom: true, type: true, suiteParDefaut: true, statut: true, creeLe: true },
    orderBy: { creeLe: 'asc' },
  });

  res.json(categories);
});

categoriesRouter.post('/categories', async (req, res) => {
  const { nom, type } = req.body ?? {};

  if (typeof nom !== 'string' || !nom.trim()) {
    res.status(400).json({ error: 'Le nom de la catégorie est requis' });
    return;
  }
  if (type !== undefined && type !== 'NOURRITURE' && type !== 'BOISSON') {
    res.status(400).json({ error: 'Type de catégorie invalide' });
    return;
  }

  const { etablissementId } = await contexteDe(req);

  const categorie = await prisma.categorie.create({
    data: { nom, type: type ?? undefined, etablissementId },
  });

  res.status(201).json(categorie);
});

categoriesRouter.patch('/categories/:id', async (req, res) => {
  const { nom, statut, type, suiteParDefaut } = req.body ?? {};
  const { etablissementId } = await contexteDe(req);

  const categorie = await prisma.categorie.findUnique({ where: { id: req.params.id } });
  if (!categorie || categorie.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Catégorie introuvable' });
    return;
  }

  if (statut !== undefined && statut !== 'ACTIF' && statut !== 'INACTIF') {
    res.status(400).json({ error: 'Statut invalide' });
    return;
  }
  if (type !== undefined && type !== 'NOURRITURE' && type !== 'BOISSON') {
    res.status(400).json({ error: 'Type de catégorie invalide' });
    return;
  }
  if (
    suiteParDefaut !== undefined &&
    (!Number.isInteger(suiteParDefaut) || suiteParDefaut < 1 || suiteParDefaut > 5)
  ) {
    res.status(400).json({ error: 'Suite invalide (1 à 5)' });
    return;
  }

  const categorieMaj = await prisma.categorie.update({
    where: { id: categorie.id },
    data: {
      nom: typeof nom === 'string' && nom.trim() ? nom : undefined,
      statut: statut ?? undefined,
      type: type ?? undefined,
      suiteParDefaut: suiteParDefaut ?? undefined,
    },
  });

  res.json(categorieMaj);
});
