import { useState } from 'react';
import { api, ErreurReseau } from '../lib/api';
import { Modal } from './Modal';

export type ReservationConfirmee = Awaited<ReturnType<typeof api.reserverEnLigne>>;

/** Bornes du créneau, calculées par l'appelant à l'ouverture du formulaire. */
export interface CreneauxReservation {
  min: string;
  max: string;
  defaut: string;
}

const champTexte = 'rounded-lg border border-stone-300 px-3 py-2.5 text-sm';

/**
 * Réservation prise par le client depuis le menu QR.
 *
 * Les limites du restaurant (couverts, horizon) sont annoncées et appliquées
 * ici, avant l'envoi : le client n'a pas à remplir un formulaire pour se
 * l'entendre refuser. Le serveur les revérifie de son côté — c'est lui qui
 * fait foi, celles-ci ne servent qu'à éviter un aller-retour inutile.
 */
export function FormulaireReservation({
  etablissementId,
  couvertsMax,
  horizonJours,
  creneaux,
  onFerme,
  onConfirmee,
}: {
  etablissementId: string;
  couvertsMax: number;
  horizonJours: number;
  creneaux: CreneauxReservation;
  onFerme: () => void;
  onConfirmee: (reservation: ReservationConfirmee) => void;
}) {
  const [quand, setQuand] = useState(creneaux.defaut);
  const [couverts, setCouverts] = useState(2);
  const [nomClient, setNomClient] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer() {
    setErreur(null);
    setEnCours(true);
    try {
      onConfirmee(
        await api.reserverEnLigne({
          etablissementId,
          nomClient: nomClient.trim(),
          telephone: telephone.trim(),
          email: email.trim() || undefined,
          nombreCouverts: couverts,
          date: new Date(quand).toISOString(),
          note: note.trim() || undefined,
        }),
      );
    } catch (err) {
      setErreur(
        err instanceof ErreurReseau
          ? 'Pas de connexion — réessayez, ou appelez le restaurant.'
          : err instanceof Error
            ? err.message
            : 'Une erreur est survenue',
      );
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modal ancrage="bas">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          envoyer();
        }}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-card p-5"
      >
        <h3 className="text-lg font-bold text-stone-900">Réserver une table</h3>
        <p className="mt-1 text-sm text-stone-500">
          Jusqu’à {couvertsMax} personnes, dans les {horizonJours} prochains jours. Pour un plus grand
          groupe ou pour tout à l’heure, appelez le restaurant.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Quand ?</span>
            <input
              type="datetime-local"
              required
              value={quand}
              onChange={(e) => setQuand(e.target.value)}
              min={creneaux.min}
              max={creneaux.max}
              className={champTexte}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Combien de personnes ?</span>
            <input
              type="number"
              required
              min={1}
              max={couvertsMax}
              value={couverts}
              onChange={(e) => setCouverts(Number(e.target.value))}
              className={champTexte}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Votre nom</span>
            <input
              type="text"
              required
              maxLength={100}
              value={nomClient}
              onChange={(e) => setNomClient(e.target.value)}
              className={champTexte}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Votre téléphone</span>
            <input
              type="tel"
              required
              maxLength={30}
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              className={champTexte}
            />
            <span className="text-xs text-stone-500">
              Pour vous joindre si le restaurant doit vous rappeler.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">
              Votre e-mail <span className="font-normal text-stone-400">(facultatif)</span>
            </span>
            <input
              type="email"
              maxLength={100}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={champTexte}
            />
            <span className="text-xs text-stone-500">Pour recevoir la confirmation.</span>
          </label>

          <input
            type="text"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Une précision ? (anniversaire, chaise haute...)"
            className={champTexte}
          />
        </div>

        {erreur && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erreur}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={enCours}
            className="flex-1 rounded-lg bg-brand-600 py-3 font-semibold text-white disabled:opacity-40"
          >
            {enCours ? 'Envoi...' : 'Réserver'}
          </button>
          <button
            type="button"
            onClick={onFerme}
            className="rounded-lg border border-stone-300 px-4 py-3 text-stone-600"
          >
            Retour
          </button>
        </div>
      </form>
    </Modal>
  );
}
