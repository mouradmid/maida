import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { erreurLignesEntree, resoudreLignesCommande, type LigneEntree } from '../lib/commandes';
import { emailValide, envoyerEmail } from '../lib/email';
import { emailConfirmationReservation } from '../lib/emails';
import { prisma } from '../lib/prisma';
import { verrouillerEtablissement } from '../lib/erreurs';
import {
  choisirTableDisponible,
  creneauxDuJour,
  dansLesHoraires,
  JOUR_ISO,
  lireBesoins,
  lireHoraires,
} from '../lib/reservations';

// Routes publiques, sans authentification : le menu consultable par les
// clients du restaurant (QR code à table), leur demande de commande — qui
// reste en attente jusqu'à validation par un serveur — et la réservation de
// table depuis le lien public du restaurant, confirmée sur-le-champ dans les
// limites fixées par le gérant.
export const publicRouter = Router();

// Anti-abus : la commande client est publique, on borne le débit par IP.
const limiteCommandeClient = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 10_000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de commandes envoyées. Patientez quelques minutes.' },
});

// Une réservation engage une table pour deux heures : on est plus strict que
// pour une commande, où le client se corrige lui-même en rappelant un serveur.
const limiteReservationClient = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 10_000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de réservations demandées. Appelez le restaurant.' },
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
          disponible: true,
          suiviQuantite: true,
          quantiteRestante: true,
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
      // Le client ne voit pas les articles épuisés (rupture manuelle ou stock à 0).
      .map((c) => ({
        ...c,
        produits: c.produits.filter(
          (p) => p.disponible && (!p.suiviQuantite || (p.quantiteRestante ?? 0) > 0),
        ),
      }))
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

/**
 * Page publique de réservation d'un restaurant, atteinte par son lien lisible
 * (« /reserver/le-bon-grill ») depuis ses réseaux, son site ou WhatsApp.
 *
 * Le menu QR, lui, sert au client déjà assis à table : réserver se fait de
 * chez soi, il fallait donc une porte d'entrée qui ne passe pas par la salle.
 */
publicRouter.get('/reservation/:lien', async (req, res) => {
  const etablissement = await prisma.etablissement.findUnique({
    where: { lienPublic: req.params.lien.toLowerCase() },
    select: {
      id: true,
      nom: true,
      adresse: true,
      ville: true,
      statut: true,
      reservationEnLigneActive: true,
      reservationCouvertsMax: true,
      reservationDelaiMinMinutes: true,
      reservationHorizonJours: true,
      horairesReservation: true,
      compteClient: { select: { statut: true, modules: true } },
    },
  });
  if (
    !etablissement ||
    etablissement.statut !== 'ACTIF' ||
    etablissement.compteClient.statut !== 'ACTIF' ||
    !etablissement.compteClient.modules.includes('QR_MENU')
  ) {
    res.status(404).json({ error: 'Restaurant introuvable' });
    return;
  }

  res.json({
    etablissementId: etablissement.id,
    etablissement: {
      nom: etablissement.nom,
      adresse: etablissement.adresse,
      ville: etablissement.ville,
    },
    // `null` quand le gérant a fermé la réservation en ligne : la page le dit
    // et renvoie vers le téléphone, plutôt qu'une erreur. Sinon, les limites
    // à afficher et à respecter avant même l'envoi.
    reservationEnLigne: etablissement.reservationEnLigneActive
      ? {
          couvertsMax: etablissement.reservationCouvertsMax,
          delaiMinMinutes: etablissement.reservationDelaiMinMinutes,
          horizonJours: etablissement.reservationHorizonJours,
          // Jours de la semaine (0 = dimanche) où au moins un service est
          // ouvert : le calendrier du client grise les autres d'emblée.
          joursOuverts: [
            ...new Set(lireHoraires(etablissement.horairesReservation).map((p) => p.jour)),
          ].sort(),
        }
      : null,
  });
});

const DUREE_RESERVATION_MINUTES = 120;

/**
 * Les créneaux d'un jour pour un groupe : « 19:00, 19:30 (complet), 20:00… ».
 * Le client choisit parmi eux au lieu de deviner une heure qui sera refusée.
 */
