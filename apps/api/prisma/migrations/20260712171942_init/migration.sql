-- CreateEnum
CREATE TYPE "StatutCompteClient" AS ENUM ('ACTIF', 'SUSPENDU');

-- CreateEnum
CREATE TYPE "StatutEtablissement" AS ENUM ('ACTIF', 'INACTIF');

-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('SUPER_ADMIN', 'GERANT', 'SERVEUR');

-- CreateEnum
CREATE TYPE "StatutUtilisateur" AS ENUM ('ACTIF', 'DESACTIVE');

-- CreateTable
CREATE TABLE "comptes_clients" (
    "id" TEXT NOT NULL,
    "nomEnseigne" TEXT NOT NULL,
    "statut" "StatutCompteClient" NOT NULL DEFAULT 'ACTIF',
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comptes_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etablissements" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "adresse" TEXT,
    "ville" TEXT,
    "statut" "StatutEtablissement" NOT NULL DEFAULT 'ACTIF',
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compteClientId" TEXT NOT NULL,

    CONSTRAINT "etablissements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateurs" (
    "id" TEXT NOT NULL,
    "role" "RoleUtilisateur" NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT,
    "motDePasseHash" TEXT,
    "codePinHash" TEXT,
    "statut" "StatutUtilisateur" NOT NULL DEFAULT 'ACTIF',
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,
    "compteClientId" TEXT,
    "etablissementId" TEXT,

    CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_email_key" ON "utilisateurs"("email");

-- AddForeignKey
ALTER TABLE "etablissements" ADD CONSTRAINT "etablissements_compteClientId_fkey" FOREIGN KEY ("compteClientId") REFERENCES "comptes_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_compteClientId_fkey" FOREIGN KEY ("compteClientId") REFERENCES "comptes_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "etablissements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
