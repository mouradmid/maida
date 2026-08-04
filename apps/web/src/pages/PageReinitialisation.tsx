import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageConnexion } from '../components/PageConnexion';
import { api } from '../lib/api';
import { boutonPrimaire, champ, messageErreur, messageSucces } from '../lib/ui';

const LONGUEUR_MINIMALE = 8;

/**
 * Page ouverte depuis le lien de réinitialisation. Le lien est à usage unique et
 * ne vaut qu'une heure : on vérifie d'abord qu'il tient encore debout, pour ne
 * pas faire saisir un mot de passe qui serait refusé ensuite.
 */
export function PageReinitialisation() {
  const { jeton = '' } = useParams();
  const navigate = useNavigate();

  const [prenom, setPrenom] = useState<string | null>(null);
  const [lienMort, setLienMort] = useState<string | null>(null);
  const [verification, setVerification] = useState(true);

  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(false);

  useEffect(() => {
    api
      .verifierJetonReinitialisation(jeton)
      .then((r) => setPrenom(r.prenom))
      .catch((err) => setLienMort(err instanceof Error ? err.message : 'Lien invalide'))
      .finally(() => setVerification(false));
  }, [jeton]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne sont pas identiques.');
      return;
    }
    setErreur(null);
    setEnCours(true);
    try {
      await api.reinitialiserMotDePasse(jeton, motDePasse);
      setFait(true);
      // Laisse le message se lire avant de renvoyer vers la connexion.
      setTimeout(() => navigate('/gerant'), 2500);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setEnCours(false);
    }
  }

  if (verification) {
    return (
      <PageConnexion titre="Nouveau mot de passe">
        <p className="text-sm text-ink-faint">Vérification du lien...</p>
      </PageConnexion>
    );
  }

  if (lienMort) {
    return (
      <PageConnexion titre="Lien expiré">
        <div className="flex flex-col gap-4">
          <p className={messageErreur}>{lienMort}</p>
          <p className="text-sm text-ink-soft">
            Les liens ne valent qu'une heure et ne servent qu'une fois. Redemandez-en un depuis l'écran
            de connexion.
          </p>
          <Link to="/gerant" className={`${boutonPrimaire} py-2.5 text-center`}>
            Retour à la connexion
          </Link>
        </div>
      </PageConnexion>
    );
  }

  if (fait) {
    return (
      <PageConnexion titre="Mot de passe changé">
        <div className="flex flex-col gap-4">
          <p className={messageSucces}>
            C'est fait. Vous pouvez vous connecter avec votre nouveau mot de passe.
          </p>
          <Link to="/gerant" className={`${boutonPrimaire} py-2.5 text-center`}>
            Se connecter
          </Link>
        </div>
      </PageConnexion>
    );
  }

  return (
    <PageConnexion
      titre="Nouveau mot de passe"
      sousTitre={prenom ? `Bonjour ${prenom}, choisissez votre nouveau mot de passe.` : undefined}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="nouveau">
            Nouveau mot de passe
          </label>
          <input
            id="nouveau"
            type="password"
            required
            autoFocus
            minLength={LONGUEUR_MINIMALE}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className={champ}
          />
          <p className="mt-1 text-xs text-ink-faint">{LONGUEUR_MINIMALE} caractères minimum.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-soft" htmlFor="confirmation">
            Confirmez le mot de passe
          </label>
          <input
            id="confirmation"
            type="password"
            required
            minLength={LONGUEUR_MINIMALE}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className={champ}
          />
        </div>
        {erreur && <p className={messageErreur}>{erreur}</p>}
        <p className="text-sm text-ink-faint">
          Changer votre mot de passe ferme les sessions ouvertes ailleurs : chaque appareil devra se
          reconnecter.
        </p>
        <button type="submit" disabled={enCours} className={`${boutonPrimaire} py-2.5`}>
          {enCours ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>
    </PageConnexion>
  );
}
