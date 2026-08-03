import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { boutonDiscret, carte, messageErreur } from '../lib/ui';

type Connexion = Awaited<ReturnType<typeof api.listConnexions>>[number];

const LIBELLE_RESULTAT: Record<Connexion['resultat'], string> = {
  REUSSIE: 'Connexion',
  IDENTIFIANTS_INVALIDES: 'Refusée',
  COMPTE_SUSPENDU: 'Compte suspendu',
  TROP_DE_TENTATIVES: 'Trop de tentatives',
};

/**
 * Journal des connexions : sert au support (« qui a ouvert la caisse hier
 * soir ? ») autant qu'à repérer un acharnement sur un code PIN.
 */
export function JournalConnexions() {
  const [connexions, setConnexions] = useState<Connexion[]>([]);
  const [echecsSeulement, setEchecsSeulement] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [probleme, setProbleme] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    api
      .listConnexions(echecsSeulement)
      .then((liste) => {
        if (annule) return;
        setConnexions(liste);
        setProbleme(null);
      })
      .catch((err) => {
        if (!annule) setProbleme(err instanceof Error ? err.message : 'Erreur de chargement');
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [echecsSeulement]);

  if (chargement) return null;

  return (
    <div className={`${carte} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Journal des connexions</h3>
        <button type="button" onClick={() => setEchecsSeulement((v) => !v)} className={boutonDiscret}>
          {echecsSeulement ? 'Voir toutes les tentatives' : 'Voir seulement les échecs'}
        </button>
      </div>

      {probleme && <p className={messageErreur}>{probleme}</p>}

      {connexions.length === 0 && !probleme && (
        <p className="text-sm text-ink-faint">
          {echecsSeulement ? 'Aucune tentative refusée.' : 'Aucune connexion enregistrée.'}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-line-soft text-sm">
        {connexions.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  c.resultat === 'REUSSIE' ? 'bg-ok-bg text-ok' : 'bg-danger-bg text-danger'
                }`}
              >
                {LIBELLE_RESULTAT[c.resultat]}
              </span>
              <span className="text-xs text-ink-faint">{c.type === 'PIN' ? 'PIN' : 'Mot de passe'}</span>
              <span className="truncate font-medium text-ink">{c.acteur ?? 'inconnu'}</span>
              {c.etablissement && <span className="truncate text-ink-soft">{c.etablissement}</span>}
            </span>
            <span className="shrink-0 font-mono text-xs text-ink-faint">
              {c.ip ?? '—'} ·{' '}
              {new Date(c.creeLe).toLocaleString('fr-FR', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
