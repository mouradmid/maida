import { prisma } from './prisma';

// Règles de créneau partagées par la prise de réservation à la caisse et la
// réservation en ligne du client : deux entrées, une seule vérité sur ce
// qu'« occuper une table » veut dire.

// Une réservation peut commencer bien avant le créneau et déborder dessus. La
// durée maximale acceptée étant de 10 heures, ratisser 12 heures de part et
// d'autre garantit de ne manquer aucune voisine sans balayer toute la table.
const MARGE_MS = 12 * 60 * 60_000;

/** Les réservations vivantes qui chevauchent le créneau, sur les tables données. */
async function reservationsChevauchantes(
  tableIds: string[],
  debutCreneau: number,
  dureeMinutes: number,
  reservationExclueId?: string,
) {
  const finCreneau = debutCreneau + dureeMinutes * 60_000;
  const voisines = await prisma.reservation.findMany({
    where: {
      tableId: { in: tableIds },
      statut: { in: ['A_VENIR', 'ARRIVEE'] },
      date: { gte: new Date(debutCreneau - MARGE_MS), lte: new Date(finCreneau + MARGE_MS) },
      ...(reservationExclueId ? { id: { not: reservationExclueId } } : {}),
    },
  });
  return voisines.filter((r) => {
    const debutR = r.date.getTime();
    return debutR < finCreneau && debutR + r.dureeMinutes * 60_000 > debutCreneau;
  });
}

/** La réservation en conflit sur une table donnée, s'il y en a une. */
export async function trouverConflitReservation(
  tableId: string,
  debutCreneau: number,
  dureeMinutes: number,
  reservationExclueId?: string,
) {
  const [conflit] = await reservationsChevauchantes(
    [tableId],
    debutCreneau,
    dureeMinutes,
    reservationExclueId,
  );
  return conflit;
}

/**
 * La table à donner à une réservation en ligne, ou `null` si le service est
 * complet sur ce créneau.
 *
 * Au plus juste : la plus petite table qui tient le groupe. Placer deux
 * personnes sur une table de huit, c'est refuser le groupe de huit qui
 * appellera dans l'heure.
 */
export async function choisirTableDisponible(
  etablissementId: string,
  nombreCouverts: number,
  debutCreneau: number,
  dureeMinutes: number,
) {
  const tables = await prisma.table.findMany({
    where: { etablissementId, statut: 'ACTIF', nombreCouverts: { gte: nombreCouverts } },
    orderBy: [{ nombreCouverts: 'asc' }, { numero: 'asc' }],
  });
  if (tables.length === 0) return null;

  const occupees = new Set(
    (
      await reservationsChevauchantes(
        tables.map((t) => t.id),
        debutCreneau,
        dureeMinutes,
      )
    ).map((r) => r.tableId),
  );
  return tables.find((t) => !occupees.has(t.id)) ?? null;
}
