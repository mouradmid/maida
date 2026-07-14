import { Router } from 'express';
import type { ModePaiement, Prisma } from '../generated/prisma/client';
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

caisseRouter.get('/moyens-paiement', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const etablissement = await prisma.etablissement.findUnique({
    where: { id: etablissementId },
    select: { moyensPaiementActifs: true },
  });

  res.json({ actifs: etablissement?.moyensPaiementActifs ?? [] });
});

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

caisseRouter.get('/tables', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const tables = await prisma.table.findMany({
    where: { etablissementId, statut: 'ACTIF' },
    select: {
      id: true,
      numero: true,
      nombreCouverts: true,
      forme: true,
      largeur: true,
      hauteur: true,
      positionX: true,
      positionY: true,
      additions: { where: { statut: 'OUVERTE' }, select: { id: true } },
    },
  });

  // Tri numérique naturel : « Table 2 » avant « Table 10 » (numero est une chaîne).
  tables.sort((a, b) => a.numero.localeCompare(b.numero, 'fr', { numeric: true }));

  res.json(
    tables.map(({ additions, ...table }) => ({
      ...table,
      occupee: additions.length > 0,
    })),
  );
});

function toPublicCommande(commande: {
  id: string;
  canal: string;
  noteCuisine: string | null;
  statut: string;
  creeLe: Date;
  serveur: { nom: string; prenom: string };
  addition: { id: string; statut: string; table: { numero: string } | null };
  lignes: Array<{
    id: string;
    nomProduit: string;
    prixUnitaire: unknown;
    quantite: number;
    quantitePayee: number;
    options: Array<{ id: string; nomGroupe: string; valeur: string }>;
  }>;
}) {
  const lignes = commande.lignes.map((l) => ({
    id: l.id,
    nomProduit: l.nomProduit,
    prixUnitaire: Number(l.prixUnitaire),
    quantite: l.quantite,
    quantitePayee: l.quantitePayee,
    options: l.options.map((o) => ({ nomGroupe: o.nomGroupe, valeur: o.valeur })),
  }));
  const total = lignes.reduce((somme, l) => somme + l.prixUnitaire * l.quantite, 0);

  return {
    id: commande.id,
    canal: commande.canal,
    noteCuisine: commande.noteCuisine,
    additionId: commande.addition.id,
    additionStatut: commande.addition.statut,
    table: commande.addition.table,
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
  addition: { include: { table: { select: { numero: true } } } },
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
      additionId,
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

// --- Encaissement ---

const INCLUDE_ADDITION = {
  table: { select: { numero: true } },
  commandes: { include: { lignes: true } },
  paiements: true,
} satisfies Prisma.AdditionInclude;

type AdditionAvecTotaux = Prisma.AdditionGetPayload<{ include: typeof INCLUDE_ADDITION }>;

function calculerTotaux(addition: AdditionAvecTotaux) {
  const total = addition.commandes
    .flatMap((c) => c.lignes)
    .reduce((s, l) => s + Number(l.prixUnitaire) * l.quantite, 0);
  const totalPaye = addition.paiements.reduce((s, p) => s + Number(p.montant), 0);
  const solde = Math.max(0, Math.round((total - totalPaye) * 100) / 100);
  return { total: Math.round(total * 100) / 100, totalPaye: Math.round(totalPaye * 100) / 100, solde };
}

caisseRouter.get('/additions', async (req, res) => {
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

caisseRouter.get('/additions/:id', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const addition = await prisma.addition.findUnique({
    where: { id: req.params.id },
    include: {
      table: { select: { numero: true } },
      commandes: { include: { lignes: { include: { options: true } } }, orderBy: { creeLe: 'asc' } },
      paiements: { include: { lignes: true }, orderBy: { creeLe: 'asc' } },
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
        quantite: l.quantite,
        quantitePayee: l.quantitePayee,
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
  });
});

interface LigneAPayer {
  ligneCommandeId: string;
  quantite: number;
}

caisseRouter.post('/additions/:id/paiements', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);
  const { mode, montant, moyenPaiement, montantRecu, lignes } = req.body ?? {};

  const MOYENS_VALIDES: ModePaiement[] = ['ESPECES', 'CARTE', 'CHEQUE', 'AUTRE'];
  if (typeof moyenPaiement !== 'string' || !MOYENS_VALIDES.includes(moyenPaiement as ModePaiement)) {
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

  const addition = await prisma.addition.findUnique({
    where: { id: req.params.id },
    include: INCLUDE_ADDITION,
  });
  if (!addition || addition.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Addition introuvable' });
    return;
  }
  if (addition.statut !== 'OUVERTE') {
    res.status(400).json({ error: 'Cette addition est déjà soldée' });
    return;
  }

  const { solde } = calculerTotaux(addition);
  const lignesParId = new Map(addition.commandes.flatMap((c) => c.lignes).map((l) => [l.id, l]));

  let montantFinal: number;
  let lignesAPayer: Array<{ ligneCommandeId: string; quantite: number; montant: number }> = [];

  if (mode === 'ARTICLES') {
    if (!Array.isArray(lignes) || lignes.length === 0) {
      res.status(400).json({ error: 'Sélectionnez au moins un article' });
      return;
    }
    for (const entree of lignes as LigneAPayer[]) {
      const ligne = lignesParId.get(entree.ligneCommandeId);
      if (!ligne) {
        res.status(400).json({ error: 'Article invalide pour cette addition' });
        return;
      }
      if (!Number.isInteger(entree.quantite) || entree.quantite <= 0) {
        res.status(400).json({ error: 'Quantité invalide' });
        return;
      }
      const restant = ligne.quantite - ligne.quantitePayee;
      if (entree.quantite > restant) {
        res.status(400).json({ error: `Quantité indisponible pour ${ligne.nomProduit} (reste ${restant})` });
        return;
      }
    }
    lignesAPayer = (lignes as LigneAPayer[]).map((entree) => {
      const ligne = lignesParId.get(entree.ligneCommandeId)!;
      return { ligneCommandeId: ligne.id, quantite: entree.quantite, montant: Number(ligne.prixUnitaire) * entree.quantite };
    });
    montantFinal = Math.round(lignesAPayer.reduce((s, l) => s + l.montant, 0) * 100) / 100;
  } else {
    if (typeof montant !== 'number' || !Number.isFinite(montant) || montant <= 0) {
      res.status(400).json({ error: 'Montant invalide' });
      return;
    }
    montantFinal = Math.round(montant * 100) / 100;
  }

  if (montantFinal > solde + 0.01) {
    res.status(400).json({ error: `Le montant dépasse le solde restant (${solde} DZD)` });
    return;
  }
  if (moyenPaiementValide === 'ESPECES' && montantRecu !== undefined && montantRecu < montantFinal) {
    res.status(400).json({ error: 'Le montant reçu est inférieur au montant encaissé' });
    return;
  }

  const resultat = await prisma.$transaction(async (tx) => {
    const paiement = await tx.paiement.create({
      data: {
        additionId: addition.id,
        montant: montantFinal,
        moyenPaiement: moyenPaiementValide,
        montantRecu: moyenPaiementValide === 'ESPECES' && montantRecu !== undefined ? montantRecu : null,
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
        ? Math.round((Number(resultat.paiement.montantRecu) - Number(resultat.paiement.montant)) * 100) / 100
        : null,
    soldeRestant: resultat.soldeRestant,
    additionCloturee: resultat.cloturee,
  });
});
