-- AlterEnum
ALTER TYPE "ModePaiement" ADD VALUE 'CHEQUE';

-- AlterTable
ALTER TABLE "etablissements" ADD COLUMN     "moyensPaiementActifs" "ModePaiement"[] DEFAULT ARRAY['ESPECES', 'CARTE', 'CHEQUE', 'AUTRE']::"ModePaiement"[];
