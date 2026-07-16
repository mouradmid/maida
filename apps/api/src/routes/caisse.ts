import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { Prisma } from '../generated/prisma/client';
import type { DroitUtilisateur, ModePaiement } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireCompteActif } from '../middleware/requireCompteActif';
import { requireRole } from '../middleware/requireRole';

export const caisseRouter = Router();

caisseRouter.use(requireAuth, requireRole('SERVEUR'), requireCompteActif);

const arrondi = (n: number) => Math.round(n * 100) / 100;

async function getContexteServeur(serveurId: string) {
  const serveur = await prisma.utilisateur.findUnique({ where: { id: serveurId } });
  if (!serveur?.etablissementId) {
    throw new Error('Serveur sans établissement associé');
  }
  return { etablissementId: serveur.etablissementId };
}

// Action sensible : soit le serveur a le droit requis, soit un gérant de
// l'établissement valide avec son code PIN et porte la responsabilité.
async function resoudreResponsable(options: {
  serveurId: string;
  etablissementId: string;
  droit: DroitUtilisateur;
  codeGerant: unknown;
  messageDroitManquant: string;
}): Promise<
  | { ok: true; responsableId: string; demandeeParId: string | null }
  | { ok: false; status: number; body: { error: string; codeGerantRequis?: boolean } }
> {
  const serveur = await prisma.utilisateur.findUnique({ where: { id: options.serveurId } });
  if (!serveur) {
    return { ok: false, status: 401, body: { error: 'Non authentifié' } };
  }
  if (serveur.droits.includes(options.droit)) {
    return { ok: true, responsableId: serveur.id, demandeeParId: null };
  }
  if (typeof options.codeGerant !== 'string' || !options.codeGerant) {
    return {
      ok: false,
      status: 403,
      body: { error: options.messageDroitManquant, codeGerantRequis: true },
    };
  }
  const gerants = await prisma.utilisateur.findMany({
    where: {
      etablissementId: options.etablissementId,
      role: 'GERANT',
      statut: 'ACTIF',
      codePinHash: { not: null },
    },
  });
  for (const gerant of gerants) {
    if (gerant.codePinHash && (await bcrypt.compare(options.codeGerant, gerant.codePinHash))) {
      return { ok: true, responsableId: gerant.id, demandeeParId: serveur.id };
    }
  }
  return { ok: false, status: 403, body: { error: 'Code gérant invalide', codeGerantRequis: true } };
}

// Infos affichées sur le ticket client.
caisseRouter.get('/etablissement', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const etablissement = await prisma.etablissement.findUnique({
    where: { id: etablissementId },
    select: { nom: true, adresse: true, ville: true },
  });

  res.json(etablissement);
});

caisseRouter.get('/moyens-paiement', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const etablissement = await prisma.etablissement.findUnique({
    where: { id: etablissementId },
    select: { moyensPaiementActifs: true },
  });

  res.json({ actifs: etablissement?.moyensPaiementActifs ?? [] });
});

caisseRouter.get('/menu', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const categories = await prisma.categorie.findMany({
    where: { etablissementId, statut: 'ACTIF' },
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
          tempsPreparationMinutes: true,
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
    // Ordre de création : le gérant construit son menu dans l'ordre du repas
    // (entrées, plats, desserts), on le respecte à la caisse.
    orderBy: { creeLe: 'asc' },
  });

  res.json(
    categories.map((c) => ({
      ...c,
      produits: c.produits.map((p) => ({ ...p, prix: Number(p.prix) })),
    })),
  );
});

caisseRouter.get('/tables', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const tables = await prisma.table.findMany({
    where: { etablissementId, statut: 'ACTIF' },
    select: {
      id: true,
      numero: true,
      nombreCouverts: true,
      forme: true,
      largeur: true,
      hauteur: true,
      positionX: true,
      positionY: true,
      additions: { where: { statut: 'OUVERTE' }, select: { id: true } },
    },
  });

  // Tri numérique naturel : « Table 2 » avant « Table 10 » (numero est une chaîne).
  tables.sort((a, b) => a.numero.localeCompare(b.numero, 'fr', { numeric: true }));

  res.json(
    tables.map(({ additions, ...table }) => ({
      ...table,
      occupee: additions.length > 0,
    })),
  );
});

function toPublicCommande(commande: {
  id: string;
  canal: string;
  noteCuisine: string | null;
  statut: string;
  creeLe: Date;
  preteLe: Date | null;
  serveur: { nom: string; prenom: string };
  addition: { id: string; statut: string; table: { numero: string } | null };
  lignes: Array<{
    id: string;
    nomProduit: string;
    prixUnitaire: unknown;
    tauxTva: number | null;
    quantite: number;
    quantitePayee: number;
    quantiteAnnulee: number;
    quantiteOfferte: number;
    options: Array<{ id: string; nomGroupe: string; valeur: string }>;
  }>;
}) {
  const lignes = commande.lignes.map((l) => ({
    id: l.id,
    nomProduit: l.nomProduit,
    prixUnitaire: Number(l.prixUnitaire),
    tauxTva: l.tauxTva,
    quantite: l.quantite,
    quantitePayee: l.quantitePayee,
    quantiteAnnulee: l.quantiteAnnulee,
    quantiteOfferte: l.quantiteOfferte,
    options: l.options.map((o) => ({ nomGroupe: o.nomGroupe, valeur: o.valeur })),
  }));
  // Les quantités annulées et offertes ne comptent pas dans le total facturable.
  const total = lignes.reduce(
    (somme, l) => somme + l.prixUnitaire * (l.quantite - l.quantiteAnnulee - l.quantiteOfferte),
    0,
  );

  return {
    id: commande.id,
    canal: commande.canal,
    noteCuisine: commande.noteCuisine,
    additionId: commande.addition.id,
    additionStatut: commande.addition.statut,
    table: commande.addition.table,
    statut: commande.statut,
    creeLe: commande.creeLe,
    preteLe: commande.preteLe,
    serveur: commande.serveur,
    lignes,
    total,
  };
}

