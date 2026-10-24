#!/usr/bin/env bash
# Sauvegarde de la prod : base de données + photos de la galerie.
#
# Lancé chaque nuit par le timer systemd (voir deploy/install-backup-timer.sh),
# ou à la main : ./deploy/backup-prod.sh
#
# - Les fichiers vont dans BACKUP_DIR (défaut : ~/backups) :
#     prod-db-AAAAMMJJ-HHMMSS.dump     (pg_dump format custom)
#     prod-photos-AAAAMMJJ-HHMMSS.tgz  (volume des uploads)
# - Sont conservés les KEEP_DAYS derniers jours (défaut 14).
# - Un dump illisible fait échouer le script (donc le timer, visible dans systemctl).
# - Si RCLONE_REMOTE est défini (ex. "gdrive:carla-backups") et que rclone est
#   installé, les fichiers sont aussi copiés hors du VPS — indispensable : une
#   sauvegarde qui reste sur la machine ne protège pas de la perte de la machine.
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-carla-prod-postgres-1}"
WEB_CONTAINER="${WEB_CONTAINER:-carla-prod-web-1}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
DB_FILE="$BACKUP_DIR/prod-db-$STAMP.dump"
PHOTOS_FILE="prod-photos-$STAMP.tgz"

echo "==> Base de données -> $DB_FILE"
docker exec "$PG_CONTAINER" pg_dump -U salon -Fc salon > "$DB_FILE"
docker exec -i "$PG_CONTAINER" pg_restore --list < "$DB_FILE" > /dev/null   # le dump doit être lisible

echo "==> Photos -> $BACKUP_DIR/$PHOTOS_FILE"
VOL="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' "$WEB_CONTAINER")"
docker run --rm -v "$VOL":/src:ro -v "$BACKUP_DIR":/dst:z alpine tar czf "/dst/$PHOTOS_FILE" -C /src .

echo "==> Nettoyage (> $KEEP_DAYS jours)"
find "$BACKUP_DIR" -maxdepth 1 \( -name 'prod-db-*.dump' -o -name 'prod-photos-*.tgz' \) -mtime +"$KEEP_DAYS" -delete

if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone > /dev/null; then
  echo "==> Copie hors VPS -> $RCLONE_REMOTE"
  rclone copy "$DB_FILE" "$RCLONE_REMOTE"
  rclone copy "$BACKUP_DIR/$PHOTOS_FILE" "$RCLONE_REMOTE"
fi

echo "Sauvegarde terminée ($(du -h "$DB_FILE" | cut -f1) base, $(du -h "$BACKUP_DIR/$PHOTOS_FILE" | cut -f1) photos)."
