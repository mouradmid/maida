import { Router } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { getContexteServeur } from './partage';

export const reservationsRouter = Router();

const INCLUDE_RESERVATION = {
  table: { select: { id: true, numero: true } },
  prisePar: { select: { nom: true, prenom: true } },
} satisfies Prisma.ReservationInclude;

function toPublicReservation(r: Prisma.ReservationGetPayload<{ include: typeof INCLUDE_RESERVATION }>) {
  return {
    id: r.id,
    nomClient: r.nomClient,
    telephone: r.telephone,
    email: r.email,
    nombreCouverts: r.nombreCouverts,
    date: r.date,
    dureeMinutes: r.dureeMinutes,
    note: r.note,
    statut: r.statut,
    table: r.table,
    prisePar: r.prisePar,
  };
}

// Détecte une réservation en conflit (chevauchement de créneau) sur une table donnée.
async function trouverConflitReservation(
  tableId: string,
  debutCreneau: number,
  dureeMinutes: number,
  reservationExclueId?: string,
) {
  const finCreneau = debutCreneau + dureeMinutes * 60_000;
  const voisines = await prisma.reservation.findMany({
    where: {
      tableId,
      statut: { in: ['A_VENIR', 'ARRIVEE'] },
      date: {
        gte: new Date(debutCreneau - 12 * 60 * 60_000),
        lte: new Date(finCreneau + 12 * 60 * 60_000),
      },
      ...(reservationExclueId ? { id: { not: reservationExclueId } } : {}),
    },
  });
  return voisines.find((r) => {
    const debutR = r.date.getTime();
    const finR = debutR + r.dureeMinutes * 60_000;
    return debutR < finCreneau && finR > debutCreneau;
  });
}

