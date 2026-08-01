import { Router } from 'express';
import {
  decompterStock,
  ErreurStock,
  resoudreLignesCommande,
  type LigneEntree,
} from '../../lib/commandes';
import { prisma } from '../../lib/prisma';
import { getContexteServeur } from './partage';
import { INCLUDE_COMMANDE, toPublicCommande } from './vues';

// Demandes des clients (commande depuis le QR à table) : un serveur les valide
// avant l'envoi en cuisine, c'est le garde-fou anti-abus.

export const demandesRouter = Router();

demandesRouter.get('/demandes', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const demandes = await prisma.demandeClient.findMany({
    where: { etablissementId, statut: 'EN_ATTENTE' },
    include: { table: { select: { numero: true } } },
    orderBy: { creeLe: 'asc' },
  });

  // Résolution d'affichage contre le menu actuel : si un produit a été
  // désactivé entre-temps, le serveur voit le problème et peut refuser.
  const resultat = [];
  for (const demande of demandes) {
    const resolution = await resoudreLignesCommande(
      etablissementId,
      demande.lignes as unknown as LigneEntree[],
    );
    resultat.push({
      id: demande.id,
      table: demande.table,
      note: demande.note,
      creeLe: demande.creeLe,
      lignes: resolution.ok
        ? resolution.lignes.map((l) => ({
            nomProduit: l.nomProduit,
            quantite: l.quantite,
            prixUnitaire: Number(l.prixUnitaire),
            options: l.options.map((o) => o.valeur),
          }))
        : null,
      total: resolution.ok
        ? Math.round(
            resolution.lignes.reduce((s, l) => s + Number(l.prixUnitaire) * l.quantite, 0) * 100,
          ) / 100
        : null,
      probleme: resolution.ok ? null : resolution.erreur,
    });
  }

  res.json(resultat);
});

demandesRouter.post('/demandes/:id/accepter', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const demande = await prisma.demandeClient.findFirst({
    where: { id: req.params.id, etablissementId },
  });
  if (!demande) {
    res.status(404).json({ error: 'Demande introuvable' });
    return;
  }
  if (demande.statut !== 'EN_ATTENTE') {
    res.status(409).json({ error: 'Cette demande a déjà été traitée' });
    return;
  }

  const resolution = await resoudreLignesCommande(
    etablissementId,
    demande.lignes as unknown as LigneEntree[],
  );
  if (!resolution.ok) {
    res.status(400).json({
      error: `Impossible d'accepter : ${resolution.erreur}. Refusez la demande et voyez avec le client.`,
    });
    return;
  }

  let commande;
  try {
    commande = await prisma.$transaction(async (tx) => {
      await decompterStock(tx, resolution.lignes);
      const additionOuverte = await tx.addition.findFirst({
        where: { etablissementId, tableId: demande.tableId, statut: 'OUVERTE' },
      });
      const additionId = additionOuverte
        ? additionOuverte.id
        : (await tx.addition.create({ data: { etablissementId, tableId: demande.tableId } })).id;

      const creee = await tx.commande.create({
        data: {
          canal: 'SUR_PLACE',
          additionId,
          etablissementId,
          serveurId: req.user!.id,
          noteCuisine: demande.note ? `Commande client : ${demande.note}` : 'Commande client (QR)',
          lignes: {
            create: resolution.lignes.map((l) => ({
              produitId: l.produitId,
              nomProduit: l.nomProduit,
              prixUnitaire: l.prixUnitaire,
              coutRevientUnitaire: l.coutRevientUnitaire,
              tauxTva: l.tauxTva,
              suite: l.suite,
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

      await tx.demandeClient.update({
        where: { id: demande.id },
        data: {
          statut: 'ACCEPTEE',
          commandeId: creee.id,
          traiteeParId: req.user!.id,
          traiteeLe: new Date(),
        },
      });

      return creee;
    });
  } catch (error) {
    if (error instanceof ErreurStock) {
      res.status(409).json({
        error: `Impossible d'accepter : ${error.message}. Refusez la demande et voyez avec le client.`,
      });
      return;
    }
    throw error;
  }

  res.status(201).json(toPublicCommande(commande));
});

demandesRouter.post('/demandes/:id/refuser', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const demande = await prisma.demandeClient.findFirst({
    where: { id: req.params.id, etablissementId },
  });
  if (!demande) {
    res.status(404).json({ error: 'Demande introuvable' });
    return;
  }
  if (demande.statut !== 'EN_ATTENTE') {
    res.status(409).json({ error: 'Cette demande a déjà été traitée' });
    return;
  }

  await prisma.demandeClient.update({
    where: { id: demande.id },
    data: { statut: 'REFUSEE', traiteeParId: req.user!.id, traiteeLe: new Date() },
  });

  res.status(204).send();
});
