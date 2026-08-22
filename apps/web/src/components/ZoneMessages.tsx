import { useEffect, type ReactNode } from 'react';
import { useHorsLigne } from '../hooks/useHorsLigne';

/** Une confirmation sans action à proposer s'efface seule au bout de ce délai. */
const DELAI_EFFACEMENT_MS = 6000;

/**
 * Messages du service, ancrés en bas de l'écran plutôt qu'en haut de page.
 *
 * En plein service, le serveur travaille le regard sur la grille du menu et le
 * pouce en bas de la tablette : une erreur affichée tout en haut de la page,
 * hors de l'écran dès qu'on a fait défiler, n'est jamais lue. Ici elle arrive
 * dans le champ de vision et sous le pouce.
 *
 * Ce qui s'efface seul et ce qui reste :
 *  - une erreur ne part JAMAIS toute seule — elle demande une décision ;
 *  - une confirmation assortie d'une action (imprimer le bon) reste aussi :
 *    le serveur peut vouloir imprimer quelques secondes plus tard ;
 *  - une simple confirmation s'efface au bout de quelques secondes.
 */
export function ZoneMessages({
  erreur,
  confirmation,
  action,
  onFermerErreur,
  onFermerConfirmation,
}: {
  erreur: string | null;
  confirmation: string | null;
  action?: ReactNode;
  onFermerErreur: () => void;
  onFermerConfirmation: () => void;
}) {
  const { horsLigne } = useHorsLigne();
  const confirmationEphemere = Boolean(confirmation) && !action;

  useEffect(() => {
    if (!confirmationEphemere) return;
    const minuterie = setTimeout(onFermerConfirmation, DELAI_EFFACEMENT_MS);
    return () => clearTimeout(minuterie);
    // `confirmation` en dépendance : chaque nouveau message relance le compte à
    // rebours au lieu d'hériter de celui du message précédent.
  }, [confirmation, confirmationEphemere, onFermerConfirmation]);

  if (!erreur && !confirmation) return null;

  return (
    <div
      // Laisse la place à la pastille « Mode hors ligne », qui occupe déjà le
      // bas de l'écran pendant une coupure.
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 ${
        horsLigne
          ? 'pb-[max(4rem,env(safe-area-inset-bottom))]'
          : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'
      }`}
      role="status"
      aria-live="polite"
    >
      {erreur && <MessageFlottant ton="erreur" texte={erreur} onFermer={onFermerErreur} />}
      {confirmation && (
        <MessageFlottant ton="succes" texte={confirmation} onFermer={onFermerConfirmation}>
          {action}
        </MessageFlottant>
      )}
    </div>
  );
}

function MessageFlottant({
  ton,
  texte,
  onFermer,
  children,
}: {
  ton: 'erreur' | 'succes';
  texte: string;
  onFermer: () => void;
  children?: ReactNode;
}) {
  const erreur = ton === 'erreur';
  return (
    <div
      className={`pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
        erreur ? 'border-danger/30 bg-danger-bg text-danger' : 'border-ok/30 bg-ok-bg text-ok'
      }`}
    >
      <span className="min-w-0 flex-1">{texte}</span>
      {children}
      <button
        type="button"
        onClick={onFermer}
        aria-label="Masquer ce message"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg leading-none transition-[colors,transform] active:scale-90 ${
          erreur ? 'hover:bg-danger/10' : 'hover:bg-ok/10'
        }`}
      >
        ✕
      </button>
    </div>
  );
}
