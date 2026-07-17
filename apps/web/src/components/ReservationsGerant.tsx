import { useEffect, useState } from 'react';
import { api, type StatutReservation } from '../lib/api';
import { badgeNeutre, carte, messageErreur } from '../lib/ui';

type Donnees = Awaited<ReturnType<typeof api.reservationsGerant>>;

const LIBELLES_STATUT: Record<StatutReservation, { texte: string; classes: string }> = {
  A_VENIR: { texte: 'À venir', classes: 'bg-sky-100 text-sky-800' },
  ARRIVEE: { texte: 'Venu', classes: 'bg-green-100 text-green-800' },
  ANNULEE: { texte: 'Annulée', classes: 'bg-stone-100 text-stone-500' },
  NO_SHOW: { texte: 'No-show', classes: 'bg-red-100 text-red-800' },
};

function Tuile({ libelle, valeur, detail, accent }: { libelle: string; valeur: string; detail?: string; accent?: boolean }) {
  return (
    <div className={`${carte} flex flex-col gap-1`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{libelle}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-red-700' : 'text-stone-900'}`}>{valeur}</p>
      {detail && <p className="text-xs text-stone-500">{detail}</p>}
    </div>
  );
}

export function ReservationsGerant() {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api
      .reservationsGerant()
      .then(setDonnees)
      .catch((err) => setErreur(err instanceof Error ? err.message : 'Erreur de chargement'));
  }, []);

  if (erreur) return <p className={messageErreur}>{erreur}</p>;
  if (!donnees) return <p className="text-center text-stone-500">Chargement des réservations...</p>;

  const { stats, clientsARisque, reservations } = donnees;

  return (
    <div className="flex w-full flex-col gap-4">
      <p className="text-sm text-stone-500">
        Les réservations se prennent à la caisse (onglet Réservations). Ici : la vue d'ensemble des 90
        derniers jours.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tuile libelle="Réservations" valeur={String(stats.total)} detail={`dont ${stats.aVenir} à venir`} />
        <Tuile libelle="Clients venus" valeur={String(stats.arrivees)} />
        <Tuile
          libelle="No-shows"
          valeur={String(stats.noShows)}
          detail={`${stats.annulees} annulation${stats.annulees > 1 ? 's' : ''} en plus`}
          accent={stats.noShows > 0}
        />
        <Tuile
          libelle="Taux de no-show"
          valeur={stats.tauxNoShow !== null ? `${stats.tauxNoShow} %` : '—'}
          detail="sur les réservations passées"
          accent={stats.tauxNoShow !== null && stats.tauxNoShow > 15}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className={carte}>
          <h3 className="mb-2 font-semibold text-stone-900">Clients à surveiller</h3>
          {clientsARisque.length === 0 ? (
            <p className="py-4 text-sm text-stone-400">
              Aucun no-show sur les 90 derniers jours — de la clientèle fiable !
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-stone-100 text-sm">
              {clientsARisque.map((c, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-stone-900">{c.nomClient}</span>
                    <span className="text-xs text-stone-500">
                      {c.telephone && <>📞 {c.telephone} </>}
                      {c.email && <>· ✉ {c.email}</>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                      {c.noShows} no-show{c.noShows > 1 ? 's' : ''}
                    </span>
                    <span className={badgeNeutre}>
                      {c.venues} venue{c.venues > 1 ? 's' : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={carte}>
          <h3 className="mb-2 font-semibold text-stone-900">Historique récent</h3>
          <ul className="flex flex-col divide-y divide-stone-100 text-sm">
            {reservations.slice(0, 25).map((r) => {
              const statut = LIBELLES_STATUT[r.statut];
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-xs text-stone-500">
                      {new Date(r.date).toLocaleString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="font-medium text-stone-900">{r.nomClient}</span>
                    <span className={badgeNeutre}>Table {r.table.numero}</span>
                    <span className={badgeNeutre}>{r.nombreCouverts} couv.</span>
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statut.classes}`}
                  >
                    {statut.texte}
                  </span>
                </li>
              );
            })}
            {reservations.length === 0 && (
              <li className="py-4 text-stone-400">Aucune réservation pour l'instant.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
