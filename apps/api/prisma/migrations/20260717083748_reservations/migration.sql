-- CreateEnum
CREATE TYPE "StatutReservation" AS ENUM ('A_VENIR', 'ARRIVEE', 'ANNULEE', 'NO_SHOW');

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "nomClient" TEXT NOT NULL,
    "telephone" TEXT,
    "nombreCouverts" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dureeMinutes" INTEGER NOT NULL DEFAULT 120,
    "note" TEXT,
    "statut" "StatutReservation" NOT NULL DEFAULT 'A_VENIR',
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tableId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "priseParId" TEXT NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_priseParId_fkey" FOREIGN KEY ("priseParId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
