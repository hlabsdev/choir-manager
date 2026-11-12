# Déploiement et exploitation — ChoirManager

Pile Docker Compose : PostgreSQL, migrations, API Django, frontend Angular
servi par Nginx. Ce document couvre le démarrage, l'exploitation courante, la
sauvegarde, la restauration et le rollback.

> Base de référence : **PostgreSQL 17**. SQLite n'est plus qu'un repli de poste
> de développement, explicitement conditionné à `DJANGO_DEBUG=True`.

## 1. Architecture de la pile

```text
Navigateur
   │  127.0.0.1:8080
   ▼
frontend (Nginx non privilégié, port 8080)
   ├── /            → bundle Angular (fallback SPA vers index.html)
   ├── /media/      → volume media_data
   └── /api/, /admin/, /static/ → backend:8000
                                     │
                                     ▼
                              backend (Gunicorn, non-root)
                                     │
                                     ▼
                              db (PostgreSQL 17, volume postgres_data)
```

L'API est **same-origin** : le navigateur n'appelle jamais le backend
directement. Aucun port applicatif n'est publié en dehors du 8080 du frontend,
et la base n'est joignable que depuis le réseau Compose.

Ordre de démarrage garanti par Compose :

```text
db (healthy) → migrate (completed successfully) → backend (healthy) → frontend
```

Les migrations sont jouées **une fois** par le service `migrate`. L'entrypoint
du backend ne les applique jamais : les rejouer dans chaque worker Gunicorn les
mettrait en concurrence.

## 2. Prérequis

- WSL 2 avec l'intégration Docker Desktop activée, ou Docker Engine natif ;
- le dépôt cloné dans le système de fichiers **Linux** (`~/src/...`), jamais
  depuis `/mnt/c/...` ;
- `docker version`, `docker compose version` et `docker run --rm hello-world`
  fonctionnels.

```bash
git config --global core.autocrlf input
git config --global core.eol lf
```

## 3. Premier démarrage

```bash
git clone --recurse-submodules https://github.com/hlabsdev/choir-manager.git
cd choir-manager

make env          # crée .env depuis .env.example
```

Éditer `.env` et remplacer **toutes** les valeurs `change-me` :

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # DJANGO_SECRET_KEY
```

`POSTGRES_PASSWORD` doit être répercuté dans `DATABASE_URL`. Un mot de passe
contenant des caractères réservés (`@ : / ? #`) doit y être encodé en pourcent,
sinon l'URL est mal découpée.

```bash
make build        # construit les images backend et frontend
make up           # démarre la pile
make ps           # tous les services doivent être « healthy »
```

Application : <http://127.0.0.1:8080>

### Données initiales

La base démarre vide. Aucune donnée n'est importée automatiquement.

```bash
make superuser                                        # compte plateforme
make provision ARGS="--nom 'Ma Chorale' --prefix MCH \
  --admin-username president_mch --admin-email president@mch.example \
  --admin-first-name Awa --admin-last-name Traore"
```

Le mot de passe du compte Bureau est généré et affiché **une seule fois**.

```bash
make seed        # 2e chorale de démo — dev/QA UNIQUEMENT, jamais en production
```

## 4. Variables d'environnement

Toutes documentées dans [`.env.example`](../.env.example).

### La configuration est fermée par défaut

Depuis ce jalon, `chm_config/env.py` applique une règle simple : **tant que
`DJANGO_DEBUG=True` les valeurs de confort du poste de développement
s'appliquent ; dès que `DJANGO_DEBUG=False`, aucune configuration permissive ne
peut résulter de l'oubli d'une variable.**

| Variable | Absente avec `DEBUG=True` | Absente avec `DEBUG=False` |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | clé de développement | **démarrage refusé** |
| `DJANGO_ALLOWED_HOSTS` | `localhost, 127.0.0.1, [::1]` | **démarrage refusé** |
| `CORS_ALLOW_ALL_ORIGINS` | `True` | `False` |
| `CORS_ALLOWED_ORIGINS` | origines `ng serve` | vide |
| `DATABASE_URL` | repli SQLite explicite | **démarrage refusé** |
| `REDIS_URL` | repli LocMem explicite | **démarrage refusé** |
| `DJANGO_COOKIE_SECURE` | sans objet | `True` |
| `WAHA_ENABLED` | `False` | `True` via `compose.prod.yaml` (surchargeable par `.env`) |
| `WAHA_URL` | `http://waha:3000` (Compose) | **démarrage refusé si le canal est actif et l'URL vide** |
| `WAHA_API_KEY` | vide toléré | **démarrage refusé si le canal est actif et la clé vide** |

Deux refus supplémentaires, volontairement bruyants :

- fournir explicitement la clé de développement avec `DEBUG=False` est rejeté
  (elle est versionnée, donc publiquement connue) ;
- `CORS_ALLOW_ALL_ORIGINS=True` combiné à `CORS_ALLOW_CREDENTIALS=True` est
  rejeté hors développement : dans cette combinaison django-cors-headers
  reflète l'origine de la requête avec `Allow-Credentials: true`, autorisant
  n'importe quel site tiers à appeler l'API avec les identifiants du
  navigateur. La cible de production étant same-origin, CORS n'est de toute
  façon pas nécessaire.

Un démarrage qui échoue affiche le nom exact de la variable manquante.

**WhatsApp (WAHA)** est **désactivé par défaut hors Compose** et activé par
défaut par `compose.prod.yaml` (`WAHA_ENABLED=True`) : la production doit donc
posséder une clé. En développement, il reste coupé pour ne pas logger un échec
par notification. Poser une clé aléatoire — la MÊME valeur est lue par WAHA et
par Django :

```bash
# 1. Générer une clé
python -c "import secrets; print(secrets.token_urlsafe(32))"

# 2. Dans .env (jamais committé)
WAHA_API_KEY=<valeur-générée>

# 3. Production uniquement : ne PAS laisser WAHA_ENABLED=False dans .env,
#    sinon l'interrupteur explicite désactive le canal. En développement,
#    laisser False.
WAHA_ENABLED=True
```

Sans clé, un démarrage de production avec `WAHA_ENABLED=True` est **refusé**
avec le nom de la variable — jamais un service qui tourne sans pouvoir envoyer.
Pour déployer sans WhatsApp, poser explicitement `WAHA_ENABLED=False`.

