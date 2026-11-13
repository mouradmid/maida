import { OccasionReservation, RestrictionAlimentaire } from '../generated/prisma/client';
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

// ---------------------------------------------------------------------------
// Créneaux de la réservation en ligne, à la façon de Zenchef ou TheFork : le
// client ne tape pas une heure au hasard, il choisit parmi les créneaux que le
// restaurant ouvre, et voit tout de suite ceux qui sont complets.
// ---------------------------------------------------------------------------

/** Une plage de service : le lundi (1) de 12:00 à 14:30. `fin` = dernière arrivée. */
export interface PlageHoraire {
  jour: number;
  debut: string;
  fin: string;
}

export const PAS_CRENEAU_MINUTES = 30;

// Midi et soir, tous les jours : la réservation fonctionne dès son activation,
// le gérant ajuste ensuite à ses vrais horaires.
export const HORAIRES_PAR_DEFAUT: PlageHoraire[] = [0, 1, 2, 3, 4, 5, 6].flatMap((jour) => [
  { jour, debut: '12:00', fin: '14:30' },
  { jour, debut: '19:00', fin: '22:30' },
]);

const HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesDe(heure: string): number {
  const [h, m] = heure.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Vérifie des horaires saisis par le gérant. Renvoie les plages triées, ou un
 * message d'erreur. Une liste vide est permise : le restaurant ne prend alors
 * plus aucune réservation en ligne, sans pour autant désactiver le module.
 */
export function validerHoraires(valeur: unknown): PlageHoraire[] | string {
  if (!Array.isArray(valeur) || valeur.length > 50) return 'Horaires invalides';
  const plages: PlageHoraire[] = [];
  for (const p of valeur) {
    const { jour, debut, fin } = (p ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(jour) || (jour as number) < 0 || (jour as number) > 6) {
      return 'Jour invalide';
    }
    if (typeof debut !== 'string' || typeof fin !== 'string' || !HEURE.test(debut) || !HEURE.test(fin)) {
      return 'Heure invalide (format HH:MM)';
    }
    if (minutesDe(fin) < minutesDe(debut)) {
      return `Le service de ${debut} doit finir après son début`;
    }
    plages.push({ jour: jour as number, debut, fin });
  }
  plages.sort((a, b) => a.jour - b.jour || minutesDe(a.debut) - minutesDe(b.debut));
  for (let i = 1; i < plages.length; i++) {
    const [a, b] = [plages[i - 1], plages[i]];
    if (a.jour === b.jour && minutesDe(b.debut) <= minutesDe(a.fin)) {
      return 'Deux services du même jour se chevauchent';
    }
  }
  return plages;
}

/** Les horaires enregistrés, ou ceux par défaut s'il n'y en a jamais eu. */
export function lireHoraires(enregistres: unknown): PlageHoraire[] {
  if (enregistres === null || enregistres === undefined) return HORAIRES_PAR_DEFAUT;
  const plages = validerHoraires(enregistres);
  return typeof plages === 'string' ? HORAIRES_PAR_DEFAUT : plages;
}

// L'Algérie vit à UTC+1 toute l'année, sans heure d'été : un décalage fixe
// suffit, et le calcul ne dépend pas du fuseau de la machine qui l'exécute.
const DECALAGE_ALGER_MS = 60 * 60_000;

/** « 2026-11-20 » + « 19:30 », heure d'Alger → instant. */
export function instantAlger(jour: string, heure: string): number {
  const [a, mo, j] = jour.split('-').map(Number);
  const [h, mi] = heure.split(':').map(Number);
  return Date.UTC(a, mo - 1, j, h, mi) - DECALAGE_ALGER_MS;
}

function enAlger(instant: number) {
  const d = new Date(instant + DECALAGE_ALGER_MS);
  return { jourSemaine: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** Vrai si l'heure tombe dans un service ouvert ce jour-là (heure d'Alger). */
export function dansLesHoraires(plages: PlageHoraire[], instant: number): boolean {
  const { jourSemaine, minutes } = enAlger(instant);
  return plages.some(
    (p) => p.jour === jourSemaine && minutes >= minutesDe(p.debut) && minutes <= minutesDe(p.fin),
  );
}

export const JOUR_ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Les créneaux d'un jour pour un groupe donné, chacun disponible ou complet.
 * Seuls ceux qui respectent le délai et l'horizon du gérant sont proposés.
 *
 * Tables et réservations du jour sont lues une seule fois : chaque créneau se
 * vérifie ensuite en mémoire, comme choisirTableDisponible le ferait.
 */
export async function creneauxDuJour(options: {
  etablissementId: string;
  jour: string;
  couverts: number;
  plages: PlageHoraire[];
  delaiMinMinutes: number;
  horizonJours: number;
  dureeMinutes: number;
}): Promise<Array<{ heure: string; service: string; disponible: boolean }>> {
  const jourSemaine = enAlger(instantAlger(options.jour, '12:00')).jourSemaine;
  const plagesDuJour = options.plages.filter((p) => p.jour === jourSemaine);
  if (plagesDuJour.length === 0) return [];

  const maintenant = Date.now();
  const auPlusTot = maintenant + options.delaiMinMinutes * 60_000;
  const auPlusTard = maintenant + options.horizonJours * 24 * 60 * 60_000;

  const candidats: Array<{ heure: string; service: string; instant: number }> = [];
  for (const plage of plagesDuJour) {
    // Le nom du service suit l'heure de début : c'est ainsi qu'un client parle.
    const service = minutesDe(plage.debut) < 17 * 60 ? 'Midi' : 'Soir';
    for (let m = minutesDe(plage.debut); m <= minutesDe(plage.fin); m += PAS_CRENEAU_MINUTES) {
      const heure = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const instant = instantAlger(options.jour, heure);
      if (instant >= auPlusTot && instant <= auPlusTard) candidats.push({ heure, service, instant });
    }
  }
  if (candidats.length === 0) return [];

  const tables = await prisma.table.findMany({
    where: {
      etablissementId: options.etablissementId,
      statut: 'ACTIF',
      nombreCouverts: { gte: options.couverts },
    },
    select: { id: true },
  });
  const premier = candidats[0].instant;
  const dernier = candidats[candidats.length - 1].instant + options.dureeMinutes * 60_000;
  const occupations = await prisma.reservation.findMany({
    where: {
      tableId: { in: tables.map((t) => t.id) },
      statut: { in: ['A_VENIR', 'ARRIVEE'] },
      date: { gte: new Date(premier - MARGE_MS), lte: new Date(dernier) },
    },
    select: { tableId: true, date: true, dureeMinutes: true },
  });

  return candidats.map(({ heure, service, instant }) => {
    const fin = instant + options.dureeMinutes * 60_000;
    const occupees = new Set(
      occupations
        .filter((r) => {
          const debutR = r.date.getTime();
          return debutR < fin && debutR + r.dureeMinutes * 60_000 > instant;
        })
        .map((r) => r.tableId),
    );
    return { heure, service, disponible: tables.some((t) => !occupees.has(t.id)) };
  });
}

const OCCASIONS = Object.values(OccasionReservation);
const RESTRICTIONS = Object.values(RestrictionAlimentaire);

/**
 * Occasion et restrictions alimentaires d'une réservation, vérifiées. Les
 * listes viennent du schéma : ajouter une valeur à l'énumération suffit à la
 * proposer. `undefined` = champ absent (rien à changer lors d'une modification).
 */
export function lireBesoins(
  occasion: unknown,
  restrictions: unknown,
):
  | { occasion?: OccasionReservation | null; restrictions?: RestrictionAlimentaire[] }
  | { erreur: string } {
  const resultat: { occasion?: OccasionReservation | null; restrictions?: RestrictionAlimentaire[] } =
    {};
  if (occasion !== undefined) {
    if (occasion !== null && !OCCASIONS.includes(occasion as OccasionReservation)) {
      return { erreur: 'Occasion invalide' };
    }
    resultat.occasion = occasion as OccasionReservation | null;
  }
  if (restrictions !== undefined) {
    if (
      !Array.isArray(restrictions) ||
      restrictions.some((r) => !RESTRICTIONS.includes(r as RestrictionAlimentaire))
    ) {
      return { erreur: 'Restrictions alimentaires invalides' };
    }
    resultat.restrictions = [...new Set(restrictions as RestrictionAlimentaire[])];
  }
  return resultat;
}
