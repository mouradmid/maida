import type { DemandeClient } from '../lib/api';
import { da } from '../lib/ui';

/**
 * Commandes passées par les clients depuis le QR à table : un serveur les
 * valide avant l'envoi en cuisine, c'est le garde-fou anti-abus.
 */
export function BandeauDemandesClients({
  demandes,
  onAccepter,
  onRefuser,
}: {
  demandes: DemandeClient[];
  onAccepter: (demande: DemandeClient) => void;
  onRefuser: (demande: DemandeClient) => void;
}) {
  if (demandes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-sky-300 bg-sky-50 p-4">
      <h3 className="flex items-center gap-2 font-semibold text-sky-900">
        📱 Commandes clients à valider
        <span className="inline-flex items-center rounded-full bg-sky-600 px-2.5 py-0.5 text-xs font-semibold text-white">
          {demandes.length}
        </span>
      </h3>
      <ul className="flex flex-col divide-y divide-sky-200">
        {demandes.map((demande) => (
          <li key={demande.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-stone-900">
                Table {demande.table.numero}
                <span className="ml-2 font-normal text-stone-500">
                  {new Date(demande.creeLe).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {demande.total !== null && (
                  <span className="ml-2 font-bold text-sky-900">{da(demande.total)}</span>
                )}
              </p>
              {demande.lignes && (
                <p className="text-stone-600">
                  {demande.lignes
                    .map(
                      (l) =>
                        `${l.quantite}× ${l.nomProduit}${l.options.length ? ` (${l.options.join(', ')})` : ''}`,
                    )
                    .join(' · ')}
                </p>
              )}
              {demande.note && <p className="text-xs text-stone-500">« {demande.note} »</p>}
              {demande.probleme && (
                <p className="text-xs font-medium text-red-700">⚠ {demande.probleme}</p>
              )}
            </div>
            <span className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={demande.probleme !== null}
                onClick={() => onAccepter(demande)}
                className="flex min-h-11 items-center rounded-lg bg-green-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-ok-hover disabled:opacity-40"
              >
                Accepter → cuisine
              </button>
              <button
                type="button"
                onClick={() => onRefuser(demande)}
                className="flex min-h-11 items-center rounded-lg border border-red-200 bg-card px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
              >
                Refuser
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
