-- Marque explicite des comptes de démonstration.
--
-- Le seed de démo purgeait jusqu'ici TOUTES les données transactionnelles, sans
-- distinction de compte : le jour où un vrai restaurant tourne sur cette base,
-- un rafraîchissement de la démo effacerait son chiffre d'affaires. La démo
-- devient un statut porté par la donnée, et la purge s'y limite.
ALTER TABLE "comptes_clients" ADD COLUMN "demo" BOOLEAN NOT NULL DEFAULT false;

-- Les deux comptes de vitrine existants sont marqués comme tels, sans quoi le
-- garde-fou du seed les prendrait pour de vrais clients et refuserait de tourner.
UPDATE "comptes_clients" SET "demo" = true WHERE "nomEnseigne" IN ('Le Bon Grill', 'La Palmeraie');
