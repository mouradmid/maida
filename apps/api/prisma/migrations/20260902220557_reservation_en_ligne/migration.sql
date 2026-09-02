-- DropForeignKey
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_priseParId_fkey";

-- AlterTable
ALTER TABLE "etablissements" ADD COLUMN     "reservationCouvertsMax" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "reservationDelaiMinMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "reservationEnLigneActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reservationHorizonJours" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "reservations" ALTER COLUMN "priseParId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_priseParId_fkey" FOREIGN KEY ("priseParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
