#!/usr/bin/env bash
# Copie la base et les photos de l'ANCIEN staging (dossier OLD_DIR, projet
# Compose "carla-creation") vers la NOUVELLE stack de prod (NEW_DIR, projet
# "carla-prod"), puis applique les migrations en attente.
#
# - À lancer sur le VPS, en tant qu'utilisateur de déploiement.
# - Répétable : écrase à chaque fois la base de la prod. Ne touche jamais à
#   l'ancien staging, sauf avec --freeze (arrête son appli pour figer les
#   données — à n'utiliser que pour la vraie bascule).
# - Une sauvegarde complète est écrite dans BACKUP_DIR avant toute chose.
#
#   CONFIRM=yes ./deploy/migrate-staging-to-prod.sh [--freeze]
set -euo pipefail

OLD_DIR="${OLD_DIR:-/opt/carla-creation}"
NEW_DIR="${NEW_DIR:-/opt/carla-prod}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
FREEZE=0
[ "${1:-}" = "--freeze" ] && FREEZE=1

[ "${CONFIRM:-}" = "yes" ] || { echo "Ceci ÉCRASE la base de la prod ($NEW_DIR). Relancer avec CONFIRM=yes."; exit 1; }

old() { docker compose --project-directory "$OLD_DIR" -f "$OLD_DIR/docker-compose.yml" "$@"; }
new() { docker compose --project-directory "$NEW_DIR" -f "$NEW_DIR/docker-compose.yml" -f "$NEW_DIR/docker-compose.prod.yml" "$@"; }

OLD_PG="$(old ps -q postgres)"
OLD_WEB="$(old ps -q web)"
[ -n "$OLD_PG" ] || { echo "Postgres de l'ancien staging introuvable dans $OLD_DIR."; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
DUMP="$BACKUP_DIR/staging-$STAMP.dump"
UPLOADS="$BACKUP_DIR/staging-uploads-$STAMP.tgz"

if [ "$FREEZE" = 1 ]; then
  echo "==> Gel du staging (plus aucune réservation possible dessus)"
  docker stop "$OLD_WEB"
fi

echo "==> Sauvegarde de la base du staging -> $DUMP"
docker exec "$OLD_PG" pg_dump -U salon -Fc salon > "$DUMP"

# :z = étiquette SELinux partagée, sinon (Fedora) le conteneur ne peut pas écrire dans $BACKUP_DIR.
echo "==> Sauvegarde des photos -> $UPLOADS"
OLD_VOL="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' "$OLD_WEB")"
docker run --rm -v "$OLD_VOL":/src:ro -v "$BACKUP_DIR":/dst:z alpine tar czf "/dst/$(basename "$UPLOADS")" -C /src .

echo "==> Préparation de la stack de prod (base vide, schéma créé par init.sql)"
new up -d postgres
new stop web >/dev/null 2>&1 || true
NEW_PG="$(new ps -q postgres)"
# Attendre la FIN de l'initialisation : pendant init.sql, Postgres tourne dans
# un serveur temporaire (socket seulement) que pg_isready déclare déjà "prêt" ;
# le vrai serveur, lui, écoute en TCP une fois init.sql terminé.
until docker exec "$NEW_PG" pg_isready -h 127.0.0.1 -U salon >/dev/null 2>&1; do sleep 1; done
until docker exec "$NEW_PG" psql -U salon -d salon -tAc "SELECT 1 FROM migrations LIMIT 1" >/dev/null 2>&1; do sleep 1; done

echo "==> Restauration de la base dans la prod"
docker exec "$NEW_PG" psql -U salon -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS salon WITH (FORCE);" -c "CREATE DATABASE salon;"
docker exec -i "$NEW_PG" pg_restore -U salon -d salon --no-owner --exit-on-error < "$DUMP"

echo "==> Restauration des photos"
new create web >/dev/null
NEW_VOL="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' "$(new ps -aq web)")"
docker run --rm -v "$NEW_VOL":/dst -v "$BACKUP_DIR":/src:ro,z alpine sh -c "rm -rf /dst/* && tar xzf /src/$(basename "$UPLOADS") -C /dst"

echo "==> Démarrage de la prod + migrations en attente"
new up -d --build web
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$(new ps -q web)")" = "healthy" ]; do sleep 2; done
new exec -T web npm run migration:run

echo "==> Contrôle (ancien staging vs prod)"
for t in clients reservations loyalty_points invoices; do
  a="$(docker exec "$OLD_PG" psql -U salon -d salon -tAc "SELECT COUNT(*) FROM $t" 2>/dev/null || echo '-')"
  b="$(docker exec "$NEW_PG" psql -U salon -d salon -tAc "SELECT COUNT(*) FROM $t" 2>/dev/null || echo '-')"
  printf '  %-16s staging=%s prod=%s\n' "$t" "$a" "$b"
done
echo "Terminé. Sauvegardes : $DUMP et $UPLOADS"
