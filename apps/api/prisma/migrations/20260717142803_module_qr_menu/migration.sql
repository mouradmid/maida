-- AlterEnum
ALTER TYPE "ModuleCompte" ADD VALUE 'QR_MENU';

-- AlterTable
ALTER TABLE "comptes_clients" ALTER COLUMN "modules" SET DEFAULT ARRAY['FOOD_COST', 'QR_MENU']::"ModuleCompte"[];
