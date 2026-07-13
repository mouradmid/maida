/*
  Warnings:

  - You are about to drop the column `note` on the `lignes_commande` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "commandes" ADD COLUMN     "noteCuisine" TEXT;

-- AlterTable
ALTER TABLE "lignes_commande" DROP COLUMN "note";
