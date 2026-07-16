-- CreateEnum
CREATE TYPE "ModuleCompte" AS ENUM ('FOOD_COST');

-- AlterTable
ALTER TABLE "comptes_clients" ADD COLUMN     "modules" "ModuleCompte"[] DEFAULT ARRAY['FOOD_COST']::"ModuleCompte"[];

-- AlterTable
ALTER TABLE "etablissements" ADD COLUMN     "suiviCoutsActive" BOOLEAN NOT NULL DEFAULT true;
