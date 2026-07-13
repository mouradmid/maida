/*
  Warnings:

  - You are about to drop the column `tableId` on the `commandes` table. All the data in the column will be lost.
  - Added the required column `additionId` to the `commandes` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StatutAddition" AS ENUM ('OUVERTE', 'PAYEE');

-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('ESPECES', 'CARTE', 'AUTRE');

-- DropForeignKey
ALTER TABLE "commandes" DROP CONSTRAINT "commandes_tableId_fkey";

-- AlterTable
ALTER TABLE "commandes" DROP COLUMN "tableId",
ADD COLUMN     "additionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "lignes_commande" ADD COLUMN     "quantitePayee" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "additions" (
    "id" TEXT NOT NULL,
    "statut" "StatutAddition" NOT NULL DEFAULT 'OUVERTE',
    "ouverteLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fermeeLe" TIMESTAMP(3),
    "etablissementId" TEXT NOT NULL,
    "tableId" TEXT,

    CONSTRAINT "additions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements" (
    "id" TEXT NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "moyenPaiement" "ModePaiement" NOT NULL,
    "montantRecu" DECIMAL(10,2),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "additionId" TEXT NOT NULL,

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements_lignes" (
    "id" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "paiementId" TEXT NOT NULL,
    "ligneCommandeId" TEXT NOT NULL,

    CONSTRAINT "paiements_lignes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "commandes" ADD CONSTRAINT "commandes_additionId_fkey" FOREIGN KEY ("additionId") REFERENCES "additions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additions" ADD CONSTRAINT "additions_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additions" ADD CONSTRAINT "additions_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_additionId_fkey" FOREIGN KEY ("additionId") REFERENCES "additions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements_lignes" ADD CONSTRAINT "paiements_lignes_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements_lignes" ADD CONSTRAINT "paiements_lignes_ligneCommandeId_fkey" FOREIGN KEY ("ligneCommandeId") REFERENCES "lignes_commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
