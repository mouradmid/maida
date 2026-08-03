import { useEffect, useRef, useState } from 'react';
import { api, type Utilisateur } from '../lib/api';
import { boutonDiscret, boutonPrimaire, champ, messageErreur } from '../lib/ui';

// La tablette retient le restaurant auquel elle a été rattachée. Le nom est
// gardé avec l'identifiant pour pouvoir l'afficher dès le premier rendu, sans
// attendre le réseau — cet écran doit s'ouvrir même quand le wifi est tombé.
const CLE_TERMINAL = 'maida.terminal';
// Écrite par les versions antérieures, qui laissaient choisir dans une liste.
const CLE_ANCIENNE = 'maida.etablissementId';
const LONGUEUR_PIN = 4;

interface Terminal {
  id: string;
  nom: string;
  ville: string | null;
}

function lireTerminal(): Terminal | null {
  const brut = localStorage.getItem(CLE_TERMINAL);
  if (!brut) return null;
  try {
    const terminal = JSON.parse(brut) as Terminal;
    return terminal.id ? terminal : null;
  } catch {
    return null;
  }
}

export function LoginPin({ onSuccess }: { onSuccess: (user: Utilisateur) => void }) {
  const [terminal, setTerminal] = useState<Terminal | null>(lireTerminal);
  const [codePin, setCodePin] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const envoiRef = useRef(false);

  // Le choix par liste n'existe plus : on nettoie la trace des anciennes versions.
  useEffect(() => localStorage.removeItem(CLE_ANCIENNE), []);

  function rattacher(nouveau: Terminal) {
    localStorage.setItem(CLE_TERMINAL, JSON.stringify(nouveau));
    setTerminal(nouveau);
    setErreur(null);
  }

  function detacher() {
    localStorage.removeItem(CLE_TERMINAL);
    setTerminal(null);
    setCodePin('');
    setErreur(null);
  }

  async function envoyer(pin: string) {
    if (envoiRef.current || !terminal) return;
    envoiRef.current = true;
    setEnCours(true);
    setErreur(null);
    try {
      onSuccess(await api.loginPin(terminal.id, pin));
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

  if (!terminal) {
    return <RattachementTerminal onRattache={rattacher} />;
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="text-center">
        <p className="font-display text-lg font-semibold text-ink">{terminal.nom}</p>
        <p className="text-sm text-ink-faint">
          {terminal.ville ? `${terminal.ville} — ` : ''}Tapez votre code personnel
        </p>
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

      <button type="button" onClick={detacher} className={`${boutonDiscret} self-center`}>
        Ce n'est pas le bon restaurant ?
      </button>
    </div>
  );
}

/** Premier démarrage d'une tablette : elle demande son code d'installation. */
function RattachementTerminal({ onRattache }: { onRattache: (terminal: Terminal) => void }) {
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (enCours || !code.trim()) return;
    setEnCours(true);
    setErreur(null);
    try {
      onRattache(await api.rattacherTerminal(code));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={valider} className="flex w-full flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="codeTerminal">
          Code d'installation
        </label>
        <input
          id="codeTerminal"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD-2345"
          className={`${champ} text-center font-mono text-xl tracking-[0.2em] uppercase`}
        />
        <p className="mt-2 text-sm text-ink-faint">
          Ce code figure dans l'espace gérant, onglet « Équipe ». Il n'est demandé qu'une fois : la
          tablette retient ensuite son restaurant.
        </p>
      </div>

      {erreur && <p className={messageErreur}>{erreur}</p>}

      <button type="submit" disabled={enCours || !code.trim()} className={boutonPrimaire}>
        {enCours ? 'Vérification...' : 'Rattacher cette tablette'}
      </button>
    </form>
  );
}
