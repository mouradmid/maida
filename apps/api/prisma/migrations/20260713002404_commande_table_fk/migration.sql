/*
  Warnings:

  - You are about to drop the column `numeroTable` on the `commandes` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "commandes" DROP COLUMN "numeroTable",
ADD COLUMN     "tableId" TEXT;

-- AddForeignKey
ALTER TABLE "commandes" ADD CONSTRAINT "commandes_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
