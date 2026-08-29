-- Gestes commerciaux accordés pendant une coupure réseau : la clé
-- d'idempotence empêche qu'une resynchronisation répétée applique deux fois la
-- même remise ou le même offert.
ALTER TABLE "remises" ADD COLUMN "cleIdempotence" TEXT;
CREATE UNIQUE INDEX "remises_cleIdempotence_key" ON "remises"("cleIdempotence");
