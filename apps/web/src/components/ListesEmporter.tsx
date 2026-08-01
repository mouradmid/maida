import type { Commande } from '../lib/api';
import type { CibleHorsLigne } from '../lib/horsLigne';
import { carte, da } from '../lib/ui';

// Une vente à emporter n'a pas de table sur laquelle s'appuyer : elle se
// retrouve dans ces listes, sous le plan de salle.

const ongletActif =
  'rounded-full px-3 py-1 text-xs font-semibold transition-colors bg-brand-600 text-white';
const ongletInactif =
  'rounded-full px-3 py-1 text-xs font-semibold transition-colors border border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100';

export function ListeEmporterEnPreparation({
  commandes,
  additionOuverteId,
  onOuvrirAddition,
  onAnnuler,
}: {
  commandes: Commande[];
  additionOuverteId: string | null;
  onOuvrirAddition: (additionId: string) => void;
  onAnnuler: (commande: Commande) => void;
}) {
  if (commandes.length === 0) return null;

  return (
    <div className={carte}>
      <h3 className="mb-2 text-sm font-semibold text-stone-900">À emporter en préparation</h3>
      <ul className="flex flex-col divide-y divide-stone-100">
        {commandes.map((c) => {
          const annulable =
            c.statut !== 'ANNULEE' &&
            c.lignes.some((l) => l.quantite - l.quantitePayee - l.quantiteAnnulee > 0);
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-stone-900">
                  {new Date(c.creeLe).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="ml-2 text-xs text-stone-500">
                  {c.lignes
                    .filter((l) => l.quantite - l.quantiteAnnulee > 0)
                    .map(
                      (l) =>
                        `${l.quantite - l.quantiteAnnulee}× ${l.nomProduit}${
                          l.options.length ? ` (${l.options.map((o) => o.valeur).join(', ')})` : ''
                        }`,
                    )
                    .join(' · ')}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="font-semibold text-stone-900">{da(c.total)}</span>
                <button
                  type="button"
                  onClick={() => onOuvrirAddition(c.additionId)}
                  title="Voir l'addition et encaisser cette vente"
                  className={additionOuverteId === c.additionId ? ongletActif : ongletInactif}
                >
                  Addition
                </button>
                {annulable && (
                  <button
                    type="button"
                    onClick={() => onAnnuler(c)}
                    className="text-xs font-medium text-red-600 transition-colors hover:text-red-800"
                  >
                    Annuler
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Ventes à emporter prises pendant la coupure : encaissables ici. */
export function ListeEmporterHorsLigne({
  cibles,
  cleOuverte,
  onEncaisser,
}: {
  cibles: CibleHorsLigne[];
  cleOuverte: string | null;
  onEncaisser: (cle: string) => void;
}) {
  if (cibles.length === 0) return null;

  return (
    <div className={carte}>
      <h3 className="mb-2 text-sm font-semibold text-stone-900">À emporter à encaisser (hors ligne)</h3>
      <ul className="flex flex-col divide-y divide-stone-100">
        {cibles.map((cible) => (
          <li key={cible.cle} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="font-medium text-stone-900">{cible.libelle}</span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="font-semibold text-stone-900">{da(cible.solde)}</span>
              <button
                type="button"
                onClick={() => onEncaisser(cible.cle)}
                className={cleOuverte === cible.cle ? ongletActif : ongletInactif}
              >
                Encaisser
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