Tant que `WAHA_ENABLED=False`, le conteneur WAHA tourne mais aucun message ne
part : les appels à `notifier(..., par_whatsapp=True)` sont ignorés avec une
ligne de log, sans ligne `NotificationWhatsApp`.

### ⛔ ÉTAPE BLOQUANTE — mesurer `DJANGO_NUM_PROXIES` sur l'hôte réel

**N'activez pas les throttles en production avant d'avoir mesuré cette valeur
sur la machine cible.** Ce n'est pas une précaution de style : une valeur
fausse casse la protection dans un sens ou dans l'autre, et les deux échouent
en silence.

`DJANGO_NUM_PROXIES` indique combien de proxys de confiance se trouvent entre
le client et Django. DRF s'en sert pour lire l'IP réelle du client dans
`X-Forwarded-For`, et **c'est cette valeur qui décide de la validité de tous
les plafonds par IP** (connexion, rafraîchissement, demande de chorale, codes
d'invitation).

| Réglage | Ce que Django lit | Conséquence |
| --- | --- | --- |
| **trop haut** | une adresse que le client a lui-même écrite | plafonds **contournables** : il suffit de changer d'en-tête |
| **trop bas** | l'IP d'un proxy, identique pour tout le monde | plafonds **partagés** : quelques échecs bloquent toute la plateforme |
| **exact** | l'IP réelle du client | correct |

Il n'existe donc pas de valeur « prudente ». `1` est le défaut, qui correspond
à la topologie de `compose.yaml` (client → nginx frontend → backend). Toute
autre topologie — notamment une passerelle mutualisée en amont — doit être
mesurée.

**Procédure.** Pile démarrée, depuis une machine EXTÉRIEURE au serveur (pas
depuis l'hôte lui-même, dont l'IP ne traverserait pas la passerelle) :

```bash
# 1. Relever votre IP publique, vue depuis l'extérieur.
curl -s https://api.ipify.org ; echo
```

Puis sur l'hôte, faire raconter à Django ce qu'il reçoit réellement :

```bash
# 2. Afficher la chaîne X-Forwarded-For telle qu'elle arrive au backend.
docker compose exec backend python -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chm_config.settings')
django.setup()
from django.conf import settings
print('NUM_PROXIES actuellement configuré :', settings.REST_FRAMEWORK['NUM_PROXIES'])
"

# 3. Émettre une requête depuis l'extérieur et lire la chaîne reçue.
#    Les logs d'accès Gunicorn ne la montrent pas : on la fait dire par l'API.
docker compose logs --tail=50 backend | grep -i forwarded
```

Si l'en-tête n'apparaît pas dans les journaux, le plus simple est de le
demander à l'application le temps d'une mesure — depuis l'extérieur :

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://VOTRE-DOMAINE/api/core/health/
```

puis sur l'hôte :

```bash
docker compose exec backend python -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','chm_config.settings')
django.setup()
from django.test import RequestFactory
from rest_framework.throttling import AnonRateThrottle
# Reproduire la chaîne observée dans les journaux nginx, puis vérifier
# quelle adresse DRF en extrait avec le réglage courant :
chaine = 'VOTRE.IP.PUBLIQUE, 10.0.0.5'   # ← à remplacer par la chaîne réelle
r = RequestFactory().get('/', HTTP_X_FORWARDED_FOR=chaine, REMOTE_ADDR='172.18.0.4')
print('DRF retient :', AnonRateThrottle().get_ident(r))
"
```

**Règle de décision :** `DJANGO_NUM_PROXIES` est le **nombre d'adresses de la
chaîne `X-Forwarded-For` reçue par le backend**. `DRF retient` doit afficher
exactement l'IP publique relevée à l'étape 1 — ni celle d'une passerelle, ni
une valeur que vous auriez pu injecter. Ajustez la variable dans `.env`,
redémarrez, et **re-mesurez** avant d'ouvrir la pile au public.

Contrôle final, depuis l'extérieur : deux machines d'IP publiques différentes
doivent pouvoir échouer chacune leur connexion sans se bloquer mutuellement.

### ⛔ ÉTAPES BLOQUANTES — module audio (MediaChant) : trois actions avant exploitation

Le front MediaChant (lecture + dépôt, fiche chant) n'est exploitable en
production qu'après CES TROIS ACTIONS, dans cet ordre :

1. **Mesurer `client_max_body_size` sur `mrs-gateway`** — le plafond
   applicatif (15 Mo) doit passer le second saut. Procédure ci-dessous.
2. **Rejouer la réconciliation Partition → MediaChant** — `Partition` est
   resté le seul chemin d'écriture vivant depuis le bloc modèle (issue #2
   chm-backend) ; toute Partition déposée depuis n'a aucun miroir
   `MediaChant` tant que cette étape n'a pas tourné une seconde fois.
   Procédure ci-dessous.
3. **Seulement alors**, le front peut être poussé : il lit/écrit
   exclusivement `MediaChant`, donc toute Partition orpheline de l'étape 2
   resterait invisible à l'écran une fois le front en place.

**Ordre du cutover, non négociable (issue #2)** : réconciliation → bascule du
front → retrait de `Partition`. Jamais l'inverse — basculer le front avant
d'avoir rejoué la réconciliation laisserait derrière toute Partition déposée
pendant la transition, silencieusement.

#### 1. Mesurer `client_max_body_size` sur `mrs-gateway`

**Ne comptez pas sur le plafond applicatif seul avant d'avoir mesuré celui du
second saut.** Même angle mort que `DJANGO_NUM_PROXIES` ci-dessus : une limite
non lisible depuis ce dépôt, qui doit être mesurée sur l'hôte réel avant le
premier dépôt de fichier en production.

Deux paliers connus, un troisième non mesurable d'ici :

| Palier | Valeur | Source |
| --- | --- | --- |
| Django (`TAILLE_MAX_OCTETS`, `core/medias.py`) | 10 Mo (médias existants), 15 Mo (`MEDIA_CHANT`) | ce dépôt |
| Nginx frontend (`client_max_body_size`, `chm-frontend/nginx.conf`) | 20 Mo | ce dépôt |
| `mrs-gateway` (second saut, devant Nginx frontend) | **inconnu** | à mesurer sur l'hôte |

Si `mrs-gateway` impose une limite sous 15 Mo, un dépôt `MediaChant`
parfaitement légitime côté Django reçoit un **413 opaque au second saut, sans
jamais atteindre l'application** — la même trappe que celle documentée dans
`core/medias.py` pour `TAILLE_MAX_OCTETS`, un cran plus loin, invisible depuis
les journaux Django puisque la requête ne les atteint pas.

**Procédure**, depuis une machine EXTÉRIEURE au serveur :

```bash
# Fichier de test à la taille du plafond applicatif le plus élevé (15 Mo).
dd if=/dev/urandom of=/tmp/test-15mo.bin bs=1M count=15

# Requête directement contre le domaine public (donc via mrs-gateway) —
# n'importe quel endpoint authentifié suffit à observer le code renvoyé.
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://VOTRE-DOMAINE/api/musique/medias-chant/ \
  -H "Authorization: Bearer VOTRE-TOKEN" \
  -F "fichier=@/tmp/test-15mo.bin"
```

Un `413` à ce stade vient de `mrs-gateway` (Django ne l'émettrait qu'après
avoir reçu le corps entier — un plafond applicatif dépassé produit un `400`
avec le message de `valider_fichier`, pas un `413` nu). Si `mrs-gateway`
coupe en dessous de 15 Mo, **abaisser `MEDIA_CHANT.taille_max`
(`core/medias.py`) à la valeur mesurée**, jamais l'inverse — remonter
`client_max_body_size` sur une passerelle mutualisée est hors de portée de ce
dépôt.

#### 2. Rejouer la réconciliation Partition → MediaChant

La migration `musique/migrations/0005_migrer_partitions_vers_media_chant.py`
n'a tourné qu'une fois, au déploiement du bloc modèle — un instantané, pas une
synchronisation continue. `Partition` est resté le seul chemin d'écriture
vivant depuis (le front ne le propose plus depuis le bloc 3, mais son
endpoint n'est pas retiré côté serveur), donc toute Partition déposée depuis
cet instantané n'a AUCUN miroir `MediaChant` — invisible dès que le front
bascule, silencieusement.

`musique/services.py::synchroniser_medias_chant_depuis_partitions` est
IDEMPOTENTE et rejouable (dédup par `fichier.name` — une Partition déjà
couverte n'est jamais dupliquée), conçue précisément pour cette seconde
exécution :

```bash
docker compose exec backend python manage.py shell -c "
from django.apps import apps
from musique.services import synchroniser_medias_chant_depuis_partitions
n = synchroniser_medias_chant_depuis_partitions(apps)
print(f'{n} MediaChant créés par la réconciliation.')
"
```

Ne copie ni ne déplace aucun fichier (le miroir réutilise le `fichier.name`
de la Partition d'origine) — sans risque pour le contenu déjà en place, à
rejouer aussi souvent que nécessaire tant que `Partition` reste accessible en
écriture quelque part (admin Django compris).

### Cookies et pile locale en HTTP

`DJANGO_COOKIE_SECURE` vaut `True` par défaut : les cookies de session et CSRF
sont marqués `Secure`. **Un navigateur ne renvoie jamais un cookie `Secure` sur
une connexion HTTP** — sur la pile locale servie en clair, la connexion à
l'admin Django échouerait alors en 403 CSRF, le cookie n'étant jamais retourné.

Contrairement à `SECRET_KEY`/`ALLOWED_HOSTS`/CORS (aucune raison légitime
d'être permissifs), désactiver `Secure` a un usage réel : cette pile locale
sans TLS. Poser `DJANGO_COOKIE_SECURE=False` seul, hors `DJANGO_DEBUG=True`,
**ne suffit donc plus** — il faut EN PLUS la dérogation explicite :

```dotenv
DJANGO_COOKIE_SECURE=False
DJANGO_ACCEPT_INSECURE_COOKIES=True
```

Sans cette seconde variable (nom volontairement sans ambiguïté), le démarrage
échoue avec un message explicite plutôt que de démarrer silencieusement avec
des cookies non sécurisés — par exemple si un `.env` de dev est recopié sur un
environnement `DJANGO_DEBUG=False` sans relecture attentive.

**Repasser `DJANGO_COOKIE_SECURE` à `True` (et retirer la dérogation) dès
qu'un TLS est en place.** Tant que `False`, `check --deploy` signale `W012` et
`W016` : c'est attendu, ce sont les deux avertissements qui correspondent
exactement à ce débrayage.

`DJANGO_CSRF_TRUSTED_ORIGINS` doit lister l'origine **avec son port** par
laquelle l'admin est atteint (`http://127.0.0.1:8080`), Django comparant
l'en-tête `Origin` complet.

### Avertissements attendus de `check --deploy`

Sur la pile locale, trois avertissements sont normaux et justifiés :

| Code | Cause | Action en production |
| --- | --- | --- |
| `W008` | `SECURE_SSL_REDIRECT=False` | TLS terminé par le reverse-proxy ; passer à `True` si Django est exposé directement |
| `W012` | `SESSION_COOKIE_SECURE=False` | poser `DJANGO_COOKIE_SECURE=True` |
| `W016` | `CSRF_COOKIE_SECURE=False` | idem |

Aucun autre avertissement ne doit apparaître.

## 5. Exploitation courante

### Redéployer UN service sans réveiller toute la pile

`docker compose up -d --build frontend` reconstruit et redémarre bien plus que
le frontend : Compose remonte toute la chaîne de dépendances déclarée
(`frontend` → `backend` → `migrate` → `db`). Les migrations sont donc rejouées
et le backend recréé, alors qu'on ne voulait toucher qu'au bundle Angular.

Pour se limiter au service visé :

```bash
docker compose up -d --build --no-deps frontend    # ou : make up-frontend
```

`--no-deps` suppose que les dépendances tournent déjà et sont saines : à
utiliser pour un redéploiement incrémental, jamais pour un premier démarrage.
Vérifier avant avec `make ps`.

Rejouer les migrations n'est pas dangereux — elles sont idempotentes, une
migration déjà appliquée est ignorée — mais c'est du temps perdu, et le
redémarrage du backend coupe les requêtes en cours.

### Email — vérification manuelle OBLIGATOIRE après déploiement

> ## ⚠️ La suite de tests ne prouve rien sur l'envoi réel
>
> Les 14 tests d'email tournent sur le backend **`locmem`** : ils inspectent des
> objets `EmailMessage` en mémoire. **Aucun** ne prouve que Gmail accepte la
> connexion, que le mot de passe d'application est valide, que le `From` n'est
> pas réécrit par le relais, ni que le `Reply-To` survit au transport.
>
> **C'est exactement le schéma de SQLite au jalon 1** : une suite verte sur un
> substitut. La vérification ci-dessous n'est pas du polish — c'est la **seule
> preuve réelle** que la chaîne fonctionne.

Configuration : Google Workspace, `smtp.gmail.com:587` en TLS, authentifié par
un **mot de passe d'application** (jamais le mot de passe du compte, jamais
committé — cf. `.env.example`).

