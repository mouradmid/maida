import { Router } from 'express';
import { Prisma } from '../../generated/prisma/client';
import {
  decompterStock,
  erreurLignesEntree,
  ErreurStock,
  resoudreLignesCommande,
  type LigneEntree,
  type LigneSourceEntree,
} from '../../lib/commandes';
import { prisma } from '../../lib/prisma';
import { getContexteServeur, lireCleIdempotence, lireDateHorsLigne } from './partage';
import { INCLUDE_COMMANDE, toPublicCommande } from './vues';

export const commandesRouter = Router();

commandesRouter.get('/commandes', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const commandes = await prisma.commande.findMany({
    where: { etablissementId },
    include: INCLUDE_COMMANDE,
    orderBy: { creeLe: 'desc' },
    take: 50,
  });

  res.json(commandes.map(toPublicCommande));
});

// Le serveur réclame la suite suivante pour toute la table : la cuisine peut
// alors la préparer. Porte sur l'addition (une table = une addition ouverte),
// donc toutes les commandes en préparation avancent ensemble.
commandesRouter.post('/additions/:id/reclamer', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const addition = await prisma.addition.findFirst({
    where: { id: req.params.id, etablissementId },
    include: {
      commandes: {
        where: { statut: 'ENVOYEE' },
        include: { lignes: { select: { suite: true } } },
      },
    },
  });
  if (!addition) {
    res.status(404).json({ error: 'Addition introuvable' });
    return;
  }
  if (addition.commandes.length === 0) {
    res.status(409).json({ error: 'Aucune commande en préparation sur cette addition' });
    return;
  }
  const suiteMax = Math.max(1, ...addition.commandes.flatMap((c) => c.lignes.map((l) => l.suite)));
  const suiteActuelle = Math.max(1, ...addition.commandes.map((c) => c.suiteReclamee));
  if (suiteActuelle >= suiteMax) {
    res.status(409).json({ error: 'Toutes les suites de cette table sont déjà réclamées' });
    return;
  }

  await prisma.commande.updateMany({
    where: { additionId: addition.id, statut: 'ENVOYEE' },
    data: { suiteReclamee: suiteActuelle + 1 },
  });

  const commandes = await prisma.commande.findMany({
    where: { additionId: addition.id },
    include: INCLUDE_COMMANDE,
    orderBy: { creeLe: 'asc' },
  });
  res.json({ suiteReclamee: suiteActuelle + 1, commandes: commandes.map(toPublicCommande) });
});

