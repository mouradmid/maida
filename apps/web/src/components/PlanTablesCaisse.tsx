import type { TableCaisse } from '../lib/api';

// Mêmes dimensions que le plan de salle du gérant : les positions sont
// exprimées dans ce repère, on les convertit en pourcentages pour que le
// plan s'adapte à la largeur disponible.
const CANVAS_LARGEUR = 900;
const CANVAS_HAUTEUR = 500;

function pctX(valeur: number) {
  return `${(valeur / CANVAS_LARGEUR) * 100}%`;
}

function pctY(valeur: number) {
  return `${(valeur / CANVAS_HAUTEUR) * 100}%`;
}

export function PlanTablesCaisse({
  tables,
  tableId,
  onSelect,
}: {
  tables: TableCaisse[];
  tableId: string;
  onSelect: (tableId: string) => void;
}) {
  if (tables.length === 0) {
    return (
      <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-400">
        Aucune table active. Le gérant peut en ajouter dans le plan de salle.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-50"
        style={{
          aspectRatio: `${CANVAS_LARGEUR} / ${CANVAS_HAUTEUR}`,
          backgroundImage: 'radial-gradient(circle, #d6d3d1 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {tables.map((table) => {
          const selectionnee = table.id === tableId;
          return (
            <button
              key={table.id}
              type="button"
              onClick={() => onSelect(selectionnee ? '' : table.id)}
              className={`absolute flex flex-col items-center justify-center border-2 text-xs font-semibold transition-colors ${
                selectionnee
                  ? 'z-10 border-brand-700 bg-brand-600 text-white shadow-md'
                  : table.occupee
                    ? 'border-brand-300 bg-brand-100 text-brand-900 hover:bg-brand-200'
                    : 'border-stone-300 bg-white text-stone-700 hover:border-brand-400 hover:bg-brand-50'
              }`}
              style={{
                left: pctX(table.positionX),
                top: pctY(table.positionY),
                width: pctX(table.largeur),
                height: pctY(table.hauteur),
                borderRadius: table.forme === 'RONDE' ? '50%' : '10px',
              }}
              aria-pressed={selectionnee}
            >
              <span>{table.numero}</span>
              <span
                className={`hidden text-[10px] font-normal sm:block ${
                  selectionnee ? 'text-white/80' : 'text-stone-400'
                }`}
              >
                {table.nombreCouverts} couv.
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-stone-300 bg-white" /> libre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-brand-300 bg-brand-100" /> addition en cours
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-brand-700 bg-brand-600" /> sélectionnée
        </span>
      </div>
    </div>
  );
}