`DEFAULT_FROM_EMAIL` doit désigner un compte réellement autorisé à envoyer pour
le domaine. Un expéditeur qui ne correspond pas au compte authentifié fait
échouer SPF, et les messages atterrissent en indésirables — ou disparaissent.

#### Procédure

**1. Envoi déclenché par une vraie action métier** — approuver une demande
d'absence sur un compte de test, vers une adresse **Gmail**. Pas un `send_mail`
depuis un shell : cela court-circuiterait le chemin réel (construction du
sujet, Reply-To, provenance) et ne testerait que la connectivité.

**2. Sur le message reçu**, contrôler :

- le **`From` affiché** : `CHM Noreply`, **sans guillemets littéraux** autour du
  nom. Une valeur à espaces mal citée dans `.env` produit un
  `"CHM Noreply" <...>` affiché tel quel, guillemets compris — piège classique
  du parsing d'environnement ;
- le **`Reply-To`** : présent, et portant l'adresse de contact de la chorale
  émettrice ;
- la **provenance dans le sujet** : `[ChoirManager · <nom de la chorale>]`.

**3. « Afficher l'original »** (menu ⋮ de Gmail) : confirmer **`SPF : PASS`**
*et* **`DKIM : PASS`**, tous deux sur **`sankoftechnologies.com`** — pas sur un
domaine d'infrastructure Google.

