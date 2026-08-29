import bcrypt from 'bcryptjs';
import type { DroitUtilisateur } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';

// Helpers transverses de l'espace caisse : contexte du serveur connecté,
// validation des gestes sensibles et accès à la journée de caisse ouverte.

export const arrondi = (n: number) => Math.round(n * 100) / 100;

// Clé d'idempotence d'une action prise hors ligne : rejouer la même clé ne doit
// jamais créer un doublon. Renvoie la clé nettoyée, `undefined` si absente, ou
// `false` si la valeur reçue est inexploitable.
export function lireCleIdempotence(valeur: unknown): string | undefined | false {
  if (valeur === undefined) return undefined;
  if (typeof valeur !== 'string' || !valeur.trim() || valeur.length > 100) return false;
  return valeur.trim();
}

// Heure réelle de l'action quand elle a été enregistrée hors ligne : la
// cuisine, la caisse et les rapports gardent la bonne chronologie après
// resynchronisation. Bornée (+5 min / −48 h) pour qu'une tablette à l'heure
// fausse ne puisse pas antidater indéfiniment.
export function lireDateHorsLigne(valeur: unknown): Date | undefined | false {
  if (valeur === undefined) return undefined;
  const date = typeof valeur === 'string' ? new Date(valeur) : null;
  const maintenant = Date.now();
  if (
    !date ||
    Number.isNaN(date.getTime()) ||
    date.getTime() > maintenant + 5 * 60_000 ||
    date.getTime() < maintenant - 48 * 60 * 60_000
  ) {
    return false;
  }
  return date;
}

export async function getContexteServeur(serveurId: string) {
  const serveur = await prisma.utilisateur.findUnique({ where: { id: serveurId } });
  if (!serveur?.etablissementId) {
    throw new Error('Serveur sans établissement associé');
  }
  return { etablissementId: serveur.etablissementId };
}

// Contexte + vérification d'un droit du serveur (sans validation par code
// gérant) : pour les gestes fréquents et peu sensibles comme la gestion du stock.
export async function getContexteAvecDroit(serveurId: string, droit: DroitUtilisateur) {
  const serveur = await prisma.utilisateur.findUnique({ where: { id: serveurId } });
  if (!serveur?.etablissementId) {
    throw new Error('Serveur sans établissement associé');
  }
  return { etablissementId: serveur.etablissementId, aLeDroit: serveur.droits.includes(droit) };
}

// Action sensible : soit le serveur a le droit requis, soit un gérant de
// l'établissement valide avec son code PIN et porte la responsabilité.
export async function resoudreResponsable(options: {
  serveurId: string;
  etablissementId: string;
  droit: DroitUtilisateur;
  codeGerant: unknown;
  messageDroitManquant: string;
}): Promise<
  | { ok: true; responsableId: string; demandeeParId: string | null }
  | { ok: false; status: number; body: { error: string; codeGerantRequis?: boolean } }
> {
  const serveur = await prisma.utilisateur.findUnique({ where: { id: options.serveurId } });
  if (!serveur) {
    return { ok: false, status: 401, body: { error: 'Non authentifié' } };
  }
  if (serveur.droits.includes(options.droit)) {
    return { ok: true, responsableId: serveur.id, demandeeParId: null };
  }
  if (typeof options.codeGerant !== 'string' || !options.codeGerant) {
    return {
      ok: false,
      status: 403,
      body: { error: options.messageDroitManquant, codeGerantRequis: true },
    };
  }
  const gerants = await prisma.utilisateur.findMany({
    where: {
      etablissementId: options.etablissementId,
      role: 'GERANT',
      statut: 'ACTIF',
      codePinHash: { not: null },
    },
  });
  for (const gerant of gerants) {
    if (gerant.codePinHash && (await bcrypt.compare(options.codeGerant, gerant.codePinHash))) {
      return { ok: true, responsableId: gerant.id, demandeeParId: serveur.id };
    }
  }
  return { ok: false, status: 403, body: { error: 'Code gérant invalide', codeGerantRequis: true } };
}

// La journée ouverte porte les paiements : l'encaissement la réclame, la
// clôture la solde.
export function getJourneeOuverte(etablissementId: string) {
  return prisma.journeeCaisse.findFirst({
    where: { etablissementId, statut: 'OUVERTE' },
    orderBy: { ouverteLe: 'desc' },
  });
}
