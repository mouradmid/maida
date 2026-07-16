-- CreateEnum
CREATE TYPE "StatutJourneeCaisse" AS ENUM ('OUVERTE', 'CLOTUREE');

-- AlterEnum
ALTER TYPE "DroitUtilisateur" ADD VALUE 'CLOTURER';

-- AlterTable
ALTER TABLE "paiements" ADD COLUMN     "journeeCaisseId" TEXT;

-- CreateTable
CREATE TABLE "journees_caisse" (
    "id" TEXT NOT NULL,
    "statut" "StatutJourneeCaisse" NOT NULL DEFAULT 'OUVERTE',
    "fondDeCaisse" DECIMAL(10,2) NOT NULL,
    "ouverteLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clotureeLe" TIMESTAMP(3),
    "especesAttendues" DECIMAL(10,2),
    "especesComptees" DECIMAL(10,2),
    "ecart" DECIMAL(10,2),
    "commentaire" TEXT,
    "etablissementId" TEXT NOT NULL,
    "ouverteParId" TEXT NOT NULL,
    "clotureeParId" TEXT,
    "clotureDemandeeParId" TEXT,

    CONSTRAINT "journees_caisse_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_journeeCaisseId_fkey" FOREIGN KEY ("journeeCaisseId") REFERENCES "journees_caisse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journees_caisse" ADD CONSTRAINT "journees_caisse_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journees_caisse" ADD CONSTRAINT "journees_caisse_ouverteParId_fkey" FOREIGN KEY ("ouverteParId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journees_caisse" ADD CONSTRAINT "journees_caisse_clotureeParId_fkey" FOREIGN KEY ("clotureeParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journees_caisse" ADD CONSTRAINT "journees_caisse_clotureDemandeeParId_fkey" FOREIGN KEY ("clotureDemandeeParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