// Corrige la suite d'un article (une salade partie en plat par erreur…).
commandesRouter.patch('/lignes/:id/suite', async (req, res) => {
  const { suite } = req.body ?? {};

  if (!Number.isInteger(suite) || suite < 1 || suite > 5) {
    res.status(400).json({ error: 'Suite invalide (1 à 5)' });
    return;
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const ligne = await prisma.ligneCommande.findFirst({
    where: { id: req.params.id, commande: { etablissementId } },
    include: { commande: true },
  });
  if (!ligne) {
    res.status(404).json({ error: 'Article introuvable' });
    return;
  }
  if (ligne.commande.statut !== 'ENVOYEE') {
    res.status(409).json({ error: "Cette commande n'est plus en préparation" });
    return;
  }

  await prisma.ligneCommande.update({ where: { id: ligne.id }, data: { suite } });

  const commande = await prisma.commande.findUniqueOrThrow({
    where: { id: ligne.commandeId },
    include: INCLUDE_COMMANDE,
  });
  res.json(toPublicCommande(commande));
});

commandesRouter.post('/commandes', async (req, res) => {
  const { canal, tableId, noteCuisine, lignes, cleIdempotence, creeLeHorsLigne } = req.body ?? {};

  if (canal !== 'SUR_PLACE' && canal !== 'EMPORTER') {
    res.status(400).json({ error: 'Canal invalide' });
    return;
  }
  const cle = lireCleIdempotence(cleIdempotence);
  if (cle === false) {
    res.status(400).json({ error: "Clé d'idempotence invalide" });
    return;
  }
  const creeLeFinal = lireDateHorsLigne(creeLeHorsLigne);
  if (creeLeFinal === false) {
    res.status(400).json({ error: 'Date de prise hors ligne invalide' });
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
  // La caisse peut mélanger nouveaux produits et « la même chose en plus »
  // (lignes { ligneSourceId, quantite } dupliquant un article déjà envoyé).
  const erreurLignes = erreurLignesEntree(lignes, true);
  if (erreurLignes) {
    res.status(400).json({ error: erreurLignes });
    return;
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  // Rejeu d'une commande déjà synchronisée : on renvoie l'existante, sans doublon.
  if (cle) {
    const existante = await prisma.commande.findUnique({
      where: { cleIdempotence: cle },
      include: INCLUDE_COMMANDE,
    });
    if (existante) {
      if (existante.etablissementId !== etablissementId) {
        res.status(409).json({ error: "Clé d'idempotence déjà utilisée" });
        return;
      }
      res.status(200).json(toPublicCommande(existante));
      return;
    }
  }

  let additionId: string;
  if (canal === 'SUR_PLACE') {
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table || table.etablissementId !== etablissementId || table.statut !== 'ACTIF') {
      res.status(400).json({ error: 'Table invalide' });
      return;
    }
    const additionOuverte = await prisma.addition.findFirst({
      where: { etablissementId, tableId: table.id, statut: 'OUVERTE' },
    });
    additionId = additionOuverte
      ? additionOuverte.id
      : (await prisma.addition.create({ data: { etablissementId, tableId: table.id } })).id;
  } else {
    additionId = (await prisma.addition.create({ data: { etablissementId, tableId: null } })).id;
  }

  const lignesProduits = (lignes as Array<LigneEntree | LigneSourceEntree>).filter(
    (l): l is LigneEntree => !('ligneSourceId' in l),
  );
  const lignesSources = (lignes as Array<LigneEntree | LigneSourceEntree>).filter(
    (l): l is LigneSourceEntree => 'ligneSourceId' in l,
  );

  const resolution = await resoudreLignesCommande(etablissementId, lignesProduits);
  if (!resolution.ok) {
    res.status(400).json({ error: resolution.erreur });
    return;
  }
  // Une vente à emporter part d'un bloc : pas de service en plusieurs temps,
  // donc pas de suite à réclamer. On ignore la suite par défaut des catégories,
  // sinon un plat attendrait une réclame qui ne viendra jamais.
  const lignesAvecOptions =
    canal === 'EMPORTER' ? resolution.lignes.map((l) => ({ ...l, suite: 1 })) : resolution.lignes;

  // Duplication des articles existants : mêmes produit, options et suite que
  // la ligne d'origine (qui doit appartenir à la même addition, encore ouverte) ;
  // prix, coût et TVA figés à aujourd'hui, comme toute nouvelle ligne.
  const duplicats: Array<{
    produitId: string;
    nomProduit: string;
    prixUnitaire: Prisma.Decimal;
    coutRevientUnitaire: Prisma.Decimal | null;
    tauxTva: number;
    suite: number;
    quantite: number;
    options: Array<{ optionValeurId: string | null; nomGroupe: string; valeur: string }>;
  }> = [];
  if (lignesSources.length > 0) {
    // Plusieurs « + » sur le même article se cumulent en une seule ligne.
    const quantitesParSource = new Map<string, number>();
    for (const l of lignesSources) {
      quantitesParSource.set(
        l.ligneSourceId,
        Math.min((quantitesParSource.get(l.ligneSourceId) ?? 0) + l.quantite, 50),
      );
    }
    const sources = await prisma.ligneCommande.findMany({
      where: {
        id: { in: [...quantitesParSource.keys()] },
        commande: { etablissementId, additionId, statut: { not: 'ANNULEE' } },
      },
      include: { options: true, produit: true },
    });
    const sourcesParId = new Map(sources.map((s) => [s.id, s]));
    for (const [ligneSourceId, quantite] of quantitesParSource) {
      const source = sourcesParId.get(ligneSourceId);
      if (!source) {
        res.status(400).json({ error: 'Article à dupliquer introuvable sur cette addition' });
        return;
      }
      if (source.produit.statut !== 'ACTIF') {
        res.status(409).json({ error: `« ${source.produit.nom} » n'est plus au menu` });
        return;
      }
      duplicats.push({
        produitId: source.produitId,
        nomProduit: source.produit.nom,
        prixUnitaire: source.produit.prix,
        coutRevientUnitaire: source.produit.coutRevient,
        tauxTva: source.produit.tauxTva,
        suite: canal === 'EMPORTER' ? 1 : source.suite,
        quantite,
        options: source.options.map((o) => ({
          optionValeurId: o.optionValeurId,
          nomGroupe: o.nomGroupe,
          valeur: o.valeur,
        })),
      });
    }
  }

  // La table garde sa progression : une commande ajoutée pendant les plats
  // part en préparation tout de suite, sans re-réclamer les suites servies.
  const progression = await prisma.commande.aggregate({
    where: { additionId, statut: { not: 'ANNULEE' } },
    _max: { suiteReclamee: true },
  });
  const suiteReclamee = progression._max.suiteReclamee ?? 1;

  const toutesLignes = [...lignesAvecOptions, ...duplicats];

  try {
    // Décompte du stock et création dans la même transaction : si un produit
    // suivi vient d'être épuisé, rien n'est écrit et le serveur reçoit un 409.
    const commande = await prisma.$transaction(async (tx) => {
      await decompterStock(tx, toutesLignes);
      return tx.commande.create({
        data: {
          canal,
          additionId,
          cleIdempotence: cle ?? null,
          creeLe: creeLeFinal,
          noteCuisine: typeof noteCuisine === 'string' && noteCuisine.trim() ? noteCuisine.trim() : null,
          etablissementId,
          serveurId: req.user!.id,
          suiteReclamee,
          lignes: {
            create: toutesLignes.map((l) => ({
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
    });
    res.status(201).json(toPublicCommande(commande));
  } catch (error) {
    // Produit épuisé entre-temps : rupture posée ou dernière portion prise.
    if (error instanceof ErreurStock) {
      res.status(409).json({ error: error.message });
      return;
    }
    // Deux synchronisations simultanées de la même commande hors ligne :
    // la seconde renvoie celle que la première vient de créer.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && cle) {
      const existante = await prisma.commande.findUnique({
        where: { cleIdempotence: cle },
        include: INCLUDE_COMMANDE,
      });
      if (existante && existante.etablissementId === etablissementId) {
        res.status(200).json(toPublicCommande(existante));
        return;
      }
    }
    throw error;
  }
});
