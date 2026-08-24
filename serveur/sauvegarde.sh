#!/usr/bin/env bash
# Sauvegarde nocturne de la base de Maïda.
#
# Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : la
# procédure de restauration est écrite dans HEBERGEMENT.md et doit être
# essayée au moins une fois, avant d'en avoir besoin.
set -euo pipefail

DOSSIER=/srv/maida
DESTINATION="$DOSSIER/sauvegardes"
JOURS_CONSERVES=30

cd "$DOSSIER"
horodatage=$(date +%Y-%m-%d_%Hh%M)
fichier="$DESTINATION/maida-$horodatage.sql.gz"

# --clean --if-exists : le fichier sait recréer la base par-dessus une base
# existante, ce qui évite d'avoir à la supprimer à la main un jour de panique.
docker compose exec -T base pg_dump -U maida --clean --if-exists maida | gzip -9 > "$fichier"

taille=$(du -h "$fichier" | cut -f1)
echo "$(date '+%Y-%m-%d %H:%M') — $fichier ($taille)"

# Une sauvegarde vide ou minuscule est un échec déguisé : mieux vaut le voir
# dans le journal que de le découvrir le jour de la restauration.
if [ "$(stat -c%s "$fichier")" -lt 10000 ]; then
	echo "$(date '+%Y-%m-%d %H:%M') — ATTENTION : sauvegarde suspecte, moins de 10 ko"
fi

find "$DESTINATION" -name 'maida-*.sql.gz' -mtime "+$JOURS_CONSERVES" -delete
