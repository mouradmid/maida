// Logo Maïda. L'emblème (médaillon zellige) reste une image SVG ; les textes du
// lockup sont composés en HTML pour bénéficier des vraies polices de la marque
// (Marcellus pour « Maïda », Aref Ruqaa pour l'arabe, Jost pour la mention) —
// une police de page ne s'applique pas au texte d'un SVG chargé via <img>.
export function Logo({ grand = false }: { grand?: boolean }) {
  if (grand) {
    return (
      <div className="flex flex-col items-center gap-2" aria-label="Maïda — point de vente">
        <img
          src="/maida-emblem.svg"
          alt=""
          aria-hidden
          className="h-24 w-24 select-none"
          draggable={false}
        />
        <div className="flex flex-col items-center gap-1">
          <span className="font-marcellus text-4xl leading-none tracking-wide text-[#201a10]">
            Maïda
          </span>
          <span className="font-arabe text-lg leading-none text-brand-logo" dir="rtl">
            مائدة
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="h-px w-6 bg-gold" aria-hidden />
            <span className="font-jost text-[11px] tracking-[0.28em] text-[#7e7148]">
              POINT DE VENTE
            </span>
            <span className="h-px w-6 bg-gold" aria-hidden />
          </span>
        </div>
      </div>
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
      <span className="font-marcellus text-xl tracking-wide text-ink">Maïda</span>
    </div>
  );
}
