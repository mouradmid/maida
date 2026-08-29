import { chipActive, chipInactive } from '../lib/ui';

/**
 * Bascule entre les restaurants d'une même enseigne.
 *
 * N'apparaît que si le compte en tient plusieurs : pour l'immense majorité des
 * clients — un seul restaurant — l'écran reste exactement comme avant.
 */
export function SelecteurEtablissement({
  etablissements,
  actuelId,
  enCours,
  onChoisir,
}: {
  etablissements: Array<{ id: string; nom: string; ville: string | null }>;
  actuelId: string;
  enCours: boolean;
  onChoisir: (id: string) => void;
}) {
  if (etablissements.length < 2) return null;

  return (
    <section className="flex flex-col gap-1.5" aria-label="Restaurant affiché">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        Restaurant
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
        {etablissements.map((e) => (
          <button
            key={e.id}
            type="button"
            disabled={enCours || e.id === actuelId}
            onClick={() => onChoisir(e.id)}
            aria-current={e.id === actuelId ? 'true' : undefined}
            className={`${e.id === actuelId ? chipActive : chipInactive} shrink-0 justify-start whitespace-nowrap md:w-full`}
          >
            {e.nom}
            {e.ville && <span className="ml-1.5 text-xs opacity-70">{e.ville}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
