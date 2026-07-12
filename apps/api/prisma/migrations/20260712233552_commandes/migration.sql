-- CreateEnum
CREATE TYPE "CanalCommande" AS ENUM ('SUR_PLACE', 'EMPORTER');

-- CreateEnum
CREATE TYPE "StatutCommande" AS ENUM ('ENVOYEE', 'ANNULEE');

-- CreateTable
CREATE TABLE "commandes" (
    "id" TEXT NOT NULL,
    "canal" "CanalCommande" NOT NULL,
    "numeroTable" TEXT,
    "statut" "StatutCommande" NOT NULL DEFAULT 'ENVOYEE',
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "etablissementId" TEXT NOT NULL,
    "serveurId" TEXT NOT NULL,

    CONSTRAINT "commandes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_commande" (
    "id" TEXT NOT NULL,
    "nomProduit" TEXT NOT NULL,
    "prixUnitaire" DECIMAL(10,2) NOT NULL,
    "quantite" INTEGER NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commandeId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,

    CONSTRAINT "lignes_commande_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "commandes" ADD CONSTRAINT "commandes_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commandes" ADD CONSTRAINT "commandes_serveurId_fkey" FOREIGN KEY ("serveurId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_commande" ADD CONSTRAINT "lignes_commande_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commandes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_commande" ADD CONSTRAINT "lignes_commande_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
