ALTER TABLE "commandes" ADD COLUMN "cleIdempotence" TEXT;
CREATE UNIQUE INDEX "commandes_cleIdempotence_key" ON "commandes"("cleIdempotence");
