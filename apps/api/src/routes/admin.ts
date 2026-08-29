import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { ModuleCompte, Prisma } from '../generated/prisma/client';
import { emailConfigure } from '../lib/email';
import { prisma } from '../lib/prisma';
import { formaterCodeTerminal, genererCodeTerminal } from '../lib/securite';
import { requireAuth } from '../middleware/requireAuth';
import { requireCompteActif } from '../middleware/requireCompteActif';
import { requireRole } from '../middleware/requireRole';

export const adminRouter = Router();

// requireCompteActif vaut aussi pour l'éditeur : un compte d'administration
// désactivé doit perdre la main immédiatement, pas à l'expiration du jeton.
adminRouter.use(requireAuth, requireRole('SUPER_ADMIN'), requireCompteActif);

adminRouter.get('/comptes-clients', async (_req, res) => {
  const comptes = await prisma.compteClient.findMany({
    select: {
      id: true,
      nomEnseigne: true,
      statut: true,
      modules: true,
      demo: true,
      creeLe: true,
      // codeTerminal : l'éditeur doit pouvoir le dicter au téléphone quand un
      // client installe sa première tablette et n'a pas encore ouvert son espace.
      etablissements: { select: { id: true, nom: true, ville: true, codeTerminal: true } },
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
        etablissements: compte.etablissements.map((e) => ({
          ...e,
          codeTerminal: formaterCodeTerminal(e.codeTerminal),
        })),
        gerants: compte.utilisateurs,
        utilisateurs: undefined,
        commandes7Jours,
        derniereCommande,
      };
    }),
  );
});

// Dérivée du schéma : ajouter un module à l'énumération suffit à le rendre
// accordable, sans avoir à penser à cette liste (cf. le droit GERER_STOCK,
// oublié ici pendant des semaines côté gérant).
const MODULES_VALIDES = Object.values(ModuleCompte);

adminRouter.patch('/comptes-clients/:id', async (req, res) => {
  const { statut, modules } = req.body ?? {};

  if (statut !== undefined && statut !== 'ACTIF' && statut !== 'SUSPENDU') {
    res.status(400).json({ error: 'Statut invalide (ACTIF ou SUSPENDU)' });
    return;
  }
  if (
    modules !== undefined &&
    (!Array.isArray(modules) ||
      modules.some((m) => !MODULES_VALIDES.includes(m as ModuleCompte)) ||
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
      modules: modules !== undefined ? (modules as ModuleCompte[]) : undefined,
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

// Journal des connexions : sert au support (« qui a ouvert la caisse hier
// soir ? ») autant qu'à repérer un acharnement sur un code PIN.
adminRouter.get('/connexions', async (req, res) => {
  const { echecs } = req.query;

  const connexions = await prisma.connexionJournal.findMany({
    where: echecs === 'true' ? { resultat: { not: 'REUSSIE' } } : undefined,
    orderBy: { creeLe: 'desc' },
    take: 200,
  });

  res.json(connexions);
});

// Journal des e-mails : premier réflexe du support quand un client dit
// « je n'ai rien reçu ». `?echecs=true` isole ce qui n'est pas parti.
adminRouter.get('/emails', async (req, res) => {
  const { echecs } = req.query;

  const emails = await prisma.emailEnvoye.findMany({
    where: echecs === 'true' ? { resultat: { not: 'ENVOYE' } } : undefined,
    orderBy: { creeLe: 'desc' },
    take: 200,
  });

  res.json({ configure: emailConfigure(), emails });
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
    data: {
      motDePasseHash: await bcrypt.hash(motDePasse, 12),
      // Même règle que la réinitialisation en libre-service : changer le mot de
      // passe met fin aux sessions ouvertes avec l'ancien.
      sessionsInvalidesAvant: new Date(),
    },
  });

  // La demande du gérant, s'il en avait déposé une, n'a plus lieu d'être.
  await prisma.jetonReinitialisation.deleteMany({
    where: { utilisateurId: gerant.id, utiliseLe: null },
  });

  res.status(204).send();
});

/**
 * Demandes de réinitialisation en attente.
 *
 * Tant que Maïda n'envoie pas d'e-mails, c'est ici que le lien atterrit :
 * l'éditeur le lit et le transmet au gérant (téléphone, WhatsApp). Le jour où
 * l'envoi automatique existera, cet écran ne servira plus que de trace.
 */
adminRouter.get('/reinitialisations', async (_req, res) => {
  const demandes = await prisma.jetonReinitialisation.findMany({
    where: { utiliseLe: null, expireLe: { gt: new Date() } },
    orderBy: { creeLe: 'desc' },
    select: {
      id: true,
      jeton: true,
      creeLe: true,
      expireLe: true,
      ip: true,
      utilisateur: {
        select: {
          nom: true,
          prenom: true,
          email: true,
          compteClient: { select: { nomEnseigne: true } },
        },
      },
    },
  });

  res.json(demandes);
});

// Annule une demande : utile si elle vient manifestement de quelqu'un d'autre
// que le gérant, ou si le dépannage a été fait autrement.
adminRouter.delete('/reinitialisations/:id', async (req, res) => {
  await prisma.jetonReinitialisation.deleteMany({ where: { id: req.params.id } });
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
          codeTerminal: genererCodeTerminal(),
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
      etablissement: {
        ...resultat.etablissement,
        codeTerminal: formaterCodeTerminal(resultat.etablissement.codeTerminal),
      },
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
