import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { formaterCodeTerminal, genererCodeTerminal } from '../../lib/securite';
import { contexteDe } from './partage';

// Paramètres de l'établissement : modules accordés au compte client,
// préférences d'affichage du gérant, réglages de la réservation en ligne et
// code d'installation des tablettes.

export const parametresRouter = Router();

// Les réglages modifiables, avec ce qu'ils acceptent. Une seule table de vérité :
// la validation, la mise à jour et la réponse s'en déduisent, et ajouter un
// réglage ne demande plus d'aller le recopier à trois endroits.
const BORNES_NOMBRES = {
  // Un grand groupe se négocie de vive voix ; en dessous de 1, plus personne
  // ne peut réserver.
  reservationCouvertsMax: { min: 1, max: 50 },
  // De « tout de suite » à une semaine de préavis.
  reservationDelaiMinMinutes: { min: 0, max: 7 * 24 * 60 },
  // D'un jour à un an.
  reservationHorizonJours: { min: 1, max: 365 },
} as const;

const BOOLEENS = ['suiviCoutsActive', 'commandeClientActive', 'reservationEnLigneActive'] as const;

const SELECTION_ETABLISSEMENT = {
  suiviCoutsActive: true,
  commandeClientActive: true,
  reservationEnLigneActive: true,
  reservationCouvertsMax: true,
  reservationDelaiMinMinutes: true,
  reservationHorizonJours: true,
} as const;

type ReglagesEtablissement = { [K in keyof typeof SELECTION_ETABLISSEMENT]: boolean | number };

function reponseParametres(modules: string[] | undefined, etablissement: ReglagesEtablissement) {
  return {
    moduleFoodCost: modules?.includes('FOOD_COST') ?? false,
    moduleQrMenu: modules?.includes('QR_MENU') ?? false,
    ...etablissement,
  };
}

parametresRouter.get('/parametres', async (req, res) => {
  const { compteClientId, etablissementId } = await contexteDe(req);

  const [compte, etablissement] = await Promise.all([
    prisma.compteClient.findUnique({ where: { id: compteClientId }, select: { modules: true } }),
    prisma.etablissement.findUniqueOrThrow({
      where: { id: etablissementId },
      select: { ...SELECTION_ETABLISSEMENT, codeTerminal: true },
    }),
  ]);

  const { codeTerminal, ...reglages } = etablissement;
  res.json({
    ...reponseParametres(compte?.modules, reglages),
    codeTerminal: formaterCodeTerminal(codeTerminal),
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
  const corps = req.body ?? {};
  const data: Record<string, boolean | number> = {};

  for (const cle of BOOLEENS) {
    const valeur = corps[cle];
    if (valeur === undefined) continue;
    if (typeof valeur !== 'boolean') {
      res.status(400).json({ error: 'Paramètre invalide' });
      return;
    }
    data[cle] = valeur;
  }

  for (const [cle, bornes] of Object.entries(BORNES_NOMBRES)) {
    const valeur = corps[cle];
    if (valeur === undefined) continue;
    if (!Number.isInteger(valeur) || valeur < bornes.min || valeur > bornes.max) {
      res.status(400).json({ error: `Valeur invalide (de ${bornes.min} à ${bornes.max})` });
      return;
    }
    data[cle] = valeur;
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'Rien à modifier' });
    return;
  }

  const { compteClientId, etablissementId } = await contexteDe(req);

  const [compte, etablissement] = await Promise.all([
    prisma.compteClient.findUnique({ where: { id: compteClientId }, select: { modules: true } }),
    prisma.etablissement.update({
      where: { id: etablissementId },
      data,
      select: SELECTION_ETABLISSEMENT,
    }),
  ]);

  res.json(reponseParametres(compte?.modules, etablissement));
});