const INCLUDE_COMMANDE = {
  lignes: { include: { options: true } },
  serveur: { select: { nom: true, prenom: true } },
  addition: { include: { table: { select: { numero: true } } } },
} satisfies Prisma.CommandeInclude;

caisseRouter.get('/commandes', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const commandes = await prisma.commande.findMany({
    where: { etablissementId },
    include: INCLUDE_COMMANDE,
    orderBy: { creeLe: 'desc' },
    take: 50,
  });

  res.json(commandes.map(toPublicCommande));
});

// Écran cuisine : les commandes envoyées, de la plus ancienne à la plus récente.
caisseRouter.get('/cuisine/commandes', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const commandes = await prisma.commande.findMany({
    where: { etablissementId, statut: 'ENVOYEE' },
    include: INCLUDE_COMMANDE,
    orderBy: { creeLe: 'asc' },
  });

  res.json(commandes.map(toPublicCommande));
});

caisseRouter.patch('/commandes/:id/prete', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const commande = await prisma.commande.findFirst({
    where: { id: req.params.id, etablissementId },
  });

  if (!commande) {
    res.status(404).json({ error: 'Commande introuvable' });
    return;
  }

  if (commande.statut !== 'ENVOYEE') {
    res.status(409).json({ error: "Cette commande n'est plus en préparation" });
    return;
  }

  const majApres = await prisma.commande.update({
    where: { id: commande.id },
    data: { statut: 'PRETE', preteLe: new Date() },
    include: INCLUDE_COMMANDE,
  });

  res.json(toPublicCommande(majApres));
});

// --- Annulations ---

interface LigneAAnnuler {
  ligneCommandeId: string;
  quantite: number;
}