**4. Cas `email_contact` vide** — à faire **avant** de renseigner toutes les
chorales, sinon le cas devient intestable sans remettre une adresse à zéro.
Déclencher un envoi depuis une chorale sans adresse de contact et vérifier sur
le message reçu : **aucun en-tête `Reply-To`**, et la phrase de pied
« Cette adresse ne reçoit pas de réponses. Contactez le bureau de votre
chorale. » réellement affichée.

> ⚠️ **La console Workspace peut afficher DKIM comme actif alors que
> l'enregistrement DNS n'a pas propagé.** C'est le message reçu qui fait foi,
> pas la console. Refaire le contrôle si l'enregistrement a été posé moins de
> 48 h auparavant.

Si `SPF : PASS` mais `DKIM : NEUTRAL` ou absent : la clé DKIM n'est pas publiée
ou pas encore propagée. Les messages partent, mais leur réputation est
mauvaise — à corriger avant d'ouvrir le pilote à de vrais membres.

### WhatsApp — initialiser la session WAHA (une seule fois)

Le canal WhatsApp est **sortant** et réservé aux notifications transactionnelles
attendues (rappel de répétition, confirmation, alerte de cotisation). Il n'est
jamais utilisé pour une annonce générale : WAHA s'appuie sur le protocole
WhatsApp Web, non officiel, et un usage trop agressif peut faire **bannir le
numéro**.

**Numéro dédié obligatoire.** Utiliser un numéro professionnel, prépayé, dont
le nom de profil dit clairement « Chœur — notification automatique ». Jamais un
numéro personnel d'un membre du bureau : un bannissement emporterait son
WhatsApp personnel.

#### Procédure (pile démarrée)

```bash
# Poste de développement (pile compose.yaml + compose.dev.yaml) :
make waha-init

# Serveur de production (toujours la pile compose.prod.yaml) :
make prod-waha-init

# → interroge le backend, qui parle à http://waha:3000 sur le réseau interne
# → crée/démarre la session « chm-notifications »
# → si le statut est SCAN_QR_CODE, enregistre /app/waha-qr.png et le copie
#   dans ./waha-qr.png sur l'hôte
```

1. Ouvrir `waha-qr.png` et le scanner avec le téléphone dédié : WhatsApp →
   **Appareils connectés** → **Connecter un appareil**.
2. Relancer `make waha-init` : le statut doit passer à **`WORKING`**.
3. Envoyer un message de test à un membre qui a donné son consentement
   (Mon espace → Notifications WhatsApp).

La session persiste dans le volume `waha_sessions`. **Perdre ce volume impose
de rescanner le QR** — il fait donc partie de la sauvegarde, au même titre que
`media_data` (cf. §7). La perte n'est pas une perte de données métier, mais elle
interrompt le canal jusqu'à réappairage.

#### Interface web WAHA (développement uniquement)

En dev, `compose.dev.yaml` publie WAHA sur `127.0.0.1:${WAHA_HOST_PORT}` et
active le dashboard. Il est protégé par **HTTP Basic** :

```text
URL      : http://127.0.0.1:3115/dashboard/
Login    : WAHA_DASHBOARD_USERNAME (admin)
Password : WAHA_DASHBOARD_PASSWORD
```

Le dashboard affiche le **QR en direct** et l'état de la session : c'est le
chemin à privilégier pour scanner, car le PNG écrit par `waha_init` expire vite.
L'API reste sur `/api/...` avec `X-Api-Key` ; le Basic Auth ne couvre que
l'interface.

Fixer ces deux variables dans `.env` avant le premier démarrage. Si elles sont
vides, WAHA génère un mot de passe aléatoire **à chaque redémarrage** et
l'affiche une seule fois dans ses logs (`docker compose logs waha | grep
WAHA_DASHBOARD_PASSWORD`) — introuvable ensuite. En production, aucun port
WAHA n'est publié : ces identifiants n'ouvrent rien de public.

#### Pourquoi le port 3000 n'est pas publié en production

`compose.dev.yaml` l'expose sur `127.0.0.1:3000` pour l'initialisation
locale. `compose.prod.yaml` ne le publie pas : seul `mrs-gateway` est public.
Exposer WAHA donnerait accès à son tableau de bord, qui affiche le QR de
session — un tiers pourrait y lier **son** WhatsApp à la place du numéro de la
plateforme. `make waha-init` passe par le backend, sur le réseau interne, et ne
nécessite donc aucune ouverture de port.

#### Vérifier après déploiement

```bash
# Statut de la session, sans exposer WAHA :
make prod-waha-init

