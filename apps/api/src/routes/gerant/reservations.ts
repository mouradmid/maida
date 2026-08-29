import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { contexteDe } from './partage';

// Vue gérant des réservations : fiabilité des clients et historique.
// (La prise de réservation elle-même vit dans l'espace caisse.)

export const reservationsRouter = Router();

reservationsRouter.get('/reservations', async (req, res) => {
  const { etablissementId } = await contexteDe(req);

  // Fenêtre d'analyse : 90 derniers jours + tout ce qui est à venir.
  const depuis = new Date(Date.now() - 90 * 24 * 60 * 60_000);
  const reservations = await prisma.reservation.findMany({
    where: { etablissementId, date: { gte: depuis } },
    include: {
      table: { select: { numero: true } },
      prisePar: { select: { nom: true, prenom: true } },
    },
    orderBy: { date: 'desc' },
    take: 300,
  });

  const stats = { total: reservations.length, arrivees: 0, noShows: 0, annulees: 0, aVenir: 0 };
  for (const r of reservations) {
    if (r.statut === 'ARRIVEE') stats.arrivees += 1;
    else if (r.statut === 'NO_SHOW') stats.noShows += 1;
    else if (r.statut === 'ANNULEE') stats.annulees += 1;
    else stats.aVenir += 1;
  }
  const decidees = stats.arrivees + stats.noShows;
  const tauxNoShow = decidees > 0 ? Math.round((stats.noShows / decidees) * 1000) / 10 : null;

  // Clients à risque : regroupés par téléphone (à défaut par nom).
  const parClient = new Map<
    string,
    {
      nomClient: string;
      telephone: string | null;
      email: string | null;
      noShows: number;
      venues: number;
    }
  >();
  for (const r of reservations) {
    if (r.statut !== 'ARRIVEE' && r.statut !== 'NO_SHOW') continue;
    const cle = r.telephone?.replace(/\s/g, '') || r.nomClient.trim().toLowerCase();
    const entree = parClient.get(cle) ?? {
      nomClient: r.nomClient,
      telephone: r.telephone,
      email: r.email,
      noShows: 0,
      venues: 0,
    };
    if (r.statut === 'NO_SHOW') entree.noShows += 1;
    else entree.venues += 1;
    if (r.email && !entree.email) entree.email = r.email;
    parClient.set(cle, entree);
  }
  const clientsARisque = [...parClient.values()]
    .filter((c) => c.noShows > 0)
    .sort((a, b) => b.noShows - a.noShows)
    .slice(0, 20);

  res.json({
    stats: { ...stats, tauxNoShow },
    clientsARisque,
    reservations: reservations.map((r) => ({
      id: r.id,
      nomClient: r.nomClient,
      telephone: r.telephone,
      email: r.email,
      nombreCouverts: r.nombreCouverts,
      date: r.date,
      note: r.note,
      statut: r.statut,
      table: r.table,
      prisePar: r.prisePar,
    })),
  });
});
