import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { Prisma, type FormeTable } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const gerantRouter = Router();

gerantRouter.use(requireAuth, requireRole('GERANT'));

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

const DROITS_VALIDES = ['ANNULER', 'CLOTURER'] as const;

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
    select: { id: true, nom: true, statut: true, creeLe: true },
    orderBy: { creeLe: 'asc' },
  });

  res.json(categories);
});

gerantRouter.post('/categories', async (req, res) => {
  const { nom } = req.body ?? {};

  if (typeof nom !== 'string' || !nom.trim()) {
    res.status(400).json({ error: 'Le nom de la catégorie est requis' });
    return;
  }

  const { etablissementId } = await getContexteGerant(req.user!.id);

  const categorie = await prisma.categorie.create({
    data: { nom, etablissementId },
  });

  res.status(201).json(categorie);
});

gerantRouter.patch('/categories/:id', async (req, res) => {
  const { nom, statut } = req.body ?? {};
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

  const categorieMaj = await prisma.categorie.update({
    where: { id: categorie.id },
    data: {
      nom: typeof nom === 'string' && nom.trim() ? nom : undefined,
      statut: statut ?? undefined,
    },
  });

  res.json(categorieMaj);
});

// --- Produits ---

function toPublicProduit(produit: { prix: { toString(): string } } & Record<string, unknown>) {
  return { ...produit, prix: Number(produit.prix) };
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
  const { nom, description, prix, categorieId, tempsPreparationMinutes } = req.body ?? {};

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
    res.status(400).json({ error: 'Le temps de préparation doit être un nombre entier positif de minutes' });
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
      categorieId,
      etablissementId,
      tempsPreparationMinutes: tempsPrepa.valeur,
    },
  });

  res.status(201).json(toPublicProduit(produit));
});

gerantRouter.patch('/produits/:id', async (req, res) => {
  const { nom, description, prix, categorieId, statut, tempsPreparationMinutes } = req.body ?? {};
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
      res.status(400).json({ error: 'Le temps de préparation doit être un nombre entier positif de minutes' });
      return;
    }
    nouveauTempsPrepa = tempsPrepa.valeur;
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
  const { numero, forme, nombreCouverts, largeur, hauteur, positionX, positionY, statut } = req.body ?? {};
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
  const totauxParJournee = new Map<string, Array<{ moyenPaiement: string; montant: number; nombre: number }>>();
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
