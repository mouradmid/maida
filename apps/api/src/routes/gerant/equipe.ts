import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { DroitUtilisateur } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { contexteDe } from './partage';

export const equipeRouter = Router();

const CODE_PIN = /^[0-9]{4}$/;

/**
 * Un code PIN doit désigner une seule personne. Deux serveurs avec le même code
 * ne se distinguent plus à la caisse ; et un serveur qui aurait le code d'un
 * gérant pourrait valider lui-même ses annulations et ses remises.
 *
 * Portée : les serveurs de l'établissement (ils partagent les mêmes tablettes)
 * et les gérants de l'enseigne (ils valident dans tous ses restaurants). Pour
 * un code de gérant, ce sont donc les serveurs de TOUS les restaurants.
 */
async function codePinDejaPris(
  codePin: string,
  portee: { compteClientId: string; etablissementId?: string; exclureId?: string },
): Promise<boolean> {
  const personnes = await prisma.utilisateur.findMany({
    where: {
      codePinHash: { not: null },
      ...(portee.exclureId ? { id: { not: portee.exclureId } } : {}),
      OR: [
        { role: 'GERANT', compteClientId: portee.compteClientId },
        portee.etablissementId
          ? { role: 'SERVEUR', etablissementId: portee.etablissementId }
          : { role: 'SERVEUR', compteClientId: portee.compteClientId },
      ],
    },
    select: { codePinHash: true },
  });
  for (const p of personnes) {
    if (p.codePinHash && (await bcrypt.compare(codePin, p.codePinHash))) return true;
  }
  return false;
}

const SELECT_SERVEUR = {
  id: true,
  nom: true,
  prenom: true,
  statut: true,
  droits: true,
  creeLe: true,
} as const;

equipeRouter.get('/serveurs', async (req, res) => {
  const { etablissementId } = await contexteDe(req);

  const serveurs = await prisma.utilisateur.findMany({
    where: { etablissementId, role: 'SERVEUR' },
    select: SELECT_SERVEUR,
    orderBy: { creeLe: 'desc' },
  });

  res.json(serveurs);
});

// Liste dérivée de l'énumération Prisma : ajouter un droit au schéma suffit
// désormais à le rendre attribuable. GERER_STOCK avait été oublié ici alors que
// l'écran « Équipe » le proposait déjà — le gérant recevait un 400.
const DROITS_VALIDES = Object.values(DroitUtilisateur);

equipeRouter.patch('/serveurs/:id/droits', async (req, res) => {
  const { droits } = req.body ?? {};

  if (!Array.isArray(droits) || droits.some((d) => !DROITS_VALIDES.includes(d as DroitUtilisateur))) {
    res.status(400).json({ error: 'Droits invalides' });
    return;
  }

  const { etablissementId } = await contexteDe(req);

  const serveur = await prisma.utilisateur.findFirst({
    where: { id: req.params.id, etablissementId, role: 'SERVEUR' },
  });
  if (!serveur) {
    res.status(404).json({ error: 'Serveur introuvable' });
    return;
  }

  const majApres = await prisma.utilisateur.update({
    where: { id: serveur.id },
    data: { droits: [...new Set(droits as DroitUtilisateur[])] },
    select: SELECT_SERVEUR,
  });

  res.json(majApres);
});

equipeRouter.post('/serveurs', async (req, res) => {
  const { nom, prenom, codePin } = req.body ?? {};

  if (typeof nom !== 'string' || !nom.trim() || typeof prenom !== 'string' || !prenom.trim()) {
    res.status(400).json({ error: 'Nom et prénom requis' });
    return;
  }
  if (typeof codePin !== 'string' || !CODE_PIN.test(codePin)) {
    res.status(400).json({ error: 'Le code PIN doit contenir exactement 4 chiffres' });
    return;
  }

  const { compteClientId, etablissementId } = await contexteDe(req);

  if (await codePinDejaPris(codePin, { compteClientId, etablissementId })) {
    res.status(409).json({ error: 'Ce code PIN est déjà utilisé dans cet établissement' });
    return;
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

// Un serveur qui quitte l'équipe est désactivé, pas supprimé : ses commandes et
// ses encaissements restent signés de son nom. Il perd la main à sa requête
// suivante (requireCompteActif). Un code oublié ou divulgué se remplace ici.
equipeRouter.patch('/serveurs/:id', async (req, res) => {
  const { statut, codePin } = req.body ?? {};

  if (statut !== undefined && statut !== 'ACTIF' && statut !== 'DESACTIVE') {
    res.status(400).json({ error: 'Statut invalide (ACTIF ou DESACTIVE)' });
    return;
  }
  if (codePin !== undefined && (typeof codePin !== 'string' || !CODE_PIN.test(codePin))) {
    res.status(400).json({ error: 'Le code PIN doit contenir exactement 4 chiffres' });
    return;
  }
  if (statut === undefined && codePin === undefined) {
    res.status(400).json({ error: 'Rien à modifier' });
    return;
  }

  const { compteClientId, etablissementId } = await contexteDe(req);

  const serveur = await prisma.utilisateur.findFirst({
    where: { id: req.params.id, etablissementId, role: 'SERVEUR' },
    select: { id: true },
  });
  if (!serveur) {
    res.status(404).json({ error: 'Serveur introuvable' });
    return;
  }

  if (
    codePin !== undefined &&
    (await codePinDejaPris(codePin, { compteClientId, etablissementId, exclureId: serveur.id }))
  ) {
    res.status(409).json({ error: 'Ce code PIN est déjà utilisé dans cet établissement' });
    return;
  }

  const majApres = await prisma.utilisateur.update({
    where: { id: serveur.id },
    data: {
      statut: statut ?? undefined,
      codePinHash: codePin !== undefined ? await bcrypt.hash(codePin, 12) : undefined,
    },
    select: SELECT_SERVEUR,
  });

  res.json(majApres);
});

// Le code gérant : celui qu'on tape sur la caisse d'un serveur pour valider une
// annulation, une remise ou une clôture qu'il n'a pas le droit de faire seul.
equipeRouter.get('/code-pin', async (req, res) => {
  const gerant = await prisma.utilisateur.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: { codePinHash: true },
  });
  res.json({ defini: gerant.codePinHash !== null });
});

// Le mot de passe est redemandé : une session laissée ouverte sur l'ordinateur
// du bureau ne doit pas suffire à s'approprier le code qui valide tout.
equipeRouter.put('/code-pin', async (req, res) => {
  const { codePin, motDePasse } = req.body ?? {};

  if (typeof codePin !== 'string' || !CODE_PIN.test(codePin)) {
    res.status(400).json({ error: 'Le code PIN doit contenir exactement 4 chiffres' });
    return;
  }
  if (typeof motDePasse !== 'string' || !motDePasse) {
    res.status(400).json({ error: 'Votre mot de passe est requis' });
    return;
  }

  const gerant = await prisma.utilisateur.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: { id: true, motDePasseHash: true, compteClientId: true },
  });
  if (!gerant.motDePasseHash || !(await bcrypt.compare(motDePasse, gerant.motDePasseHash))) {
    res.status(403).json({ error: 'Mot de passe incorrect' });
    return;
  }

  if (
    await codePinDejaPris(codePin, {
      compteClientId: gerant.compteClientId!,
      exclureId: gerant.id,
    })
  ) {
    res.status(409).json({ error: 'Ce code est déjà celui de quelqu’un de votre équipe' });
    return;
  }

  await prisma.utilisateur.update({
    where: { id: gerant.id },
    data: { codePinHash: await bcrypt.hash(codePin, 12) },
  });
  res.status(204).send();
});
