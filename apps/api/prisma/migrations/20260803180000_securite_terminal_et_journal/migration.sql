-- Palier 1 de sécurité des accès.

-- 1. Code de rattachement du terminal.
--
-- La liste des établissements était servie publiquement pour que la tablette
-- puisse choisir le sien : elle exposait le portefeuille client de Maïda et
-- donnait à un attaquant la cible dont il avait besoin pour s'acharner sur un
-- code PIN. La tablette se rattache désormais une fois avec ce code.
ALTER TABLE "etablissements" ADD COLUMN "codeTerminal" TEXT;

-- Les établissements existants reçoivent un code aléatoire. L'hexadécimal ne
-- contient ni O ni I : aucune confusion possible à la lecture avec 0 et 1.
UPDATE "etablissements"
SET "codeTerminal" = upper(substr(md5(random()::text || id), 1, 8))
WHERE "codeTerminal" IS NULL;

ALTER TABLE "etablissements" ALTER COLUMN "codeTerminal" SET NOT NULL;
CREATE UNIQUE INDEX "etablissements_codeTerminal_key" ON "etablissements"("codeTerminal");

-- 2. Journal des connexions.
CREATE TYPE "TypeConnexion" AS ENUM ('MOT_DE_PASSE', 'PIN');
CREATE TYPE "ResultatConnexion" AS ENUM (
  'REUSSIE',
  'IDENTIFIANTS_INVALIDES',
  'COMPTE_SUSPENDU',
  'TROP_DE_TENTATIVES'
);

CREATE TABLE "connexions_journal" (
  "id"              TEXT NOT NULL,
  "creeLe"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "type"            "TypeConnexion" NOT NULL,
  "resultat"        "ResultatConnexion" NOT NULL,
  "utilisateurId"   TEXT,
  "acteur"          TEXT,
  "etablissementId" TEXT,
  "etablissement"   TEXT,
  "ip"              TEXT,
  "navigateur"      TEXT,
  CONSTRAINT "connexions_journal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "connexions_journal_creeLe_idx" ON "connexions_journal"("creeLe");
