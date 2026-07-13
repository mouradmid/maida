-- CreateTable
CREATE TABLE "groupes_options" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "obligatoire" BOOLEAN NOT NULL DEFAULT false,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "produitId" TEXT NOT NULL,

    CONSTRAINT "groupes_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "options_valeurs" (
    "id" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupeOptionId" TEXT NOT NULL,

    CONSTRAINT "options_valeurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_commande_options" (
    "id" TEXT NOT NULL,
    "nomGroupe" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ligneCommandeId" TEXT NOT NULL,
    "optionValeurId" TEXT,

    CONSTRAINT "lignes_commande_options_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "groupes_options" ADD CONSTRAINT "groupes_options_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "options_valeurs" ADD CONSTRAINT "options_valeurs_groupeOptionId_fkey" FOREIGN KEY ("groupeOptionId") REFERENCES "groupes_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_commande_options" ADD CONSTRAINT "lignes_commande_options_ligneCommandeId_fkey" FOREIGN KEY ("ligneCommandeId") REFERENCES "lignes_commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_commande_options" ADD CONSTRAINT "lignes_commande_options_optionValeurId_fkey" FOREIGN KEY ("optionValeurId") REFERENCES "options_valeurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