# Les derniers envois et leurs échecs :
docker compose -f compose.yaml -f compose.prod.yaml exec backend python manage.py shell -c "
from notifications.models import NotificationWhatsApp as N
print(list(N.objects.values('statut', 'gabarit', 'created_at')[:10]))"
```

Un `echec` avec `erreur="throttle"` signifie que `WAHA_MAX_PER_MINUTE` a été
atteint pour cette chorale ; avec `erreur="HTTP 401"`, la clé
`WAHA_API_KEY` diffère entre Django et WAHA (les deux la lisent dans `.env`,
mais une modification n'est prise qu'après redémarrage des deux conteneurs).

#### Si WhatsApp refuse l'appairage (`FAILED`, « impossible de se connecter »)

Trois causes réelles, dans l'ordre de probabilité :

1. **QR périmé.** Le PNG de `waha_init` est une photo à l'instant T ; WAHA le
   régénère toutes les quelques secondes. Scanner depuis le **dashboard**
   (`/dashboard/`), qui affiche la version courante, élimine ce cas.
2. **Session fantôme / moteur WEBJS rejeté.** Si les logs montrent
   `Session has been logged out! args=LOGOUT` juste après le scan, WhatsApp a
   refusé la liaison. Le moteur WEBJS (Chromium) est le plus exposé. Passer à
   NOWEB puis repartir d'une session vide :

   ```bash
   # dans .env
   WHATSAPP_DEFAULT_ENGINE=NOWEB

   docker compose -f compose.yaml -f compose.dev.yaml stop waha
   docker compose -f compose.yaml -f compose.dev.yaml rm -f waha
   docker volume rm choirmanager_waha_sessions
   docker compose -f compose.yaml -f compose.dev.yaml up -d waha
   ```

3. **Appareils liés saturés ou conflit de compte.** Sur le téléphone :
   WhatsApp → Appareils connectés → retirer les anciennes sessions
   (WAHA/Chrome), puis rescanner. Utiliser UN seul téléphone et UN seul compte
   pour le test ; scanner ensuite avec WhatsApp Business lie un autre compte et
   peut déconnecter le premier.

Après un scan réussi, `waha_init` doit afficher `WORKING`, et
`NotificationWhatsApp.statut` doit passer à `envoye`.

### SMS WassaSMS — canal payant, fermé par défaut

Le canal est utilisé uniquement par les séries/occurrences marquées
`notifier_sms=True`. Il n'envoie jamais de SMS pour une annonce générale.

Variables `.env` / `env.prod` :

```dotenv
SMS_ENABLED=True
SMS_API_URL=http://www.wassasms.com/wassasms/api/web/v3/sends
SMS_API_KEY=<clé_WassaSMS>
SMS_SENDER=Choeur          # 11 caractères max, sans caractère spécial
SMS_MAX_PER_MINUTE=20
```

`SMS_ENABLED=False` (défaut) désactive complètement le canal, même si une
série porte `notifier_sms=True`. La clé ne doit jamais être committée,
affichée dans les logs ou recopiée dans un ticket.

Contrôle après déploiement :

```bash
make prod-shell
# dans le shell Django :
from notifications.models import NotificationSMS
NotificationSMS.objects.order_by("-created_at")[:5]
```

Un SMS réel n'est **pas** envoyé pendant le déploiement. Pour le tester,
créer un événement de test avec « Envoyer aussi un SMS », puis vérifier
`NotificationSMS` (statut `envoye`/`echec`) et la consommation WassaSMS.

### Rappels d'événements — À PLANIFIER

Le module Planning envoie un rappel in-app + email aux membres actifs des
événements qui commencent dans les prochaines 24 h. La commande est idempotente
par jour : la rejouer ne duplique rien.

```bash
make prod-rappels
# équivalent : docker compose -f compose.yaml -f compose.prod.yaml exec -T \
#   backend python manage.py rappeler_evenements --jours 1
```

Fréquence recommandée : **une fois par jour**, en fin de matinée (pour que le
rappel de demain arrive avant la fin de journée). Entrée cron type :

```cron
0 11 * * * cd /srv/chm/choir-manager && make prod-rappels >> /var/log/chm-rappels.log 2>&1
```

Le canal WhatsApp n'est **pas** utilisé pour ces rappels : ils partent à toute
la chorale, donc c'est un envoi de masse. Le canal WhatsApp reste réservé aux
notifications transactionnelles unitaires.

### Purge des refresh tokens — À PLANIFIER

Depuis l'activation de `rest_framework_simplejwt.token_blacklist`, **chaque
refresh token émis crée une ligne** dans `token_blacklist_outstandingtoken` :
à chaque connexion, chaque changement de chorale, chaque acceptation
d'invitation, et **à chaque rotation de refresh** — soit toutes les 30 minutes
pour une session active. Une session active à la journée produit donc une
cinquantaine de lignes.

Cette table ne se vide pas toute seule. Sans purge, elle grossit
indéfiniment ; le symptôme n'apparaîtra qu'après des mois, sous forme de
sauvegardes qui gonflent et de requêtes de révocation qui ralentissent.

```bash
make purge-tokens        # docker compose exec backend manage.py flushexpiredtokens
```

**Fréquence retenue : quotidienne**, à une heure creuse. Le raisonnement :
les refresh vivent 7 jours (`REFRESH_TOKEN_LIFETIME`), donc une purge
quotidienne borne la table à ~8 jours d'émissions, contre ~14 avec un
rythme hebdomadaire. L'opération est un `DELETE` indexé sur `expires_at`,
assez peu coûteux pour ne pas justifier d'espacer davantage — et un rythme
quotidien rend une panne de la tâche visible en un jour plutôt qu'en une
semaine.

Entrée cron de l'hôte (la pile n'embarque pas d'ordonnanceur) :

```cron
17 4 * * *  cd /chemin/vers/choir-manager && make purge-tokens >> /var/log/chm-purge-tokens.log 2>&1
```

`flushexpiredtokens` ne supprime que les tokens **déjà expirés** : il ne
révoque rien et ne déconnecte personne. Il est sans danger à toute heure, et
rejouable sans effet de bord.

> ⚠️ La révocation elle-même (changement de mot de passe) ne dépend PAS de
> cette purge. Une purge en retard fait grossir la table, elle n'ouvre aucun
> accès : un token expiré est refusé sur sa date d'expiration, blacklisté ou
> non.

### Rétention du journal d'audit

Même nature de problème que les refresh tokens, à un rythme différent : la
table `audit_evenementaudit` reçoit une ligne par écriture métier, par geste
d'admin et par événement d'authentification. Elle ne se vide pas toute seule.

```bash
docker compose exec backend python manage.py purger_journal_audit --jours 365
# → compte seulement, n'efface rien
docker compose exec backend python manage.py purger_journal_audit --jours 365 --confirmer
```

Le défaut est **non destructif** : sans `--confirmer`, la commande annonce ce
qu'elle purgerait et s'arrête. C'est la seule valeur par défaut acceptable
pour un outil qui efface un journal, sachant qu'il finira dans un cron copié
d'un exemple.

**Fréquence retenue : mensuelle**, avec une rétention de 12 mois. Le
raisonnement diffère de celui des tokens : le journal n'a aucune contrainte de
fraîcheur (rien ne dépend de sa taille pour fonctionner), et c'est justement
sa PROFONDEUR qui fait sa valeur — un incident se découvre rarement le jour
même. Purger trop court, c'est perdre la seule trace au moment où on la
cherche. Douze mois couvrent un cycle complet de mandats.

```cron
23 4 1 * *  cd /chemin/vers/choir-manager && docker compose exec -T backend python manage.py purger_journal_audit --jours 365 --confirmer >> /var/log/chm-purge-audit.log 2>&1
```

⚠️ Avant de raccourcir cette rétention, exporter (CSV ou JSONL, depuis
`/admin/audit/evenementaudit/`). La purge est un `DELETE` sec : rien n'est
archivé ailleurs, et le journal d'audit est le seul endroit où figurent les
échecs de connexion et les suppressions définitives.

### Atteindre le backend directement

Dans la pile cible, le backend **ne publie aucun port** : il n'est joignable que
par le proxy Nginx du frontend (`/api/`, `/admin/`, `/static/`). L'admin Django
est donc sur <http://127.0.0.1:8080/admin/>, pas sur le port 8000.

Pour l'atteindre en direct (client REST, inspection d'en-têtes) sans quitter la
configuration durcie :

```bash
make up-api             # publie l'API sur 127.0.0.1:8000, reste en Gunicorn/DEBUG=False
```

`make dev` publie aussi le port 8000, mais repasse en `runserver` avec
`DJANGO_DEBUG=True` : à réserver au développement, jamais pour valider un
comportement de production.

```bash
make ps                 # état des services
make logs               # logs suivis
make check              # manage.py check
make check-deploy       # contrôles de sécurité (§11)
make shell              # shell Django
make dbshell            # psql sur la base applicative
make down               # arrêt SANS perte de données
```

`make down` correspond à `docker compose down` : les volumes sont conservés.

> **`docker compose down -v` détruit la base et les médias.** La cible
> `make nettoyage-jetable` l'expose derrière une confirmation explicite et ne
> doit servir que sur un environnement jetable.

### Mise à jour applicative — par TAG, jamais par branche

```bash
make prod-deploie TAG=v1.2.0-rc.4
```

**`TAG` est obligatoire et sans défaut.** Un déploiement doit désigner un état
figé et nommé : une branche bouge sous les pieds, `main` au moment du `pull`
n'est pas forcément ce qu'on croyait déployer, et sans repère exact le retour
arrière n'a pas de cible. La cible refuse de démarrer sans lui.

Elle enchaîne, en échouant bruyamment à chaque étape :

| # | Étape | Pourquoi |
| --- | --- | --- |
| 1 | `git fetch --tags` + le tag existe ? | échouer ici ne coûte rien |
| 2 | contrôle du **sens** de l'évolution | refuse un tag dont les pointeurs de sous-module RECULENT (voir plus bas) |
| 3 | **sauvegarde base + médias** | après les validations, mais AVANT toute mutation : un déploiement qui casse doit avoir un retour arrière |
| 4 | `git checkout --detach <TAG>` | jamais une branche |
| 5 | `git submodule update --init --recursive` | **l'étape qu'un `git pull` seul oublie** : le pointeur serait à jour, la pile démarrerait sur l'ancien code des sous-modules |
| 6 | `build` | |
| 7 | `migrate` (service one-shot) puis redémarrage backend + frontend | la base n'est pas touchée par le redémarrage |
| 8 | `check --deploy` | la cible **échoue** si ce n'est pas vert |

L'étape 5 mérite qu'on s'y arrête : c'est le mode de défaillance le plus
silencieux de ce dépôt. Un superprojet à jour dont les sous-modules sont restés
en arrière démarre parfaitement, sert l'ancien code, et rien ne le signale.

#### L'étape 2, et pourquoi elle existe

Le 2 août 2026, un commit a fait reculer les deux pointeurs de sous-module vers
l'état d'avant les lots de sécurité. Il n'a jamais été déployé, mais rien ne
l'en aurait empêché. Le hook `verif-sous-modules` ne l'attrape pas : il vérifie
que le pointeur correspond au HEAD du sous-module, jamais le SENS de
l'évolution.

La cible refuse donc un tag qui recule, et dit quoi faire :

```
    ⚠ chm-backend RECULE : 628282a → f2d422a