caisseRouter.post('/commandes/:id/annulation', async (req, res) => {
  const { portee, lignes, motif, commentaire, codeGerant } = req.body ?? {};

  if (portee !== 'COMMANDE' && portee !== 'LIGNES') {
    res.status(400).json({ error: 'Portée invalide (COMMANDE ou LIGNES)' });
    return;
  }
  if (typeof motif !== 'string' || !motif.trim() || motif.length > 100) {
    res.status(400).json({ error: "Le motif d'annulation est obligatoire" });
    return;
  }
  if (commentaire !== undefined && typeof commentaire !== 'string') {
    res.status(400).json({ error: 'Commentaire invalide' });
    return;
  }
  if (portee === 'LIGNES') {
    if (!Array.isArray(lignes) || lignes.length === 0) {
      res.status(400).json({ error: 'Sélectionnez au moins un article à annuler' });
      return;
    }
    for (const l of lignes as LigneAAnnuler[]) {
      if (typeof l?.ligneCommandeId !== 'string' || !Number.isInteger(l?.quantite) || l.quantite <= 0) {
        res.status(400).json({ error: 'Lignes à annuler invalides' });
        return;
      }
    }
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const resolution = await resoudreResponsable({
    serveurId: req.user!.id,
    etablissementId,
    droit: 'ANNULER',
    codeGerant,
    messageDroitManquant: "Vous n'avez pas le droit d'annuler. Un gérant doit valider avec son code.",
  });
  if (!resolution.ok) {
    res.status(resolution.status).json(resolution.body);
    return;
  }
  const annuleeParId = resolution.responsableId;
  const demandeeParId = resolution.demandeeParId;

  const commande = await prisma.commande.findFirst({
    where: { id: req.params.id, etablissementId },
    include: { lignes: true },
  });
  if (!commande) {
    res.status(404).json({ error: 'Commande introuvable' });
    return;
  }
  if (commande.statut === 'ANNULEE') {
    res.status(409).json({ error: 'Cette commande est déjà annulée' });
    return;
  }

  // Quantité annulable = commandée − déjà payée − déjà annulée − déjà offerte.
  const annulablesParId = new Map(
    commande.lignes.map((l) => [
      l.id,
      l.quantite - l.quantitePayee - l.quantiteAnnulee - l.quantiteOfferte,
    ]),
  );

  let cibles: Array<{ ligneCommandeId: string; quantite: number }>;
  if (portee === 'COMMANDE') {
    cibles = commande.lignes
      .filter((l) => (annulablesParId.get(l.id) ?? 0) > 0)
      .map((l) => ({ ligneCommandeId: l.id, quantite: annulablesParId.get(l.id)! }));
    if (cibles.length === 0) {
      res.status(400).json({ error: 'Plus rien à annuler sur cette commande (articles déjà payés ou annulés)' });
      return;
    }
  } else {
    cibles = lignes as LigneAAnnuler[];
    for (const cible of cibles) {
      const annulable = annulablesParId.get(cible.ligneCommandeId);
      if (annulable === undefined) {
        res.status(400).json({ error: 'Article invalide pour cette commande' });
        return;
      }
      if (cible.quantite > annulable) {
        const ligne = commande.lignes.find((l) => l.id === cible.ligneCommandeId)!;
        res.status(400).json({
          error: `Quantité non annulable pour ${ligne.nomProduit} (reste ${annulable}, le payé ne s'annule pas)`,
        });
        return;
      }
    }
  }

  const lignesParId = new Map(commande.lignes.map((l) => [l.id, l]));
  const apresPreparation = commande.statut === 'PRETE';
  const motifFinal = motif.trim();
  const commentaireFinal =
    typeof commentaire === 'string' && commentaire.trim() ? commentaire.trim() : null;

  const commandeMaj = await prisma.$transaction(async (tx) => {
    for (const cible of cibles) {
      await tx.ligneCommande.update({
        where: { id: cible.ligneCommandeId },
        data: { quantiteAnnulee: { increment: cible.quantite } },
      });
    }

    if (portee === 'COMMANDE') {
      const quantiteTotale = cibles.reduce((s, c) => s + c.quantite, 0);
      const montantTotal = cibles.reduce(
        (s, c) => s + Number(lignesParId.get(c.ligneCommandeId)!.prixUnitaire) * c.quantite,
        0,
      );
      await tx.annulation.create({
        data: {
          etablissementId,
          commandeId: commande.id,
          quantite: quantiteTotale,
          montant: Math.round(montantTotal * 100) / 100,
          motif: motifFinal,
          commentaire: commentaireFinal,
          apresPreparation,
          annuleeParId,
          demandeeParId,
        },
      });
    } else {
      for (const cible of cibles) {
        const ligne = lignesParId.get(cible.ligneCommandeId)!;
        await tx.annulation.create({
          data: {
            etablissementId,
            commandeId: commande.id,
            ligneCommandeId: ligne.id,
            quantite: cible.quantite,
            montant: Math.round(Number(ligne.prixUnitaire) * cible.quantite * 100) / 100,
            motif: motifFinal,
            commentaire: commentaireFinal,
            apresPreparation,
            annuleeParId,
            demandeeParId,
          },
        });
      }
    }

    // Si plus aucune quantité active, la commande entière passe en ANNULEE.
    const lignesApres = await tx.ligneCommande.findMany({ where: { commandeId: commande.id } });
    const toutAnnule = lignesApres.every((l) => l.quantite - l.quantiteAnnulee === 0);
    if (toutAnnule) {
      await tx.commande.update({ where: { id: commande.id }, data: { statut: 'ANNULEE' } });
    }

    // Si l'addition n'a plus rien à encaisser, on la clôture (libère la table).
    const addition = await tx.addition.findUnique({
      where: { id: commande.additionId },
      include: { commandes: { include: { lignes: true } }, paiements: true },
    });
    if (addition && addition.statut === 'OUVERTE') {
      const lignesAddition = addition.commandes.flatMap((c) => c.lignes);
      const resteAPayer = lignesAddition.some(
        (l) => l.quantite - l.quantitePayee - l.quantiteAnnulee - l.quantiteOfferte > 0,
      );
      if (!resteAPayer) {
        await tx.addition.update({
          where: { id: addition.id },
          data: { statut: 'PAYEE', fermeeLe: new Date() },
        });
      }
    }

    return tx.commande.findUniqueOrThrow({ where: { id: commande.id }, include: INCLUDE_COMMANDE });
  });

  res.status(201).json(toPublicCommande(commandeMaj));
});

interface LigneEntree {
  produitId: string;
  quantite: number;
  options?: Array<{ groupeOptionId: string; optionValeurId: string }>;
}

caisseRouter.post('/commandes', async (req, res) => {
  const { canal, tableId, noteCuisine, lignes, cleIdempotence, creeLeHorsLigne } = req.body ?? {};

  if (canal !== 'SUR_PLACE' && canal !== 'EMPORTER') {
    res.status(400).json({ error: 'Canal invalide' });
    return;
  }
  if (
    cleIdempotence !== undefined &&
    (typeof cleIdempotence !== 'string' || !cleIdempotence.trim() || cleIdempotence.length > 100)
  ) {
    res.status(400).json({ error: "Clé d'idempotence invalide" });
    return;
  }
  // Heure réelle de prise de commande quand elle a été enregistrée hors ligne :
  // la cuisine et les rapports gardent la bonne chronologie après resynchronisation.
  let creeLeFinal: Date | undefined;
  if (creeLeHorsLigne !== undefined) {
    const date = typeof creeLeHorsLigne === 'string' ? new Date(creeLeHorsLigne) : null;
    const maintenant = Date.now();
    if (
      !date ||
      Number.isNaN(date.getTime()) ||
      date.getTime() > maintenant + 5 * 60_000 ||
      date.getTime() < maintenant - 48 * 60 * 60_000
    ) {
      res.status(400).json({ error: 'Date de prise hors ligne invalide' });
      return;
    }
    creeLeFinal = date;
  }
  if (canal === 'SUR_PLACE' && typeof tableId !== 'string') {
    res.status(400).json({ error: 'La table est requise pour une commande sur place' });
    return;
  }
  if (noteCuisine !== undefined && typeof noteCuisine !== 'string') {
    res.status(400).json({ error: 'La note cuisine doit être du texte' });
    return;
  }
  if (!Array.isArray(lignes) || lignes.length === 0) {
    res.status(400).json({ error: 'La commande doit contenir au moins un produit' });
    return;
  }
  for (const ligne of lignes) {
    if (typeof ligne?.produitId !== 'string' || !Number.isInteger(ligne?.quantite) || ligne.quantite <= 0) {
      res.status(400).json({ error: 'Chaque ligne doit avoir un produitId et une quantité entière positive' });
      return;
    }
    if (
      ligne.options !== undefined &&
      (!Array.isArray(ligne.options) ||
        ligne.options.some(
          (o: unknown) =>
            typeof (o as { groupeOptionId?: unknown })?.groupeOptionId !== 'string' ||
            typeof (o as { optionValeurId?: unknown })?.optionValeurId !== 'string',
        ))
    ) {
      res.status(400).json({ error: 'Options de ligne invalides' });
      return;
    }
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  // Rejeu d'une commande déjà synchronisée : on renvoie l'existante, sans doublon.
  if (typeof cleIdempotence === 'string') {
    const existante = await prisma.commande.findUnique({
      where: { cleIdempotence: cleIdempotence.trim() },
      include: INCLUDE_COMMANDE,
    });
    if (existante) {
      if (existante.etablissementId !== etablissementId) {
        res.status(409).json({ error: "Clé d'idempotence déjà utilisée" });
        return;
      }
      res.status(200).json(toPublicCommande(existante));
      return;
    }
  }

  let additionId: string;
  if (canal === 'SUR_PLACE') {
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table || table.etablissementId !== etablissementId || table.statut !== 'ACTIF') {
      res.status(400).json({ error: 'Table invalide' });
      return;
    }
    const additionOuverte = await prisma.addition.findFirst({
      where: { etablissementId, tableId: table.id, statut: 'OUVERTE' },
    });
    additionId = additionOuverte
      ? additionOuverte.id
      : (await prisma.addition.create({ data: { etablissementId, tableId: table.id } })).id;
  } else {
    additionId = (await prisma.addition.create({ data: { etablissementId, tableId: null } })).id;
  }

  const lignesEntree = lignes as LigneEntree[];
  const produitIds = [...new Set(lignesEntree.map((l) => l.produitId))];
  const produits = await prisma.produit.findMany({
    where: { id: { in: produitIds }, etablissementId, statut: 'ACTIF' },
    include: { groupesOptions: { include: { valeurs: true } } },
  });
  const produitsParId = new Map(produits.map((p) => [p.id, p]));

  for (const id of produitIds) {
    if (!produitsParId.has(id)) {
      res.status(400).json({ error: `Produit invalide ou indisponible: ${id}` });
      return;
    }
  }

  const lignesAvecOptions: Array<{
    produitId: string;
    nomProduit: string;
    prixUnitaire: (typeof produits)[number]['prix'];
    coutRevientUnitaire: (typeof produits)[number]['coutRevient'];
    tauxTva: number;
    quantite: number;
    options: Array<{ optionValeurId: string; nomGroupe: string; valeur: string }>;
  }> = [];

  for (const ligne of lignesEntree) {
    const produit = produitsParId.get(ligne.produitId)!;
    const optionsFournies = ligne.options ?? [];
    const groupesChoisis = new Set<string>();
    const optionsResolues: Array<{ optionValeurId: string; nomGroupe: string; valeur: string }> = [];

    for (const choix of optionsFournies) {
      const groupe = produit.groupesOptions.find((g) => g.id === choix.groupeOptionId);
      if (!groupe) {
        res.status(400).json({ error: `Groupe d'option invalide pour ${produit.nom}` });
        return;
      }
      if (groupesChoisis.has(groupe.id)) {
        res.status(400).json({ error: `Une seule valeur autorisée par groupe (${groupe.nom})` });
        return;
      }
      const valeur = groupe.valeurs.find((v) => v.id === choix.optionValeurId);
      if (!valeur) {
        res.status(400).json({ error: `Valeur d'option invalide pour ${groupe.nom}` });
        return;
      }
      groupesChoisis.add(groupe.id);
      optionsResolues.push({ optionValeurId: valeur.id, nomGroupe: groupe.nom, valeur: valeur.valeur });
    }

    const groupesObligatoiresManquants = produit.groupesOptions.filter(
      (g) => g.obligatoire && !groupesChoisis.has(g.id),
    );
    if (groupesObligatoiresManquants.length > 0) {
      res.status(400).json({
        error: `Sélection requise pour ${produit.nom}: ${groupesObligatoiresManquants.map((g) => g.nom).join(', ')}`,
      });
      return;
    }

    lignesAvecOptions.push({
      produitId: produit.id,
      nomProduit: produit.nom,
      prixUnitaire: produit.prix,
      coutRevientUnitaire: produit.coutRevient,
      tauxTva: produit.tauxTva,
      quantite: ligne.quantite,
      options: optionsResolues,
    });
  }

  try {
    const commande = await prisma.commande.create({
      data: {
        canal,
        additionId,
        cleIdempotence: typeof cleIdempotence === 'string' ? cleIdempotence.trim() : null,
        creeLe: creeLeFinal,
        noteCuisine: typeof noteCuisine === 'string' && noteCuisine.trim() ? noteCuisine.trim() : null,
        etablissementId,
        serveurId: req.user!.id,
        lignes: {
          create: lignesAvecOptions.map((l) => ({
            produitId: l.produitId,
            nomProduit: l.nomProduit,
            prixUnitaire: l.prixUnitaire,
            coutRevientUnitaire: l.coutRevientUnitaire,
            tauxTva: l.tauxTva,
            quantite: l.quantite,
            options: {
              create: l.options.map((o) => ({
                optionValeurId: o.optionValeurId,
                nomGroupe: o.nomGroupe,
                valeur: o.valeur,
              })),
            },
          })),
        },
      },
      include: INCLUDE_COMMANDE,
    });
    res.status(201).json(toPublicCommande(commande));
  } catch (error) {
    // Deux synchronisations simultanées de la même commande hors ligne :
    // la seconde renvoie celle que la première vient de créer.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      typeof cleIdempotence === 'string'
    ) {
      const existante = await prisma.commande.findUnique({
        where: { cleIdempotence: cleIdempotence.trim() },
        include: INCLUDE_COMMANDE,
      });
      if (existante && existante.etablissementId === etablissementId) {
        res.status(200).json(toPublicCommande(existante));
        return;
      }
    }
    throw error;
  }
});

