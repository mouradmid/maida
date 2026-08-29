-- Journal des e-mails envoyés par Maïda (mot de passe oublié, confirmation de
-- réservation). Sans relation, comme le journal des connexions : il doit
-- survivre à la suppression de ce qu'il décrit.
CREATE TYPE "TypeEmail" AS ENUM ('MOT_DE_PASSE_OUBLIE', 'CONFIRMATION_RESERVATION');
CREATE TYPE "ResultatEmail" AS ENUM ('ENVOYE', 'ECHEC', 'NON_CONFIGURE');

CREATE TABLE "emails_envoyes" (
    "id" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "TypeEmail" NOT NULL,
    "resultat" "ResultatEmail" NOT NULL,
    "destinataire" TEXT NOT NULL,
    "sujet" TEXT NOT NULL,
    "erreur" TEXT,
    "etablissementId" TEXT,
    "etablissement" TEXT,

    CONSTRAINT "emails_envoyes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "emails_envoyes_creeLe_idx" ON "emails_envoyes"("creeLe");
