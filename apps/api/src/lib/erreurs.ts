import type { Prisma } from '../generated/prisma/client';

/**
 * Refus métier levé au milieu d'une transaction (addition soldée entre-temps,
 * quantité déjà payée par une autre caisse…). La transaction est annulée, et
 * le filet d'erreurs de l'application répond avec ce statut et ce message au
 * lieu d'un 500.
 */
export class ErreurMetier extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Verrouille une addition jusqu'à la fin de la transaction.
 *
 * Deux tablettes peuvent agir sur la même table au même instant — un paiement
 * pendant qu'un collègue offre un dessert, ou une file hors ligne qui se
 * resynchronise. Sans verrou, chacune lit le même solde et l'addition finit
 * payée deux fois. Avec lui, la seconde attend que la première ait fini, puis
 * relit l'état à jour : toute vérification de solde ou de quantité doit donc se
 * faire APRÈS cet appel, dans la même transaction.
 */
export async function verrouillerAddition(tx: Prisma.TransactionClient, additionId: string) {
  await tx.$queryRaw`SELECT id FROM additions WHERE id = ${additionId} FOR UPDATE`;
}

/** Même garde pour ce qui se décide à l'échelle d'un établissement entier. */
export async function verrouillerEtablissement(tx: Prisma.TransactionClient, etablissementId: string) {
  await tx.$queryRaw`SELECT id FROM etablissements WHERE id = ${etablissementId} FOR UPDATE`;
}
