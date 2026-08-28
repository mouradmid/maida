import { Router } from 'express';
import { Prisma, type FormeTable } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { getContexteGerant } from './partage';

// Plan de salle : création, déplacement et redimensionnement des tables.

export const tablesRouter = Router();

const FORMES_VALIDES = ['RONDE', 'CARREE', 'RECTANGULAIRE'];

// Zone de travail du plan côté web (PlanDeSalle.tsx) : les créneaux proposés à une
// nouvelle table doivent tenir dedans, sinon elle est posée hors du cadre visible.
const CANVAS_LARGEUR = 900;
const CANVAS_HAUTEUR = 500;
const PAS_GRILLE = 110;
const MARGE_GRILLE = 20;
const TAILLE_TABLE_PAR_DEFAUT = 80; // doit rester aligné sur les @default du modèle Table

// Les positions arrivent du glisser-déposer : sur un écran à mise à l'échelle
// (Windows 125 %, zoom navigateur), les coordonnées du pointeur sont fractionnaires.
// On arrondit au lieu d'ignorer la valeur, sinon le déplacement n'est jamais enregistré.
function entierArrondi(valeur: unknown): number | undefined {
  return typeof valeur === 'number' && Number.isFinite(valeur) ? Math.round(valeur) : undefined;
}

function seChevauchent(
  a: { positionX: number; positionY: number; largeur: number; hauteur: number },
  b: { positionX: number; positionY: number; largeur: number; hauteur: number },
) {
  return (
    a.positionX < b.positionX + b.largeur &&
    b.positionX < a.positionX + a.largeur &&
    a.positionY < b.positionY + b.hauteur &&
    b.positionY < a.positionY + a.hauteur
  );
}

// Premier créneau de la grille où la nouvelle table ne recouvre aucune table existante.
// Un test d'égalité exacte des coordonnées ne suffit pas : dès que le gérant a réorganisé
// sa salle à la souris, les tables ne sont plus sur les créneaux de la grille.
function placeLibre(
  existantes: Array<{ positionX: number; positionY: number; largeur: number; hauteur: number }>,
  largeur: number,
  hauteur: number,
) {
  for (let y = MARGE_GRILLE; y + hauteur <= CANVAS_HAUTEUR; y += PAS_GRILLE) {
    for (let x = MARGE_GRILLE; x + largeur <= CANVAS_LARGEUR; x += PAS_GRILLE) {
      const candidate = { positionX: x, positionY: y, largeur, hauteur };
      if (!existantes.some((t) => seChevauchent(candidate, t))) {
        return { positionX: x, positionY: y };
      }
    }
  }
  // Salle saturée : décalage en escalier plutôt qu'un empilement exact, pour rester attrapable.
  const decalage = (existantes.length % 10) * 14;
  return { positionX: MARGE_GRILLE + decalage, positionY: MARGE_GRILLE + decalage };
}

tablesRouter.get('/tables', async (req, res) => {
  const { etablissementId } = await getContexteGerant(req.user!.id);

  const tables = await prisma.table.findMany({
    where: { etablissementId },
    orderBy: { creeLe: 'asc' },
  });

  res.json(tables);
});

tablesRouter.post('/tables', async (req, res) => {
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

  const largeurTable = entierArrondi(largeur);
  const hauteurTable = entierArrondi(hauteur);

  const existantes = await prisma.table.findMany({
    where: { etablissementId },
    select: { positionX: true, positionY: true, largeur: true, hauteur: true },
  });
  const { positionX, positionY } = placeLibre(
    existantes,
    largeurTable && largeurTable > 0 ? largeurTable : TAILLE_TABLE_PAR_DEFAUT,
    hauteurTable && hauteurTable > 0 ? hauteurTable : TAILLE_TABLE_PAR_DEFAUT,
  );

  try {
    const table = await prisma.table.create({
      data: {
        numero,
        forme: forme as FormeTable,
        nombreCouverts,
        largeur: largeurTable && largeurTable > 0 ? largeurTable : undefined,
        hauteur: hauteurTable && hauteurTable > 0 ? hauteurTable : undefined,
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

tablesRouter.patch('/tables/:id', async (req, res) => {
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

  const mesures = {
    largeur: entierArrondi(largeur),
    hauteur: entierArrondi(hauteur),
    positionX: entierArrondi(positionX),
    positionY: entierArrondi(positionY),
  };
  for (const [nom, valeur] of Object.entries({ largeur, hauteur, positionX, positionY })) {
    // Une valeur fournie mais illisible doit remonter une erreur : la refuser en silence
    // laissait croire que le déplacement était enregistré alors qu'il était perdu.
    if (valeur !== undefined && mesures[nom as keyof typeof mesures] === undefined) {
      res.status(400).json({ error: `Valeur invalide pour ${nom}` });
      return;
    }
  }
  if (
    (mesures.largeur !== undefined && mesures.largeur <= 0) ||
    (mesures.hauteur !== undefined && mesures.hauteur <= 0)
  ) {
    res.status(400).json({ error: 'La taille de la table doit être positive' });
    return;
  }

  try {
    const tableMaj = await prisma.table.update({
      where: { id: table.id },
      data: {
        numero: typeof numero === 'string' && numero.trim() ? numero : undefined,
        forme: forme !== undefined ? (forme as FormeTable) : undefined,
        nombreCouverts: nombreCouverts ?? undefined,
        largeur: mesures.largeur,
        hauteur: mesures.hauteur,
        positionX: mesures.positionX !== undefined ? Math.max(0, mesures.positionX) : undefined,
        positionY: mesures.positionY !== undefined ? Math.max(0, mesures.positionY) : undefined,
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
