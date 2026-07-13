import { useEffect, useState } from 'react';
import { api, type ModePaiement } from '../lib/api';

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

  if (chargement) return <p>Chargement...</p>;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-3 text-left">
      <h2 className="text-xl font-semibold">Moyens de paiement acceptés</h2>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <p className="text-sm text-gray-500">
        Décochez un moyen pour qu'il n'apparaisse plus à l'encaissement. Vous pouvez le réactiver à tout moment.
      </p>
      <div className="flex flex-wrap gap-4">
        {tous.map((mode) => (
          <label key={mode} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={actifs.includes(mode)}
              disabled={enregistrement}
              onChange={() => handleToggle(mode)}
            />
            {LIBELLES[mode]}
          </label>
        ))}
      </div>
    </div>
  );
}
