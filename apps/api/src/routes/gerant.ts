import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { Prisma, type FormeTable } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireCompteActif } from '../middleware/requireCompteActif';
import { requireRole } from '../middleware/requireRole';

export const gerantRouter = Router();

gerantRouter.use(requireAuth, requireRole('GERANT'), requireCompteActif);

async function getContexteGerant(gerantId: string) {
  const gerant = await prisma.utilisateur.findUnique({ where: { id: gerantId } });
  if (!gerant?.etablissementId || !gerant?.compteClientId) {
    throw new Error('Gérant sans établissement associé');
  }
  return { compteClientId: gerant.compteClientId, etablissementId: gerant.etablissementId };
}

gerantRouter.get('/serveurs', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const serveurs = await prisma.utilisateur.findMany({
    where: { etablissementId, role: 'SERVEUR' },
    select: { id: true, nom: true, prenom: true, statut: true, droits: true, creeLe: true },
    orderBy: { creeLe: 'desc' },
  });

  res.json(serveurs);
});

const DROITS_VALIDES = ['ANNULER', 'CLOTURER', 'REMISER'] as const;

gerantRouter.patch('/serveurs/:id/droits', async (req, res) => {
  const { droits } = req.body ?? {};

  if (
    !Array.isArray(droits) ||
    droits.some((d) => !DROITS_VALIDES.includes(d as (typeof DROITS_VALIDES)[number]))
  ) {
    res.status(400).json({ error: 'Droits invalides' });
    return;
  }

  const { etablissementId } = await getContexteGerant(req.user!.id);

  const serveur = await prisma.utilisateur.findFirst({
    where: { id: req.params.id, etablissementId, role: 'SERVEUR' },
  });
  if (!serveur) {
    res.status(404).json({ error: 'Serveur introuvable' });
    return;
  }

  const majApres = await prisma.utilisateur.update({
    where: { id: serveur.id },
    data: { droits: [...new Set(droits as (typeof DROITS_VALIDES)[number][])] },
    select: { id: true, nom: true, prenom: true, statut: true, droits: true, creeLe: true },
  });

  res.json(majApres);
});

gerantRouter.post('/serveurs', async (req, res) => {
  const { nom, prenom, codePin } = req.body ?? {};

  if (typeof nom !== 'string' || !nom.trim() || typeof prenom !== 'string' || !prenom.trim()) {
    res.status(400).json({ error: 'Nom et prénom requis' });
    return;
  }
  if (typeof codePin !== 'string' || !/^\d{4}$/.test(codePin)) {
    res.status(400).json({ error: 'Le code PIN doit contenir exactement 4 chiffres' });
    return;
  }

  const { compteClientId, etablissementId } = await getContexteGerant(req.user!.id);

  const serveursExistants = await prisma.utilisateur.findMany({
    where: { etablissementId, role: 'SERVEUR', codePinHash: { not: null } },
    select: { codePinHash: true },
  });

  for (const s of serveursExistants) {
    if (s.codePinHash && (await bcrypt.compare(codePin, s.codePinHash))) {
      res.status(409).json({ error: 'Ce code PIN est déjà utilisé dans cet établissement' });
      return;
    }
  }

  const codePinHash = await bcrypt.hash(codePin, 12);

  const serveur = await prisma.utilisateur.create({
    data: {
      role: 'SERVEUR',
      nom,
      prenom,
      codePinHash,
      compteClientId,
      etablissementId,
    },
  });

  res.status(201).json({
    id: serveur.id,
    nom: serveur.nom,
    prenom: serveur.prenom,
    role: serveur.role,
    statut: serveur.statut,
  });
});

// --- Catégories ---

gerantRouter.get('/categories', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const categories = await prisma.categorie.findMany({
    where: { etablissementId },
    select: { id: true, nom: true, type: true, statut: true, creeLe: true },
    orderBy: { creeLe: 'asc' },
  });

  res.json(categories);
});

gerantRouter.post('/categories', async (req, res) => {
  const { nom, type } = req.body ?? {};

  if (typeof nom !== 'string' || !nom.trim()) {
    res.status(400).json({ error: 'Le nom de la catégorie est requis' });
    return;
  }
  if (type !== undefined && type !== 'NOURRITURE' && type !== 'BOISSON') {
    res.status(400).json({ error: 'Type de catégorie invalide' });
    return;
  }

  const { etablissementId } = await getContexteGerant(req.user!.id);

  const categorie = await prisma.categorie.create({
    data: { nom, type: type ?? undefined, etablissementId },
  });

  res.status(201).json(categorie);
});

