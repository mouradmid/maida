-- Personne ne perd ce qu'il utilise déjà : les comptes dont un restaurant a
-- ouvert la réservation en ligne reçoivent la nouvelle option.
UPDATE "comptes_clients" SET "modules" = array_append("modules", 'RESERVATION_EN_LIGNE')
WHERE NOT ('RESERVATION_EN_LIGNE' = ANY("modules"))
  AND EXISTS (
    SELECT 1 FROM "etablissements" e
    WHERE e."compteClientId" = "comptes_clients"."id" AND e."reservationEnLigneActive"
  );
