#!/usr/bin/env bash
# Envoie une alerte de sauvegarde ChoirManager par email.
#
# ⚠️ L'ADRESSE DE SECOURS N'EST PLUS CODÉE EN DUR.
# Elle l'était (`kekeligolo@gmail.com`), ce qui publiait une donnée
# personnelle dans un dépôt Git public — et l'aurait rendue obsolète le jour
# où la boîte de secours change. Elle vient désormais de l'environnement :
#
#     /etc/choirmanager/backup.env  (chmod 600, non versionné)
#     BACKUP_ALERT_EMAIL=alerte@exemple.org
#
# Fichier chargé par les unités systemd `choirmanager-backup.service` et
# `choirmanager-backup-freshness.service` (EnvironmentFile=-...). En appel
# manuel (`make prod-sauvegarde`), exporter la variable ou sourcer ce fichier.
# Procédure : docs/DEPLOIEMENT.md §7 « Adresse des alertes de sauvegarde ».
#
# Variable absente = échec EXPLICITE (`:?`) : mieux vaut une alerte de
# sauvegarde qui ne part pas et le dit, qu'une adresse de secours inventée.
set -euo pipefail

: "${BACKUP_ALERT_EMAIL:?BACKUP_ALERT_EMAIL obligatoire — adresse de secours des alertes de sauvegarde (cf. docs/DEPLOIEMENT.md §7)}"

message=${1:-"Échec de sauvegarde ChoirManager sans détail."}
docker exec \
  -e BACKUP_ALERT_MESSAGE="$message" \
  -e BACKUP_ALERT_EMAIL="$BACKUP_ALERT_EMAIL" \
  choirmanager-backend \
  python manage.py shell -c "
import os
from notifications.services import envoyer_email_externe
envoyer_email_externe(
    os.environ['BACKUP_ALERT_EMAIL'],
    'ALERTE sauvegarde VPS',
    os.environ['BACKUP_ALERT_MESSAGE'],
)
" >/dev/null 2>&1 || true
