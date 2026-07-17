ALTER TABLE "paiements" ADD COLUMN "cleIdempotence" TEXT;
CREATE UNIQUE INDEX "paiements_cleIdempotence_key" ON "paiements"("cleIdempotence");
