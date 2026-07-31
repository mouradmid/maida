-- Réservations prises hors ligne : la caisse joint une clé d'idempotence à sa
-- requête, ce qui rend la resynchronisation rejouable sans créer de doublon.

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN "cleIdempotence" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "reservations_cleIdempotence_key" ON "reservations"("cleIdempotence");