reservationsRouter.get('/reservations', async (req, res) => {
  const { debut, fin } = req.query;
  if (typeof debut !== 'string' || typeof fin !== 'string') {
    res.status(400).json({ error: 'Période requise (debut et fin)' });
    return;
  }
  const dateDebut = new Date(debut);
  const dateFin = new Date(fin);
  if (Number.isNaN(dateDebut.getTime()) || Number.isNaN(dateFin.getTime()) || dateDebut > dateFin) {
    res.status(400).json({ error: 'Période invalide' });
    return;
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const reservations = await prisma.reservation.findMany({
    where: { etablissementId, date: { gte: dateDebut, lte: dateFin } },
    include: INCLUDE_RESERVATION,
    orderBy: { date: 'asc' },
  });

  res.json(reservations.map(toPublicReservation));
});

reservationsRouter.post('/reservations', async (req, res) => {
  const {
    nomClient,
    telephone,
    email,
    nombreCouverts,
    date,
    dureeMinutes,
    note,
    tableId,
    cleIdempotence,
  } = req.body ?? {};

  if (typeof nomClient !== 'string' || !nomClient.trim() || nomClient.length > 100) {
    res.status(400).json({ error: 'Le nom du client est requis' });
    return;
  }
  if (
    cleIdempotence !== undefined &&
    (typeof cleIdempotence !== 'string' || !cleIdempotence.trim() || cleIdempotence.length > 100)
  ) {
    res.status(400).json({ error: "Clé d'idempotence invalide" });
    return;
  }
  if (telephone !== undefined && (typeof telephone !== 'string' || telephone.length > 30)) {
    res.status(400).json({ error: 'Téléphone invalide' });
    return;
  }
  if (
    email !== undefined &&
    email !== '' &&
    (typeof email !== 'string' || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  ) {
    res.status(400).json({ error: 'Adresse email invalide' });
    return;
  }
  if (!Number.isInteger(nombreCouverts) || nombreCouverts <= 0) {
    res.status(400).json({ error: 'Le nombre de couverts doit être un entier positif' });
    return;
  }
  const dateReservation = typeof date === 'string' ? new Date(date) : null;
  const maintenant = Date.now();
  // Une réservation prise hors ligne peut n'arriver qu'après l'heure prévue, si
  // la tablette est restée coupée pendant le service : on accepte alors le
  // passé récent plutôt que de perdre la réservation à la resynchronisation.
  const tolerancePasse = typeof cleIdempotence === 'string' ? 24 * 60 * 60_000 : 30 * 60_000;
  if (
    !dateReservation ||
    Number.isNaN(dateReservation.getTime()) ||
    dateReservation.getTime() < maintenant - tolerancePasse ||
    dateReservation.getTime() > maintenant + 365 * 24 * 60 * 60_000
  ) {
    res.status(400).json({ error: 'Date de réservation invalide (elle doit être à venir)' });
    return;
  }
  const duree = dureeMinutes ?? 120;
  if (!Number.isInteger(duree) || duree < 15 || duree > 600) {
    res.status(400).json({ error: 'Durée invalide (15 minutes à 10 heures)' });
    return;
  }
  if (typeof tableId !== 'string') {
    res.status(400).json({ error: 'La table est requise' });
    return;
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  // Rejeu d'une réservation déjà synchronisée : on renvoie l'existante.
  if (typeof cleIdempotence === 'string') {
    const existante = await prisma.reservation.findUnique({
      where: { cleIdempotence: cleIdempotence.trim() },
      include: INCLUDE_RESERVATION,
    });
    if (existante) {
      if (existante.etablissementId !== etablissementId) {
        res.status(409).json({ error: "Clé d'idempotence déjà utilisée" });
        return;
      }
      res.json(toPublicReservation(existante));
      return;
    }
  }

  const table = await prisma.table.findUnique({ where: { id: tableId } });
  if (!table || table.etablissementId !== etablissementId || table.statut !== 'ACTIF') {
    res.status(400).json({ error: 'Table invalide' });
    return;
  }

  // Anti double-réservation : chevauchement sur la même table.
  const conflit = await trouverConflitReservation(table.id, dateReservation.getTime(), duree);
  if (conflit) {
    const heure = conflit.date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Algiers',
    });
    res.status(409).json({
      error: `La table ${table.numero} est déjà réservée sur ce créneau (${conflit.nomClient}, ${heure})`,
    });
    return;
  }

  try {
    const reservation = await prisma.reservation.create({
      data: {
        nomClient: nomClient.trim(),
        telephone: typeof telephone === 'string' && telephone.trim() ? telephone.trim() : null,
        email: typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null,
        nombreCouverts,
        date: dateReservation,
        dureeMinutes: duree,
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
        tableId: table.id,
        etablissementId,
        priseParId: req.user!.id,
        cleIdempotence: typeof cleIdempotence === 'string' ? cleIdempotence.trim() : null,
      },
      include: INCLUDE_RESERVATION,
    });
    res.status(201).json(toPublicReservation(reservation));
  } catch (error) {
    // Deux synchronisations simultanées de la même réservation hors ligne.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      typeof cleIdempotence === 'string'
    ) {
      const existante = await prisma.reservation.findUnique({
        where: { cleIdempotence: cleIdempotence.trim() },
        include: INCLUDE_RESERVATION,
      });
      if (existante) {
        res.json(toPublicReservation(existante));
        return;
      }
    }
    throw error;
  }
});

