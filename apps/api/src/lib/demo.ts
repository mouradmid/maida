// Frontière entre la vitrine et les vrais clients.
//
// La base de production héberge à la fois la démonstration publique (dont les
// identifiants sont affichés sur la page d'accueil) et, à terme, de vrais
// restaurants. Le seed de démo reconstruit la vitrine de zéro : il doit donc
// pouvoir tout effacer d'un côté de cette frontière, et rien de l'autre.
//
// La frontière est portée par la donnée elle-même (`CompteClient.demo`), pas
// par une correspondance de nom dans un script : renommer « Le Bon Grill » ne
// doit pas transformer la vitrine en client, ni l'inverse.

import type { PrismaClient } from '../generated/prisma/client';

// Enseignes reconstruites par scripts/seed-demo.ts.
export const ENSEIGNES_DEMO = ['Le Bon Grill', 'La Palmeraie'] as const;

/**
 * Comptes clients qui ne sont PAS de la démonstration. Tant que cette liste est
 * vide, la purge du seed ne peut rien détruire d'irremplaçable ; dès qu'elle ne
 * l'est plus, le seed doit s'arrêter et demander confirmation.
 */
export async function comptesReels(prisma: PrismaClient) {
  return prisma.compteClient.findMany({
    where: { demo: false },
    select: { id: true, nomEnseigne: true, statut: true },
    orderBy: { creeLe: 'asc' },
  });
}

/**
 * Efface les données d'exploitation des comptes de démonstration : commandes,
 * additions, paiements, journées, réservations, et le menu lui-même (le seed
 * le reconstruit ensuite).
 *
 * Les comptes, établissements et utilisateurs survivent — le seed remet
 * seulement leurs identifiants à jour.
 *
 * L'ordre suit les dépendances entre tables : une ligne de commande ne peut
 * pas partir avant les annulations et les remises qui la référencent.
 */
export async function purgerDonneesDemo(prisma: PrismaClient): Promise<number> {
  const comptes = await prisma.compteClient.findMany({
    where: { demo: true },
    select: { id: true },
  });
  const idsDemo = comptes.map((c) => c.id);
  if (idsDemo.length === 0) return 0;

  const filtreEtab = { etablissement: { compteClientId: { in: idsDemo } } };

  await prisma.paiementLigne.deleteMany({ where: { paiement: { addition: filtreEtab } } });
  await prisma.paiement.deleteMany({ where: { addition: filtreEtab } });
  await prisma.annulation.deleteMany({ where: filtreEtab });
  await prisma.remise.deleteMany({ where: filtreEtab });
  await prisma.reservation.deleteMany({ where: filtreEtab });
  await prisma.demandeClient.deleteMany({ where: filtreEtab });
  await prisma.ligneCommandeOption.deleteMany({
    where: { ligneCommande: { commande: filtreEtab } },
  });
  await prisma.ligneCommande.deleteMany({ where: { commande: filtreEtab } });
  await prisma.commande.deleteMany({ where: filtreEtab });
  await prisma.addition.deleteMany({ where: filtreEtab });
  await prisma.journeeCaisse.deleteMany({ where: filtreEtab });
  await prisma.optionValeur.deleteMany({ where: { groupeOption: { produit: filtreEtab } } });
  await prisma.groupeOption.deleteMany({ where: { produit: filtreEtab } });
  await prisma.produit.deleteMany({ where: filtreEtab });
  await prisma.categorie.deleteMany({ where: filtreEtab });
  await prisma.table.deleteMany({ where: filtreEtab });

  return idsDemo.length;
}