gerantRouter.patch('/categories/:id', async (req, res) => {
  const { nom, statut, type } = req.body ?? {};
  const { etablissementId } = await getContexteGerant(req.user!.id);

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

  const categorieMaj = await prisma.categorie.update({
    where: { id: categorie.id },
    data: {
      nom: typeof nom === 'string' && nom.trim() ? nom : undefined,
      statut: statut ?? undefined,
      type: type ?? undefined,
    },
  });

  res.json(categorieMaj);
});

// --- Produits ---

function toPublicProduit(
  produit: { prix: { toString(): string }; coutRevient: { toString(): string } | null } & Record<
    string,
    unknown
  >,
) {
  return {
    ...produit,
    prix: Number(produit.prix),
    coutRevient: produit.coutRevient !== null ? Number(produit.coutRevient) : null,
  };
}

// Taux de TVA : entier entre 0 et 100 (undefined = ne pas modifier / défaut).
function tauxTvaValide(valeur: unknown): boolean {
  return typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 0 && valeur <= 100;
}

// Coût de revient : nombre positif, ou vide/null pour « non renseigné ».
function validerCoutRevient(valeur: unknown): { ok: true; valeur: number | null } | { ok: false } {
  if (valeur === undefined || valeur === null || valeur === '') {
    return { ok: true, valeur: null };
  }
  if (typeof valeur !== 'number' || !Number.isFinite(valeur) || valeur < 0) {
    return { ok: false };
  }
  return { ok: true, valeur };
}

gerantRouter.get('/produits', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);
  const { categorieId } = req.query;

  const produits = await prisma.produit.findMany({
    where: {
      etablissementId,
      categorieId: typeof categorieId === 'string' ? categorieId : undefined,
    },
    include: {
      groupesOptions: {
        include: { valeurs: { orderBy: { creeLe: 'asc' } } },
        orderBy: { creeLe: 'asc' },
      },
    },
    orderBy: { creeLe: 'asc' },
  });

  res.json(produits.map(toPublicProduit));
});

function validerTempsPreparation(valeur: unknown): { ok: true; valeur: number | null } | { ok: false } {
  if (valeur === undefined || valeur === null || valeur === '') {
    return { ok: true, valeur: null };
  }
  if (typeof valeur !== 'number' || !Number.isInteger(valeur) || valeur <= 0) {
    return { ok: false };
  }
  return { ok: true, valeur };
}

gerantRouter.post('/produits', async (req, res) => {
  const { nom, description, prix, categorieId, tempsPreparationMinutes, coutRevient, tauxTva } =
    req.body ?? {};

  if (typeof nom !== 'string' || !nom.trim()) {
    res.status(400).json({ error: 'Le nom du produit est requis' });
    return;
  }
  if (typeof prix !== 'number' || !Number.isFinite(prix) || prix <= 0) {
    res.status(400).json({ error: 'Le prix doit être un nombre positif' });
    return;
  }
  if (typeof categorieId !== 'string') {
    res.status(400).json({ error: 'La catégorie est requise' });
    return;
  }
  const tempsPrepa = validerTempsPreparation(tempsPreparationMinutes);
  if (!tempsPrepa.ok) {
    res
      .status(400)
      .json({ error: 'Le temps de préparation doit être un nombre entier positif de minutes' });
    return;
  }
  const cout = validerCoutRevient(coutRevient);
  if (!cout.ok) {
    res.status(400).json({ error: 'Le coût de revient doit être un nombre positif ou nul' });
    return;
  }
  if (tauxTva !== undefined && !tauxTvaValide(tauxTva)) {
    res.status(400).json({ error: 'Le taux de TVA doit être un entier entre 0 et 100' });
    return;
  }

  const { etablissementId } = await getContexteGerant(req.user!.id);

  const categorie = await prisma.categorie.findUnique({ where: { id: categorieId } });
  if (!categorie || categorie.etablissementId !== etablissementId) {
    res.status(400).json({ error: 'Catégorie invalide' });
    return;
  }

  const produit = await prisma.produit.create({
    data: {
      nom,
      description: typeof description === 'string' ? description : null,
      prix,
      coutRevient: cout.valeur,
      tauxTva: tauxTva ?? undefined,
      categorieId,
      etablissementId,
      tempsPreparationMinutes: tempsPrepa.valeur,
    },
  });

  res.status(201).json(toPublicProduit(produit));
});

