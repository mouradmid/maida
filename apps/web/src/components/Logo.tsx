export function Logo({ grand = false }: { grand?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex items-center justify-center rounded-xl bg-brand-logo font-display font-bold text-white ring-1 ring-inset ring-gold/50 ${
          grand ? 'h-14 w-14 text-3xl' : 'h-9 w-9 text-lg'
        }`}
      >
        M
      </span>
      <span
        className={`font-display font-semibold tracking-tight text-ink ${grand ? 'text-4xl' : 'text-xl'}`}
      >
        Maïda
      </span>
    </div>
  );
}
