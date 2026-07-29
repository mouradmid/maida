-- Retrait du statut « prête » et de son horodatage : plus rien ne les produit
-- depuis la suppression de l'écran cuisine. Le drapeau « après préparation »
-- d'une annulation est désormais déclaré par le serveur au moment d'annuler.

-- Les commandes historiquement marquées « prêtes » redeviennent de simples
-- envois : c'est l'état qu'elles auraient aujourd'hui.
UPDATE "commandes" SET "statut" = 'ENVOYEE' WHERE "statut" = 'PRETE';

-- DropColumn
ALTER TABLE "commandes" DROP COLUMN "preteLe";

-- AlterEnum : PostgreSQL ne sait pas retirer une valeur d'un type énuméré,
-- il faut recréer le type et y basculer la colonne.
ALTER TYPE "StatutCommande" RENAME TO "StatutCommande_old";

CREATE TYPE "StatutCommande" AS ENUM ('ENVOYEE', 'ANNULEE');

ALTER TABLE "commandes" ALTER COLUMN "statut" DROP DEFAULT;
ALTER TABLE "commandes" ALTER COLUMN "statut" TYPE "StatutCommande" USING ("statut"::text::"StatutCommande");
ALTER TABLE "commandes" ALTER COLUMN "statut" SET DEFAULT 'ENVOYEE';

DROP TYPE "StatutCommande_old";
