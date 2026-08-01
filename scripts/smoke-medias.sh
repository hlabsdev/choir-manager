#!/usr/bin/env bash
# ============================================================================
# ChoirManager — Smoke test des médias privés, À TRAVERS NGINX
# ============================================================================
#
# POURQUOI CE SCRIPT EXISTE
# --------------------------
# Les tests Django (`core/tests/test_medias_proteges.py`) passent par le client
# de test, donc PAS par Nginx. Ils prouvent que Django émet le bon en-tête
# `X-Accel-Redirect` ; ils ne prouvent RIEN de ce que Nginx en fait, ni que la
# `location /media/` publique a bien disparu de la configuration réelle.
#
# C'est exactement l'écart LocMem/Redis du lot 2 : une pile verte contre un
# substitut, et le défaut n'apparaît qu'en production. Ce script ferme le
# dernier maillon en interrogeant la vraie pile.
#
# Il vérifie QUATRE propriétés, dans l'ordre où elles peuvent casser :
#   1. l'endpoint protégé sert bien le fichier (Nginx honore X-Accel-Redirect)
#   2. les octets reçus sont EXACTEMENT ceux déposés
#   3. `/media/<chemin>` en direct ne donne plus rien (P0-3 fermé)
#   4. l'endpoint sans session refuse
#
# Usage : make smoke-medias   (la pile doit être démarrée : make up)
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://127.0.0.1:8080}"
ROUGE=$'\e[31m'; VERT=$'\e[32m'; GRAS=$'\e[1m'; FIN=$'\e[0m'
echecs=0

etape()  { printf '\n%s▸ %s%s\n' "$GRAS" "$1" "$FIN"; }
ok()     { printf '  %s✓%s %s\n' "$VERT" "$FIN" "$1"; }
echec()  { printf '  %s✗ %s%s\n' "$ROUGE" "$1" "$FIN"; echecs=$((echecs + 1)); }

# ---------------------------------------------------------------------------
etape "Préparation du jeu d'essai (chorale, membre, partition avec fichier)"

