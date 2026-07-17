-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "suiteParDefaut" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "commandes" ADD COLUMN     "suiteReclamee" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "lignes_commande" ADD COLUMN     "suite" INTEGER NOT NULL DEFAULT 1;
