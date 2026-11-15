#!/usr/bin/env sh
# Sauvegarde LOGIQUE des données NOVIA (en plus des sauvegardes automatiques de la base managée).
# Le schéma n'est pas sauvegardé : il est reconstruit par les migrations versionnées.
# Usage : NOVIA_ADMIN_DATABASE_URL=postgres://… ./backup.sh fichier.sql
# Le fichier contient des données personnelles : le chiffrer et le stocker en UE.
set -eu
out="${1:?fichier de sortie}"
pg_dump --data-only --no-owner --no-privileges --disable-triggers \
  --exclude-table=novia_schema_migrations \
  --exclude-table=sessions --exclude-table=auth_challenges \
  --dbname="${NOVIA_ADMIN_DATABASE_URL:?NOVIA_ADMIN_DATABASE_URL}" --file="$out"
echo "Sauvegarde écrite : $out"
