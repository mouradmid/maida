import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Aligne le code d'installation de l'établissement de démonstration sur celui
// affiché par la page d'accueil du site vitrine.
//
// La migration qui a créé la colonne a donné un code aléatoire à chaque
// établissement existant, y compris à la démo : sans ce script, le code publié
// sur l'accueil ne rattacherait aucune tablette. Le seed de démo pose le même
// code, mais lui purge toutes les données — ici on ne touche qu'à ce champ.
//
// Sur la production : cd apps/api && railway run --service maida -- npx tsx scripts/code-terminal-demo.ts
const CODE_TERMINAL_DEMO = 'HYDRA268';

async function main() {
  const etablissement = await prisma.etablissement.findFirst({
    where: { nom: { contains: 'Bon Grill' } },
    select: { id: true, nom: true, codeTerminal: true },
  });
  if (!etablissement) throw new Error('Établissement de démonstration introuvable');

  if (etablissement.codeTerminal === CODE_TERMINAL_DEMO) {
    console.log(`${etablissement.nom} : code déjà à jour (${CODE_TERMINAL_DEMO}).`);
    return;
  }

  await prisma.etablissement.update({
    where: { id: etablissement.id },
    data: { codeTerminal: CODE_TERMINAL_DEMO },
  });
  console.log(`${etablissement.nom} : ${etablissement.codeTerminal} → ${CODE_TERMINAL_DEMO}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
