-- AlterTable
ALTER TABLE "etablissements" ADD COLUMN     "lienPublic" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "etablissements_lienPublic_key" ON "etablissements"("lienPublic");
