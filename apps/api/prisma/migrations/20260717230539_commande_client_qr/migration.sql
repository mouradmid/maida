-- CreateEnum
CREATE TYPE "StatutDemandeClient" AS ENUM ('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE');

-- AlterTable
ALTER TABLE "etablissements" ADD COLUMN     "commandeClientActive" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "demandes_clients" (
    "id" TEXT NOT NULL,
    "statut" "StatutDemandeClient" NOT NULL DEFAULT 'EN_ATTENTE',
    "lignes" JSONB NOT NULL,
    "note" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tableId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "commandeId" TEXT,
    "traiteeParId" TEXT,
    "traiteeLe" TIMESTAMP(3),

    CONSTRAINT "demandes_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demandes_clients_commandeId_key" ON "demandes_clients"("commandeId");

-- AddForeignKey
ALTER TABLE "demandes_clients" ADD CONSTRAINT "demandes_clients_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_clients" ADD CONSTRAINT "demandes_clients_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_clients" ADD CONSTRAINT "demandes_clients_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commandes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_clients" ADD CONSTRAINT "demandes_clients_traiteeParId_fkey" FOREIGN KEY ("traiteeParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
