-- AlterEnum
ALTER TYPE "DroitUtilisateur" ADD VALUE 'GERER_STOCK';

-- AlterTable
ALTER TABLE "produits" ADD COLUMN     "disponible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "quantiteRestante" INTEGER,
ADD COLUMN     "suiviQuantite" BOOLEAN NOT NULL DEFAULT false;
