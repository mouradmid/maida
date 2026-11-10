import { Router, type Response } from 'express';
import { ModePaiement, Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { ErreurMetier, verrouillerAddition } from '../../lib/erreurs';
import { getContexteServeur, getJourneeOuverte, lireCleIdempotence, lireDateHorsLigne } from './partage';
import { INCLUDE_ADDITION, calculerTotaux } from './vues';

export const paiementsRouter = Router();

interface LigneAPayer {
  ligneCommandeId: string;
  quantite: number;
}

// Renvoie le paiement déjà enregistré pour cette clé (réponse 200, même forme
// que la création). Retourne false si la clé est inconnue.
async function repondrePaiementExistant(
  cleIdempotence: string,
  etablissementId: string,
  res: Response,
): Promise<boolean> {
  const existant = await prisma.paiement.findUnique({
    where: { cleIdempotence },
    include: { addition: { include: INCLUDE_ADDITION } },
  });
  if (!existant) return false;
  if (existant.addition.etablissementId !== etablissementId) {
    res.status(409).json({ error: "Clé d'idempotence déjà utilisée" });
    return true;
  }
  const { solde } = calculerTotaux(existant.addition);
  res.status(200).json({
    id: existant.id,
    montant: Number(existant.montant),
    moyenPaiement: existant.moyenPaiement,
    montantRecu: existant.montantRecu !== null ? Number(existant.montantRecu) : null,
    rendu:
      existant.montantRecu !== null
        ? Math.round((Number(existant.montantRecu) - Number(existant.montant)) * 100) / 100
        : null,
    soldeRestant: solde,
    additionCloturee: existant.addition.statut === 'PAYEE',
  });
  return true;
}

paiementsRouter.post('/additions/:id/paiements', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);
  const { mode, montant, moyenPaiement, montantRecu, lignes, cleIdempotence, creeLeHorsLigne } =
    req.body ?? {};

  const cle = lireCleIdempotence(cleIdempotence);
  if (cle === false) {
    res.status(400).json({ error: "Clé d'idempotence invalide" });
    return;
  }
  const creeLeFinal = lireDateHorsLigne(creeLeHorsLigne);
  if (creeLeFinal === false) {
    res.status(400).json({ error: "Date d'encaissement hors ligne invalide" });
    return;
  }

  // Rejeu d'un paiement déjà synchronisé : on renvoie l'existant, sans double.
  if (cle) {
    const rejoue = await repondrePaiementExistant(cle, etablissementId, res);
    if (rejoue) return;
  }

  if (
    typeof moyenPaiement !== 'string' ||
    !Object.values(ModePaiement).includes(moyenPaiement as ModePaiement)
  ) {
    res.status(400).json({ error: 'Moyen de paiement invalide' });
    return;
  }
  const moyenPaiementValide = moyenPaiement as ModePaiement;
  if (montantRecu !== undefined && (typeof montantRecu !== 'number' || montantRecu < 0)) {
    res.status(400).json({ error: 'Montant reçu invalide' });
    return;
  }
  if (mode !== 'MONTANT' && mode !== 'ARTICLES') {
    res.status(400).json({ error: 'Mode de paiement invalide' });
    return;
  }

  const etablissement = await prisma.etablissement.findUnique({
    where: { id: etablissementId },
    select: { moyensPaiementActifs: true },
  });
  if (!etablissement?.moyensPaiementActifs.includes(moyenPaiementValide)) {
    res.status(400).json({ error: "Ce moyen de paiement n'est pas activé pour cet établissement" });
    return;
  }

  // Forme des articles vérifiée avant de verrouiller quoi que ce soit.
  if (mode === 'ARTICLES') {
    if (!Array.isArray(lignes) || lignes.length === 0) {
      res.status(400).json({ error: 'Sélectionnez au moins un article' });
      return;
    }
    for (const entree of lignes as LigneAPayer[]) {
      if (typeof entree?.ligneCommandeId !== 'string') {
        res.status(400).json({ error: 'Article invalide pour cette addition' });
        return;
      }
      if (!Number.isInteger(entree.quantite) || entree.quantite <= 0) {
        res.status(400).json({ error: 'Quantité invalide' });
        return;
      }
    }
  } else if (typeof montant !== 'number' || !Number.isFinite(montant) || montant <= 0) {
    res.status(400).json({ error: 'Montant invalide' });
    return;
  }

  try {
    // Tout ce qui dépend de l'état de l'addition — solde, quantités restantes —
    // se lit sous verrou : deux caisses qui encaissent la même table au même
    // instant passent l'une après l'autre, et la seconde voit le paiement de
    // la première.
    const resultat = await prisma.$transaction(async (tx) => {
      await verrouillerAddition(tx, req.params.id);
      const addition = await tx.addition.findUnique({
        where: { id: req.params.id },
        include: INCLUDE_ADDITION,
      });
      if (!addition || addition.etablissementId !== etablissementId) {
        throw new ErreurMetier(404, 'Addition introuvable');
      }
      if (addition.statut !== 'OUVERTE') {
        throw new ErreurMetier(400, 'Cette addition est déjà soldée');
      }

      const { solde } = calculerTotaux(addition);
      const lignesParId = new Map(addition.commandes.flatMap((c) => c.lignes).map((l) => [l.id, l]));

      let montantFinal: number;
      let lignesAPayer: Array<{ ligneCommandeId: string; quantite: number; montant: number }> = [];

      if (mode === 'ARTICLES') {
        for (const entree of lignes as LigneAPayer[]) {
          const ligne = lignesParId.get(entree.ligneCommandeId);
          if (!ligne) {
            throw new ErreurMetier(400, 'Article invalide pour cette addition');
          }
          const restant =
            ligne.quantite - ligne.quantitePayee - ligne.quantiteAnnulee - ligne.quantiteOfferte;
          if (entree.quantite > restant) {
            throw new ErreurMetier(
              400,
              `Quantité indisponible pour ${ligne.nomProduit} (reste ${restant})`,
            );
          }
        }
        lignesAPayer = (lignes as LigneAPayer[]).map((entree) => {
          const ligne = lignesParId.get(entree.ligneCommandeId)!;
          return {
            ligneCommandeId: ligne.id,
            quantite: entree.quantite,
            montant: Number(ligne.prixUnitaire) * entree.quantite,
          };
        });
        montantFinal = Math.round(lignesAPayer.reduce((s, l) => s + l.montant, 0) * 100) / 100;
      } else {
        montantFinal = Math.round((montant as number) * 100) / 100;
      }

      if (montantFinal > solde + 0.01) {
        throw new ErreurMetier(400, `Le montant dépasse le solde restant (${solde} DZD)`);
      }
      if (moyenPaiementValide === 'ESPECES' && montantRecu !== undefined && montantRecu < montantFinal) {
        throw new ErreurMetier(400, 'Le montant reçu est inférieur au montant encaissé');
      }

      const journee = await getJourneeOuverte(etablissementId);
      if (!journee) {
        throw new ErreurMetier(
          409,
          "Aucune journée de caisse ouverte. Ouvrez la journée (onglet Journée) avant d'encaisser.",
        );
      }

      const paiement = await tx.paiement.create({
        data: {
          additionId: addition.id,
          journeeCaisseId: journee.id,
          cleIdempotence: cle ?? null,
          creeLe: creeLeFinal,
          montant: montantFinal,
          moyenPaiement: moyenPaiementValide,
          montantRecu:
            moyenPaiementValide === 'ESPECES' && montantRecu !== undefined ? montantRecu : null,
          lignes: {
            create: lignesAPayer.map((l) => ({
              ligneCommandeId: l.ligneCommandeId,
              quantite: l.quantite,
              montant: l.montant,
            })),
          },
        },
      });

      for (const l of lignesAPayer) {
        await tx.ligneCommande.update({
          where: { id: l.ligneCommandeId },
          data: { quantitePayee: { increment: l.quantite } },
        });
      }

      const soldeRestant = Math.max(0, Math.round((solde - montantFinal) * 100) / 100);
      if (soldeRestant <= 0.01) {
        await tx.addition.update({
          where: { id: addition.id },
          data: { statut: 'PAYEE', fermeeLe: new Date() },
        });
      }

      return { paiement, soldeRestant, cloturee: soldeRestant <= 0.01 };
    });

    res.status(201).json({
      id: resultat.paiement.id,
      montant: Number(resultat.paiement.montant),
      moyenPaiement: resultat.paiement.moyenPaiement,
      montantRecu: resultat.paiement.montantRecu !== null ? Number(resultat.paiement.montantRecu) : null,
      rendu:
        resultat.paiement.montantRecu !== null
          ? Math.round(
              (Number(resultat.paiement.montantRecu) - Number(resultat.paiement.montant)) * 100,
            ) / 100
          : null,
      soldeRestant: resultat.soldeRestant,
      additionCloturee: resultat.cloturee,
    });
  } catch (error) {
    // Deux synchronisations simultanées du même paiement hors ligne.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && cle) {
      const rejoue = await repondrePaiementExistant(cle, etablissementId, res);
      if (rejoue) return;
    }
    throw error;
  }
});
