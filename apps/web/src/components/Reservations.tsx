import { useCallback, useEffect, useState } from 'react';
import { api, ErreurReseau, type Reservation, type TableCaisse } from '../lib/api';
import {
  lireCache,
  lireReservationsEnAttente,
  mettreReservationEnAttente,
  nouvelleCle,
  sauvegarderCache,
  type ReservationEnAttente,
} from '../lib/horsLigne';
import { useHorsLigne } from '../hooks/useHorsLigne';
import { badgeNeutre, boutonPrimaire, carte, champ, messageErreur, messageSucces } from '../lib/ui';
import { LIBELLES_STATUT_RESERVATION } from '../lib/libelles';

function jourISO(date: Date) {
  const decale = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return decale.toISOString().slice(0, 10);
}

function heureLocale(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function Reservations() {
  const { horsLigne, enAttente } = useHorsLigne();
  const [jour, setJour] = useState(jourISO(new Date()));
  const [reservations, setReservations] = useState<Reservation[]>([]);
  // Réservations prises hors ligne, pas encore parties au serveur.
  const [enFile, setEnFile] = useState<ReservationEnAttente[]>([]);
  const [tables, setTables] = useState<TableCaisse[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editionTableId, setEditionTableId] = useState<string | null>(null);
  const [editionCouvertsId, setEditionCouvertsId] = useState<string | null>(null);
  const [editionHeureId, setEditionHeureId] = useState<string | null>(null);
  const [editionInfosId, setEditionInfosId] = useState<string | null>(null);
  const [infoNom, setInfoNom] = useState('');
  const [infoTel, setInfoTel] = useState('');
  const [infoEmail, setInfoEmail] = useState('');
  const [infoNote, setInfoNote] = useState('');

  // Formulaire
  const [nomClient, setNomClient] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [heure, setHeure] = useState('20:00');
  const [couverts, setCouverts] = useState('2');
  const [tableId, setTableId] = useState('');
  const [note, setNote] = useState('');

  // Mémorisée sur le jour affiché : l'effet ci-dessous la déclare en dépendance
  // au lieu de la laisser hors du tableau (elle est aussi rappelée à la main
  // après chaque action qui modifie la liste).
  const charger = useCallback(async () => {
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
      // Mis de côté pour pouvoir réserver pendant une coupure : sans le plan de
      // salle, impossible de choisir une table.
      sauvegarderCache('tables', tablesActives);
      sauvegarderCache(`reservations.${jour}`, liste);
      setErreur(null);
    } catch (err) {
      if (err instanceof ErreurReseau) {
        // Coupure : on travaille sur le dernier état connu du jour affiché.
        setTables(lireCache<TableCaisse[]>('tables') ?? []);
        setReservations(lireCache<Reservation[]>(`reservations.${jour}`) ?? []);
        setErreur(null);
      } else {
        setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
      }
    } finally {
      setChargement(false);
    }
  }, [jour]);

  useEffect(() => {
    charger();
    // Se relance au retour du réseau, et quand la file locale se vide : la
    // réservation prise hors ligne apparaît alors dans la vraie liste, à la
    // place de sa ligne « à synchroniser ».
  }, [charger, horsLigne, enAttente]);

  // La file locale bouge à la prise d'une réservation et à sa synchronisation.
  useEffect(() => {
    setEnFile(lireReservationsEnAttente().filter((r) => jourISO(new Date(r.donnees.date)) === jour));
  }, [jour, enAttente]);

  async function handleCreer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setMessage(null);
    if (!tableId) {
      setErreur('Choisissez une table');
      return;
    }
    const donnees = {
      nomClient,
      telephone: telephone.trim() || undefined,
      email: email.trim() || undefined,
      nombreCouverts: Number(couverts),
      date: new Date(`${jour}T${heure}:00`).toISOString(),
      note: note.trim() || undefined,
      tableId,
    };
    // Clé générée avant l'envoi et réutilisée en cas de repli : une requête
    // partie mais sans réponse ne créera pas une seconde réservation.
    const cleIdempotence = nouvelleCle('hlr');
    const numeroTable = tables.find((t) => t.id === tableId)?.numero ?? '?';

    const viderFormulaire = () => {
      setNomClient('');
      setTelephone('');
      setEmail('');
      setNote('');
    };

    const enregistrerEnFile = () => {
      mettreReservationEnAttente(
        { description: `Table ${numeroTable} — ${nomClient} à ${heure}`, donnees },
        cleIdempotence,
      );
      setMessage(
        `Hors ligne — table ${numeroTable} réservée pour ${nomClient} à ${heure}, elle partira au retour du réseau.`,
      );
      viderFormulaire();
    };

    // Créneau déjà pris à notre connaissance : le serveur refuserait, autant le
    // dire tout de suite plutôt qu'à la resynchronisation.
    if (horsLigne && conflitLocal(tableId, donnees.date)) {
      setErreur(`La table ${numeroTable} est déjà réservée sur ce créneau.`);
      return;
    }
    if (horsLigne) {
      enregistrerEnFile();
      return;
    }

    try {
      const reservation = await api.creerReservation({ ...donnees, cleIdempotence });
      setMessage(`Table ${reservation.table.numero} réservée pour ${reservation.nomClient} à ${heure}.`);
      viderFormulaire();
      await charger();
    } catch (err) {
      // Coupure pendant l'envoi : la réservation part dans la file, avec la
      // même clé — si la requête avait abouti, elle ne sera pas dupliquée.
      if (err instanceof ErreurReseau) {
        enregistrerEnFile();
        return;
      }
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  // Chevauchement avec ce que la tablette connaît : réservations du jour déjà
  // chargées et celles prises hors ligne. Une réservation posée entre-temps sur
  // une autre tablette reste invisible — le serveur tranchera à la synchro.
  function conflitLocal(tableCible: string, dateISO: string): boolean {
    const debut = new Date(dateISO).getTime();
    const fin = debut + 120 * 60_000;
    const creneaux = [
      ...reservations
        .filter((r) => r.table.id === tableCible && r.statut !== 'ANNULEE')
        .map((r) => ({ debut: new Date(r.date).getTime(), duree: r.dureeMinutes })),
      ...lireReservationsEnAttente()
        .filter((r) => r.donnees.tableId === tableCible)
        .map((r) => ({ debut: new Date(r.donnees.date).getTime(), duree: 120 })),
    ];
    return creneaux.some((c) => debut < c.debut + c.duree * 60_000 && c.debut < fin);
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

  async function handleChangerTable(reservation: Reservation, nouvelleTableId: string) {
    setEditionTableId(null);
    if (nouvelleTableId === reservation.table.id) return;
    setErreur(null);
    setMessage(null);
    try {
      const maj = await api.modifierReservation(reservation.id, { tableId: nouvelleTableId });
      setMessage(`${maj.nomClient} déplacé·e sur la table ${maj.table.numero}.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  function ouvrirEditionInfos(reservation: Reservation) {
    setEditionInfosId(reservation.id);
    setInfoNom(reservation.nomClient);
    setInfoTel(reservation.telephone ?? '');
    setInfoEmail(reservation.email ?? '');
    setInfoNote(reservation.note ?? '');
  }

  async function handleEnregistrerInfos(reservation: Reservation) {
    if (!infoNom.trim()) {
      setErreur('Le nom du client est requis');
      return;
    }
    setErreur(null);
    setMessage(null);
    try {
      const maj = await api.modifierReservation(reservation.id, {
        nomClient: infoNom.trim(),
        telephone: infoTel.trim(),
        email: infoEmail.trim(),
        note: infoNote.trim(),
      });
      setEditionInfosId(null);
      setMessage(`Coordonnées de ${maj.nomClient} mises à jour.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleChangerHeure(reservation: Reservation, heureStr: string) {
    setEditionHeureId(null);
    if (!heureStr) return;
    const [h, m] = heureStr.split(':').map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m)) return;
    const nouvelleDate = new Date(reservation.date);
    nouvelleDate.setHours(h, m, 0, 0);
    if (nouvelleDate.getTime() === new Date(reservation.date).getTime()) return;
    setErreur(null);
    setMessage(null);
    try {
      const maj = await api.modifierReservation(reservation.id, { date: nouvelleDate.toISOString() });
      setMessage(`Réservation de ${maj.nomClient} déplacée à ${heureLocale(maj.date)}.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleChangerCouverts(reservation: Reservation, valeur: string) {
    setEditionCouvertsId(null);
    const couverts = Number(valeur);
    if (!Number.isInteger(couverts) || couverts <= 0 || couverts === reservation.nombreCouverts) {
      return;
    }
    setErreur(null);
    setMessage(null);
    try {
      const maj = await api.modifierReservation(reservation.id, { nombreCouverts: couverts });
      setMessage(`Réservation de ${maj.nomClient} : ${maj.nombreCouverts} couverts.`);
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

          {reservations.length === 0 && enFile.length === 0 && (
            <p className="py-6 text-center text-sm text-stone-400">
              Aucune réservation ce jour-là pour l'instant.
            </p>
          )}

          {/* Prises hors ligne : visibles tout de suite pour ne pas réserver
              deux fois la même table, en attendant leur départ au serveur. */}
          {enFile.length > 0 && (
            <ul className="flex flex-col divide-y divide-amber-100 border-b border-stone-100">
              {enFile.map((r) => (
                <li
                  key={r.cleIdempotence}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-stone-900">{heureLocale(r.donnees.date)}</span>
                      <span className="font-medium text-stone-900">{r.donnees.nomClient}</span>
                      <span className={badgeNeutre}>
                        Table {tables.find((t) => t.id === r.donnees.tableId)?.numero ?? '?'}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-medium text-warn">
                        à synchroniser
                      </span>
                    </span>
                    <span className="text-xs text-stone-500">
                      {r.donnees.nombreCouverts} couvert{r.donnees.nombreCouverts > 1 ? 's' : ''}
                      {r.donnees.telephone ? ` · ${r.donnees.telephone}` : ''}
                      {r.donnees.note ? ` · « ${r.donnees.note} »` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <ul className="flex flex-col divide-y divide-stone-100">
            {reservations.map((r) => {
              const statut = LIBELLES_STATUT_RESERVATION[r.statut];
              const modifiable = r.statut === 'A_VENIR' || r.statut === 'ARRIVEE';
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {modifiable ? (
                        editionHeureId === r.id ? (
                          <input
                            type="time"
                            autoFocus
                            defaultValue={heureLocale(r.date)}
                            onBlur={(e) => handleChangerHeure(r, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                              if (e.key === 'Escape') setEditionHeureId(null);
                            }}
                            title="Modifier l'heure"
                            className={`${champ} w-auto py-0.5 text-base font-bold`}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditionHeureId(r.id)}
                            title="Modifier l'heure"
                            className="text-lg font-bold text-stone-900 transition-colors hover:text-brand-700"
                          >
                            {new Date(r.date).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </button>
                        )
                      ) : (
                        <span className="text-lg font-bold text-stone-900">
                          {new Date(r.date).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                      <span className="font-medium text-stone-900">{r.nomClient}</span>
                      <span className={badgeNeutre}>Table {r.table.numero}</span>
                      {modifiable ? (
                        editionCouvertsId === r.id ? (
                          <input
                            type="number"
                            min="1"
                            step="1"
                            autoFocus
                            defaultValue={r.nombreCouverts}
                            onBlur={(e) => handleChangerCouverts(r, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                              if (e.key === 'Escape') setEditionCouvertsId(null);
                            }}
                            title="Modifier le nombre de couverts"
                            className={`${champ} w-16 py-0.5 text-xs`}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditionCouvertsId(r.id)}
                            title="Modifier le nombre de couverts"
                            className={`${badgeNeutre} cursor-pointer hover:bg-brand-100`}
                          >
                            {r.nombreCouverts} couv. ✎
                          </button>
                        )
                      ) : (
                        <span className={badgeNeutre}>{r.nombreCouverts} couv.</span>
                      )}
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statut.classes}`}
                      >
                        {statut.texte}
                      </span>
                    </span>
                    <span className="text-xs text-stone-500">
                      {r.telephone && <>📞 {r.telephone} · </>}
                      {r.email && <>✉ {r.email} · </>}
                      {r.prisePar ? `prise par ${r.prisePar.prenom}` : 'réservée en ligne'}
                      {r.note && <> · « {r.note} »</>}
                    </span>
                  </div>
                  {modifiable && (
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      {editionTableId === r.id ? (
                        <select
                          autoFocus
                          defaultValue={r.table.id}
                          onChange={(e) => handleChangerTable(r, e.target.value)}
                          onBlur={() => setEditionTableId(null)}
                          title="Réaffecter la table"
                          className={`${champ} w-auto py-1.5 text-xs`}
                        >
                          {tables.map((t) => (
                            <option key={t.id} value={t.id}>
                              Table {t.numero} — {t.nombreCouverts} couv.
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditionTableId(r.id)}
                          className="rounded-lg border border-stone-300 bg-card px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50"
                        >
                          Changer de table
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          editionInfosId === r.id ? setEditionInfosId(null) : ouvrirEditionInfos(r)
                        }
                        className="rounded-lg border border-stone-300 bg-card px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50"
                      >
                        Modifier les infos
                      </button>
                      {r.statut === 'A_VENIR' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStatut(r, 'ARRIVEE')}
                            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-ok-hover"
                          >
                            Client arrivé ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatut(r, 'NO_SHOW')}
                            className="rounded-lg border border-red-200 bg-card px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                          >
                            No-show
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatut(r, 'ANNULEE')}
                            className="rounded-lg border border-stone-300 bg-card px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50"
                          >
                            Annuler
                          </button>
                        </>
                      )}
                    </span>
                  )}
                  {editionInfosId === r.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleEnregistrerInfos(r);
                      }}
                      className="flex w-full flex-col gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3"
                    >
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          placeholder="Nom du client"
                          value={infoNom}
                          onChange={(e) => setInfoNom(e.target.value)}
                          required
                          className={`${champ} min-w-40 flex-1`}
                        />
                        <input
                          type="tel"
                          placeholder="Téléphone"
                          value={infoTel}
                          onChange={(e) => setInfoTel(e.target.value)}
                          className={`${champ} min-w-40 flex-1`}
                        />
                        <input
                          type="email"
                          placeholder="Email"
                          value={infoEmail}
                          onChange={(e) => setInfoEmail(e.target.value)}
                          className={`${champ} min-w-40 flex-1`}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Note (anniversaire, terrasse...)"
                        value={infoNote}
                        onChange={(e) => setInfoNote(e.target.value)}
                        className={champ}
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-hover"
                        >
                          Enregistrer
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditionInfosId(null)}
                          className="rounded-lg border border-stone-300 bg-card px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50"
                        >
                          Annuler
                        </button>
                      </div>
                    </form>
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
