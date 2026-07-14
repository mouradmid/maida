// Seed initial : crée uniquement le compte super-admin (voir scripts/seed-demo.ts pour la démo).
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SEED_SUPER_ADMIN_EMAIL et SEED_SUPER_ADMIN_PASSWORD doivent être définis dans .env',
    );
  }

  const existant = await prisma.utilisateur.findUnique({ where: { email } });
  if (existant) {
    console.log(`Un utilisateur existe déjà avec l'email ${email}, rien à faire.`);
    return;
  }

  const motDePasseHash = await bcrypt.hash(password, 12);

  const superAdmin = await prisma.utilisateur.create({
    data: {
      role: 'SUPER_ADMIN',
      nom: 'Admin',
      prenom: 'Super',
      email,
      motDePasseHash,
    },
  });

  console.log(`Compte super-admin créé : ${superAdmin.email} (id: ${superAdmin.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