publicRouter.get('/reservation/:lien/creneaux', async (req, res) => {
  const { jour, couverts } = req.query;
  const nombre = Number(couverts);
  if (typeof jour !== 'string' || !JOUR_ISO.test(jour)) {
    res.status(400).json({ error: 'Jour invalide (AAAA-MM-JJ)' });
    return;
  }
  if (!Number.isInteger(nombre) || nombre <= 0) {
    res.status(400).json({ error: 'Nombre de personnes invalide' });
    return;
  }

  const etablissement = await prisma.etablissement.findUnique({
    where: { lienPublic: req.params.lien.toLowerCase() },
    select: {
      id: true,
      statut: true,
      reservationEnLigneActive: true,
      reservationCouvertsMax: true,
      reservationDelaiMinMinutes: true,
      reservationHorizonJours: true,
      horairesReservation: true,
      compteClient: { select: { statut: true, modules: true } },
    },
  });
  if (
    !etablissement ||
    etablissement.statut !== 'ACTIF' ||
    etablissement.compteClient.statut !== 'ACTIF' ||
    !etablissement.compteClient.modules.includes('QR_MENU') ||
    !etablissement.reservationEnLigneActive
  ) {
    res.status(404).json({ error: 'Réservation indisponible' });
    return;
  }
  if (nombre > etablissement.reservationCouvertsMax) {
    res.json({ creneaux: [] });
    return;
  }

  res.json({
    creneaux: await creneauxDuJour({
      etablissementId: etablissement.id,
      jour,
      couverts: nombre,
      plages: lireHoraires(etablissement.horairesReservation),
      delaiMinMinutes: etablissement.reservationDelaiMinMinutes,
      horizonJours: etablissement.reservationHorizonJours,
      dureeMinutes: DUREE_RESERVATION_MINUTES,
    }),
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

/**
 * Réservation prise par le client lui-même depuis le lien public du restaurant.
 *
 * Confirmée sur-le-champ : le client repart avec une table ou avec un refus
 * clair, jamais avec une attente. Ce qui la borne, ce sont les limites fixées
 * par le gérant (couverts, délai, horizon) et le plan de salle lui-même — on ne
 * peut pas réserver plus de tables qu'il n'y en a.
 */
publicRouter.post('/reservations', limiteReservationClient, async (req, res) => {
  const {
    etablissementId,
    nomClient,
    telephone,
    email,
    nombreCouverts,
    date,
    note,
    occasion,
    restrictions,
  } = req.body ?? {};

  if (typeof etablissementId !== 'string') {
    res.status(400).json({ error: 'Établissement requis' });
    return;
  }
  if (typeof nomClient !== 'string' || !nomClient.trim() || nomClient.length > 100) {
    res.status(400).json({ error: 'Votre nom est requis' });
    return;
  }
  // Le téléphone n'est pas une formalité : c'est par lui que le restaurant
  // rappelle quand il doit décaler ou annuler.
  if (typeof telephone !== 'string' || !telephone.trim() || telephone.length > 30) {
    res.status(400).json({ error: 'Votre téléphone est requis' });
    return;
  }
  if (email !== undefined && email !== '' && (typeof email !== 'string' || !emailValide(email))) {
    res.status(400).json({ error: 'Adresse e-mail invalide' });
    return;
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 200)) {
    res.status(400).json({ error: 'Note invalide (200 caractères maximum)' });
    return;
  }
  if (!Number.isInteger(nombreCouverts) || nombreCouverts <= 0) {
    res.status(400).json({ error: 'Le nombre de personnes doit être un entier positif' });
    return;
  }
  const besoins = lireBesoins(occasion, restrictions);
  if ('erreur' in besoins) {
    res.status(400).json({ error: besoins.erreur });
    return;
  }
  const dateReservation = typeof date === 'string' ? new Date(date) : null;
  if (!dateReservation || Number.isNaN(dateReservation.getTime())) {
    res.status(400).json({ error: 'Horaire invalide' });
    return;
  }

  const etablissement = await prisma.etablissement.findUnique({
    where: { id: etablissementId },
    select: {
      id: true,
      nom: true,
      statut: true,
      reservationEnLigneActive: true,
      reservationCouvertsMax: true,
      reservationDelaiMinMinutes: true,
      reservationHorizonJours: true,
      horairesReservation: true,
      compteClient: { select: { statut: true, modules: true } },
    },
  });
  if (
    !etablissement ||
    etablissement.statut !== 'ACTIF' ||
    etablissement.compteClient.statut !== 'ACTIF' ||
    !etablissement.compteClient.modules.includes('QR_MENU')
  ) {
    res.status(404).json({ error: 'Réservation indisponible' });
    return;
  }
  if (!etablissement.reservationEnLigneActive) {
    res.status(403).json({
      error: 'Ce restaurant ne prend pas les réservations en ligne — appelez-le.',
    });
    return;
  }

  // Les limites du gérant. Chaque refus dit ce qu'il faut faire à la place :
  // un client sans solution rappelle, et c'est le service qu'on encombre.
  if (nombreCouverts > etablissement.reservationCouvertsMax) {
    res.status(400).json({
      error: `En ligne, la réservation va jusqu'à ${etablissement.reservationCouvertsMax} personnes. Pour un groupe plus grand, appelez le restaurant.`,
    });
    return;
  }
  const maintenant = Date.now();
  const debutCreneau = dateReservation.getTime();
  const delaiMinMs = etablissement.reservationDelaiMinMinutes * 60_000;
  if (debutCreneau < maintenant + delaiMinMs) {
    const heures = Math.round(etablissement.reservationDelaiMinMinutes / 60);
    const delai =
      etablissement.reservationDelaiMinMinutes < 60
        ? `${etablissement.reservationDelaiMinMinutes} minutes`
        : `${heures} heure${heures > 1 ? 's' : ''}`;
    res.status(400).json({
      error: `Il faut réserver au moins ${delai} à l'avance. Pour ce soir même, appelez le restaurant.`,
    });
    return;
  }
  if (debutCreneau > maintenant + etablissement.reservationHorizonJours * 24 * 60 * 60_000) {
    res.status(400).json({
      error: `Les réservations en ligne s'arrêtent à ${etablissement.reservationHorizonJours} jours. Au-delà, appelez le restaurant.`,
    });
    return;
  }

  // Le restaurant ne prend que pendant ses services : un créneau hors horaires
  // est refusé ici même si le formulaire du client a été contourné.
  if (!dansLesHoraires(lireHoraires(etablissement.horairesReservation), debutCreneau)) {
    res.status(400).json({
      error:
        "Le restaurant ne prend pas de réservation à cette heure-là. Choisissez l'un des créneaux proposés.",
    });
    return;
  }

  // Sous verrou : deux clients qui visent la dernière table du même créneau
  // passent l'un après l'autre, et le second se voit proposer autre chose.
  const resultat = await prisma.$transaction(async (tx) => {
    await verrouillerEtablissement(tx, etablissement.id);
    const table = await choisirTableDisponible(
      etablissement.id,
      nombreCouverts,
      debutCreneau,
      DUREE_RESERVATION_MINUTES,
    );
    if (!table) return null;
    const reservation = await tx.reservation.create({
      data: {
        nomClient: nomClient.trim(),
        telephone: telephone.trim(),
        email: typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null,
        nombreCouverts,
        date: dateReservation,
        dureeMinutes: DUREE_RESERVATION_MINUTES,
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
        occasion: besoins.occasion ?? null,
        restrictions: besoins.restrictions ?? [],
        tableId: table.id,
        etablissementId: etablissement.id,
        // Personne n'a décroché : c'est le client qui a rempli le formulaire.
        priseParId: null,
      },
    });
    return { table, reservation };
  });
  if (!resultat) {
    res.status(409).json({
      error: 'Plus de table libre à cette heure. Essayez un autre créneau, ou appelez le restaurant.',
    });
    return;
  }
  const { table, reservation } = resultat;

  // Confirmation non bloquante : la table est prise, qu'un serveur d'e-mail
  // réponde ou non (envoyerEmail ne lève jamais et trace le résultat).
  if (reservation.email) {
    await envoyerEmail(
      emailConfirmationReservation({
        destinataire: reservation.email,
        nomClient: reservation.nomClient,
        etablissement: etablissement.nom,
        date: reservation.date,
        nombreCouverts: reservation.nombreCouverts,
        table: table.numero,
      }),
      {
        type: 'CONFIRMATION_RESERVATION',
        etablissementId: etablissement.id,
        etablissement: etablissement.nom,
      },
    );
  }

  res.status(201).json({
    id: reservation.id,
    date: reservation.date,
    nombreCouverts: reservation.nombreCouverts,
    table: table.numero,
    confirmationEnvoyee: Boolean(reservation.email),
  });
});
