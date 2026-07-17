import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { erreurLignesEntree, resoudreLignesCommande, type LigneEntree } from '../lib/commandes';
import { prisma } from '../lib/prisma';

// Routes publiques, sans authentification : le menu consultable par les
// clients du restaurant (QR code à table), et leur demande de commande —
// qui reste en attente jusqu'à validation par un serveur.
export const publicRouter = Router();

// Anti-abus : la commande client est publique, on borne le débit par IP.
const limiteCommandeClient = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 10_000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de commandes envoyées. Patientez quelques minutes.' },
});

publicRouter.get('/menu/:etablissementId', async (req, res) => {
  const etablissement = await prisma.etablissement.findUnique({
    where: { id: req.params.etablissementId },
    select: {
      id: true,
      nom: true,
      adresse: true,
      ville: true,
      statut: true,
      compteClient: { select: { statut: true, modules: true } },
    },
  });

  // Un établissement inconnu, inactif, au compte suspendu ou sans le module
  // QR menu n'expose rien.
  if (
    !etablissement ||
    etablissement.statut !== 'ACTIF' ||
    etablissement.compteClient.statut !== 'ACTIF' ||
    !etablissement.compteClient.modules.includes('QR_MENU')
  ) {
    res.status(404).json({ error: 'Menu indisponible' });
    return;
  }

  const categories = await prisma.categorie.findMany({
    where: { etablissementId: etablissement.id, statut: 'ACTIF' },
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
    orderBy: { creeLe: 'asc' },
  });

  const parametres = await prisma.etablissement.findUnique({
    where: { id: etablissement.id },
    select: { commandeClientActive: true },
  });

  res.json({
    etablissement: {
      nom: etablissement.nom,
      adresse: etablissement.adresse,
      ville: etablissement.ville,
    },
    commandeClientActive: parametres?.commandeClientActive ?? false,
    categories: categories
      .filter((c) => c.produits.length > 0)
      .map((c) => ({
        id: c.id,
        nom: c.nom,
        produits: c.produits.map((p) => ({
          id: p.id,
          nom: p.nom,
          description: p.description,
          prix: Number(p.prix),
          options: p.groupesOptions.map((g) => ({
            id: g.id,
            nom: g.nom,
            obligatoire: g.obligatoire,
            valeurs: g.valeurs.map((v) => ({ id: v.id, valeur: v.valeur })),
          })),
        })),
      })),
  });
});

publicRouter.post('/commandes', limiteCommandeClient, async (req, res) => {
  const { etablissementId, tableNumero, lignes, note } = req.body ?? {};

  if (typeof etablissementId !== 'string' || typeof tableNumero !== 'string') {
    res.status(400).json({ error: 'Établissement et table requis' });
    return;
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 200)) {
    res.status(400).json({ error: 'Note invalide (200 caractères maximum)' });
    return;
  }
  const erreurLignes = erreurLignesEntree(lignes);
  if (erreurLignes) {
    res.status(400).json({ error: erreurLignes });
    return;
  }

  const etablissement = await prisma.etablissement.findUnique({
    where: { id: etablissementId },
    select: {
      id: true,
      statut: true,
      commandeClientActive: true,
      compteClient: { select: { statut: true, modules: true } },
    },
  });
  if (
    !etablissement ||
    etablissement.statut !== 'ACTIF' ||
    etablissement.compteClient.statut !== 'ACTIF' ||
    !etablissement.compteClient.modules.includes('QR_MENU')
  ) {
    res.status(404).json({ error: 'Commande indisponible' });
    return;
  }
  if (!etablissement.commandeClientActive) {
    res.status(403).json({
      error: "Ce restaurant n'accepte pas la commande en ligne — appelez un serveur.",
    });
    return;
  }

  const table = await prisma.table.findFirst({
    where: { etablissementId: etablissement.id, numero: tableNumero, statut: 'ACTIF' },
  });
  if (!table) {
    res.status(400).json({ error: 'Table inconnue' });
    return;
  }

  // Validation immédiate contre le menu : le client sait tout de suite si un
  // produit n'est plus disponible ou s'il manque un choix obligatoire.
  const resolution = await resoudreLignesCommande(etablissement.id, lignes as LigneEntree[]);
  if (!resolution.ok) {
    res.status(400).json({ error: resolution.erreur });
    return;
  }
  const total =
    Math.round(resolution.lignes.reduce((s, l) => s + Number(l.prixUnitaire) * l.quantite, 0) * 100) /
    100;

  const demande = await prisma.demandeClient.create({
    data: {
      etablissementId: etablissement.id,
      tableId: table.id,
      lignes: lignes as LigneEntree[] as object[],
      note: typeof note === 'string' && note.trim() ? note.trim() : null,
    },
  });

  res.status(201).json({
    id: demande.id,
    total,
    message: 'Commande envoyée — un serveur va la confirmer.',
  });
});
