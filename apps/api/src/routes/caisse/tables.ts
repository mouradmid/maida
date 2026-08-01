import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { getContexteServeur } from './partage';
import { SELECT_TOTAUX, calculerTotaux } from './vues';

export const tablesRouter = Router();

// Plan de salle de la caisse : chaque table porte l'état de son addition en
// cours (montant, reste à payer, service réclamé) pour que le serveur lise la
// salle d'un coup d'œil sans ouvrir les tables une par une.
tablesRouter.get('/tables', async (req, res) => {
  const { etablissementId } = await getContexteServeur(req.user!.id);

  const maintenant = Date.now();
  const [tables, reservationsProches] = await Promise.all([
    prisma.table.findMany({
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
        additions: {
          where: { statut: 'OUVERTE' },
          select: {
            ...SELECT_TOTAUX,
            id: true,
            ouverteLe: true,
            // Suites : de quoi savoir si la table attend encore un service.
            commandes: {
              select: {
                statut: true,
                suiteReclamee: true,
                lignes: {
                  select: {
                    suite: true,
                    prixUnitaire: true,
                    quantite: true,
                    quantiteAnnulee: true,
                    quantiteOfferte: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    // Réservations imminentes : signalées sur le plan pour ne pas installer
    // des clients de passage sur une table promise.
    prisma.reservation.findMany({
      where: {
        etablissementId,
        statut: 'A_VENIR',
        date: {
          gte: new Date(maintenant - 30 * 60_000),
          lte: new Date(maintenant + 2 * 60 * 60_000),
        },
      },
      orderBy: { date: 'asc' },
      select: { tableId: true, date: true, nomClient: true },
    }),
  ]);

  const reservationParTable = new Map<string, { date: Date; nomClient: string }>();
  for (const r of reservationsProches) {
    if (!reservationParTable.has(r.tableId)) {
      reservationParTable.set(r.tableId, { date: r.date, nomClient: r.nomClient });
    }
  }

  // Tri numérique naturel : « Table 2 » avant « Table 10 » (numero est une chaîne).
  tables.sort((a, b) => a.numero.localeCompare(b.numero, 'fr', { numeric: true }));

  res.json(
    tables.map(({ additions, ...table }) => {
      // Une table n'a qu'une addition ouverte à la fois.
      const addition = additions[0];
      const totaux = addition ? calculerTotaux(addition) : null;
      return {
        ...table,
        occupee: addition !== undefined,
        addition:
          addition && totaux
            ? {
                id: addition.id,
                ouverteLe: addition.ouverteLe,
                total: totaux.total,
                solde: totaux.solde,
                // Un service reste à lancer quand une commande envoyée porte
                // des articles au-delà de la suite déjà réclamée.
                aReclamer: addition.commandes.some(
                  (c) => c.statut === 'ENVOYEE' && c.lignes.some((l) => l.suite > c.suiteReclamee),
                ),
              }
            : null,
        reservationProche: reservationParTable.get(table.id) ?? null,
      };
    }),
  );
});
