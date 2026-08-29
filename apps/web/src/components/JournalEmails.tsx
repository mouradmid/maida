import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { boutonDiscret, carte, messageErreur } from '../lib/ui';

type Reponse = Awaited<ReturnType<typeof api.listEmails>>;
type Email = Reponse['emails'][number];

const LIBELLE_TYPE: Record<Email['type'], string> = {
  MOT_DE_PASSE_OUBLIE: 'Mot de passe oublié',
  CONFIRMATION_RESERVATION: 'Confirmation de réservation',
};

const LIBELLE_RESULTAT: Record<Email['resultat'], string> = {
  ENVOYE: 'Envoyé',
  ECHEC: 'Échec',
  NON_CONFIGURE: 'Non envoyé',
};

/**
 * Journal des e-mails : la première chose à regarder quand un client dit
 * « je n'ai rien reçu ». Il montre aussi ce que Maïda AURAIT envoyé tant
 * qu'aucun serveur d'envoi n'est branché.
 */
export function JournalEmails() {
  const [reponse, setReponse] = useState<Reponse | null>(null);
  const [echecsSeulement, setEchecsSeulement] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [probleme, setProbleme] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    api
      .listEmails(echecsSeulement)
      .then((data) => {
        if (annule) return;
        setReponse(data);
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

  const emails = reponse?.emails ?? [];

  return (
    <div className={`${carte} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">E-mails envoyés</h3>
        <button type="button" onClick={() => setEchecsSeulement((v) => !v)} className={boutonDiscret}>
          {echecsSeulement ? 'Voir tous les envois' : 'Voir seulement les problèmes'}
        </button>
      </div>

      {reponse && !reponse.configure && (
        <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
          Aucun serveur d'envoi n'est branché : les messages ci-dessous ont été préparés mais ne sont
          partis nulle part. Les demandes de mot de passe restent à transmettre à la main.
        </p>
      )}

      {probleme && <p className={messageErreur}>{probleme}</p>}

      {emails.length === 0 && !probleme && (
        <p className="text-sm text-ink-faint">
          {echecsSeulement ? 'Aucun envoi en échec.' : 'Aucun e-mail pour le moment.'}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-line-soft text-sm">
        {emails.map((e) => (
          <li key={e.id} className="flex flex-col gap-1 py-2">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    e.resultat === 'ENVOYE'
                      ? 'bg-ok-bg text-ok'
                      : e.resultat === 'ECHEC'
                        ? 'bg-danger-bg text-danger'
                        : 'bg-warn-bg text-warn'
                  }`}
                >
                  {LIBELLE_RESULTAT[e.resultat]}
                </span>
                <span className="text-xs text-ink-faint">{LIBELLE_TYPE[e.type]}</span>
                <span className="truncate font-medium text-ink">{e.destinataire}</span>
                {e.etablissement && <span className="truncate text-ink-soft">{e.etablissement}</span>}
              </span>
              <span className="shrink-0 font-mono text-xs text-ink-faint">
                {new Date(e.creeLe).toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </span>
            {e.erreur && <span className="text-xs text-danger">{e.erreur}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
