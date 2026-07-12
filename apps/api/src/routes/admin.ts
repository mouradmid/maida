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
      creeLe: true,
      etablissements: { select: { id: true, nom: true, ville: true } },
    },
    orderBy: { creeLe: 'desc' },
  });

  res.json(comptes);
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
