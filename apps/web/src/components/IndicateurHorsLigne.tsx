import { useHorsLigne } from '../hooks/useHorsLigne';

// Petit avertissement discret ancré en bas de l'écran : rappelle en permanence
// à l'équipe qu'elle travaille hors connexion, même quand le bandeau d'en-tête
// a défilé hors de vue. N'apparaît que pendant une coupure réseau.
export function IndicateurHorsLigne() {
  const { horsLigne, enAttente } = useHorsLigne();

  if (!horsLigne) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-warn px-4 py-2 text-sm font-semibold text-white shadow-lg">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-white/90"
        />
        <span>
          Mode hors ligne
          {enAttente > 0 && (
            <span className="font-normal">
              {' '}
              — {enAttente} opération{enAttente > 1 ? 's' : ''} à synchroniser
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
