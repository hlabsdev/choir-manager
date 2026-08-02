#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
RCLONE_CONFIG=${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}
export RCLONE_CONFIG

readonly staging=/var/backups/choirmanager
readonly remote=chm-crypt:
readonly alert=/root/choir-manager/ops/backup/alert-backup.sh
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
dump_tmp="$staging/database-$timestamp.dump.tmp"
dump_final="$staging/database-$timestamp.dump"

mkdir -p "$staging"
chmod 700 "$staging"
exec 9>"$staging/backup.lock"
flock -n 9 || exit 0

on_error() {
  code=$?
  rm -f "$dump_tmp"
  "$alert" "La sauvegarde ChoirManager a échoué le $(date -u --iso-8601=seconds), code $code. Consultez journalctl -u choirmanager-backup.service."
  exit "$code"
}
trap on_error ERR

docker exec choirmanager-db pg_dump -U choirmanager -d choirmanager -Fc >"$dump_tmp"
test -s "$dump_tmp"
mv "$dump_tmp" "$dump_final"
sha256sum "$dump_final" >"$dump_final.sha256"

rclone copyto "$dump_final" "$remote/database/$timestamp.dump" --retries 5
rclone copyto "$dump_final.sha256" "$remote/database/$timestamp.dump.sha256" --retries 5
rclone copyto "$dump_final" "$remote/database/latest.dump" --retries 5
rclone copyto "$dump_final.sha256" "$remote/database/latest.dump.sha256" --retries 5

rclone sync /srv/chm/media "$remote/media" \
  --backup-dir "$remote/media-history/$timestamp" \
  --create-empty-src-dirs --retries 5

printf '%s\n' "$(date -u +%s) $timestamp" >"$staging/latest-success.txt"
rclone copyto "$staging/latest-success.txt" "$remote/latest-success.txt" --retries 5

find "$staging" -type f -name 'database-*.dump*' -mtime +7 -delete
rclone delete "$remote/database" --min-age 30d --include '/????????T??????Z.dump*' || true

trap - ERR
printf 'Sauvegarde réussie : %s\n' "$timestamp"
