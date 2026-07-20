// Motif zellige (étoile à huit branches) en filigrane safran : fond décoratif
// discret de toute l'application. Posé une seule fois à la racine (App.tsx) en
// position fixe, il habille chaque écran derrière le contenu et reste en place
// au défilement. La couleur vient du token --saffron (aucune couleur en dur).
export function MotifZellige() {
  return (
    <svg className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-10" aria-hidden="true">
      <defs>
        <pattern id="zellige" width="50" height="50" patternUnits="userSpaceOnUse">
          <path
            d="M25 2l6 9 11-3-3 11 9 6-9 6 3 11-11-3-6 9-6-9-11 3 3-11-9-6 9-6-3-11 11 3z"
            fill="none"
            stroke="var(--saffron)"
            strokeWidth="1.2"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#zellige)" />
    </svg>
  );
}
