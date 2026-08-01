import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { getContexteServeur } from './partage';
import { INCLUDE_ADDITION, calculerTotaux } from './vues';

// Consultation des additions : liste des tables ouvertes et détail facturable
// d'une addition (articles, paiements, gestes commerciaux).

export const additionsRouter = Router();

additionsRouter.get('/additions', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const additions = await prisma.addition.findMany({
    where: { etablissementId, statut: 'OUVERTE' },
    include: INCLUDE_ADDITION,
    orderBy: { ouverteLe: 'asc' },
  });

  res.json(
    additions.map((a) => ({
      id: a.id,
      table: a.table,
      statut: a.statut,
      ouverteLe: a.ouverteLe,
      ...calculerTotaux(a),
    })),
  );
});

additionsRouter.get('/additions/:id', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const addition = await prisma.addition.findUnique({
    where: { id: req.params.id },
    include: {
      table: { select: { numero: true } },
      commandes: { include: { lignes: { include: { options: true } } }, orderBy: { creeLe: 'asc' } },
      paiements: { include: { lignes: true }, orderBy: { creeLe: 'asc' } },
      remises: { orderBy: { creeLe: 'asc' } },
    },
  });

  if (!addition || addition.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Addition introuvable' });
    return;
  }

  res.json({
    id: addition.id,
    table: addition.table,
    statut: addition.statut,
    ouverteLe: addition.ouverteLe,
    fermeeLe: addition.fermeeLe,
    ...calculerTotaux(addition),
    commandes: addition.commandes.map((c) => ({
      id: c.id,
      canal: c.canal,
      creeLe: c.creeLe,
      lignes: c.lignes.map((l) => ({
        id: l.id,
        nomProduit: l.nomProduit,
        prixUnitaire: Number(l.prixUnitaire),
        tauxTva: l.tauxTva,
        quantite: l.quantite,
        quantitePayee: l.quantitePayee,
        quantiteAnnulee: l.quantiteAnnulee,
        quantiteOfferte: l.quantiteOfferte,
        options: l.options.map((o) => ({ nomGroupe: o.nomGroupe, valeur: o.valeur })),
      })),
    })),
    paiements: addition.paiements.map((p) => ({
      id: p.id,
      montant: Number(p.montant),
      moyenPaiement: p.moyenPaiement,
      montantRecu: p.montantRecu !== null ? Number(p.montantRecu) : null,
      creeLe: p.creeLe,
    })),
    remises: addition.remises.map((r) => ({
      id: r.id,
      type: r.type,
      montant: Number(r.montant),
      pourcentage: r.pourcentage,
      quantite: r.quantite,
      motif: r.motif,
      creeLe: r.creeLe,
    })),
  });
});
