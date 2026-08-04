-- Récupération de mot de passe pour les gérants.

-- 1. Coupure des sessions ouvertes après un changement de mot de passe.
--
-- Les jetons d'authentification sont signés et jamais stockés : sans ce repère,
-- une session volée survivrait jusqu'à huit heures au changement de mot de
-- passe, ce qui viderait la réinitialisation de son sens.
ALTER TABLE "utilisateurs" ADD COLUMN "sessionsInvalidesAvant" TIMESTAMP(3);

-- 2. Trace des réinitialisations dans le journal des connexions.
ALTER TYPE "TypeConnexion" ADD VALUE 'REINITIALISATION';

-- 3. Jetons de réinitialisation : usage unique, une heure de validité.
CREATE TABLE "jetons_reinitialisation" (
  "id"            TEXT NOT NULL,
  "jeton"         TEXT NOT NULL,
  "utilisateurId" TEXT NOT NULL,
  "creeLe"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expireLe"      TIMESTAMP(3) NOT NULL,
  "utiliseLe"     TIMESTAMP(3),
  "ip"            TEXT,
  CONSTRAINT "jetons_reinitialisation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "jetons_reinitialisation_jeton_key" ON "jetons_reinitialisation"("jeton");
CREATE INDEX "jetons_reinitialisation_utilisateurId_idx" ON "jetons_reinitialisation"("utilisateurId");

ALTER TABLE "jetons_reinitialisation"
  ADD CONSTRAINT "jetons_reinitialisation_utilisateurId_fkey"
  FOREIGN KEY ("utilisateurId") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
