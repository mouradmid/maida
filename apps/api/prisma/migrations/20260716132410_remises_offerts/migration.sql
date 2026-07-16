-- CreateEnum
CREATE TYPE "TypeRemise" AS ENUM ('REMISE', 'OFFERT');

-- AlterEnum
ALTER TYPE "DroitUtilisateur" ADD VALUE 'REMISER';

-- AlterTable
ALTER TABLE "lignes_commande" ADD COLUMN     "quantiteOfferte" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "remises" (
    "id" TEXT NOT NULL,
    "type" "TypeRemise" NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "pourcentage" INTEGER,
    "quantite" INTEGER,
    "motif" TEXT NOT NULL,
    "commentaire" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "etablissementId" TEXT NOT NULL,
    "additionId" TEXT NOT NULL,
    "ligneCommandeId" TEXT,
    "accordeeParId" TEXT NOT NULL,
    "demandeeParId" TEXT,

    CONSTRAINT "remises_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "remises" ADD CONSTRAINT "remises_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remises" ADD CONSTRAINT "remises_additionId_fkey" FOREIGN KEY ("additionId") REFERENCES "additions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remises" ADD CONSTRAINT "remises_ligneCommandeId_fkey" FOREIGN KEY ("ligneCommandeId") REFERENCES "lignes_commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remises" ADD CONSTRAINT "remises_accordeeParId_fkey" FOREIGN KEY ("accordeeParId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remises" ADD CONSTRAINT "remises_demandeeParId_fkey" FOREIGN KEY ("demandeeParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
