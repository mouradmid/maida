import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { contexteDe, plagePeriode } from './partage';

// Historiques des gestes exceptionnels du service : annulations et remises.
// Tous deux acceptent une période optionnelle (?debut=&fin=). Sans elle, on
// renvoie les 200 dernières lignes pour l'affichage ; avec une période
// explicite (export comptable), le plafond monte à 2000 pour couvrir un
// exercice sans tronquer le fichier silencieusement.

export const historiquesRouter = Router();

historiquesRouter.get('/annulations', async (req, res) => {
  const { plage: creeLe, erreur } = plagePeriode(req.query);
  if (erreur) {
    res.status(400).json({ error: erreur });
    return;
  }

  const { etablissementId } = await contexteDe(req);

  const annulations = await prisma.annulation.findMany({
    where: { etablissementId, creeLe },
    include: {
      commande: {
        select: {
          id: true,
          canal: true,
          addition: { select: { table: { select: { numero: true } } } },
        },
      },
      ligneCommande: { select: { nomProduit: true } },
      annuleePar: { select: { nom: true, prenom: true, role: true } },
      demandeePar: { select: { nom: true, prenom: true } },
    },
    orderBy: { creeLe: 'desc' },
    take: creeLe ? 2000 : 200,
  });

  res.json(
    annulations.map((a) => ({
      id: a.id,
      motif: a.motif,
      commentaire: a.commentaire,
      quantite: a.quantite,
      montant: Number(a.montant),
      apresPreparation: a.apresPreparation,
      creeLe: a.creeLe,
      canal: a.commande.canal,
      table: a.commande.addition.table,
      produit: a.ligneCommande?.nomProduit ?? null,
      annuleePar: a.annuleePar,
      demandeePar: a.demandeePar,
    })),
  );
});

historiquesRouter.get('/remises', async (req, res) => {
  const { plage: creeLe, erreur } = plagePeriode(req.query);
  if (erreur) {
    res.status(400).json({ error: erreur });
    return;
  }

  const { etablissementId } = await contexteDe(req);

  const remises = await prisma.remise.findMany({
    where: { etablissementId, creeLe },
    include: {
      addition: { select: { table: { select: { numero: true } } } },
      ligneCommande: { select: { nomProduit: true } },
      accordeePar: { select: { nom: true, prenom: true, role: true } },
      demandeePar: { select: { nom: true, prenom: true } },
    },
    orderBy: { creeLe: 'desc' },
    take: creeLe ? 2000 : 200,
  });

  res.json(
    remises.map((r) => ({
      id: r.id,
      type: r.type,
      montant: Number(r.montant),
      pourcentage: r.pourcentage,
      quantite: r.quantite,
      motif: r.motif,
      commentaire: r.commentaire,
      creeLe: r.creeLe,
      table: r.addition.table,
      produit: r.ligneCommande?.nomProduit ?? null,
      accordeePar: r.accordeePar,
      demandeePar: r.demandeePar,
    })),
  );
});