// --- Journée de caisse ---

const INCLUDE_JOURNEE = {
  ouvertePar: { select: { nom: true, prenom: true } },
  clotureePar: { select: { nom: true, prenom: true, role: true } },
  clotureDemandeePar: { select: { nom: true, prenom: true } },
} satisfies Prisma.JourneeCaisseInclude;

type JourneeAvecActeurs = Prisma.JourneeCaisseGetPayload<{ include: typeof INCLUDE_JOURNEE }>;

function toPublicJournee(j: JourneeAvecActeurs) {
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
  };
}

function getJourneeOuverte(etablissementId: string) {
  return prisma.journeeCaisse.findFirst({
    where: { etablissementId, statut: 'OUVERTE' },
    orderBy: { ouverteLe: 'desc' },
  });
}

async function totauxJournee(journeeCaisseId: string) {
  const groupes = await prisma.paiement.groupBy({
    by: ['moyenPaiement'],
    where: { journeeCaisseId },
    _sum: { montant: true },
    _count: { _all: true },
  });
  const parMoyen = groupes.map((g) => ({
    moyenPaiement: g.moyenPaiement,
    montant: arrondi(Number(g._sum.montant ?? 0)),
    nombre: g._count._all,
  }));
  const total = arrondi(parMoyen.reduce((s, m) => s + m.montant, 0));
  return { parMoyen, total };
}

