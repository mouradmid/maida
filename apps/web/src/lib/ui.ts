// Classes Tailwind partagées pour garder un design cohérent partout.

export const champ =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

export const boutonPrimaire =
  'rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50';

export const boutonSecondaire =
  'rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 active:bg-stone-100';

export const boutonDiscret = 'text-sm font-medium text-brand-700 transition-colors hover:text-brand-900';

export const carte = 'rounded-xl border border-stone-200 bg-white p-5 shadow-sm';

export const badgeNeutre =
  'inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600';

export const badgeBrand =
  'inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800';

export const badgeVert =
  'inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800';

export const messageErreur = 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700';

export const messageSucces =
  'rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800';

// Formate un montant en dinars pour l'affichage : séparateur de milliers
// français et deux décimales maximum (ex. 12500.5 → « 12 500,5 DA »).
export function da(montant: number): string {
  return `${montant.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DA`;
}
