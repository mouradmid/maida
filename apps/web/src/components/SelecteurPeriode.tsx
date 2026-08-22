import { PERIODES, type Periode } from '../lib/periode';
import { champ } from '../lib/ui';

// Barre de sélection de période (pastilles + dates libres), partagée par les
// écrans Rapports et Journées du gérant.
export function SelecteurPeriode({
  periode,
  onPeriode,
  persoDebut,
  onPersoDebut,
  persoFin,
  onPersoFin,
}: {
  periode: Periode;
  onPeriode: (p: Periode) => void;
  persoDebut: string;
  onPersoDebut: (v: string) => void;
  persoFin: string;
  onPersoFin: (v: string) => void;
}) {
  return (
    <>
      {PERIODES.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPeriode(p.id)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            periode === p.id
              ? 'bg-brand-600 text-white'
              : 'bg-card text-stone-600 border border-stone-300 hover:bg-stone-50'
          }`}
        >
          {p.libelle}
        </button>
      ))}
      {periode === 'perso' && (
        <span className="flex items-center gap-2">
          <input
            type="date"
            value={persoDebut}
            onChange={(e) => onPersoDebut(e.target.value)}
            className={`${champ} w-auto`}
          />
          <span className="text-sm text-stone-400">→</span>
          <input
            type="date"
            value={persoFin}
            onChange={(e) => onPersoFin(e.target.value)}
            className={`${champ} w-auto`}
          />
        </span>
      )}
    </>
  );
}