caisseRouter.get('/journee', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const journee = await prisma.journeeCaisse.findFirst({
    where: { etablissementId, statut: 'OUVERTE' },
    include: INCLUDE_JOURNEE,
    orderBy: { ouverteLe: 'desc' },
  });

  if (!journee) {
    const derniere = await prisma.journeeCaisse.findFirst({
      where: { etablissementId, statut: 'CLOTUREE' },
      include: INCLUDE_JOURNEE,
      orderBy: { clotureeLe: 'desc' },
    });
    res.json({
      journee: null,
      derniereCloture: derniere
        ? { ...toPublicJournee(derniere), totaux: await totauxJournee(derniere.id) }
        : null,
    });
    return;
  }

  const totaux = await totauxJournee(journee.id);
  const especesEncaissees = totaux.parMoyen.find((m) => m.moyenPaiement === 'ESPECES')?.montant ?? 0;
  const additionsOuvertes = await prisma.addition.count({
    where: { etablissementId, statut: 'OUVERTE' },
  });

  res.json({
    journee: toPublicJournee(journee),
    totaux,
    especesAttendues: arrondi(Number(journee.fondDeCaisse) + especesEncaissees),
    additionsOuvertes,
  });
});

caisseRouter.post('/journee/ouverture', async (req, res) => {
  const { fondDeCaisse } = req.body ?? {};

  if (typeof fondDeCaisse !== 'number' || !Number.isFinite(fondDeCaisse) || fondDeCaisse < 0) {
    res.status(400).json({ error: 'Le fond de caisse doit être un nombre positif ou nul' });
    return;
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const existante = await getJourneeOuverte(etablissementId);
  if (existante) {
    res.status(409).json({ error: 'Une journée de caisse est déjà ouverte' });
    return;
  }

  const journee = await prisma.journeeCaisse.create({
    data: { etablissementId, fondDeCaisse: arrondi(fondDeCaisse), ouverteParId: req.user!.id },
    include: INCLUDE_JOURNEE,
  });

  res.status(201).json(toPublicJournee(journee));
});

caisseRouter.post('/journee/cloture', async (req, res) => {
  const { especesComptees, commentaire, codeGerant } = req.body ?? {};

  if (typeof especesComptees !== 'number' || !Number.isFinite(especesComptees) || especesComptees < 0) {
    res.status(400).json({ error: 'Le montant des espèces comptées doit être un nombre positif ou nul' });
    return;
  }
  if (commentaire !== undefined && typeof commentaire !== 'string') {
    res.status(400).json({ error: 'Commentaire invalide' });
    return;
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const journee = await getJourneeOuverte(etablissementId);
  if (!journee) {
    res.status(409).json({ error: 'Aucune journée de caisse ouverte' });
    return;
  }

  // On ne clôture pas avec des tables non soldées : tout doit être encaissé ou annulé.
  const additionsOuvertes = await prisma.addition.count({
    where: { etablissementId, statut: 'OUVERTE' },
  });
  if (additionsOuvertes > 0) {
    res.status(409).json({
      error: `Il reste ${additionsOuvertes} addition${additionsOuvertes > 1 ? 's' : ''} ouverte${additionsOuvertes > 1 ? 's' : ''}. Encaissez-les ou annulez-les avant de clôturer.`,
    });
    return;
  }

  const resolution = await resoudreResponsable({
    serveurId: req.user!.id,
    etablissementId,
    droit: 'CLOTURER',
    codeGerant,
    messageDroitManquant:
      "Vous n'avez pas le droit de clôturer la caisse. Un gérant doit valider avec son code.",
  });
  if (!resolution.ok) {
    res.status(resolution.status).json(resolution.body);
    return;
  }

  const totaux = await totauxJournee(journee.id);
  const especesEncaissees = totaux.parMoyen.find((m) => m.moyenPaiement === 'ESPECES')?.montant ?? 0;
  const especesAttendues = arrondi(Number(journee.fondDeCaisse) + especesEncaissees);
  const ecart = arrondi(especesComptees - especesAttendues);
  const commentaireFinal =
    typeof commentaire === 'string' && commentaire.trim() ? commentaire.trim() : null;

  const journeeMaj = await prisma.journeeCaisse.update({
    where: { id: journee.id },
    data: {
      statut: 'CLOTUREE',
      clotureeLe: new Date(),
      especesAttendues,
      especesComptees: arrondi(especesComptees),
      ecart,
      commentaire: commentaireFinal,
      clotureeParId: resolution.responsableId,
      clotureDemandeeParId: resolution.demandeeParId,
    },
    include: INCLUDE_JOURNEE,
  });

  res.json({ ...toPublicJournee(journeeMaj), totaux });
});

// --- Encaissement ---

const INCLUDE_ADDITION = {
  table: { select: { numero: true } },
  commandes: { include: { lignes: true } },
  paiements: true,
  remises: true,
} satisfies Prisma.AdditionInclude;

type AdditionAvecTotaux = Prisma.AdditionGetPayload<{ include: typeof INCLUDE_ADDITION }>;

function calculerTotaux(addition: AdditionAvecTotaux) {
  // Les quantités annulées et offertes ne comptent pas dans le facturable,
  // et les remises sur l'addition se déduisent ensuite du total.
  const totalBrut = addition.commandes
    .flatMap((c) => c.lignes)
    .reduce(
      (s, l) => s + Number(l.prixUnitaire) * (l.quantite - l.quantiteAnnulee - l.quantiteOfferte),
      0,
    );
  const montantRemises = addition.remises
    .filter((r) => r.type === 'REMISE')
    .reduce((s, r) => s + Number(r.montant), 0);
  const total = Math.max(0, arrondi(totalBrut - montantRemises));
  const totalPaye = addition.paiements.reduce((s, p) => s + Number(p.montant), 0);
  const solde = Math.max(0, arrondi(total - totalPaye));
  return {
    total,
    totalPaye: arrondi(totalPaye),
    solde,
    montantRemises: arrondi(montantRemises),
  };
}

caisseRouter.get('/additions', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const additions = await prisma.addition.findMany({
    where: { etablissementId, statut: 'OUVERTE' },
    include: INCLUDE_ADDITION,
    orderBy: { ouverteLe: 'asc' },
  });

  res.json(
    additions.map((a) => ({
      id: a.id,
      table: a.table,
      statut: a.statut,
      ouverteLe: a.ouverteLe,
      ...calculerTotaux(a),
    })),
  );
});

caisseRouter.get('/additions/:id', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const addition = await prisma.addition.findUnique({
    where: { id: req.params.id },
    include: {
      table: { select: { numero: true } },
      commandes: { include: { lignes: { include: { options: true } } }, orderBy: { creeLe: 'asc' } },
      paiements: { include: { lignes: true }, orderBy: { creeLe: 'asc' } },
      remises: { orderBy: { creeLe: 'asc' } },
    },
  });

  if (!addition || addition.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Addition introuvable' });
    return;
  }

  res.json({
    id: addition.id,
    table: addition.table,
    statut: addition.statut,
    ouverteLe: addition.ouverteLe,
    fermeeLe: addition.fermeeLe,
    ...calculerTotaux(addition),
    commandes: addition.commandes.map((c) => ({
      id: c.id,
      canal: c.canal,
      creeLe: c.creeLe,
      lignes: c.lignes.map((l) => ({
        id: l.id,
        nomProduit: l.nomProduit,
        prixUnitaire: Number(l.prixUnitaire),
        tauxTva: l.tauxTva,
        quantite: l.quantite,
        quantitePayee: l.quantitePayee,
        quantiteAnnulee: l.quantiteAnnulee,
        quantiteOfferte: l.quantiteOfferte,
        options: l.options.map((o) => ({ nomGroupe: o.nomGroupe, valeur: o.valeur })),
      })),
    })),
    paiements: addition.paiements.map((p) => ({
      id: p.id,
      montant: Number(p.montant),
      moyenPaiement: p.moyenPaiement,
      montantRecu: p.montantRecu !== null ? Number(p.montantRecu) : null,
      creeLe: p.creeLe,
    })),
    remises: addition.remises.map((r) => ({
      id: r.id,
      type: r.type,
      montant: Number(r.montant),
      pourcentage: r.pourcentage,
      quantite: r.quantite,
      motif: r.motif,
      creeLe: r.creeLe,
    })),
  });
});