reservationsRouter.patch('/reservations/:id', async (req, res) => {
  const { statut, tableId, nombreCouverts, date, nomClient, telephone, email, note } = req.body ?? {};

  const veutChangerStatut = statut !== undefined;
  const veutChangerTable = tableId !== undefined;
  const veutChangerCouverts = nombreCouverts !== undefined;
  const veutChangerDate = date !== undefined;
  const veutChangerNom = nomClient !== undefined;
  const veutChangerTelephone = telephone !== undefined;
  const veutChangerEmail = email !== undefined;
  const veutChangerNote = note !== undefined;

  if (
    !veutChangerStatut &&
    !veutChangerTable &&
    !veutChangerCouverts &&
    !veutChangerDate &&
    !veutChangerNom &&
    !veutChangerTelephone &&
    !veutChangerEmail &&
    !veutChangerNote
  ) {
    res.status(400).json({ error: 'Aucune modification demandée' });
    return;
  }
  if (veutChangerStatut && statut !== 'ARRIVEE' && statut !== 'ANNULEE' && statut !== 'NO_SHOW') {
    res.status(400).json({ error: 'Statut invalide (ARRIVEE, ANNULEE ou NO_SHOW)' });
    return;
  }
  if (veutChangerTable && typeof tableId !== 'string') {
    res.status(400).json({ error: 'La table est requise' });
    return;
  }
  if (veutChangerCouverts && (!Number.isInteger(nombreCouverts) || nombreCouverts <= 0)) {
    res.status(400).json({ error: 'Le nombre de couverts doit être un entier positif' });
    return;
  }
  if (veutChangerNom && (typeof nomClient !== 'string' || !nomClient.trim() || nomClient.length > 100)) {
    res.status(400).json({ error: 'Le nom du client est requis' });
    return;
  }
  if (veutChangerTelephone && (typeof telephone !== 'string' || telephone.length > 30)) {
    res.status(400).json({ error: 'Téléphone invalide' });
    return;
  }
  if (
    veutChangerEmail &&
    (typeof email !== 'string' ||
      (email.trim() !== '' && (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))))
  ) {
    res.status(400).json({ error: 'Adresse email invalide' });
    return;
  }
  if (veutChangerNote && (typeof note !== 'string' || note.length > 500)) {
    res.status(400).json({ error: 'Note invalide' });
    return;
  }
  let dateModifiee: Date | null = null;
  if (veutChangerDate) {
    dateModifiee = typeof date === 'string' ? new Date(date) : null;
    const maintenant = Date.now();
    if (
      !dateModifiee ||
      Number.isNaN(dateModifiee.getTime()) ||
      dateModifiee.getTime() < maintenant - 30 * 60_000 ||
      dateModifiee.getTime() > maintenant + 365 * 24 * 60 * 60_000
    ) {
      res.status(400).json({ error: 'Horaire invalide (il doit être à venir)' });
      return;
    }
  }

  const { etablissementId } = await getContexteServeur(req.user!.id);

  const reservation = await prisma.reservation.findFirst({
    where: { id: req.params.id, etablissementId },
    include: { table: { select: { id: true, numero: true } } },
  });
  if (!reservation) {
    res.status(404).json({ error: 'Réservation introuvable' });
    return;
  }
  // Le changement de statut ne concerne qu'une réservation à venir ; la table,
  // les couverts et l'horaire restent ajustables tant que le client n'a pas quitté.
  const modifiable = reservation.statut === 'A_VENIR' || reservation.statut === 'ARRIVEE';
  if (!modifiable) {
    res.status(409).json({ error: "Cette réservation n'est plus modifiable" });
    return;
  }
  if (veutChangerStatut && reservation.statut !== 'A_VENIR') {
    res.status(409).json({ error: 'Le statut ne peut être modifié que pour une réservation à venir' });
    return;
  }

  const data: Prisma.ReservationUpdateInput = {};

  // Table cible pour la vérification de conflit (nouvelle table ou table actuelle).
  let tableCible = reservation.table;
  if (veutChangerTable) {
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table || table.etablissementId !== etablissementId || table.statut !== 'ACTIF') {
      res.status(400).json({ error: 'Table invalide' });
      return;
    }
    tableCible = { id: table.id, numero: table.numero };
    data.table = { connect: { id: table.id } };
  }

  // Anti double-réservation : on revérifie dès que la table OU l'horaire change réellement.
  const tableChange = tableCible.id !== reservation.tableId;
  const horaireChange = dateModifiee !== null && dateModifiee.getTime() !== reservation.date.getTime();
  if (tableChange || horaireChange) {
    const debutCreneau = (dateModifiee ?? reservation.date).getTime();
    const conflit = await trouverConflitReservation(
      tableCible.id,
      debutCreneau,
      reservation.dureeMinutes,
      reservation.id,
    );
    if (conflit) {
      const heure = conflit.date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Algiers',
      });
      res.status(409).json({
        error: `La table ${tableCible.numero} est déjà réservée sur ce créneau (${conflit.nomClient}, ${heure})`,
      });
      return;
    }
  }

  if (veutChangerDate && dateModifiee) {
    data.date = dateModifiee;
  }

  if (veutChangerCouverts) {
    data.nombreCouverts = nombreCouverts;
  }

  if (veutChangerNom) {
    data.nomClient = nomClient.trim();
  }
  if (veutChangerTelephone) {
    data.telephone = telephone.trim() ? telephone.trim() : null;
  }
  if (veutChangerEmail) {
    data.email = email.trim() ? email.trim().toLowerCase() : null;
  }
  if (veutChangerNote) {
    data.note = note.trim() ? note.trim() : null;
  }

  if (veutChangerStatut) {
    data.statut = statut;
  }

  const majApres = await prisma.reservation.update({
    where: { id: reservation.id },
    data,
    include: INCLUDE_RESERVATION,
  });

  res.json(toPublicReservation(majApres));
});
