-- CreateEnum
CREATE TYPE "DroitUtilisateur" AS ENUM ('ANNULER');

-- AlterTable
ALTER TABLE "lignes_commande" ADD COLUMN     "quantiteAnnulee" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "utilisateurs" ADD COLUMN     "droits" "DroitUtilisateur"[] DEFAULT ARRAY[]::"DroitUtilisateur"[];

-- CreateTable
CREATE TABLE "annulations" (
    "id" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "commentaire" TEXT,
    "quantite" INTEGER NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "apresPreparation" BOOLEAN NOT NULL DEFAULT false,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "etablissementId" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "ligneCommandeId" TEXT,
    "annuleeParId" TEXT NOT NULL,
    "demandeeParId" TEXT,

    CONSTRAINT "annulations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "annulations" ADD CONSTRAINT "annulations_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annulations" ADD CONSTRAINT "annulations_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commandes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annulations" ADD CONSTRAINT "annulations_ligneCommandeId_fkey" FOREIGN KEY ("ligneCommandeId") REFERENCES "lignes_commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annulations" ADD CONSTRAINT "annulations_annuleeParId_fkey" FOREIGN KEY ("annuleeParId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annulations" ADD CONSTRAINT "annulations_demandeeParId_fkey" FOREIGN KEY ("demandeeParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
