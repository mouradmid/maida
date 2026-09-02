import { useEffect, useState } from 'react';
import { api, type ParametresGerant, type StatutReservation } from '../lib/api';
import { badgeNeutre, boutonSecondaire, carte, champ, messageErreur } from '../lib/ui';
import { type CelluleCsv, dateFichier, dateHeureCsv, telechargerCsv } from '../lib/export';

type Donnees = Awaited<ReturnType<typeof api.reservationsGerant>>;
type Reservation = Donnees['reservations'][number];

const LIBELLES_STATUT: Record<StatutReservation, { texte: string; classes: string }> = {
  A_VENIR: { texte: 'À venir', classes: 'bg-sky-100 text-sky-800' },
  ARRIVEE: { texte: 'Venu', classes: 'bg-green-100 text-green-800' },
  ANNULEE: { texte: 'Annulée', classes: 'bg-stone-100 text-stone-500' },
  NO_SHOW: { texte: 'No-show', classes: 'bg-red-100 text-red-800' },
};

const LIBELLE_STATUT: Record<StatutReservation, string> = {
  A_VENIR: 'À venir',
  ARRIVEE: 'Venu',
  ANNULEE: 'Annulée',
  NO_SHOW: 'No-show',
};

// Répertoire clients : on regroupe les réservations par client pour en tirer un
// fichier de contacts (données récoltées à la réservation) avec leurs statistiques.
// Clé de regroupement : téléphone, sinon e-mail, sinon nom — comme la vue « à surveiller ».
function exporterClients(reservations: Reservation[]) {
  type Client = {
    nomClient: string;
    telephone: string | null;
    email: string | null;
    total: number;
    venues: number;
    noShows: number;
    annulees: number;
    aVenir: number;
    derniereVisite: string | null;
  };
  const parClient = new Map<string, Client>();
  for (const r of reservations) {
    const cle = (r.telephone || r.email || r.nomClient).trim().toLowerCase();
    let c = parClient.get(cle);
    if (!c) {
      c = {
        nomClient: r.nomClient,
        telephone: r.telephone,
        email: r.email,
        total: 0,
        venues: 0,
        noShows: 0,
        annulees: 0,
        aVenir: 0,
        derniereVisite: null,
      };
      parClient.set(cle, c);
    }
    // On complète les coordonnées manquantes au fil des réservations.
    c.telephone = c.telephone || r.telephone;
    c.email = c.email || r.email;
    c.total += 1;
    if (r.statut === 'ARRIVEE') c.venues += 1;
    else if (r.statut === 'NO_SHOW') c.noShows += 1;
    else if (r.statut === 'ANNULEE') c.annulees += 1;
    else if (r.statut === 'A_VENIR') c.aVenir += 1;
    if (r.statut === 'ARRIVEE' && (!c.derniereVisite || r.date > c.derniereVisite)) {
      c.derniereVisite = r.date;
    }
  }

  const clients = [...parClient.values()].sort((a, b) => b.total - a.total);
  const lignes: CelluleCsv[][] = [
    ['Maïda — Répertoire clients (issu des réservations, 90 derniers jours)'],
    [],
    [
      'Client',
      'Téléphone',
      'E-mail',
      'Réservations',
      'Venues',
      'No-shows',
      'Annulations',
      'À venir',
      'Dernière visite',
    ],
  ];
  for (const c of clients) {
    lignes.push([
      c.nomClient,
      c.telephone ?? '',
      c.email ?? '',
      c.total,
      c.venues,
      c.noShows,
      c.annulees,
      c.aVenir,
      c.derniereVisite ? dateHeureCsv(c.derniereVisite) : '',
    ]);
  }
  telechargerCsv(`maida-clients-${dateFichier()}.csv`, lignes);
}

// Historique brut : une ligne par réservation, telle qu'enregistrée.
function exporterHistorique(reservations: Reservation[]) {
  const lignes: CelluleCsv[][] = [
    ['Maïda — Historique des réservations (90 derniers jours)'],
    [],
    ['Date', 'Client', 'Téléphone', 'E-mail', 'Couverts', 'Table', 'Statut', 'Pris par', 'Note'],
  ];
  for (const r of reservations) {
    lignes.push([
      dateHeureCsv(r.date),
      r.nomClient,
      r.telephone ?? '',
      r.email ?? '',
      r.nombreCouverts,
      r.table.numero,
      LIBELLE_STATUT[r.statut],
      r.prisePar ? `${r.prisePar.prenom} ${r.prisePar.nom}` : 'En ligne (client)',
      r.note ?? '',
    ]);
  }
  telechargerCsv(`maida-reservations-${dateFichier()}.csv`, lignes);
}

