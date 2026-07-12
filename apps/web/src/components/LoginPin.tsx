import { useState } from 'react';
import { api, type Utilisateur } from '../lib/api';

export function LoginPin({ onSuccess }: { onSuccess: (user: Utilisateur) => void }) {
  const [etablissementId, setEtablissementId] = useState('');
  const [codePin, setCodePin] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const user = await api.loginPin(etablissementId, codePin);
      onSuccess(user);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="etablissementId">
          Identifiant établissement
        </label>
        <input
          id="etablissementId"
          type="text"
          required
          value={etablissementId}
          onChange={(e) => setEtablissementId(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2"
          placeholder="ex: cmri3h0p60001nomf1z72yucg"
        />
        <p className="text-xs text-gray-500 mt-1">
          Provisoire : plus tard, chaque terminal caisse connaîtra son établissement automatiquement.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="codePin">
          Code PIN
        </label>
        <input
          id="codePin"
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          required
          value={codePin}
          onChange={(e) => setCodePin(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-center text-2xl tracking-[0.5em]"
        />
      </div>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <button
        type="submit"
        disabled={enCours}
        className="rounded bg-gray-900 text-white py-2 font-medium disabled:opacity-50"
      >
        {enCours ? 'Connexion...' : 'Se connecter'}
      </button>
    </form>
  );
}
