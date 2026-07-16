-- CreateEnum
CREATE TYPE "TypeCategorie" AS ENUM ('NOURRITURE', 'BOISSON');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "type" "TypeCategorie" NOT NULL DEFAULT 'NOURRITURE';

-- AlterTable
ALTER TABLE "lignes_commande" ADD COLUMN     "coutRevientUnitaire" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "produits" ADD COLUMN     "coutRevient" DECIMAL(10,2);
