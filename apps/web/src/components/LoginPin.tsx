import { useEffect, useRef, useState } from 'react';
import { api, type Utilisateur } from '../lib/api';
import { champ, messageErreur } from '../lib/ui';

const CLE_STOCKAGE_ETAB = 'maida.etablissementId';
const LONGUEUR_PIN = 4;

export function LoginPin({ onSuccess }: { onSuccess: (user: Utilisateur) => void }) {
  const [etablissements, setEtablissements] = useState<
    Array<{ id: string; nom: string; ville: string | null }>
  >([]);
  const [etablissementId, setEtablissementId] = useState('');
  const [codePin, setCodePin] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const envoiRef = useRef(false);

  useEffect(() => {
    api
      .listEtablissementsPublics()
      .then((liste) => {
        setEtablissements(liste);
        const memorise = localStorage.getItem(CLE_STOCKAGE_ETAB);
        if (memorise && liste.some((e) => e.id === memorise)) {
          setEtablissementId(memorise);
        } else if (liste.length === 1) {
          setEtablissementId(liste[0].id);
        }
      })
      .catch(() => setErreur('Impossible de charger les établissements'));
  }, []);

  async function envoyer(pin: string) {
    if (envoiRef.current) return;
    if (!etablissementId) {
      setErreur('Choisissez votre établissement');
      setCodePin('');
      return;
    }
    envoiRef.current = true;
    setEnCours(true);
    setErreur(null);
    try {
      localStorage.setItem(CLE_STOCKAGE_ETAB, etablissementId);
      const user = await api.loginPin(etablissementId, pin);
      onSuccess(user);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de connexion');
      setCodePin('');
    } finally {
      envoiRef.current = false;
      setEnCours(false);
    }
  }

  function appuyerChiffre(chiffre: string) {
    if (enCours) return;
    setErreur(null);
    setCodePin((pin) => {
      if (pin.length >= LONGUEUR_PIN) return pin;
      const nouveau = pin + chiffre;
      if (nouveau.length === LONGUEUR_PIN) {
        // Laisse le temps au dernier point de s'afficher avant l'envoi.
        setTimeout(() => envoyer(nouveau), 120);
      }
      return nouveau;
    });
  }

  function effacer() {
    if (enCours) return;
    setCodePin((pin) => pin.slice(0, -1));
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="etablissementId">
          Établissement
        </label>
        <select
          id="etablissementId"
          value={etablissementId}
          onChange={(e) => setEtablissementId(e.target.value)}
          className={champ}
        >
          <option value="">Choisir un établissement</option>
          {etablissements.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nom}
              {e.ville ? ` — ${e.ville}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-center gap-3" aria-label="Code PIN">
        {Array.from({ length: LONGUEUR_PIN }).map((_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-colors ${
              i < codePin.length ? 'border-brand-600 bg-brand-600' : 'border-line bg-card'
            }`}
          />
        ))}
      </div>

      {erreur && <p className={messageErreur}>{erreur}</p>}
      {enCours && <p className="text-center text-sm text-ink-faint">Connexion...</p>}

      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((chiffre) => (
          <button
            key={chiffre}
            type="button"
            onClick={() => appuyerChiffre(chiffre)}
            className="rounded-xl border border-line bg-card py-4 text-xl font-semibold text-ink transition-colors hover:bg-surface active:bg-brand-50"
          >
            {chiffre}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => appuyerChiffre('0')}
          className="rounded-xl border border-line bg-card py-4 text-xl font-semibold text-ink transition-colors hover:bg-surface active:bg-brand-50"
        >
          0
        </button>
        <button
          type="button"
          onClick={effacer}
          aria-label="Effacer"
          className="rounded-xl border border-line bg-card py-4 text-xl text-ink-faint transition-colors hover:bg-surface active:bg-brand-50"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
