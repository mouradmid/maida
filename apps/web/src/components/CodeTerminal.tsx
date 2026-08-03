import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { boutonSecondaire, carte, messageErreur, messageSucces } from '../lib/ui';

/**
 * Code d'installation des tablettes. Le gérant le dicte à la personne qui
 * installe la caisse ; il ne sert qu'au tout premier démarrage d'un appareil.
 */
export function CodeTerminal() {
  const [code, setCode] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [regenere, setRegenere] = useState(false);

  useEffect(() => {
    api
      .getParametres()
      .then((p) => setCode(p.codeTerminal))
      .catch((err) => setErreur(err instanceof Error ? err.message : 'Erreur de chargement'))
      .finally(() => setChargement(false));
  }, []);

  async function handleRegenerer() {
    if (
      !window.confirm(
        "Générer un nouveau code ?\n\nL'ancien ne permettra plus d'installer de tablette. " +
          'Les caisses déjà en service ne sont pas déconnectées.',
      )
    ) {
      return;
    }
    setErreur(null);
    try {
      const { codeTerminal } = await api.regenererCodeTerminal();
      setCode(codeTerminal);
      setRegenere(true);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  if (chargement) return null;

  return (
    <div className={`${carte} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Installer une tablette de caisse</h3>
        <button type="button" onClick={handleRegenerer} className={boutonSecondaire}>
          Générer un nouveau code
        </button>
      </div>

      <p className="text-sm text-ink-soft">
        Sur une tablette neuve, ouvrez la page Caisse et tapez ce code une seule fois : elle retient
        ensuite votre restaurant, et l'équipe se connecte uniquement avec son code personnel.
      </p>

      <p className="font-mono text-3xl font-semibold tracking-[0.25em] text-brand-800">{code ?? '—'}</p>

      {regenere && (
        <p className={messageSucces}>
          Nouveau code en service. Les tablettes déjà installées continuent de fonctionner.
        </p>
      )}
      {erreur && <p className={messageErreur}>{erreur}</p>}

      <p className="text-sm text-ink-faint">
        Générez un nouveau code si une tablette est perdue ou si quelqu'un quitte l'établissement avec.
      </p>
    </div>
  );
}