function Tuile({
  libelle,
  valeur,
  detail,
  accent,
}: {
  libelle: string;
  valeur: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div className={`${carte} flex flex-col gap-1`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{libelle}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-red-700' : 'text-stone-900'}`}>{valeur}</p>
      {detail && <p className="text-xs text-stone-500">{detail}</p>}
    </div>
  );
}

// Délais proposés au gérant. Des minutes en base, mais personne ne raisonne en
// minutes pour ça : on lui parle en heures.
const DELAIS = [
  { minutes: 0, libelle: 'Aucun (jusqu’à la dernière minute)' },
  { minutes: 30, libelle: '30 minutes' },
  { minutes: 60, libelle: '1 heure' },
  { minutes: 120, libelle: '2 heures' },
  { minutes: 240, libelle: '4 heures' },
  { minutes: 1440, libelle: 'La veille (24 heures)' },
];

/**
 * Réglages de la réservation en ligne : le gérant l'ouvre, et fixe jusqu'où.
 *
 * Elle passe par le menu QR — sans ce module, le client n'a aucune page où
 * réserver, et la carte n'a pas lieu d'être.
 */
function ReglagesReservationEnLigne({
  parametres,
  onChange,
}: {
  parametres: ParametresGerant;
  onChange: (p: ParametresGerant) => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer(data: Parameters<typeof api.updateParametres>[0]) {
    setEnCours(true);
    setErreur(null);
    try {
      onChange(await api.updateParametres(data));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setEnCours(false);
    }
  }

  const active = parametres.reservationEnLigneActive;

  return (
    <div className={`${carte} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-stone-900">Réservation en ligne</h3>
          <p className="mt-0.5 max-w-xl text-sm text-stone-500">
            Vos clients réservent depuis le menu QR, sans vous appeler. Maïda leur attribue une table
            libre et confirme tout de suite — la réservation apparaît à la caisse comme les autres.
          </p>
        </div>
        <button
          type="button"
          onClick={() => enregistrer({ reservationEnLigneActive: !active })}
          disabled={enCours}
          aria-pressed={active}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            active
              ? 'bg-brand-600 text-white'
              : 'border border-stone-300 bg-card text-stone-500 hover:bg-stone-50'
          }`}
        >
          {active ? '✓ Activée' : 'Désactivée'}
        </button>
      </div>

      {active && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Jusqu’à combien de personnes</span>
            <input
              type="number"
              min={1}
              max={50}
              disabled={enCours}
              defaultValue={parametres.reservationCouvertsMax}
              onBlur={(e) => {
                const valeur = Number(e.target.value);
                if (valeur !== parametres.reservationCouvertsMax) {
                  enregistrer({ reservationCouvertsMax: valeur });
                }
              }}
              className={champ}
            />
            <span className="text-xs text-stone-500">Au-delà, le client est invité à vous appeler.</span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Prévenu au moins</span>
            <select
              disabled={enCours}
              value={parametres.reservationDelaiMinMinutes}
              onChange={(e) => enregistrer({ reservationDelaiMinMinutes: Number(e.target.value) })}
              className={champ}
            >
              {DELAIS.map((d) => (
                <option key={d.minutes} value={d.minutes}>
                  {d.libelle}
                </option>
              ))}
            </select>
            <span className="text-xs text-stone-500">
              Le temps que la cuisine et la salle voient venir.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Jusqu’à combien de jours à l’avance</span>
            <input
              type="number"
              min={1}
              max={365}
              disabled={enCours}
              defaultValue={parametres.reservationHorizonJours}
              onBlur={(e) => {
                const valeur = Number(e.target.value);
                if (valeur !== parametres.reservationHorizonJours) {
                  enregistrer({ reservationHorizonJours: valeur });
                }
              }}
              className={champ}
            />
            <span className="text-xs text-stone-500">Au-delà, la réservation passe par vous.</span>
          </label>
        </div>
      )}

      {erreur && <p className={messageErreur}>{erreur}</p>}
    </div>
  );
}

export function ReservationsGerant() {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [parametres, setParametres] = useState<ParametresGerant | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api
      .reservationsGerant()
      .then(setDonnees)
      .catch((err) => setErreur(err instanceof Error ? err.message : 'Erreur de chargement'));
    api
      .getParametres()
      .then(setParametres)
      .catch(() => setParametres(null));
  }, []);

  if (erreur) return <p className={messageErreur}>{erreur}</p>;
  if (!donnees) return <p className="text-center text-stone-500">Chargement des réservations...</p>;

  const { stats, clientsARisque, reservations } = donnees;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-stone-500">
          Les réservations se prennent à la caisse (onglet Réservations), ou en ligne par le client
          lui-même. Ici : la vue d'ensemble des 90 derniers jours.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => exporterClients(reservations)}
            disabled={reservations.length === 0}
            title="Télécharger le répertoire clients (contacts + statistiques) au format CSV (Excel)"
            className={`${boutonSecondaire} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            ⬇ Clients (CSV)
          </button>
          <button
            type="button"
            onClick={() => exporterHistorique(reservations)}
            disabled={reservations.length === 0}
            title="Télécharger l'historique détaillé des réservations au format CSV (Excel)"
            className={`${boutonSecondaire} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            ⬇ Historique (CSV)
          </button>
        </div>
      </div>

      {parametres?.moduleQrMenu && (
        <ReglagesReservationEnLigne parametres={parametres} onChange={setParametres} />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tuile
          libelle="Réservations"
          valeur={String(stats.total)}
          detail={`dont ${stats.aVenir} à venir`}
        />
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
                    {!r.prisePar && <span className={badgeNeutre}>En ligne</span>}
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
