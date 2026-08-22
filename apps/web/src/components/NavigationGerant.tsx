/**
 * Navigation de l'espace gérant.
 *
 * Neuf entrées mises côte à côte débordaient sur deux ou trois lignes, où
 * l'entrée active se perdait. Elles sont regroupées par intention plutôt que
 * par objet : ce que le gérant regarde chaque jour (« Suivi ») d'un côté, ce
 * qu'il règle une fois puis oublie (« Configuration ») de l'autre.
 *
 * Barre latérale dès qu'il y a la place, listes défilantes en dessous : sur
 * téléphone, une colonne fixe mangerait la moitié de l'écran.
 */
export interface OngletGerant {
  id: string;
  libelle: string;
  groupe: 'suivi' | 'configuration';
}

const TITRES: Record<OngletGerant['groupe'], string> = {
  suivi: 'Suivi',
  configuration: 'Configuration',
};

export function NavigationGerant({
  onglets,
  actif,
  onChoisir,
}: {
  onglets: readonly OngletGerant[];
  actif: string;
  onChoisir: (id: string) => void;
}) {
  const groupes = (['suivi', 'configuration'] as const)
    .map((groupe) => ({ groupe, entrees: onglets.filter((o) => o.groupe === groupe) }))
    .filter(({ entrees }) => entrees.length > 0);

  return (
    <nav className="flex flex-col gap-4 md:gap-5" aria-label="Sections de l'espace gérant">
      {groupes.map(({ groupe, entrees }) => (
        <div key={groupe} className="flex flex-col gap-1.5">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            {TITRES[groupe]}
          </h2>
          {/* Défilement horizontal sur mobile, empilement vertical dès md. */}
          <div className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
            {entrees.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onChoisir(o.id)}
                aria-current={actif === o.id ? 'page' : undefined}
                className={`flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-[colors,transform] active:scale-[0.98] md:w-full ${
                  actif === o.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'border border-line bg-card text-ink-soft hover:bg-surface md:border-transparent md:bg-transparent'
                }`}
              >
                {o.libelle}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
