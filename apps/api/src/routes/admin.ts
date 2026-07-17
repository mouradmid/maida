import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('SUPER_ADMIN'));

adminRouter.get('/comptes-clients', async (_req, res) => {
  const comptes = await prisma.compteClient.findMany({
    select: {
      id: true,
      nomEnseigne: true,
      statut: true,
      modules: true,
      creeLe: true,
      etablissements: { select: { id: true, nom: true, ville: true } },
      utilisateurs: {
        where: { role: 'GERANT' },
        select: { id: true, nom: true, prenom: true, email: true },
        orderBy: { creeLe: 'asc' },
      },
    },
    orderBy: { creeLe: 'desc' },
  });

  // Activité : volume de commandes des 7 derniers jours et dernière commande,
  // pour voir d'un coup d'œil quels clients utilisent réellement Maïda.
  const ilYA7Jours = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const etablissementIds = comptes.flatMap((c) => c.etablissements.map((e) => e.id));
  const [volumes, dernieres] = await Promise.all([
    prisma.commande.groupBy({
      by: ['etablissementId'],
      where: { etablissementId: { in: etablissementIds }, creeLe: { gte: ilYA7Jours } },
      _count: { _all: true },
    }),
    prisma.commande.groupBy({
      by: ['etablissementId'],
      where: { etablissementId: { in: etablissementIds } },
      _max: { creeLe: true },
    }),
  ]);
  const volumeParEtablissement = new Map(volumes.map((v) => [v.etablissementId, v._count._all]));
  const derniereParEtablissement = new Map(dernieres.map((d) => [d.etablissementId, d._max.creeLe]));

  res.json(
    comptes.map((compte) => {
      let commandes7Jours = 0;
      let derniereCommande: Date | null = null;
      for (const e of compte.etablissements) {
        commandes7Jours += volumeParEtablissement.get(e.id) ?? 0;
        const derniere = derniereParEtablissement.get(e.id) ?? null;
        if (derniere && (!derniereCommande || derniere > derniereCommande)) {
          derniereCommande = derniere;
        }
      }
      return {
        ...compte,
        gerants: compte.utilisateurs,
        utilisateurs: undefined,
        commandes7Jours,
        derniereCommande,
      };
    }),
  );
});

const MODULES_VALIDES = ['FOOD_COST'] as const;

adminRouter.patch('/comptes-clients/:id', async (req, res) => {
  const { statut, modules } = req.body ?? {};

  if (statut !== undefined && statut !== 'ACTIF' && statut !== 'SUSPENDU') {
    res.status(400).json({ error: 'Statut invalide (ACTIF ou SUSPENDU)' });
    return;
  }
  if (
    modules !== undefined &&
    (!Array.isArray(modules) ||
      modules.some((m) => !MODULES_VALIDES.includes(m as (typeof MODULES_VALIDES)[number])) ||
      new Set(modules).size !== modules.length)
  ) {
    res.status(400).json({ error: 'Modules invalides' });
    return;
  }
  if (statut === undefined && modules === undefined) {
    res.status(400).json({ error: 'Rien à modifier' });
    return;
  }

  const compte = await prisma.compteClient.findUnique({ where: { id: req.params.id } });
  if (!compte) {
    res.status(404).json({ error: 'Compte client introuvable' });
    return;
  }

  const compteMaj = await prisma.compteClient.update({
    where: { id: compte.id },
    data: {
      statut: statut ?? undefined,
      modules: modules !== undefined ? (modules as (typeof MODULES_VALIDES)[number][]) : undefined,
    },
    select: { id: true, nomEnseigne: true, statut: true, modules: true },
  });

  res.json(compteMaj);
});

// Journal des erreurs serveur : les 100 dernières, pour voir les problèmes
// avant que les clients n'appellent.
adminRouter.get('/erreurs', async (_req, res) => {
  const erreurs = await prisma.erreurServeur.findMany({
    orderBy: { creeLe: 'desc' },
    take: 100,
  });
  res.json(erreurs);
});

adminRouter.delete('/erreurs', async (_req, res) => {
  await prisma.erreurServeur.deleteMany({});
  res.status(204).send();
});

// Dépannage client : l'éditeur redéfinit le mot de passe d'un gérant qui l'a perdu.
adminRouter.post('/gerants/:id/mot-de-passe', async (req, res) => {
  const { motDePasse } = req.body ?? {};

  if (typeof motDePasse !== 'string' || motDePasse.length < 8) {
    res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
    return;
  }

  const gerant = await prisma.utilisateur.findFirst({
    where: { id: req.params.id, role: 'GERANT' },
  });
  if (!gerant) {
    res.status(404).json({ error: 'Gérant introuvable' });
    return;
  }

  await prisma.utilisateur.update({
    where: { id: gerant.id },
    data: { motDePasseHash: await bcrypt.hash(motDePasse, 12) },
  });

  res.status(204).send();
});

adminRouter.post('/comptes-clients', async (req, res) => {
  const { nomEnseigne, etablissement, gerant } = req.body ?? {};

  if (typeof nomEnseigne !== 'string' || !nomEnseigne.trim()) {
    res.status(400).json({ error: "Le nom de l'enseigne est requis" });
    return;
  }
  if (typeof etablissement?.nom !== 'string' || !etablissement.nom.trim()) {
    res.status(400).json({ error: "Le nom de l'établissement est requis" });
    return;
  }
  if (
    typeof gerant?.nom !== 'string' ||
    typeof gerant?.prenom !== 'string' ||
    typeof gerant?.email !== 'string' ||
    typeof gerant?.motDePasse !== 'string' ||
    gerant.motDePasse.length < 8
  ) {
    res.status(400).json({
      error:
        'Les informations du gérant sont incomplètes (nom, prénom, email, mot de passe de 8 caractères minimum)',
    });
    return;
  }

  try {
    const motDePasseHash = await bcrypt.hash(gerant.motDePasse, 12);

    const resultat = await prisma.$transaction(async (tx) => {
      const compteClient = await tx.compteClient.create({
        data: { nomEnseigne },
      });

      const nouvelEtablissement = await tx.etablissement.create({
        data: {
          nom: etablissement.nom,
          adresse: etablissement.adresse ?? null,
          ville: etablissement.ville ?? null,
          compteClientId: compteClient.id,
        },
      });

      const nouveauGerant = await tx.utilisateur.create({
        data: {
          role: 'GERANT',
          nom: gerant.nom,
          prenom: gerant.prenom,
          email: gerant.email,
          motDePasseHash,
          compteClientId: compteClient.id,
          etablissementId: nouvelEtablissement.id,
        },
      });

      return { compteClient, etablissement: nouvelEtablissement, gerant: nouveauGerant };
    });

    res.status(201).json({
      compteClient: resultat.compteClient,
      etablissement: resultat.etablissement,
      gerant: {
        id: resultat.gerant.id,
        email: resultat.gerant.email,
        nom: resultat.gerant.nom,
        prenom: resultat.gerant.prenom,
        role: resultat.gerant.role,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Cet email est déjà utilisé' });
      return;
    }
    throw error;
  }
});
