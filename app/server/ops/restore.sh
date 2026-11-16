#!/usr/bin/env sh
# Restauration : base VIDE → migrations → données. Jamais sur une base qui contient déjà des données.
# Usage : NOVIA_ADMIN_DATABASE_URL=postgres://…/base_vide ./restore.sh fichier.sql
# (rôle administrateur : la restauration contourne la sécurité au niveau des lignes et les
# déclencheurs « ajout seul », ce que le rôle applicatif ne peut pas faire)
set -eu
in="${1:?fichier de sauvegarde}"
url="${NOVIA_ADMIN_DATABASE_URL:?NOVIA_ADMIN_DATABASE_URL}"
MIGRATION_DATABASE_URL="$url" node dist-server/cli.js migrate
psql --set=ON_ERROR_STOP=1 --single-transaction --dbname="$url" --file="$in"
echo "Restauration terminée. Les sessions ne sont pas restaurées : chacune se reconnecte avec sa passkey."
