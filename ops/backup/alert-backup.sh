#!/usr/bin/env bash
set -euo pipefail

message=${1:-"Échec de sauvegarde ChoirManager sans détail."}
docker exec -e BACKUP_ALERT_MESSAGE="$message" choirmanager-backend \
  python manage.py shell -c "
import os
from notifications.services import envoyer_email_externe
envoyer_email_externe(
    'kekeligolo@gmail.com',
    'ALERTE sauvegarde VPS',
    os.environ['BACKUP_ALERT_MESSAGE'],
)
" >/dev/null 2>&1 || true