gerantRouter.patch('/produits/:id', async (req, res) => {
  const { nom, description, prix, categorieId, statut, tempsPreparationMinutes, coutRevient, tauxTva } =
    req.body ?? {};
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const produit = await prisma.produit.findUnique({ where: { id: req.params.id } });
  if (!produit || produit.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Produit introuvable' });
    return;
  }

  if (statut !== undefined && statut !== 'ACTIF' && statut !== 'INACTIF') {
    res.status(400).json({ error: 'Statut invalide' });
    return;
  }
  if (prix !== undefined && (typeof prix !== 'number' || !Number.isFinite(prix) || prix <= 0)) {
    res.status(400).json({ error: 'Le prix doit être un nombre positif' });
    return;
  }
  if (categorieId !== undefined) {
    const categorie = await prisma.categorie.findUnique({ where: { id: categorieId } });
    if (!categorie || categorie.etablissementId !== etablissementId) {
      res.status(400).json({ error: 'Catégorie invalide' });
      return;
    }
  }
  let nouveauTempsPrepa: number | null | undefined = undefined;
  if (tempsPreparationMinutes !== undefined) {
    const tempsPrepa = validerTempsPreparation(tempsPreparationMinutes);
    if (!tempsPrepa.ok) {
      res
        .status(400)
        .json({ error: 'Le temps de préparation doit être un nombre entier positif de minutes' });
      return;
    }
    nouveauTempsPrepa = tempsPrepa.valeur;
  }
  let nouveauCout: number | null | undefined = undefined;
  if (coutRevient !== undefined) {
    const cout = validerCoutRevient(coutRevient);
    if (!cout.ok) {
      res.status(400).json({ error: 'Le coût de revient doit être un nombre positif ou nul' });
      return;
    }
    nouveauCout = cout.valeur;
  }
  if (tauxTva !== undefined && !tauxTvaValide(tauxTva)) {
    res.status(400).json({ error: 'Le taux de TVA doit être un entier entre 0 et 100' });
    return;
  }

  const produitMaj = await prisma.produit.update({
    where: { id: produit.id },
    data: {
      nom: typeof nom === 'string' && nom.trim() ? nom : undefined,
      description: typeof description === 'string' ? description : undefined,
      prix: prix ?? undefined,
      categorieId: categorieId ?? undefined,
      statut: statut ?? undefined,
      tempsPreparationMinutes: nouveauTempsPrepa,
      coutRevient: nouveauCout,
      tauxTva: tauxTva ?? undefined,
    },
  });

  res.json(toPublicProduit(produitMaj));
});

// --- Plan de salle ---

const FORMES_VALIDES = ['RONDE', 'CARREE', 'RECTANGULAIRE'];

gerantRouter.get('/tables', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const tables = await prisma.table.findMany({
    where: { etablissementId },
    orderBy: { creeLe: 'asc' },
  });

  res.json(tables);
});

gerantRouter.post('/tables', async (req, res) => {
  const { numero, forme, nombreCouverts, largeur, hauteur } = req.body ?? {};

  if (typeof numero !== 'string' || !numero.trim()) {
    res.status(400).json({ error: 'Le numéro de table est requis' });
    return;
  }
  if (typeof forme !== 'string' || !FORMES_VALIDES.includes(forme)) {
    res.status(400).json({ error: 'Forme invalide' });
    return;
  }
  if (!Number.isInteger(nombreCouverts) || nombreCouverts <= 0) {
    res.status(400).json({ error: 'Le nombre de couverts doit être un entier positif' });
    return;
  }

  const { etablissementId } = await getContexteGerant(req.user!.id);

  const nombreTables = await prisma.table.count({ where: { etablissementId } });
  const positionX = 20 + (nombreTables % 6) * 110;
  const positionY = 20 + Math.floor(nombreTables / 6) * 110;

  try {
    const table = await prisma.table.create({
      data: {
        numero,
        forme: forme as FormeTable,
        nombreCouverts,
        largeur: Number.isInteger(largeur) && largeur > 0 ? largeur : undefined,
        hauteur: Number.isInteger(hauteur) && hauteur > 0 ? hauteur : undefined,
        positionX,
        positionY,
        etablissementId,
      },
    });
    res.status(201).json(table);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Ce numéro de table existe déjà' });
      return;
    }
    throw error;
  }
});

