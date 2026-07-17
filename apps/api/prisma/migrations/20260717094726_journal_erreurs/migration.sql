-- CreateTable
CREATE TABLE "erreurs_serveur" (
    "id" TEXT NOT NULL,
    "methode" TEXT NOT NULL,
    "chemin" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erreurs_serveur_pkey" PRIMARY KEY ("id")
);
