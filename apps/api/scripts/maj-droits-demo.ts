// Applique les identifiants/droits de démo sans toucher aux données
// (PIN gérant 9999, droit ANNULER pour Sofiane).
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';

async function main() {
  const gerant = await prisma.utilisateur.findFirst({ where: { role: 'GERANT' } });
  const serveurs = await prisma.utilisateur.findMany({
    where: { role: 'SERVEUR', statut: 'ACTIF' },
    orderBy: { creeLe: 'asc' },
  });
  if (!gerant || serveurs.length < 2) throw new Error('Utilisateurs de démo introuvables');

  await prisma.utilisateur.update({
    where: { id: gerant.id },
    data: { codePinHash: await bcrypt.hash('9999', 12) },
  });
  await prisma.utilisateur.update({
    where: { id: serveurs[0].id },
    data: { droits: ['ANNULER'] },
  });
  await prisma.utilisateur.update({
    where: { id: serveurs[1].id },
    data: { droits: [] },
  });
  console.log(
    `PIN gérant 9999 posé. ${serveurs[0].prenom} → droit ANNULER, ${serveurs[1].prenom} → aucun droit.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