ERREUR — ce tag ferait RECULER au moins un sous-module.
  Si c'est voulu     : make prod-deploie TAG=... FORCE=1
  Pour revenir       : make prod-retour-arriere TAG=...
```

Surchargeable et non bloquant par principe : un retour arrière recule
volontairement, et c'est légitime.

#### Ce que `check --deploy` tolère, et pourquoi une seule entrée

`security.W008` (`SECURE_SSL_REDIRECT=False`) est attendu **en permanence** : le
TLS est terminé par `mrs-gateway`, Django n'est jamais exposé directement, et le
passer à `True` provoquerait une boucle de redirection. Un `--fail-level
WARNING` nu échouerait donc à chaque déploiement — et on prendrait l'habitude de
l'ignorer, ce qui vaut moins qu'aucun contrôle.

Tout le reste fait échouer, **y compris `W012`/`W016`** que
`DJANGO_COOKIE_SECURE=True` doit solder en production.

La cible exige en plus que le rapport ait réellement été produit. Sans cette
sentinelle, une commande qui échoue avant d'atteindre Django (pile arrêtée,
variable manquante) renvoie un message sans code `(security.Wxxx)` — donc
« aucun code inattendu », donc la cible passe, et le déploiement est validé sans
qu'aucun contrôle n'ait tourné. Défaut constaté en testant la cible.

### Retour arrière

Symétrique du déploiement, `TAG` également obligatoire :

```bash
make prod-retour-arriere TAG=v1.2.0-rc.3
```

Elle refait checkout + `submodule update` + build + redémarrage, **sans jouer de
migration**, puis les mêmes contrôles.

⚠️ **Revenir au code ne défait pas une migration déjà jouée.** Les migrations
Django ne sont pas systématiquement réversibles. Si le déploiement fautif en a
joué une, le retour arrière du code ne suffit pas : il faut restaurer la
sauvegarde prise à son étape 3.

```bash
make prod-restauration DUMP=backups/pre-<tag>-<horodatage>.dump
make prod-up
```

Le chemin de la dernière sauvegarde de pré-déploiement est conservé dans
`.dernier-pre-deploiement`, et rappelé en fin de `prod-retour-arriere`.

**Séquence complète d'un retour arrière après migration :**

```bash
make prod-retour-arriere TAG=<tag précédent>      # code + sous-modules
cat .dernier-pre-deploiement                      # retrouver la sauvegarde
make prod-restauration DUMP=<ce chemin>.dump      # schéma + données
make prod-up                                       # redémarrer
make prod-smoke SMOKE_BASE_URL=https://votre-domaine  # contrôler (obligatoire — cf. Makefile)
```

Les médias sont dans l'archive `<même préfixe>-media.tgz` ; les restaurer se
fait à la main dans `/srv/chm/media`, la suppression d'un fichier étant rare et
rarement souhaitable à annuler en bloc.

## 6. Tests

```bash
make collect            # nombre de tests collectés (baseline : 129 minimum)
make test-backend       # pytest sous PostgreSQL
```

Les tests frontend s'exécutent sur l'hôte (`npm test`) ou dans l'étage de build
de l'image, l'image de production ne contenant pas les devDependencies :

```bash
docker build --target builder -t chm-frontend-build:tmp ./chm-frontend
docker run --rm chm-frontend-build:tmp npm test
```

Le rôle PostgreSQL utilisé par les tests doit pouvoir créer et supprimer la
base de test Django. **Ne pas accorder ce privilège au rôle applicatif de
production** : utiliser un rôle de test distinct.

## 7. Sauvegarde et restauration

### Sauvegarder

```bash
make sauvegarde         # → backups/choirmanager-<horodatage>.dump
```

#### Adresse des alertes de sauvegarde — OBLIGATOIRE

Le script `ops/backup/alert-backup.sh` n'embarque plus d'adresse en dur : il
exige `BACKUP_ALERT_EMAIL` et échoue explicitement sans elle. L'adresse vit
dans un fichier root:root `600`, hors dépôt :

```bash
sudo install -d -m 700 /etc/choirmanager
sudo tee /etc/choirmanager/backup.env >/dev/null <<'EOF'
BACKUP_ALERT_EMAIL=alerte-sauvegarde@votre-domaine
EOF
sudo chmod 600 /etc/choirmanager/backup.env
```

Les unités `choirmanager-backup.service` et
`choirmanager-backup-freshness.service` le chargent via
`EnvironmentFile=-/etc/choirmanager/backup.env`. En appel manuel
(`make prod-sauvegarde`), exporter la variable ou sourcer ce fichier ;

```bash
set -a; . /etc/choirmanager/backup.env; set +a
make prod-sauvegarde
```

Cette adresse est une **donnée personnelle d'exploitation** : ne la remettez
jamais dans un fichier versionné (c'était le cas, cf.
`docs/AUDIT_SECURITE_V2.md`). Les dumps écrits par `make sauvegarde` et par
`prod-deploie` sont créés avec `umask 077` (lisibles par root seulement) : ils
contiennent l'intégralité des données personnelles de la plateforme.

Les médias sont dans le volume `media_data` et doivent être sauvegardés
séparément :

```bash
docker run --rm -v choirmanager_media_data:/media -v "$PWD/backups":/sortie \
  alpine tar czf /sortie/media-$(date +%Y%m%d-%H%M%S).tar.gz -C /media .