gerantRouter.patch('/tables/:id', async (req, res) => {
  const { numero, forme, nombreCouverts, largeur, hauteur, positionX, positionY, statut } =
    req.body ?? {};
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const table = await prisma.table.findUnique({ where: { id: req.params.id } });
  if (!table || table.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Table introuvable' });
    return;
  }

  if (forme !== undefined && !FORMES_VALIDES.includes(forme)) {
    res.status(400).json({ error: 'Forme invalide' });
    return;
  }
  if (nombreCouverts !== undefined && (!Number.isInteger(nombreCouverts) || nombreCouverts <= 0)) {
    res.status(400).json({ error: 'Le nombre de couverts doit être un entier positif' });
    return;
  }
  if (statut !== undefined && statut !== 'ACTIF' && statut !== 'INACTIF') {
    res.status(400).json({ error: 'Statut invalide' });
    return;
  }

  try {
    const tableMaj = await prisma.table.update({
      where: { id: table.id },
      data: {
        numero: typeof numero === 'string' && numero.trim() ? numero : undefined,
        forme: forme !== undefined ? (forme as FormeTable) : undefined,
        nombreCouverts: nombreCouverts ?? undefined,
        largeur: Number.isInteger(largeur) ? largeur : undefined,
        hauteur: Number.isInteger(hauteur) ? hauteur : undefined,
        positionX: Number.isInteger(positionX) ? positionX : undefined,
        positionY: Number.isInteger(positionY) ? positionY : undefined,
        statut: statut ?? undefined,
      },
    });
    res.json(tableMaj);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Ce numéro de table existe déjà' });
      return;
    }
    throw error;
  }
});

// --- Mentions spéciales (groupes d'options par produit) ---

gerantRouter.post('/produits/:produitId/groupes', async (req, res) => {
  const { nom, obligatoire } = req.body ?? {};

  if (typeof nom !== 'string' || !nom.trim()) {
    res.status(400).json({ error: 'Le nom du groupe est requis' });
    return;
  }

  const { etablissementId } = await getContexteGerant(req.user!.id);

  const produit = await prisma.produit.findUnique({ where: { id: req.params.produitId } });
  if (!produit || produit.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Produit introuvable' });
    return;
  }

  const groupe = await prisma.groupeOption.create({
    data: { nom, obligatoire: obligatoire === true, produitId: produit.id },
    include: { valeurs: true },
  });

  res.status(201).json(groupe);
});

gerantRouter.delete('/groupes/:id', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const groupe = await prisma.groupeOption.findUnique({
    where: { id: req.params.id },
    include: { produit: true },
  });
  if (!groupe || groupe.produit.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Groupe introuvable' });
    return;
  }

  await prisma.groupeOption.delete({ where: { id: groupe.id } });
  res.status(204).send();
});

gerantRouter.post('/groupes/:groupeId/valeurs', async (req, res) => {
  const { valeur } = req.body ?? {};

  if (typeof valeur !== 'string' || !valeur.trim()) {
    res.status(400).json({ error: 'La valeur est requise' });
    return;
  }

  const { etablissementId } = await getContexteGerant(req.user!.id);

  const groupe = await prisma.groupeOption.findUnique({
    where: { id: req.params.groupeId },
    include: { produit: true },
  });
  if (!groupe || groupe.produit.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Groupe introuvable' });
    return;
  }

  const optionValeur = await prisma.optionValeur.create({
    data: { valeur, groupeOptionId: groupe.id },
  });

  res.status(201).json(optionValeur);
});

gerantRouter.delete('/valeurs/:id', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const optionValeur = await prisma.optionValeur.findUnique({
    where: { id: req.params.id },
    include: { groupeOption: { include: { produit: true } } },
  });
  if (!optionValeur || optionValeur.groupeOption.produit.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Valeur introuvable' });
    return;
  }

  await prisma.optionValeur.delete({ where: { id: optionValeur.id } });
  res.status(204).send();
});

// --- Moyens de paiement acceptés ---

const MOYENS_PAIEMENT_VALIDES = ['ESPECES', 'CARTE', 'CHEQUE', 'AUTRE'];

gerantRouter.get('/moyens-paiement', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const etablissement = await prisma.etablissement.findUnique({
    where: { id: etablissementId },
    select: { moyensPaiementActifs: true },
  });

  res.json({ actifs: etablissement?.moyensPaiementActifs ?? [], tous: MOYENS_PAIEMENT_VALIDES });
});

gerantRouter.patch('/moyens-paiement', async (req, res) => {
  const { actifs } = req.body ?? {};

  if (
    !Array.isArray(actifs) ||
    actifs.length === 0 ||
    actifs.some((m: unknown) => typeof m !== 'string' || !MOYENS_PAIEMENT_VALIDES.includes(m)) ||
    new Set(actifs).size !== actifs.length
  ) {
    res.status(400).json({ error: 'Il faut garder au moins un moyen de paiement actif, sans doublon' });
    return;
  }

  const { etablissementId } = await getContexteGerant(req.user!.id);

  const etablissement = await prisma.etablissement.update({
    where: { id: etablissementId },
    data: { moyensPaiementActifs: actifs },
    select: { moyensPaiementActifs: true },
  });

  res.json({ actifs: etablissement.moyensPaiementActifs, tous: MOYENS_PAIEMENT_VALIDES });
});

