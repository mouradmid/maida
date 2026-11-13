import type { OccasionReservation, RestrictionAlimentaire } from '../lib/api';
import { LIBELLES_OCCASION, LIBELLES_RESTRICTION } from '../lib/libelles';

/**
 * Occasion et restrictions alimentaires d'une réservation, en pastilles : la
 * salle repère l'anniversaire, la cuisine l'allergie, avant l'arrivée du client.
 * Les restrictions sont en rouge — une allergie ratée se paie autrement plus
 * cher qu'une bougie oubliée.
 */
export function BesoinsReservation({
  occasion,
  restrictions,
}: {
  occasion: OccasionReservation | null;
  restrictions: RestrictionAlimentaire[];
}) {
  if (!occasion && restrictions.length === 0) return null;
  return (
    <>
      {occasion && (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
          {LIBELLES_OCCASION[occasion].icone} {LIBELLES_OCCASION[occasion].texte}
        </span>
      )}
      {restrictions.map((r) => (
        <span
          key={r}
          className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800"
        >
          ⚠ {LIBELLES_RESTRICTION[r]}
        </span>
      ))}
    </>
  );
}
