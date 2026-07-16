import { useEffect, useState } from 'react';
import { api, type EtatJournee, type ModePaiement, type TotauxJournee } from '../lib/api';
import {
  boutonDiscret,
  boutonPrimaire,
  boutonSecondaire,
  carte,
  champ,
  messageErreur,
  messageSucces,
} from '../lib/ui';

const LIBELLES_MOYEN: Record<ModePaiement, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  CHEQUE: 'Chèque',
  AUTRE: 'Autre',
};

function heure(date: string) {
  return new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function jour(date: string) {
  return new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function CouleurEcart({ ecart }: { ecart: number }) {
  if (ecart === 0) return <span className="font-semibold text-green-700">0 DA — caisse juste</span>;
  return (
    <span className={`font-semibold ${ecart < 0 ? 'text-red-700' : 'text-amber-700'}`}>
      {ecart > 0 ? '+' : ''}
      {ecart} DA {ecart < 0 ? '(manquant)' : '(excédent)'}
    </span>
  );
}

function ResumeTotaux({ totaux, fondDeCaisse }: { totaux: TotauxJournee; fondDeCaisse: number }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        {totaux.parMoyen.map((m) => (
          <div key={m.moyenPaiement} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2">
            <span className="text-stone-600">
              {LIBELLES_MOYEN[m.moyenPaiement]}{' '}
              <span className="text-xs text-stone-400">
                ({m.nombre} paiement{m.nombre > 1 ? 's' : ''})
              </span>
            </span>
            <span className="font-semibold text-stone-900">{m.montant} DA</span>
          </div>
        ))}
        {totaux.parMoyen.length === 0 && (
          <p className="text-stone-400 sm:col-span-2">Aucun paiement encaissé pour l'instant.</p>
        )}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
        <span className="font-medium text-brand-900">Total encaissé</span>
        <span className="text-lg font-bold text-brand-800">{totaux.total} DA</span>
      </div>
      <p className="text-xs text-stone-500">Fond de caisse à l'ouverture : {fondDeCaisse} DA</p>
    </div>
  );
}

function ModalCloture({
  etat,
  droitCloturer,
  onFermer,
  onCloturee,
}: {
  etat: EtatJournee;
  droitCloturer: boolean;
  onFermer: () => void;
  onCloturee: () => void;
}) {
  const [especesComptees, setEspecesComptees] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [codeGerant, setCodeGerant] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const attendues = etat.especesAttendues ?? 0;
  const comptees = especesComptees === '' ? null : Number(especesComptees);
  const ecartEstime =
    comptees !== null && Number.isFinite(comptees) ? Math.round((comptees - attendues) * 100) / 100 : null;

  async function handleCloturer() {
    setErreur(null);
    if (comptees === null || !Number.isFinite(comptees) || comptees < 0) {
      setErreur('Comptez les espèces du tiroir et saisissez le montant');
      return;
    }
    if (!droitCloturer && !codeGerant) {
      setErreur('Le code gérant est requis pour valider la clôture');
      return;
    }
    setEnCours(true);
    try {
      await api.cloturerJournee({
        especesComptees: comptees,
        commentaire: commentaire.trim() || undefined,
        codeGerant: codeGerant || undefined,
      });
      onCloturee();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
      setCodeGerant('');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-stone-900/40 p-4">
      <div className={`${carte} max-h-[90vh] w-full max-w-md overflow-y-auto`}>
        <h3 className="text-lg font-semibold text-stone-900">Clôturer la journée</h3>
        <p className="mt-1 text-sm text-stone-500">
          Une fois clôturée, la journée est verrouillée : plus aucun encaissement possible avant
          l'ouverture d'une nouvelle journée.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-stone-600">Espèces attendues dans le tiroir</span>
              <span className="font-semibold text-stone-900">{attendues} DA</span>
            </div>
            <p className="mt-1 text-xs text-stone-400">
              Fond de caisse + espèces encaissées dans la journée.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700" htmlFor="especesComptees">
              Espèces comptées (DA)
            </label>
            <input
              id="especesComptees"
              type="number"
              min="0"
              step="0.01"
              value={especesComptees}
              onChange={(e) => setEspecesComptees(e.target.value)}
              placeholder="Montant réellement dans le tiroir"
              className={champ}
            />
            {ecartEstime !== null && (
              <p className="mt-1 text-sm">
                Écart : <CouleurEcart ecart={ecartEstime} />
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor="commentaireCloture">
              Commentaire (optionnel)
            </label>
            <textarea
              id="commentaireCloture"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
              className={champ}
            />
          </div>

          {!droitCloturer && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <label className="mb-1 block text-sm font-medium text-stone-700" htmlFor="codeGerantCloture">
                Validation gérant
              </label>
              <p className="mb-2 text-xs text-stone-500">
                Vous n'avez pas le droit de clôturer : un gérant doit saisir son code.
              </p>
              <input
                id="codeGerantCloture"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={codeGerant}
                onChange={(e) => setCodeGerant(e.target.value)}
                className={`${champ} text-center text-xl tracking-[0.5em]`}
              />
            </div>
          )}

          {erreur && <p className={messageErreur}>{erreur}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={enCours}
              onClick={handleCloturer}
              className={`flex-1 ${boutonPrimaire} py-2.5`}
            >
              {enCours ? 'Clôture...' : 'Confirmer la clôture'}
            </button>
            <button type="button" onClick={onFermer} className={boutonSecondaire}>
              Retour
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function JourneeCaisse({ droitCloturer }: { droitCloturer: boolean }) {
  const [etat, setEtat] = useState<EtatJournee | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fond, setFond] = useState('');
  const [modalCloture, setModalCloture] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function charger() {
    try {
      setEtat(await api.getJournee());
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function handleOuvrir(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setMessage(null);
    const montant = Number(fond);
    if (fond === '' || !Number.isFinite(montant) || montant < 0) {
      setErreur('Saisissez le fond de caisse (0 si le tiroir est vide)');
      return;
    }
    try {
      await api.ouvrirJournee(montant);
      setFond('');
      setMessage('Journée ouverte, bon service !');
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  if (chargement) return <p className="text-center text-stone-500">Chargement de la journée...</p>;
  if (!etat) return <p className={messageErreur}>{erreur ?? 'Erreur de chargement'}</p>;

  // Journée fermée : proposer l'ouverture + rappel de la dernière clôture.
  if (!etat.journee) {
    const derniere = etat.derniereCloture;
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {erreur && <p className={messageErreur}>{erreur}</p>}
        {message && <p className={messageSucces}>{message}</p>}

        <form onSubmit={handleOuvrir} className={`${carte} flex flex-col gap-3`}>
          <h3 className="text-lg font-semibold text-stone-900">Ouvrir la journée de caisse</h3>
          <p className="text-sm text-stone-500">
            Comptez le tiroir et déclarez le fond de caisse avant de commencer les encaissements.
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={fond}
              onChange={(e) => setFond(e.target.value)}
              placeholder="Fond de caisse (DA)"
              className={champ}
            />
            <button type="submit" className={`${boutonPrimaire} shrink-0`}>
              Ouvrir la journée
            </button>
          </div>
        </form>

        {derniere && (
          <div className={`${carte} flex flex-col gap-3`}>
            <div>
              <h3 className="font-semibold text-stone-900">Dernière clôture</h3>
              <p className="text-sm text-stone-500">
                {jour(derniere.ouverteLe)}
                {derniere.clotureeLe ? ` — clôturée à ${heure(derniere.clotureeLe)}` : ''}
                {derniere.clotureePar ? ` par ${derniere.clotureePar.prenom} ${derniere.clotureePar.nom}` : ''}
              </p>
            </div>
            <ResumeTotaux totaux={derniere.totaux} fondDeCaisse={derniere.fondDeCaisse} />
            {derniere.ecart !== null && (
              <p className="text-sm text-stone-600">
                Espèces : {derniere.especesComptees} DA comptées pour {derniere.especesAttendues} DA
                attendues — <CouleurEcart ecart={derniere.ecart} />
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Journée ouverte : suivi en temps réel + clôture.
  const { journee } = etat;
  const totaux = etat.totaux ?? { parMoyen: [], total: 0 };
  const additionsOuvertes = etat.additionsOuvertes ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {erreur && <p className={messageErreur}>{erreur}</p>}
      {message && <p className={messageSucces}>{message}</p>}

      <div className={`${carte} flex flex-col gap-4`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-stone-900">Journée en cours</h3>
            <p className="text-sm text-stone-500">
              Ouverte à {heure(journee.ouverteLe)} par {journee.ouvertePar.prenom}{' '}
              {journee.ouvertePar.nom}
            </p>
          </div>
          <button type="button" onClick={charger} className={boutonDiscret}>
            Actualiser
          </button>
        </div>

        <ResumeTotaux totaux={totaux} fondDeCaisse={journee.fondDeCaisse} />

        <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <span className="text-stone-600">Espèces attendues dans le tiroir</span>
          <span className="font-semibold text-stone-900">{etat.especesAttendues ?? journee.fondDeCaisse} DA</span>
        </div>
      </div>

      <div className={`${carte} flex flex-col gap-3`}>
        <h3 className="font-semibold text-stone-900">Clôture</h3>
        {additionsOuvertes > 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {additionsOuvertes} addition{additionsOuvertes > 1 ? 's' : ''} encore ouverte
            {additionsOuvertes > 1 ? 's' : ''} : encaissez-les ou annulez-les avant de clôturer.
          </p>
        ) : (
          <p className="text-sm text-stone-500">
            Toutes les additions sont soldées, vous pouvez clôturer la journée.
          </p>
        )}
        <button
          type="button"
          disabled={additionsOuvertes > 0}
          onClick={() => setModalCloture(true)}
          className={`${boutonPrimaire} py-2.5`}
        >
          Clôturer la journée
        </button>
      </div>

      {modalCloture && (
        <ModalCloture
          etat={etat}
          droitCloturer={droitCloturer}
          onFermer={() => setModalCloture(false)}
          onCloturee={async () => {
            setModalCloture(false);
            setMessage('Journée clôturée. Le récapitulatif est disponible ci-dessous et dans l\'espace gérant.');
            await charger();
          }}
        />
      )}
    </div>
  );
}
