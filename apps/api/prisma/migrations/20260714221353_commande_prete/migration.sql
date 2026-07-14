-- AlterEnum
ALTER TYPE "StatutCommande" ADD VALUE 'PRETE';

-- AlterTable
ALTER TABLE "commandes" ADD COLUMN     "preteLe" TIMESTAMP(3);
