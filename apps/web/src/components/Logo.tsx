// Logo Maïda. En grand : le lockup complet (emblème + « Maïda » + arabe +
// « point de vente »). En petit : l'emblème seul suivi du mot, pour les en-têtes.
export function Logo({ grand = false }: { grand?: boolean }) {
  if (grand) {
    return (
      <img
        src="/maida-logo.svg"
        alt="Maïda — point de vente"
        className="h-36 w-auto select-none"
        draggable={false}
      />
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/maida-emblem.svg"
        alt=""
        aria-hidden
        className="h-9 w-9 select-none"
        draggable={false}
      />
      <span className="font-display text-xl font-semibold tracking-tight text-ink">Maïda</span>
    </div>
  );
}