PREP=$(docker compose exec -T backend python manage.py shell -c "
import io, json
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth.models import User
from core.models import Chorale
from membres.models import Membre
from membres.services import adherer
from musique.models import Chant, Partition

CONTENU = b'%PDF-1.4 smoke-medias contenu unique 4f2a9c\n'

chorale, _ = Chorale.objects.get_or_create(
    prefix='SMK', defaults={'nom': 'Smoke Test', 'date_creation': '2020-01-01'})
user, cree = User.objects.get_or_create(
    username='smoke_medias', defaults={'email': 'smoke@example.invalid'})
if cree:
    user.set_password('SmokeMedias2026!')
    user.save()
if not Membre.objects.filter(user=user, chorale=chorale).exists():
    adherer(user, chorale)

Partition.objects.filter(titre='Smoke').delete()
chant, _ = Chant.objects.get_or_create(chorale=chorale, titre='Smoke', defaults={'style':'autre'})
p = Partition.objects.create(
    chorale=chorale, chant=chant, titre='Smoke',
    fichier=SimpleUploadedFile('smoke.pdf', CONTENU, content_type='application/pdf'))

print('___' + json.dumps({'pk': p.pk, 'chemin': p.fichier.name, 'taille': len(CONTENU)}))
" 2>/dev/null | sed -n 's/^___//p')

if [ -z "$PREP" ]; then
    echec "Impossible de préparer le jeu d'essai (la pile est-elle démarrée ? \`make up\`)"
    exit 1
fi

PK=$(printf '%s' "$PREP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["pk"])')
CHEMIN=$(printf '%s' "$PREP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["chemin"])')
ok "partition #$PK — fichier stocké : $CHEMIN"

# Le chemin doit être cloisonné par tenant et indevinable (uuid).
case "$CHEMIN" in
    partitions/*/*) ok "chemin cloisonné par chorale : $CHEMIN" ;;
    *) echec "chemin non cloisonné par tenant : $CHEMIN" ;;
esac

# ---------------------------------------------------------------------------
etape "Connexion à travers Nginx"

JETON=$(curl -sS -X POST "$BASE/api/auth/login/" \
    -H 'Content-Type: application/json' \
    -d '{"username":"smoke_medias","password":"SmokeMedias2026!"}' \
    | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access",""))')

[ -n "$JETON" ] && ok "jeton obtenu" || { echec "connexion impossible"; exit 1; }

# ---------------------------------------------------------------------------
etape "1/4 — l'endpoint protégé sert le fichier (Nginx honore X-Accel-Redirect)"

REP=$(mktemp)
CODE=$(curl -sS -o "$REP" -w '%{http_code}' \
    -H "Authorization: Bearer $JETON" "$BASE/api/core/medias/partition/$PK/")

if [ "$CODE" = "200" ]; then
    ok "HTTP 200 via Nginx"
else
    echec "HTTP $CODE attendu 200 — Nginx n'a pas honoré X-Accel-Redirect (location /media-interne/ absente ou mal nommée ?)"
fi

# ---------------------------------------------------------------------------
etape "2/4 — les octets reçus sont exactement ceux déposés"

if grep -q 'smoke-medias contenu unique 4f2a9c' "$REP" 2>/dev/null; then
    ok "contenu identique — le fichier a bien traversé Nginx"
else
    echec "contenu absent ou tronqué (reçu $(wc -c < "$REP") octets)"
    head -c 200 "$REP" | sed 's/^/      /'
fi

# L'en-tête interne ne doit JAMAIS ressortir vers le client.
if curl -sSI -H "Authorization: Bearer $JETON" \
     "$BASE/api/core/medias/partition/$PK/" | grep -qi 'x-accel-redirect'; then
    echec "X-Accel-Redirect est renvoyé au client — Nginx ne l'a pas consommé"
else
    ok "X-Accel-Redirect consommé par Nginx, non exposé au client"
fi

# ---------------------------------------------------------------------------
etape "3/4 — /media/ en direct ne donne plus rien (le défaut P0-3)"

# ⚠️ On teste le CONTENU, pas le code HTTP.
#
# Le catch-all SPA (`try_files $uri $uri/ /index.html`) répond légitimement
# 200 + index.html sur toute URL inconnue, y compris `/media/…`. Un test qui
# se contenterait du statut crierait donc à la fuite alors que le fichier
# n'est pas servi — c'est exactement le faux positif qu'a produit la première
# écriture de ce script. La seule question qui vaut est : les octets du
# fichier sortent-ils, oui ou non ?
DIRECT=$(mktemp)
CODE=$(curl -sS -o "$DIRECT" -w '%{http_code}' "$BASE/media/$CHEMIN")
TYPE=$(curl -sSI "$BASE/media/$CHEMIN" | grep -i '^content-type:' | tr -d '\r')

if grep -q 'smoke-medias contenu unique 4f2a9c' "$DIRECT" 2>/dev/null; then
    echec "LA FUITE EST OUVERTE : /media/$CHEMIN renvoie le fichier (HTTP $CODE)"
else
    ok "/media/ ne sert plus le fichier (HTTP $CODE, $TYPE)"
fi
rm -f "$DIRECT"

INTERNE=$(mktemp)
CODE=$(curl -sS -o "$INTERNE" -w '%{http_code}' "$BASE/media-interne/$CHEMIN")
if grep -q 'smoke-medias contenu unique 4f2a9c' "$INTERNE" 2>/dev/null; then
    echec "LA LOCATION INTERNE EST ATTEIGNABLE : /media-interne/ renvoie le fichier (HTTP $CODE)"
else
    ok "/media-interne/ ne sert rien en direct (HTTP $CODE) — \`internal\` respecté"
fi
rm -f "$INTERNE"

# ---------------------------------------------------------------------------
etape "4/4 — sans session, l'endpoint refuse"

CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/core/medias/partition/$PK/")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
    ok "HTTP $CODE sans jeton"
else
    echec "HTTP $CODE sans jeton — attendu 401/403"
fi

rm -f "$REP"

# ---------------------------------------------------------------------------
printf '\n'
if [ "$echecs" -eq 0 ]; then
    printf '%s%s✓ Médias privés : les 4 propriétés sont vérifiées À TRAVERS NGINX.%s\n' "$GRAS" "$VERT" "$FIN"
    exit 0
fi
printf '%s%s✗ %s vérification(s) en échec.%s\n' "$GRAS" "$ROUGE" "$echecs" "$FIN"
exit 1
