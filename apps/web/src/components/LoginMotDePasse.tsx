import { useState } from 'react';
import { api, type Utilisateur } from '../lib/api';
import { boutonDiscret, boutonPrimaire, champ, messageErreur, messageSucces } from '../lib/ui';

export function LoginMotDePasse({ onSuccess }: { onSuccess: (user: Utilisateur) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [oubli, setOubli] = useState(false);

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

  if (oubli) {
    return <MotDePasseOublie emailInitial={email} onRetour={() => setOubli(false)} />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="email">
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
        <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="password">
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
      <button type="button" onClick={() => setOubli(true)} className={`${boutonDiscret} self-center`}>
        Mot de passe oublié ?
      </button>
    </form>
  );
}

/**
 * Demande de réinitialisation. La réponse est toujours la même, que l'adresse
 * soit connue ou non : ce formulaire ne doit pas permettre de découvrir qui est
 * client de Maïda.
 */
function MotDePasseOublie({ emailInitial, onRetour }: { emailInitial: string; onRetour: () => void }) {
  const [email, setEmail] = useState(emailInitial);
  const [envoye, setEnvoye] = useState<{ message: string; parEmail: boolean } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      setEnvoye(await api.demanderReinitialisation(email));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setEnCours(false);
    }
  }

  if (envoye) {
    return (
      <div className="flex w-full flex-col gap-4">
        <p className={messageSucces}>{envoye.message}</p>
        <p className="text-sm text-ink-faint">
          {envoye.parEmail
            ? "Le lien vient de partir par e-mail — pensez à regarder vos indésirables. Il n'est valable qu'une heure, et une seule fois."
            : "Le lien vous sera communiqué par Maïda. Il n'est valable qu'une heure, et une seule fois."}
        </p>
        <button type="button" onClick={onRetour} className={boutonDiscret}>
          ← Retour à la connexion
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="emailOubli">
          Votre adresse e-mail
        </label>
        <input
          id="emailOubli"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={champ}
          placeholder="vous@exemple.dz"
        />
        <p className="mt-2 text-sm text-ink-faint">
          Indiquez l'adresse avec laquelle vous vous connectez. Nous vous transmettrons un lien pour
          choisir un nouveau mot de passe.
        </p>
      </div>
      {erreur && <p className={messageErreur}>{erreur}</p>}
      <button type="submit" disabled={enCours} className={`${boutonPrimaire} py-2.5`}>
        {enCours ? 'Envoi...' : 'Demander un nouveau mot de passe'}
      </button>
      <button type="button" onClick={onRetour} className={boutonDiscret}>
        ← Retour à la connexion
      </button>
    </form>
  );
}