```

Règles : chiffrer les sauvegardes, définir une rétention, et vérifier qu'une
sauvegarde d'une version donnée se restaure avec les migrations
correspondantes. `backups/` est ignoré par Git.

### Restaurer

Toujours valider une restauration dans une base **neuve** avant d'écraser quoi
que ce soit :

```bash
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres \
  -c "CREATE DATABASE choirmanager_restore OWNER $POSTGRES_USER;"
docker compose exec -T db pg_restore -U "$POSTGRES_USER" \
  -d choirmanager_restore < backups/choirmanager-<horodatage>.dump
```

Comparer ensuite les volumétries globales et par chorale, puis basculer :

```bash
make restauration DUMP=backups/choirmanager-<horodatage>.dump
```

Noter le temps réel de restauration : il conditionne l'objectif de reprise.

## 8. Rollback

La procédure vit au §5, avec le déploiement dont elle est le symétrique :
[« Retour arrière »](#retour-arrière). En résumé :

```bash
make prod-retour-arriere TAG=<tag précédent>
```

Deux points qui ne s'improvisent pas au moment où l'on en a besoin :

- **le code revient, le schéma non.** Les migrations Django ne sont pas
  systématiquement réversibles : un rollback de schéma passe par la
  restauration d'une sauvegarde, jamais par `migrate <version>` ;
- **la sauvegarde à restaurer est celle prise au moment du déploiement fautif**,
  pas la plus récente : une sauvegarde postérieure contient déjà le schéma que
  l'ancienne version ne sait pas lire. C'est exactement ce que produit l'étape 3
  de `prod-deploie`, dont le chemin est conservé dans
  `.dernier-pre-deploiement`.

Sur le poste de développement, où il n'y a ni tag ni cibles `prod-*`, le
manuel reste : `git checkout <tag> && git submodule update --init --recursive`,
puis `make build && make up`.

## 9. Avant une préproduction

```bash
make check-deploy       # doit ne laisser que des avertissements justifiés
make audit-image        # ni .env, ni SQLite, ni .git, ni venv dans les images
```

À traiter en plus de la pile locale :

- terminer TLS sur un reverse-proxy public et passer
  `DJANGO_SECURE_SSL_REDIRECT=True` si Django est exposé directement ;
- renseigner `DJANGO_CSRF_TRUSTED_ORIGINS` avec le domaine HTTPS servi ;
- remplacer le fichier `.env` par le gestionnaire de secrets de la plateforme ;
- verrouiller le digest de l'image PostgreSQL après validation ;
- régler `GUNICORN_WORKERS` selon la mémoire et le CPU réels de la cible, puis
  le mesurer — la valeur par défaut (3) n'est pas un dimensionnement.

## 10. Dépannage

| Symptôme | Cause probable |
| --- | --- |
| `DJANGO_SECRET_KEY est obligatoire…` | variable absente de `.env` avec `DJANGO_DEBUG=False` — c'est le comportement voulu |
| `DATABASE_URL est obligatoire…` | `.env` absent ou non chargé ; vérifier `docker compose config` |
| `backend` reste `starting` | `migrate` a échoué : `docker compose logs migrate` |
| 502 sur `/api/` | backend non sain ; `make logs` puis `curl` sur `/api/core/health/` |
| Export PDF en 503 | libs GTK/Pango absentes — présentes dans l'image, à vérifier hors conteneur |
| Styles figés | Tailwind v4 se compile hors du pipeline Angular : relancer `npm run tailwind` |

## 11. Export PDF — reproductibilité dev et prod

Les rapports PDF utilisent **WeasyPrint**, qui charge Pango/Cairo/GDK-Pixbuf
via ctypes **au runtime**. Une installation Python réussie ne suffit donc pas :
sans ces bibliothèques, l'export répond 503 « dépendances serveur manquantes »
alors que le CSV continue de fonctionner.

Diagnostic reproductible, sur tout environnement :

```bash
# pile Docker
make verif-pdf
# ou directement
docker compose exec -T backend python manage.py verifier_pdf
```

Sortie 0 + taille du PDF = chaîne opérationnelle. Sortie 1 = le remède exact
est affiché (paquets Linux, runtime GTK Windows, variable `WEASYPRINT_DLL_DIR`).

**Production / Docker** : `chm-backend/Dockerfile` installe déjà `libpango`,
`libpangocairo`, `libpangoft2`, `libgdk-pixbuf`, `libcairo2` et
`fonts-dejavu-core`. Reconstruire l'image (`make build`) suffit.

**Poste Windows (dev hors Docker)** : installer le runtime GTK 3
(https://github.com/tschoonj/GTK-for-Windows-Runtime-Installer). **Le chemin
standard `C:\Program Files\GTK3-Runtime Win64\bin` est détecté
automatiquement** par `chm_config/settings.py` — aucune variable à exporter si
l'installation est aux emplacements par défaut. Pour un chemin personnalisé,
exporter `WEASYPRINT_DLL_DIR` vers son dossier `bin` avant `runserver` :

```powershell
$env:WEASYPRINT_DLL_DIR = "D:\GTK3\bin"
```

Vérification immédiate après installation :

## 12. Développement sans Nginx (ng serve + runserver)

Deux conséquences à connaître, corrigées en v2.0.1 :

- **Médias privés** : en dev sans Nginx, personne n'honore
  `X-Accel-Redirect`. Django sert donc le fichier lui-même
  (`MEDIA_PROTEGE_SERVIR_DIRECT`, actif par défaut quand `DJANGO_DEBUG=True`).
  En production, la variable reste fausse et Nginx seul sert les fichiers.
- **Admin Django / CSRF** : `ng serve` (:4200) et `runserver` (:8000) sont deux
  origines. Les origines de développement sont ajoutées automatiquement à
  `CSRF_TRUSTED_ORIGINS` quand `DJANGO_DEBUG=True`, et un middleware de
  développement normalise un `Origin: null` envoyé par certains aperçus
  embarqués. Rien de tout cela n'est actif en production.

## 13. Docker local sous Windows — trois pièges vérifiés

Ces trois points ont réellement bloqué un premier `up` sur un poste Windows ;
ils ne concernent pas la production, mais coûtent du temps à diagnostiquer.

**1. Scripts `*.sh` en CRLF.** Un checkout Windows peut convertir
`chm-backend/docker/entrypoint.sh` en CRLF. Le shebang devient `/bin/sh\r`,
et le conteneur répond `exec /app/docker/entrypoint.sh: no such file or
directory` alors que le fichier existe. `.gitattributes` force désormais
`*.sh text eol=lf` ; sur un clone antérieur au correctif :
`git add --renormalize .` (ou reconvertir le fichier) puis reconstruire
`backend`.

**2. Port hôte 3000 réservé par Windows.** Hyper-V/WinNAT réserve des plages
entières (observé : 2915-3014), et Docker échoue avec
`listen tcp4 127.0.0.1:3000: bind: An attempt was made to access a socket in a
way forbidden by its access permissions`. Le port INTERNE de WAHA reste 3000 ;
seul le port HÔTE change, via `WAHA_HOST_PORT` dans `.env` (3115 dans l'exemple
local). Sans intérêt en production, où aucun port WAHA n'est publié.

**3. `WAHA_API_KEY` obligatoire même en développement Docker.** Le service
`migrate` lit `DJANGO_DEBUG` depuis `.env` (`False` par défaut), alors que
`compose.dev.yaml` ne passe `True` qu'au service `backend`. Avec
`WAHA_ENABLED=True` et une clé vide, `migrate` refuse donc de démarrer
(`WAHA_ENABLED=true exige WAHA_API_KEY lorsque DJANGO_DEBUG=False`), avant
même que le backend ne soit lancé. Poser une clé quelconque dans `.env` — elle
est partagée par WAHA et Django — ou passer `DJANGO_DEBUG=True` dans `.env`
pour ce poste.

**4. Upload de pièce jointe → 500 `PermissionError: /app/media/annonces`.**
Un volume `media_data` créé par une ancienne exécution peut appartenir à
`root`, alors que le backend tourne sous l'utilisateur `chm` (uid 10001). Le
téléversement d'une photo ou d'une pièce jointe échoue alors en 500, sans
rapport avec le formulaire. Corriger le volume existant :

```bash
docker compose -f compose.yaml -f compose.dev.yaml exec -T -u root \
  backend chown -R chm:chm /app/media
```

Un volume recréé depuis l'image actuelle hérite déjà de `chm:chm` ; cette
correction ne concerne que les volumes antérieurs. En production, c'est le
propriétaire de `/srv/chm/media` sur l'hôte qui doit être aligné (cf. §7).
