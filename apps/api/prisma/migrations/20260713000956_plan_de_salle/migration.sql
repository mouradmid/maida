-- CreateEnum
CREATE TYPE "FormeTable" AS ENUM ('RONDE', 'CARREE', 'RECTANGULAIRE');

-- CreateEnum
CREATE TYPE "StatutTable" AS ENUM ('ACTIF', 'INACTIF');

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "forme" "FormeTable" NOT NULL DEFAULT 'CARREE',
    "nombreCouverts" INTEGER NOT NULL,
    "largeur" INTEGER NOT NULL DEFAULT 80,
    "hauteur" INTEGER NOT NULL DEFAULT 80,
    "positionX" INTEGER NOT NULL DEFAULT 20,
    "positionY" INTEGER NOT NULL DEFAULT 20,
    "statut" "StatutTable" NOT NULL DEFAULT 'ACTIF',
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "etablissementId" TEXT NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tables_etablissementId_numero_key" ON "tables"("etablissementId", "numero");

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
