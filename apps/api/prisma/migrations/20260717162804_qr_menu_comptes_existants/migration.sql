-- Les comptes existants gardent le comportement actuel : le QR menu leur est accordé.
UPDATE "comptes_clients" SET "modules" = array_append("modules", 'QR_MENU') WHERE NOT ('QR_MENU' = ANY("modules"));
