import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { boutonPrimaire, carte, champ, messageErreur, messageSucces } from '../lib/ui';

/**
 * Le code du gérant : celui qu'il tape sur la caisse d'un serveur pour valider
 * une annulation, une remise ou une clôture que ce serveur n'a pas le droit de
 * faire seul. Sans lui, ces gestes restent bloqués pour toute l'équipe.
 */
export function CodeGerant() {
  const [defini, setDefini] = useState<boolean | null>(null);
  const [codePin, setCodePin] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api
      .etatCodePinGerant()
      .then((etat) => setDefini(etat.defini))
      .catch((err) => setErreur(err instanceof Error ? err.message : 'Erreur de chargement'));
  }, []);

  async function handleEnregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setErreur(null);
    setEnregistre(false);
    setEnCours(true);
    try {
      await api.definirCodePinGerant(codePin, motDePasse);
      setDefini(true);
      setEnregistre(true);
      setCodePin('');
      setMotDePasse('');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setEnCours(false);
    }
  }

  if (defini === null && !erreur) return null;

  return (
    <form onSubmit={handleEnregistrer} className={`${carte} flex flex-col gap-3`}>
      <h3 className="font-semibold text-ink">Mon code de validation</h3>

      <p className="text-sm text-ink-soft">
        Quand un serveur n'a pas le droit d'annuler, d'accorder une remise ou de clôturer la caisse,
        c'est ce code que vous tapez sur sa tablette pour valider à sa place. Gardez-le pour vous.
      </p>

      {defini === false && (
        <p className={messageErreur}>
          Aucun code défini : les serveurs sans droits ne peuvent faire valider aucune annulation ni
          remise.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          autoComplete="off"
          placeholder={defini ? 'Nouveau code (4 chiffres)' : 'Code à 4 chiffres'}
          value={codePin}
          onChange={(e) => setCodePin(e.target.value.replace(/[^0-9]/g, ''))}
          required
          className={`${champ} sm:max-w-60`}
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Votre mot de passe"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          required
          className={`${champ} sm:max-w-64`}
        />
        <button
          type="submit"
          disabled={enCours || codePin.length !== 4 || !motDePasse}
          className={boutonPrimaire}
        >
          {defini ? 'Changer mon code' : 'Définir mon code'}
        </button>
      </div>

      {enregistre && <p className={messageSucces}>Code enregistré. Il sert dès maintenant.</p>}
      {erreur && <p className={messageErreur}>{erreur}</p>}
    </form>
  );
}
