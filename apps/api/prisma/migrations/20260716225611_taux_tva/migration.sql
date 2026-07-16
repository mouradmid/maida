-- AlterTable
ALTER TABLE "lignes_commande" ADD COLUMN     "tauxTva" INTEGER;

-- AlterTable
ALTER TABLE "produits" ADD COLUMN     "tauxTva" INTEGER NOT NULL DEFAULT 19;
