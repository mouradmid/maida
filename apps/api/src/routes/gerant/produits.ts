import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { getContexteGerant } from './partage';

export const produitsRouter = Router();

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

function validerTempsPreparation(valeur: unknown): { ok: true; valeur: number | null } | { ok: false } {
  if (valeur === undefined || valeur === null || valeur === '') {
    return { ok: true, valeur: null };
  }
  if (typeof valeur !== 'number' || !Number.isInteger(valeur) || valeur <= 0) {
    return { ok: false };
  }
  return { ok: true, valeur };
}

produitsRouter.get('/produits', async (req, res) => {
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

produitsRouter.post('/produits', async (req, res) => {
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

produitsRouter.patch('/produits/:id', async (req, res) => {
  const {
    nom,
    description,
    prix,
    categorieId,
    statut,
    tempsPreparationMinutes,
    coutRevient,
    tauxTva,
    disponible,
    suiviQuantite,
    quantiteRestante,
  } = req.body ?? {};
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
  if (disponible !== undefined && typeof disponible !== 'boolean') {
    res.status(400).json({ error: 'disponible doit être un booléen' });
    return;
  }
  if (suiviQuantite !== undefined && typeof suiviQuantite !== 'boolean') {
    res.status(400).json({ error: 'suiviQuantite doit être un booléen' });
    return;
  }
  if (
    quantiteRestante !== undefined &&
    quantiteRestante !== null &&
    (!Number.isInteger(quantiteRestante) || quantiteRestante < 0 || quantiteRestante > 100_000)
  ) {
    res.status(400).json({ error: 'quantiteRestante doit être un entier positif (ou null)' });
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
      disponible: disponible ?? undefined,
      suiviQuantite: suiviQuantite ?? undefined,
      quantiteRestante: quantiteRestante === undefined ? undefined : quantiteRestante,
    },
  });

  res.json(toPublicProduit(produitMaj));
});

// --- Mentions spéciales (groupes d'options par produit) ---

produitsRouter.post('/produits/:produitId/groupes', async (req, res) => {
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

produitsRouter.delete('/groupes/:id', async (req, res) => {
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

produitsRouter.post('/groupes/:groupeId/valeurs', async (req, res) => {
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

produitsRouter.delete('/valeurs/:id', async (req, res) => {
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