// --- Historique des annulations ---

gerantRouter.get('/annulations', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const annulations = await prisma.annulation.findMany({
    where: { etablissementId },
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
    take: 200,
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

// --- Paramètres de l'établissement ---

gerantRouter.get('/parametres', async (req, res) => {
  const { compteClientId, etablissementId } = await getContexteGerant(req.user!.id);

  const [compte, etablissement] = await Promise.all([
    prisma.compteClient.findUnique({ where: { id: compteClientId }, select: { modules: true } }),
    prisma.etablissement.findUnique({
      where: { id: etablissementId },
      select: { suiviCoutsActive: true },
    }),
  ]);

  res.json({
    moduleFoodCost: compte?.modules.includes('FOOD_COST') ?? false,
    suiviCoutsActive: etablissement?.suiviCoutsActive ?? true,
  });
});

gerantRouter.patch('/parametres', async (req, res) => {
  const { suiviCoutsActive } = req.body ?? {};

  if (typeof suiviCoutsActive !== 'boolean') {
    res.status(400).json({ error: 'Paramètre invalide' });
    return;
  }

  const { compteClientId, etablissementId } = await getContexteGerant(req.user!.id);

  const [compte, etablissement] = await Promise.all([
    prisma.compteClient.findUnique({ where: { id: compteClientId }, select: { modules: true } }),
    prisma.etablissement.update({
      where: { id: etablissementId },
      data: { suiviCoutsActive },
      select: { suiviCoutsActive: true },
    }),
  ]);

  res.json({
    moduleFoodCost: compte?.modules.includes('FOOD_COST') ?? false,
    suiviCoutsActive: etablissement.suiviCoutsActive,
  });
});

// --- Historique des remises et offerts ---

gerantRouter.get('/remises', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const remises = await prisma.remise.findMany({
    where: { etablissementId },
    include: {
      addition: { select: { table: { select: { numero: true } } } },
      ligneCommande: { select: { nomProduit: true } },
      accordeePar: { select: { nom: true, prenom: true, role: true } },
      demandeePar: { select: { nom: true, prenom: true } },
    },
    orderBy: { creeLe: 'desc' },
    take: 200,
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

// --- Rapports de ventes ---

const arrondi = (n: number) => Math.round(n * 100) / 100;

gerantRouter.get('/rapports', async (req, res) => {
  const { debut, fin } = req.query;

  if (typeof debut !== 'string' || typeof fin !== 'string') {
    res.status(400).json({ error: 'Période requise (debut et fin)' });
    return;
  }
  const dateDebut = new Date(debut);
  const dateFin = new Date(fin);
  if (Number.isNaN(dateDebut.getTime()) || Number.isNaN(dateFin.getTime()) || dateDebut > dateFin) {
    res.status(400).json({ error: 'Période invalide' });
    return;
  }

  const { compteClientId, etablissementId } = await getContexteGerant(req.user!.id);
  const periode = { gte: dateDebut, lte: dateFin };

  // Le food cost n'est renvoyé que si le module est accordé au compte client.
  const compte = await prisma.compteClient.findUnique({
    where: { id: compteClientId },
    select: { modules: true },
  });
  const moduleFoodCost = compte?.modules.includes('FOOD_COST') ?? false;

  const [paiements, commandes, annulations, remises] = await Promise.all([
    prisma.paiement.findMany({
      where: { addition: { etablissementId }, creeLe: periode },
      select: { montant: true, moyenPaiement: true },
    }),
    prisma.commande.findMany({
      where: { etablissementId, creeLe: periode },
      select: {
        statut: true,
        serveur: { select: { id: true, nom: true, prenom: true } },
        lignes: {
          select: {
            nomProduit: true,
            prixUnitaire: true,
            coutRevientUnitaire: true,
            tauxTva: true,
            quantite: true,
            quantiteAnnulee: true,
            quantiteOfferte: true,
            produit: { select: { categorie: { select: { nom: true, type: true } } } },
          },
        },
      },
    }),
    prisma.annulation.findMany({
      where: { etablissementId, creeLe: periode },
      select: { montant: true, quantite: true, apresPreparation: true },
    }),
    prisma.remise.findMany({
      where: { etablissementId, creeLe: periode },
      select: { type: true, montant: true, quantite: true },
    }),
  ]);

  // Encaissements par moyen de paiement
  const parMoyenMap = new Map<string, { montant: number; nombre: number }>();
  for (const p of paiements) {
    const entree = parMoyenMap.get(p.moyenPaiement) ?? { montant: 0, nombre: 0 };
    entree.montant += Number(p.montant);
    entree.nombre += 1;
    parMoyenMap.set(p.moyenPaiement, entree);
  }
  const parMoyen = [...parMoyenMap.entries()]
    .map(([moyenPaiement, v]) => ({ moyenPaiement, montant: arrondi(v.montant), nombre: v.nombre }))
    .sort((a, b) => b.montant - a.montant);
  const caEncaisse = arrondi(parMoyen.reduce((s, m) => s + m.montant, 0));

  // Ventes par produit / catégorie / serveur (quantités annulées exclues).
  // Le coût n'est connu que sur les lignes dont le produit avait un coût de
  // revient au moment de la commande : on suit séparément la part « couverte ».
  const parProduitMap = new Map<
    string,
    { categorie: string; quantite: number; montant: number; cout: number; montantCoute: number }
  >();
  const parCategorieMap = new Map<string, { quantite: number; montant: number }>();
  const parServeurMap = new Map<
    string,
    { nom: string; prenom: string; nbCommandes: number; montant: number }
  >();
  const parType = {
    NOURRITURE: { ventes: 0, ventesCoutees: 0, cout: 0 },
    BOISSON: { ventes: 0, ventesCoutees: 0, cout: 0 },
  };
  // TTC réellement facturable par taux de TVA (hors annulé et offert).
  // null = lignes d'avant l'introduction de la TVA, non ventilables.
  const ttcParTaux = new Map<number | null, number>();
  let caCommande = 0;
  let nbCommandes = 0;

  for (const commande of commandes) {
    if (commande.statut === 'ANNULEE') continue;
    nbCommandes += 1;
    let montantCommande = 0;

    for (const ligne of commande.lignes) {
      const quantite = ligne.quantite - ligne.quantiteAnnulee;
      if (quantite <= 0) continue;
      const montant = Number(ligne.prixUnitaire) * quantite;
      const cout =
        ligne.coutRevientUnitaire !== null ? Number(ligne.coutRevientUnitaire) * quantite : null;
      const categorie = ligne.produit.categorie.nom;
      montantCommande += montant;

      const prod = parProduitMap.get(ligne.nomProduit) ?? {
        categorie,
        quantite: 0,
        montant: 0,
        cout: 0,
        montantCoute: 0,
      };
      prod.quantite += quantite;
      prod.montant += montant;
      if (cout !== null) {
        prod.cout += cout;
        prod.montantCoute += montant;
      }
      parProduitMap.set(ligne.nomProduit, prod);

      const cat = parCategorieMap.get(categorie) ?? { quantite: 0, montant: 0 };
      cat.quantite += quantite;
      cat.montant += montant;
      parCategorieMap.set(categorie, cat);

      const type = parType[ligne.produit.categorie.type];
      type.ventes += montant;
      if (cout !== null) {
        type.ventesCoutees += montant;
        type.cout += cout;
      }

      const quantiteFacturable = quantite - ligne.quantiteOfferte;
      if (quantiteFacturable > 0) {
        const ttc = Number(ligne.prixUnitaire) * quantiteFacturable;
        ttcParTaux.set(ligne.tauxTva, (ttcParTaux.get(ligne.tauxTva) ?? 0) + ttc);
      }
    }

    caCommande += montantCommande;
    const serveur = parServeurMap.get(commande.serveur.id) ?? {
      nom: commande.serveur.nom,
      prenom: commande.serveur.prenom,
      nbCommandes: 0,
      montant: 0,
    };
    serveur.nbCommandes += 1;
    serveur.montant += montantCommande;
    parServeurMap.set(commande.serveur.id, serveur);
  }

  // Pertes : annulations de la période (perte sèche = après préparation)
  const pertes = { montant: 0, quantite: 0, apresPreparation: { montant: 0, quantite: 0 } };
  for (const a of annulations) {
    pertes.montant += Number(a.montant);
    pertes.quantite += a.quantite;
    if (a.apresPreparation) {
      pertes.apresPreparation.montant += Number(a.montant);
      pertes.apresPreparation.quantite += a.quantite;
    }
  }

  res.json({
    periode: { debut: dateDebut, fin: dateFin },
    caEncaisse,
    nbPaiements: paiements.length,
    parMoyen,
    caCommande: arrondi(caCommande),
    nbCommandes,
    ticketMoyen: nbCommandes > 0 ? arrondi(caCommande / nbCommandes) : 0,
    parProduit: [...parProduitMap.entries()]
      .map(([nom, v]) => ({
        nom,
        categorie: v.categorie,
        quantite: v.quantite,
        montant: arrondi(v.montant),
        // Marge et food cost % calculés sur la part des ventes dont le coût est connu.
        cout: moduleFoodCost && v.montantCoute > 0 ? arrondi(v.cout) : null,
        marge: moduleFoodCost && v.montantCoute > 0 ? arrondi(v.montantCoute - v.cout) : null,
        foodCostPct:
          moduleFoodCost && v.montantCoute > 0 ? arrondi((v.cout / v.montantCoute) * 100) : null,
      }))
      .sort((a, b) => b.montant - a.montant),
    parCategorie: [...parCategorieMap.entries()]
      .map(([nom, v]) => ({ nom, quantite: v.quantite, montant: arrondi(v.montant) }))
      .sort((a, b) => b.montant - a.montant),
    parServeur: [...parServeurMap.values()]
      .map((s) => ({ ...s, montant: arrondi(s.montant) }))
      .sort((a, b) => b.montant - a.montant),
    pertes: {
      montant: arrondi(pertes.montant),
      quantite: pertes.quantite,
      apresPreparation: {
        montant: arrondi(pertes.apresPreparation.montant),
        quantite: pertes.apresPreparation.quantite,
      },
    },
    foodCost: moduleFoodCost
      ? {
          nourriture: resumeCout(parType.NOURRITURE),
          boissons: resumeCout(parType.BOISSON),
        }
      : null,
    remises: {
      montant: arrondi(remises.reduce((s, r) => s + Number(r.montant), 0)),
      nombre: remises.length,
      offerts: {
        montant: arrondi(
          remises.filter((r) => r.type === 'OFFERT').reduce((s, r) => s + Number(r.montant), 0),
        ),
        quantite: remises.filter((r) => r.type === 'OFFERT').reduce((s, r) => s + (r.quantite ?? 0), 0),
      },
    },
    tva: calculerTva(
      ttcParTaux,
      remises.filter((r) => r.type === 'REMISE').reduce((s, r) => s + Number(r.montant), 0),
    ),
  });
});

// TVA collectée par taux : prix TTC, donc HT = TTC / (1 + taux/100).
// Les remises sur addition réduisent la base taxable : elles sont réparties
// au prorata du TTC de chaque taux (approximation comptable classique).
function calculerTva(ttcParTaux: Map<number | null, number>, remisesTotal: number) {
  const totalVentile = [...ttcParTaux.entries()]
    .filter(([taux]) => taux !== null)
    .reduce((s, [, ttc]) => s + ttc, 0);

  const parTaux = [...ttcParTaux.entries()]
    .filter((entree): entree is [number, number] => entree[0] !== null)
    .sort((a, b) => b[0] - a[0])
    .map(([taux, ttcBrut]) => {
      const remiseAllouee = totalVentile > 0 ? (remisesTotal * ttcBrut) / totalVentile : 0;
      const ttc = Math.max(0, arrondi(ttcBrut - remiseAllouee));
      const ht = arrondi(ttc / (1 + taux / 100));
      return { taux, ttc, ht, tva: arrondi(ttc - ht) };
    });

  return {
    parTaux,
    totalTva: arrondi(parTaux.reduce((s, t) => s + t.tva, 0)),
    // Lignes d'avant l'introduction de la TVA : TTC connu, taux inconnu.
    nonVentile: arrondi(ttcParTaux.get(null) ?? 0),
  };
}

// Résumé food/bev cost : % calculé sur la part des ventes dont le coût est
// connu, avec le taux de couverture pour juger de la fiabilité du chiffre.
function resumeCout(t: { ventes: number; ventesCoutees: number; cout: number }) {
  return {
    ventes: arrondi(t.ventes),
    cout: t.ventesCoutees > 0 ? arrondi(t.cout) : null,
    marge: t.ventesCoutees > 0 ? arrondi(t.ventesCoutees - t.cout) : null,
    pct: t.ventesCoutees > 0 ? arrondi((t.cout / t.ventesCoutees) * 100) : null,
    couverturePct: t.ventes > 0 ? arrondi((t.ventesCoutees / t.ventes) * 100) : null,
  };
}

// --- Réservations : historique et fiabilité des clients ---

gerantRouter.get('/reservations', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  // Fenêtre d'analyse : 90 derniers jours + tout ce qui est à venir.
  const depuis = new Date(Date.now() - 90 * 24 * 60 * 60_000);
  const reservations = await prisma.reservation.findMany({
    where: { etablissementId, date: { gte: depuis } },
    include: {
      table: { select: { numero: true } },
      prisePar: { select: { nom: true, prenom: true } },
    },
    orderBy: { date: 'desc' },
    take: 300,
  });

  const stats = { total: reservations.length, arrivees: 0, noShows: 0, annulees: 0, aVenir: 0 };
  for (const r of reservations) {
    if (r.statut === 'ARRIVEE') stats.arrivees += 1;
    else if (r.statut === 'NO_SHOW') stats.noShows += 1;
    else if (r.statut === 'ANNULEE') stats.annulees += 1;
    else stats.aVenir += 1;
  }
  const decidees = stats.arrivees + stats.noShows;
  const tauxNoShow = decidees > 0 ? Math.round((stats.noShows / decidees) * 1000) / 10 : null;

  // Clients à risque : regroupés par téléphone (à défaut par nom).
  const parClient = new Map<
    string,
    {
      nomClient: string;
      telephone: string | null;
      email: string | null;
      noShows: number;
      venues: number;
    }
  >();
  for (const r of reservations) {
    if (r.statut !== 'ARRIVEE' && r.statut !== 'NO_SHOW') continue;
    const cle = r.telephone?.replace(/\s/g, '') || r.nomClient.trim().toLowerCase();
    const entree = parClient.get(cle) ?? {
      nomClient: r.nomClient,
      telephone: r.telephone,
      email: r.email,
      noShows: 0,
      venues: 0,
    };
    if (r.statut === 'NO_SHOW') entree.noShows += 1;
    else entree.venues += 1;
    if (r.email && !entree.email) entree.email = r.email;
    parClient.set(cle, entree);
  }
  const clientsARisque = [...parClient.values()]
    .filter((c) => c.noShows > 0)
    .sort((a, b) => b.noShows - a.noShows)
    .slice(0, 20);

  res.json({
    stats: { ...stats, tauxNoShow },
    clientsARisque,
    reservations: reservations.map((r) => ({
      id: r.id,
      nomClient: r.nomClient,
      telephone: r.telephone,
      email: r.email,
      nombreCouverts: r.nombreCouverts,
      date: r.date,
      note: r.note,
      statut: r.statut,
      table: r.table,
      prisePar: r.prisePar,
    })),
  });
});

// --- Journées de caisse ---

gerantRouter.get('/journees', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const journees = await prisma.journeeCaisse.findMany({
    where: { etablissementId },
    include: {
      ouvertePar: { select: { nom: true, prenom: true } },
      clotureePar: { select: { nom: true, prenom: true, role: true } },
      clotureDemandeePar: { select: { nom: true, prenom: true } },
    },
    orderBy: { ouverteLe: 'desc' },
    take: 90,
  });

  const totaux = await prisma.paiement.groupBy({
    by: ['journeeCaisseId', 'moyenPaiement'],
    where: { journeeCaisseId: { in: journees.map((j) => j.id) } },
    _sum: { montant: true },
    _count: { _all: true },
  });
  const totauxParJournee = new Map<
    string,
    Array<{ moyenPaiement: string; montant: number; nombre: number }>
  >();
  for (const t of totaux) {
    if (!t.journeeCaisseId) continue;
    const liste = totauxParJournee.get(t.journeeCaisseId) ?? [];
    liste.push({
      moyenPaiement: t.moyenPaiement,
      montant: Math.round(Number(t._sum.montant ?? 0) * 100) / 100,
      nombre: t._count._all,
    });
    totauxParJournee.set(t.journeeCaisseId, liste);
  }

  res.json(
    journees.map((j) => {
      const parMoyen = totauxParJournee.get(j.id) ?? [];
      return {
        id: j.id,
        statut: j.statut,
        fondDeCaisse: Number(j.fondDeCaisse),
        ouverteLe: j.ouverteLe,
        clotureeLe: j.clotureeLe,
        especesAttendues: j.especesAttendues !== null ? Number(j.especesAttendues) : null,
        especesComptees: j.especesComptees !== null ? Number(j.especesComptees) : null,
        ecart: j.ecart !== null ? Number(j.ecart) : null,
        commentaire: j.commentaire,
        ouvertePar: j.ouvertePar,
        clotureePar: j.clotureePar,
        clotureDemandeePar: j.clotureDemandeePar,
        totaux: {
          parMoyen,
          total: Math.round(parMoyen.reduce((s, m) => s + m.montant, 0) * 100) / 100,
        },
      };
    }),
  );
});
