#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export RCLONE_CONFIG=${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}
started=$(date +%s)
workdir=$(mktemp -d /tmp/chm-restore-test.XXXXXX)
container="chm-restore-test-$$"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf -- "$workdir"
}
trap cleanup EXIT

rclone copyto chm-crypt:database/latest.dump "$workdir/latest.dump"
rclone copyto chm-crypt:database/latest.dump.sha256 "$workdir/latest.dump.sha256"
(cd "$workdir" && sed 's#  .*#  latest.dump#' latest.dump.sha256 | sha256sum -c -)

docker run -d --name "$container" \
  -e POSTGRES_PASSWORD=restore-test-only \
  -e POSTGRES_DB=restore \
  postgres:17-bookworm >/dev/null

for _ in $(seq 1 30); do
  docker exec "$container" pg_isready -U postgres -d restore -q && break
  sleep 1
done
docker exec "$container" pg_isready -U postgres -d restore -q
docker cp "$workdir/latest.dump" "$container:/tmp/latest.dump"
docker exec "$container" pg_restore -U postgres -d restore --no-owner /tmp/latest.dump

read -r chorales membres mandats <<<"$(docker exec "$container" psql -U postgres -d restore -At -F ' ' -c \
  "SELECT (SELECT count(*) FROM core_chorale WHERE prefix='HDGAB'),
          (SELECT count(*) FROM membres_membre m JOIN core_chorale c ON c.id=m.chorale_id WHERE c.prefix='HDGAB' AND NOT m.is_deleted),
          (SELECT count(*) FROM membres_mandat x JOIN membres_membre m ON m.id=x.membre_id JOIN core_chorale c ON c.id=m.chorale_id WHERE c.prefix='HDGAB' AND x.is_active);")"

test "$chorales" = 1
test "$membres" = 27
test "$mandats" -ge 4

mkdir -p "$workdir/media"
rclone copy chm-crypt:media "$workdir/media" --create-empty-src-dirs
source_manifest="$workdir/source-media.sha256"
restored_manifest="$workdir/restored-media.sha256"
(cd /srv/chm/media && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) >"$source_manifest"
(cd "$workdir/media" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) >"$restored_manifest"
test -s "$source_manifest"
cmp "$source_manifest" "$restored_manifest"

elapsed=$(( $(date +%s) - started ))
printf 'RESTAURATION_OK durée=%ss chorales=%s membres=%s mandats=%s médias=%s\n' \
  "$elapsed" "$chorales" "$membres" "$mandats" "$(wc -l <"$restored_manifest")"
