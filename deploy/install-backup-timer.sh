#!/usr/bin/env bash
# Installe la sauvegarde nocturne de la prod (timer systemd, 3h du matin).
# À lancer UNE fois, avec sudo, depuis /opt/carla-prod :
#   sudo ./deploy/install-backup-timer.sh
# Variables facultatives : RUN_AS (défaut deploy), RCLONE_REMOTE (copie hors VPS).
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Lancer avec sudo."; exit 1; }
RUN_AS="${RUN_AS:-deploy}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_LINE=""
[ -n "${RCLONE_REMOTE:-}" ] && ENV_LINE="Environment=RCLONE_REMOTE=$RCLONE_REMOTE"

cat > /etc/systemd/system/carla-backup.service <<UNIT
[Unit]
Description=Sauvegarde de la prod Carla Création (base + photos)
After=docker.service

[Service]
Type=oneshot
User=$RUN_AS
$ENV_LINE
ExecStart=$DIR/deploy/backup-prod.sh
UNIT

cat > /etc/systemd/system/carla-backup.timer <<UNIT
[Unit]
Description=Sauvegarde nocturne de la prod Carla Création

[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=300
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now carla-backup.timer
systemctl list-timers carla-backup.timer --no-pager