// --- Remises et offerts ---

caisseRouter.post('/additions/:id/remise', async (req, res) => {
  const { mode, valeur, motif, commentaire, codeGerant } = req.body ?? {};

  if (mode !== 'POURCENTAGE' && mode !== 'MONTANT') {
    res.status(400).json({ error: 'Mode de remise invalide (POURCENTAGE ou MONTANT)' });
    return;
  }
  if (typeof valeur !== 'number' || !Number.isFinite(valeur) || valeur <= 0) {
    res.status(400).json({ error: 'Valeur de remise invalide' });
    return;
  }
  if (mode === 'POURCENTAGE' && (!Number.isInteger(valeur) || valeur > 100)) {
    res.status(400).json({ error: 'Le pourcentage doit être un entier entre 1 et 100' });
    return;
  }
  if (typeof motif !== 'string' || !motif.trim() || motif.length > 100) {
    res.status(400).json({ error: 'Le motif de la remise est obligatoire' });
    return;
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const addition = await prisma.addition.findUnique({
    where: { id: req.params.id },
    include: INCLUDE_ADDITION,
  });
  if (!addition || addition.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Addition introuvable' });
    return;
  }
  if (addition.statut !== 'OUVERTE') {
    res.status(400).json({ error: 'Cette addition est déjà soldée' });
    return;
  }

  const resolution = await resoudreResponsable({
    serveurId: req.user!.id,
    etablissementId,
    droit: 'REMISER',
    codeGerant,
    messageDroitManquant:
      "Vous n'avez pas le droit d'accorder une remise. Un gérant doit valider avec son code.",
  });
  if (!resolution.ok) {
    res.status(resolution.status).json(resolution.body);
    return;
  }

  const { solde } = calculerTotaux(addition);
  const montantRemise = mode === 'POURCENTAGE' ? arrondi((solde * valeur) / 100) : arrondi(valeur);
  if (montantRemise <= 0) {
    res.status(400).json({ error: 'Le montant de la remise est nul' });
    return;
  }
  if (montantRemise > solde + 0.01) {
    res.status(400).json({ error: `La remise dépasse le solde restant (${solde} DA)` });
    return;
  }

  const resultat = await prisma.$transaction(async (tx) => {
    await tx.remise.create({
      data: {
        type: 'REMISE',
        montant: montantRemise,
        pourcentage: mode === 'POURCENTAGE' ? valeur : null,
        motif: motif.trim(),
        commentaire: typeof commentaire === 'string' && commentaire.trim() ? commentaire.trim() : null,
        etablissementId,
        additionId: addition.id,
        accordeeParId: resolution.responsableId,
        demandeeParId: resolution.demandeeParId,
      },
    });

    const soldeRestant = Math.max(0, arrondi(solde - montantRemise));
    if (soldeRestant <= 0.01) {
      await tx.addition.update({
        where: { id: addition.id },
        data: { statut: 'PAYEE', fermeeLe: new Date() },
      });
    }
    return { soldeRestant, cloturee: soldeRestant <= 0.01 };
  });

  res.status(201).json({
    montant: montantRemise,
    soldeRestant: resultat.soldeRestant,
    additionCloturee: resultat.cloturee,
  });
});

interface LigneAOffrir {
  ligneCommandeId: string;
  quantite: number;
}

caisseRouter.post('/additions/:id/offert', async (req, res) => {
  const { lignes, motif, commentaire, codeGerant } = req.body ?? {};

  if (!Array.isArray(lignes) || lignes.length === 0) {
    res.status(400).json({ error: 'Sélectionnez au moins un article à offrir' });
    return;
  }
  for (const l of lignes as LigneAOffrir[]) {
    if (typeof l?.ligneCommandeId !== 'string' || !Number.isInteger(l?.quantite) || l.quantite <= 0) {
      res.status(400).json({ error: 'Lignes à offrir invalides' });
      return;
    }
  }
  if (typeof motif !== 'string' || !motif.trim() || motif.length > 100) {
    res.status(400).json({ error: "Le motif de l'offert est obligatoire" });
    return;
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const addition = await prisma.addition.findUnique({
    where: { id: req.params.id },
    include: INCLUDE_ADDITION,
  });
  if (!addition || addition.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Addition introuvable' });
    return;
  }
  if (addition.statut !== 'OUVERTE') {
    res.status(400).json({ error: 'Cette addition est déjà soldée' });
    return;
  }

  const lignesParId = new Map(addition.commandes.flatMap((c) => c.lignes).map((l) => [l.id, l]));
  for (const cible of lignes as LigneAOffrir[]) {
    const ligne = lignesParId.get(cible.ligneCommandeId);
    if (!ligne) {
      res.status(400).json({ error: 'Article invalide pour cette addition' });
      return;
    }
    const offrable = ligne.quantite - ligne.quantitePayee - ligne.quantiteAnnulee - ligne.quantiteOfferte;
    if (cible.quantite > offrable) {
      res.status(400).json({
        error: `Quantité non offrable pour ${ligne.nomProduit} (reste ${offrable})`,
      });
      return;
    }
  }

  const resolution = await resoudreResponsable({
    serveurId: req.user!.id,
    etablissementId,
    droit: 'REMISER',
    codeGerant,
    messageDroitManquant:
      "Vous n'avez pas le droit d'offrir un article. Un gérant doit valider avec son code.",
  });
  if (!resolution.ok) {
    res.status(resolution.status).json(resolution.body);
    return;
  }

  const motifFinal = motif.trim();
  const commentaireFinal =
    typeof commentaire === 'string' && commentaire.trim() ? commentaire.trim() : null;

  const resultat = await prisma.$transaction(async (tx) => {
    for (const cible of lignes as LigneAOffrir[]) {
      const ligne = lignesParId.get(cible.ligneCommandeId)!;
      await tx.ligneCommande.update({
        where: { id: ligne.id },
        data: { quantiteOfferte: { increment: cible.quantite } },
      });
      await tx.remise.create({
        data: {
          type: 'OFFERT',
          montant: arrondi(Number(ligne.prixUnitaire) * cible.quantite),
          quantite: cible.quantite,
          motif: motifFinal,
          commentaire: commentaireFinal,
          etablissementId,
          additionId: addition.id,
          ligneCommandeId: ligne.id,
          accordeeParId: resolution.responsableId,
          demandeeParId: resolution.demandeeParId,
        },
      });
    }

    // Si plus rien à encaisser après les offerts, l'addition se solde (libère la table).
    const additionApres = await tx.addition.findUniqueOrThrow({
      where: { id: addition.id },
      include: INCLUDE_ADDITION,
    });
    const { solde } = calculerTotaux(additionApres);
    if (solde <= 0.01) {
      await tx.addition.update({
        where: { id: addition.id },
        data: { statut: 'PAYEE', fermeeLe: new Date() },
      });
    }
    return { soldeRestant: solde, cloturee: solde <= 0.01 };
  });

  res.status(201).json({
    soldeRestant: resultat.soldeRestant,
    additionCloturee: resultat.cloturee,
  });
});

interface LigneAPayer {
  ligneCommandeId: string;
  quantite: number;
}

caisseRouter.post('/additions/:id/paiements', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);
  const { mode, montant, moyenPaiement, montantRecu, lignes } = req.body ?? {};

  const MOYENS_VALIDES: ModePaiement[] = ['ESPECES', 'CARTE', 'CHEQUE', 'AUTRE'];
  if (typeof moyenPaiement !== 'string' || !MOYENS_VALIDES.includes(moyenPaiement as ModePaiement)) {
    res.status(400).json({ error: 'Moyen de paiement invalide' });
    return;
  }
  const moyenPaiementValide = moyenPaiement as ModePaiement;
  if (montantRecu !== undefined && (typeof montantRecu !== 'number' || montantRecu < 0)) {
    res.status(400).json({ error: 'Montant reçu invalide' });
    return;
  }
  if (mode !== 'MONTANT' && mode !== 'ARTICLES') {
    res.status(400).json({ error: 'Mode de paiement invalide' });
    return;
  }

  const etablissement = await prisma.etablissement.findUnique({
    where: { id: etablissementId },
    select: { moyensPaiementActifs: true },
  });
  if (!etablissement?.moyensPaiementActifs.includes(moyenPaiementValide)) {
    res.status(400).json({ error: "Ce moyen de paiement n'est pas activé pour cet établissement" });
    return;
  }

  const addition = await prisma.addition.findUnique({
    where: { id: req.params.id },
    include: INCLUDE_ADDITION,
  });
  if (!addition || addition.etablissementId !== etablissementId) {
    res.status(404).json({ error: 'Addition introuvable' });
    return;
  }
  if (addition.statut !== 'OUVERTE') {
    res.status(400).json({ error: 'Cette addition est déjà soldée' });
    return;
  }

  const { solde } = calculerTotaux(addition);
  const lignesParId = new Map(addition.commandes.flatMap((c) => c.lignes).map((l) => [l.id, l]));

  let montantFinal: number;
  let lignesAPayer: Array<{ ligneCommandeId: string; quantite: number; montant: number }> = [];

  if (mode === 'ARTICLES') {
    if (!Array.isArray(lignes) || lignes.length === 0) {
      res.status(400).json({ error: 'Sélectionnez au moins un article' });
      return;
    }
    for (const entree of lignes as LigneAPayer[]) {
      const ligne = lignesParId.get(entree.ligneCommandeId);
      if (!ligne) {
        res.status(400).json({ error: 'Article invalide pour cette addition' });
        return;
      }
      if (!Number.isInteger(entree.quantite) || entree.quantite <= 0) {
        res.status(400).json({ error: 'Quantité invalide' });
        return;
      }
      const restant =
        ligne.quantite - ligne.quantitePayee - ligne.quantiteAnnulee - ligne.quantiteOfferte;
      if (entree.quantite > restant) {
        res.status(400).json({ error: `Quantité indisponible pour ${ligne.nomProduit} (reste ${restant})` });
        return;
      }
    }
    lignesAPayer = (lignes as LigneAPayer[]).map((entree) => {
      const ligne = lignesParId.get(entree.ligneCommandeId)!;
      return { ligneCommandeId: ligne.id, quantite: entree.quantite, montant: Number(ligne.prixUnitaire) * entree.quantite };
    });
    montantFinal = Math.round(lignesAPayer.reduce((s, l) => s + l.montant, 0) * 100) / 100;
  } else {
    if (typeof montant !== 'number' || !Number.isFinite(montant) || montant <= 0) {
      res.status(400).json({ error: 'Montant invalide' });
      return;
    }
    montantFinal = Math.round(montant * 100) / 100;
  }

  if (montantFinal > solde + 0.01) {
    res.status(400).json({ error: `Le montant dépasse le solde restant (${solde} DZD)` });
    return;
  }
  if (moyenPaiementValide === 'ESPECES' && montantRecu !== undefined && montantRecu < montantFinal) {
    res.status(400).json({ error: 'Le montant reçu est inférieur au montant encaissé' });
    return;
  }

  const journee = await getJourneeOuverte(etablissementId);
  if (!journee) {
    res.status(409).json({
      error: "Aucune journée de caisse ouverte. Ouvrez la journée (onglet Journée) avant d'encaisser.",
    });
    return;
  }

  const resultat = await prisma.$transaction(async (tx) => {
    const paiement = await tx.paiement.create({
      data: {
        additionId: addition.id,
        journeeCaisseId: journee.id,
        montant: montantFinal,
        moyenPaiement: moyenPaiementValide,
        montantRecu: moyenPaiementValide === 'ESPECES' && montantRecu !== undefined ? montantRecu : null,
        lignes: {
          create: lignesAPayer.map((l) => ({
            ligneCommandeId: l.ligneCommandeId,
            quantite: l.quantite,
            montant: l.montant,
          })),
        },
      },
    });

    for (const l of lignesAPayer) {
      await tx.ligneCommande.update({
        where: { id: l.ligneCommandeId },
        data: { quantitePayee: { increment: l.quantite } },
      });
    }

    const soldeRestant = Math.max(0, Math.round((solde - montantFinal) * 100) / 100);
    if (soldeRestant <= 0.01) {
      await tx.addition.update({
        where: { id: addition.id },
        data: { statut: 'PAYEE', fermeeLe: new Date() },
      });
    }

    return { paiement, soldeRestant, cloturee: soldeRestant <= 0.01 };
  });

  res.status(201).json({
    id: resultat.paiement.id,
    montant: Number(resultat.paiement.montant),
    moyenPaiement: resultat.paiement.moyenPaiement,
    montantRecu: resultat.paiement.montantRecu !== null ? Number(resultat.paiement.montantRecu) : null,
    rendu:
      resultat.paiement.montantRecu !== null
        ? Math.round((Number(resultat.paiement.montantRecu) - Number(resultat.paiement.montant)) * 100) / 100
        : null,
    soldeRestant: resultat.soldeRestant,
    additionCloturee: resultat.cloturee,
  });
});
