import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { formaterCodeTerminal, genererCodeTerminal } from '../../lib/securite';
import { contexteDe } from './partage';

// Paramètres de l'établissement : modules accordés au compte client,
// préférences d'affichage du gérant et code d'installation des tablettes.

export const parametresRouter = Router();

parametresRouter.get('/parametres', async (req, res) => {
  const { compteClientId, etablissementId } = await contexteDe(req);

  const [compte, etablissement] = await Promise.all([
    prisma.compteClient.findUnique({ where: { id: compteClientId }, select: { modules: true } }),
    prisma.etablissement.findUnique({
      where: { id: etablissementId },
      select: { suiviCoutsActive: true, commandeClientActive: true, codeTerminal: true },
    }),
  ]);

  res.json({
    moduleFoodCost: compte?.modules.includes('FOOD_COST') ?? false,
    moduleQrMenu: compte?.modules.includes('QR_MENU') ?? false,
    suiviCoutsActive: etablissement?.suiviCoutsActive ?? true,
    commandeClientActive: etablissement?.commandeClientActive ?? false,
    codeTerminal: etablissement ? formaterCodeTerminal(etablissement.codeTerminal) : null,
  });
});

// Régénère le code d'installation : à faire dès qu'une tablette est perdue ou
// qu'un employé part avec. Les caisses déjà rattachées ne sont pas
// déconnectées — le code ne sert qu'au premier rattachement.
parametresRouter.post('/terminal/code', async (req, res) => {
  const { etablissementId } = await contexteDe(req);

  const etablissement = await prisma.etablissement.update({
    where: { id: etablissementId },
    data: { codeTerminal: genererCodeTerminal() },
    select: { codeTerminal: true },
  });

  res.json({ codeTerminal: formaterCodeTerminal(etablissement.codeTerminal) });
});

parametresRouter.patch('/parametres', async (req, res) => {
  const { suiviCoutsActive, commandeClientActive } = req.body ?? {};

  if (suiviCoutsActive !== undefined && typeof suiviCoutsActive !== 'boolean') {
    res.status(400).json({ error: 'Paramètre invalide' });
    return;
  }
  if (commandeClientActive !== undefined && typeof commandeClientActive !== 'boolean') {
    res.status(400).json({ error: 'Paramètre invalide' });
    return;
  }
  if (suiviCoutsActive === undefined && commandeClientActive === undefined) {
    res.status(400).json({ error: 'Rien à modifier' });
    return;
  }

  const { compteClientId, etablissementId } = await contexteDe(req);

  const [compte, etablissement] = await Promise.all([
    prisma.compteClient.findUnique({ where: { id: compteClientId }, select: { modules: true } }),
    prisma.etablissement.update({
      where: { id: etablissementId },
      data: {
        suiviCoutsActive: suiviCoutsActive ?? undefined,
        commandeClientActive: commandeClientActive ?? undefined,
      },
      select: { suiviCoutsActive: true, commandeClientActive: true },
    }),
  ]);

  res.json({
    moduleFoodCost: compte?.modules.includes('FOOD_COST') ?? false,
    moduleQrMenu: compte?.modules.includes('QR_MENU') ?? false,
    suiviCoutsActive: etablissement.suiviCoutsActive,
    commandeClientActive: etablissement.commandeClientActive,
  });
});
