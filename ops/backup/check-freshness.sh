#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export RCLONE_CONFIG=${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}
readonly alert=/root/choir-manager/ops/backup/alert-backup.sh

marker=$(rclone cat chm-crypt:latest-success.txt 2>/dev/null || true)
epoch=${marker%% *}
now=$(date -u +%s)

if [[ ! "$epoch" =~ ^[0-9]+$ ]] || (( now - epoch > 129600 )); then
  "$alert" "ALERTE : aucune sauvegarde ChoirManager fraîche de moins de 36 heures n'est visible sur Google Drive."
  exit 1
fi

printf 'Fraîcheur OK : %s\n' "$marker"
