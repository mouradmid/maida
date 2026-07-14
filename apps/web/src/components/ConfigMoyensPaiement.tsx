import { useEffect, useState } from 'react';
import { api, type ModePaiement } from '../lib/api';
import { carte, messageErreur } from '../lib/ui';

const LIBELLES: Record<ModePaiement, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  CHEQUE: 'Chèque',
  AUTRE: 'Autre',
};

export function ConfigMoyensPaiement() {
  const [tous, setTous] = useState<ModePaiement[]>([]);
  const [actifs, setActifs] = useState<ModePaiement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function charger() {
    setChargement(true);
    try {
      const data = await api.getMoyensPaiement();
      setTous(data.tous);
      setActifs(data.actifs);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function handleToggle(mode: ModePaiement) {
    setErreur(null);
    const nouveaux = actifs.includes(mode) ? actifs.filter((m) => m !== mode) : [...actifs, mode];
    setEnregistrement(true);
    try {
      const data = await api.updateMoyensPaiement(nouveaux);
      setActifs(data.actifs);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) return <p className="text-center text-stone-500">Chargement...</p>;

  return (
    <div className={`${carte} flex w-full max-w-2xl flex-col gap-4`}>
      <div>
        <h3 className="font-semibold text-stone-900">Moyens de paiement acceptés</h3>
        <p className="mt-1 text-sm text-stone-500">
          Désactivez un moyen pour qu'il n'apparaisse plus à l'encaissement. Vous pouvez le réactiver à
          tout moment.
        </p>
      </div>
      {erreur && <p className={messageErreur}>{erreur}</p>}
      <div className="flex flex-wrap gap-2">
        {tous.map((mode) => {
          const actif = actifs.includes(mode);
          return (
            <button
              key={mode}
              type="button"
              disabled={enregistrement}
              onClick={() => handleToggle(mode)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                actif
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-stone-500 border border-stone-300 hover:bg-stone-50'
              }`}
            >
              {actif ? '✓ ' : ''}
              {LIBELLES[mode]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
