-- CreateEnum
CREATE TYPE "OccasionReservation" AS ENUM ('ANNIVERSAIRE', 'ROMANTIQUE', 'AFFAIRES', 'FAMILLE', 'FETE', 'AUTRE');

-- CreateEnum
CREATE TYPE "RestrictionAlimentaire" AS ENUM ('VEGETARIEN', 'VEGAN', 'SANS_GLUTEN', 'SANS_LACTOSE', 'ALLERGIE_ARACHIDES', 'ALLERGIE_FRUITS_A_COQUE', 'ALLERGIE_FRUITS_DE_MER');

-- AlterTable
ALTER TABLE "etablissements" ADD COLUMN     "horairesReservation" JSONB;

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "occasion" "OccasionReservation",
ADD COLUMN     "restrictions" "RestrictionAlimentaire"[] DEFAULT ARRAY[]::"RestrictionAlimentaire"[];
