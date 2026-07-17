import { Router } from 'express';
import { prisma } from '../lib/prisma';

// Routes publiques, sans authentification : le menu consultable par les
// clients du restaurant (QR code à table). Lecture seule.
export const publicRouter = Router();

publicRouter.get('/menu/:etablissementId', async (req, res) => {
  const etablissement = await prisma.etablissement.findUnique({
    where: { id: req.params.etablissementId },
    select: {
      id: true,
      nom: true,
      adresse: true,
      ville: true,
      statut: true,
      compteClient: { select: { statut: true } },
    },
  });

  // Un établissement inconnu, inactif ou au compte suspendu n'expose rien.
  if (
    !etablissement ||
    etablissement.statut !== 'ACTIF' ||
    etablissement.compteClient.statut !== 'ACTIF'
  ) {
    res.status(404).json({ error: 'Menu indisponible' });
    return;
  }

  const categories = await prisma.categorie.findMany({
    where: { etablissementId: etablissement.id, statut: 'ACTIF' },
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
          groupesOptions: {
            select: {
              nom: true,
              valeurs: { select: { valeur: true }, orderBy: { creeLe: 'asc' } },
            },
            orderBy: { creeLe: 'asc' },
          },
        },
        orderBy: { nom: 'asc' },
      },
    },
    orderBy: { creeLe: 'asc' },
  });

  res.json({
    etablissement: {
      nom: etablissement.nom,
      adresse: etablissement.adresse,
      ville: etablissement.ville,
    },
    categories: categories
      .filter((c) => c.produits.length > 0)
      .map((c) => ({
        id: c.id,
        nom: c.nom,
        produits: c.produits.map((p) => ({
          id: p.id,
          nom: p.nom,
          description: p.description,
          prix: Number(p.prix),
          options: p.groupesOptions.map((g) => ({
            nom: g.nom,
            valeurs: g.valeurs.map((v) => v.valeur),
          })),
        })),
      })),
  });
});
