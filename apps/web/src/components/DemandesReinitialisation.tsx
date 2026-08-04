import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { boutonDiscret, boutonSecondaire, carte, messageErreur } from '../lib/ui';

type Demande = Awaited<ReturnType<typeof api.listReinitialisations>>[number];

/** « dans 47 min » — ce qui reste avant que le lien ne serve plus à rien. */
function tempsRestant(expireLe: string): string {
  const minutes = Math.round((new Date(expireLe).getTime() - Date.now()) / 60000);
  if (minutes <= 0) return 'expiré';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/**
 * Demandes de mot de passe oublié.
 *
 * Tant que Maïda n'envoie pas d'e-mails, c'est ici que le lien atterrit :
 * l'éditeur le copie et le transmet au gérant par téléphone ou WhatsApp.
 */
export function DemandesReinitialisation() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [chargement, setChargement] = useState(true);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);

  async function charger() {
    try {
      setDemandes(await api.listReinitialisations());
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

  function lienDe(demande: Demande): string {
    return `${window.location.origin}/reinitialisation/${demande.jeton}`;
  }

  async function copier(demande: Demande) {
    await navigator.clipboard.writeText(lienDe(demande));
    setCopie(demande.id);
    setTimeout(() => setCopie(null), 2500);
  }

  async function annuler(demande: Demande) {
    const qui = `${demande.utilisateur.prenom} ${demande.utilisateur.nom}`;
    if (!window.confirm(`Annuler la demande de ${qui} ? Le lien ne fonctionnera plus.`)) return;
    await api.annulerReinitialisation(demande.id);
    await charger();
  }

  if (chargement) return null;

  return (
    <div className={`${carte} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold text-ink">
          Mots de passe oubliés
          {demandes.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-medium text-warn">
              {demandes.length} en attente
            </span>
          )}
        </h3>
        <button type="button" onClick={charger} className={boutonDiscret}>
          Actualiser
        </button>
      </div>

      {probleme && <p className={messageErreur}>{probleme}</p>}

      {demandes.length === 0 && !probleme && (
        <p className="text-sm text-ink-faint">
          Aucune demande en attente. Quand un gérant clique sur « Mot de passe oublié ? », son lien
          apparaît ici — à lui transmettre par téléphone ou WhatsApp.
        </p>
      )}

      <ul className="flex flex-col divide-y divide-line-soft">
        {demandes.map((d) => (
          <li key={d.id} className="flex flex-col gap-2 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-ink">
                  {d.utilisateur.prenom} {d.utilisateur.nom}
                </span>
                {d.utilisateur.compteClient && (
                  <span className="text-ink-soft">{d.utilisateur.compteClient.nomEnseigne}</span>
                )}
                {d.utilisateur.email && (
                  <span className="font-mono text-xs text-ink-faint">{d.utilisateur.email}</span>
                )}
              </span>
              <span className="text-xs text-ink-faint">
                demandé à{' '}
                {new Date(d.creeLe).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · valable encore {tempsRestant(d.expireLe)}
                {d.ip && ` · ${d.ip}`}
              </span>
            </div>

            <p className="overflow-x-auto rounded-lg bg-surface px-3 py-2 font-mono text-xs whitespace-nowrap text-ink-soft">
              {lienDe(d)}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => copier(d)} className={boutonSecondaire}>
                {copie === d.id ? '✓ Lien copié' : 'Copier le lien'}
              </button>
              <button type="button" onClick={() => annuler(d)} className={boutonDiscret}>
                Annuler la demande
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
