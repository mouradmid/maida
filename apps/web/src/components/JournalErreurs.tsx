import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { boutonDiscret, carte, messageErreur } from '../lib/ui';

type Erreur = Awaited<ReturnType<typeof api.listErreurs>>[number];

export function JournalErreurs() {
  const [erreurs, setErreurs] = useState<Erreur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [detailOuvert, setDetailOuvert] = useState<string | null>(null);

  async function charger() {
    try {
      setErreurs(await api.listErreurs());
      setProbleme(null);
    } catch (err) {
      setProbleme(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function handleVider() {
    if (!window.confirm('Vider le journal des erreurs ?')) return;
    await api.viderErreurs();
    await charger();
  }

  if (chargement) return null;

  return (
    <div className={`${carte} flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-stone-900">
          Journal des erreurs serveur
          {erreurs.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
              {erreurs.length}
            </span>
          )}
        </h3>
        <span className="flex items-center gap-3">
          <button type="button" onClick={charger} className={boutonDiscret}>
            Actualiser
          </button>
          {erreurs.length > 0 && (
            <button type="button" onClick={handleVider} className={boutonDiscret}>
              Vider
            </button>
          )}
        </span>
      </div>

      {probleme && <p className={messageErreur}>{probleme}</p>}

      {erreurs.length === 0 && !probleme && (
        <p className="text-sm text-stone-400">
          Aucune erreur serveur enregistrée — tout roule. Les erreurs inattendues de l'API
          apparaîtront ici avec leur détail technique.
        </p>
      )}

      <ul className="flex flex-col divide-y divide-stone-100 text-sm">
        {erreurs.map((e) => (
          <li key={e.id} className="flex flex-col gap-1 py-2.5">
            <button
              type="button"
              onClick={() => setDetailOuvert(detailOuvert === e.id ? null : e.id)}
              className="flex flex-wrap items-center justify-between gap-2 text-left"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="inline-flex items-center rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs text-stone-600">
                  {e.methode} {e.chemin}
                </span>
                <span className="truncate font-medium text-red-800">{e.message}</span>
              </span>
              <span className="shrink-0 text-xs text-stone-400">
                {new Date(e.creeLe).toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </button>
            {detailOuvert === e.id && e.detail && (
              <pre className="overflow-x-auto rounded-lg bg-stone-900 p-3 text-xs leading-relaxed text-stone-100">
                {e.detail}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
