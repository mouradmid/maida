// Classes Tailwind partagées pour garder un design cohérent partout.

// Classes construites uniquement sur les tokens de la charte (voir src/index.css) :
// aucune couleur en dur, tout passe par les utilitaires sémantiques.

export const champ =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25';

export const boutonPrimaire =
  'rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-[colors,transform] hover:bg-brand-hover active:bg-brand-active active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100';

export const boutonSecondaire =
  'rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-[colors,transform] hover:bg-surface active:bg-surface active:scale-[0.98]';

/* ------------------------------------------------------------------
   Cibles tactiles.

   La caisse se tient à une main, debout, en mouvement, parfois les
   doigts mouillés : sous 44 px (h-11) on rate sa cible, et rater sa
   cible en plein coup de feu, c'est une erreur de commande. Toutes les
   commandes tactiles du service passent donc par ces classes plutôt
   que par des tailles écrites à la main.
   ------------------------------------------------------------------ */

/** Bouton rond d'action rapide (− / + / ✕), 44 px. */
export const boutonRond =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold leading-none transition-[colors,transform] active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100';

/** Variante bordée, sur fond de carte (le cas courant : quantités). */
export const boutonRondBordure = `${boutonRond} border border-line bg-card text-ink-soft hover:bg-surface`;

/** Pastille de navigation ou de filtre, 44 px de haut. */
const chipBase =
  'flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-[colors,transform] active:scale-95';

export const chipActive = `${chipBase} bg-brand-600 text-white`;

export const chipInactive = `${chipBase} border border-line bg-card text-ink-soft hover:bg-surface`;

export const boutonDiscret = 'text-sm font-medium text-brand-700 transition-colors hover:text-brand-900';

export const carte = 'rounded-xl border border-line bg-card p-5 shadow-sm';

export const badgeNeutre =
  'inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-soft';

export const badgeBrand =
  'inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800';

export const badgeVert =
  'inline-flex items-center rounded-full bg-ok-bg px-2.5 py-0.5 text-xs font-medium text-ok';

export const messageErreur =
  'rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger';

export const messageSucces = 'rounded-lg border border-ok/25 bg-ok-bg px-3 py-2 text-sm text-ok';

// Formate un montant en dinars pour l'affichage : séparateur de milliers
// français et deux décimales maximum (ex. 12500.5 → « 12 500,5 DA »).
export function da(montant: number): string {
  return `${montant.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DA`;
}
