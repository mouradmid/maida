import { useState } from 'react';
import { api, type Utilisateur } from '../lib/api';
import { boutonPrimaire, champ, messageErreur } from '../lib/ui';

export function LoginMotDePasse({ onSuccess }: { onSuccess: (user: Utilisateur) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const user = await api.login(email, password);
      onSuccess(user);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-stone-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={champ}
          placeholder="vous@exemple.dz"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-stone-700" htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={champ}
        />
      </div>
      {erreur && <p className={messageErreur}>{erreur}</p>}
      <button type="submit" disabled={enCours} className={`${boutonPrimaire} py-2.5`}>
        {enCours ? 'Connexion...' : 'Se connecter'}
      </button>
    </form>
  );
}
