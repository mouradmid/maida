import { carte } from '../lib/ui';

/**
 * Tuile d'indicateur : un libellé, un chiffre, et de quoi le nuancer.
 *
 * Partagée par tous les tableaux de bord du gérant (rapports, réservations).
 * `accent` passe le chiffre en rouge, pour ce qu'on ne veut pas voir monter :
 * pertes, no-shows.
 */
export function Tuile({
  libelle,
  valeur,
  detail,
  accent,
}: {
  libelle: string;
  valeur: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div className={`${carte} flex flex-col gap-1`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{libelle}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-red-700' : 'text-stone-900'}`}>{valeur}</p>
      {detail && <p className="text-xs text-stone-500">{detail}</p>}
    </div>
  );
}
