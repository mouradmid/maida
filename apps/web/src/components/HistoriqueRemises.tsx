import { api } from '../lib/api';
import { badgeNeutre, carte } from '../lib/ui';

export type Remise = Awaited<ReturnType<typeof api.listRemises>>[number];

function dateHeure(date: string) {
  return new Date(date).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Affichage seul : la période, le chargement et l'export sont portés par
// AnnulationsRemises, qui alimente aussi cet historique.
export function HistoriqueRemises({ remises }: { remises: Remise[] }) {
  const totalPeriode = remises.reduce((s, r) => s + r.montant, 0);

  return (
    <div className={`${carte} flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-stone-900">Remises et offerts</h3>
        {remises.length > 0 && (
          <span className="text-sm text-stone-500">
            {remises.length} geste{remises.length > 1 ? 's' : ''} —{' '}
            <span className="font-semibold text-brand-800">
              {Math.round(totalPeriode * 100) / 100} DA
            </span>
          </span>
        )}
      </div>

      {remises.length === 0 && (
        <p className="text-sm text-stone-400">Aucune remise ni offert sur cette période.</p>
      )}

      <ul className="flex flex-col divide-y divide-stone-100 text-sm">
        {remises.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  r.type === 'OFFERT' ? 'bg-sky-100 text-sky-800' : 'bg-brand-50 text-brand-800'
                }`}
              >
                {r.type === 'OFFERT' ? 'Offert' : `Remise${r.pourcentage ? ` ${r.pourcentage} %` : ''}`}
              </span>
              <span className="font-medium text-stone-900">
                {r.type === 'OFFERT' && r.produit
                  ? `${r.quantite ?? 1}× ${r.produit}`
                  : r.table
                    ? `Table ${r.table.numero}`
                    : 'À emporter'}
              </span>
              <span className={badgeNeutre}>{r.motif}</span>
              {r.commentaire && <span className="text-xs text-stone-400">« {r.commentaire} »</span>}
            </span>
            <span className="flex items-center gap-3 text-xs text-stone-500">
              <span>
                {r.accordeePar.prenom} {r.accordeePar.nom}
                {r.demandeePar && ` (demandé par ${r.demandeePar.prenom})`}
              </span>
              <span>{dateHeure(r.creeLe)}</span>
              <span className="text-sm font-semibold text-stone-900">−{r.montant} DA</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
