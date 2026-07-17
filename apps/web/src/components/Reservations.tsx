import { useEffect, useState } from 'react';
import { api, type Reservation, type StatutReservation, type TableCaisse } from '../lib/api';
import { badgeNeutre, boutonPrimaire, carte, champ, messageErreur, messageSucces } from '../lib/ui';

const LIBELLES_STATUT: Record<StatutReservation, { texte: string; classes: string }> = {
  A_VENIR: { texte: 'À venir', classes: 'bg-sky-100 text-sky-800' },
  ARRIVEE: { texte: 'Client arrivé', classes: 'bg-green-100 text-green-800' },
  ANNULEE: { texte: 'Annulée', classes: 'bg-stone-100 text-stone-500' },
  NO_SHOW: { texte: 'No-show', classes: 'bg-red-100 text-red-800' },
};

function jourISO(date: Date) {
  const decale = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return decale.toISOString().slice(0, 10);
}

export function Reservations() {
  const [jour, setJour] = useState(jourISO(new Date()));
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<TableCaisse[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Formulaire
  const [nomClient, setNomClient] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [heure, setHeure] = useState('20:00');
  const [couverts, setCouverts] = useState('2');
  const [tableId, setTableId] = useState('');
  const [note, setNote] = useState('');

  async function charger() {
    setChargement(true);
    try {
      const debut = new Date(`${jour}T00:00:00`);
      const fin = new Date(`${jour}T23:59:59.999`);
      const [liste, tablesActives] = await Promise.all([
        api.listReservations(debut, fin),
        api.caisseTables(),
      ]);
      setReservations(liste);
      setTables(tablesActives);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, [jour]);

  async function handleCreer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setMessage(null);
    if (!tableId) {
      setErreur('Choisissez une table');
      return;
    }
    try {
      const reservation = await api.creerReservation({
        nomClient,
        telephone: telephone.trim() || undefined,
        email: email.trim() || undefined,
        nombreCouverts: Number(couverts),
        date: new Date(`${jour}T${heure}:00`).toISOString(),
        note: note.trim() || undefined,
        tableId,
      });
      setMessage(`Table ${reservation.table.numero} réservée pour ${reservation.nomClient} à ${heure}.`);
      setNomClient('');
      setTelephone('');
      setEmail('');
      setNote('');
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleStatut(reservation: Reservation, statut: 'ARRIVEE' | 'ANNULEE' | 'NO_SHOW') {
    setErreur(null);
    setMessage(null);
    try {
      await api.updateReservation(reservation.id, statut);
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  if (chargement && reservations.length === 0) {
    return <p className="text-center text-stone-500">Chargement des réservations...</p>;
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {erreur && <p className={messageErreur}>{erreur}</p>}
      {message && <p className={messageSucces}>{message}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <div className={`${carte} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-stone-900">
              Réservations du{' '}
              {new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </h3>
            <input
              type="date"
              value={jour}
              onChange={(e) => setJour(e.target.value)}
              className={`${champ} w-auto`}
            />
          </div>

          {reservations.length === 0 && (
            <p className="py-6 text-center text-sm text-stone-400">
              Aucune réservation ce jour-là pour l'instant.
            </p>
          )}

          <ul className="flex flex-col divide-y divide-stone-100">
            {reservations.map((r) => {
              const statut = LIBELLES_STATUT[r.statut];
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-stone-900">
                        {new Date(r.date).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="font-medium text-stone-900">{r.nomClient}</span>
                      <span className={badgeNeutre}>Table {r.table.numero}</span>
                      <span className={badgeNeutre}>{r.nombreCouverts} couv.</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statut.classes}`}
                      >
                        {statut.texte}
                      </span>
                    </span>
                    <span className="text-xs text-stone-500">
                      {r.telephone && <>📞 {r.telephone} · </>}
                      {r.email && <>✉ {r.email} · </>}
                      prise par {r.prisePar.prenom}
                      {r.note && <> · « {r.note} »</>}
                    </span>
                  </div>
                  {r.statut === 'A_VENIR' && (
                    <span className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStatut(r, 'ARRIVEE')}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700"
                      >
                        Client arrivé ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatut(r, 'NO_SHOW')}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                      >
                        No-show
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatut(r, 'ANNULEE')}
                        className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50"
                      >
                        Annuler
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <form onSubmit={handleCreer} className={`${carte} flex flex-col gap-3`}>
          <h3 className="font-semibold text-stone-900">Nouvelle réservation</h3>
          <input
            type="text"
            placeholder="Nom du client"
            value={nomClient}
            onChange={(e) => setNomClient(e.target.value)}
            required
            className={champ}
          />
          <input
            type="tel"
            placeholder="Téléphone (optionnel)"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            className={champ}
          />
          <input
            type="email"
            placeholder="Email (optionnel)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={champ}
          />
          <div className="flex gap-2">
            <input
              type="time"
              value={heure}
              onChange={(e) => setHeure(e.target.value)}
              required
              className={champ}
            />
            <input
              type="number"
              min="1"
              step="1"
              value={couverts}
              onChange={(e) => setCouverts(e.target.value)}
              required
              title="Nombre de couverts"
              className={`${champ} w-20`}
            />
          </div>
          <select
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            required
            className={champ}
          >
            <option value="">Choisir une table</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                Table {t.numero} — {t.nombreCouverts} couverts
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Note (anniversaire, terrasse...)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={champ}
          />
          <button type="submit" className={boutonPrimaire}>
            Réserver
          </button>
          <p className="text-xs text-stone-400">
            La réservation sera faite pour le jour affiché à gauche. Les tables réservées apparaissent
            avec un badge 🕐 sur le plan de salle dans les 2 heures qui précèdent.
          </p>
        </form>
      </div>
    </div>
  );
}
