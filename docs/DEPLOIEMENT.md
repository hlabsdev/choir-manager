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
| `DJANGO_COOKIE_SECURE` | sans objet | `True` |

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

### Email — vérification SPF/DKIM APRÈS déploiement

Configuration : Google Workspace, `smtp.gmail.com:587` en TLS, authentifié par
un **mot de passe d'application** (jamais le mot de passe du compte, jamais
committé — cf. `.env.example`).

`DEFAULT_FROM_EMAIL` doit désigner un compte réellement autorisé à envoyer pour
le domaine. Un expéditeur qui ne correspond pas au compte authentifié fait
échouer SPF, et les messages atterrissent en indésirables — ou disparaissent.

**Cette vérification est manuelle et ne peut pas être testée en CI** : aucun
test ne peut constater ce que le serveur *récepteur* pense de notre domaine.

1. déclencher un vrai envoi vers une adresse **Gmail** (approuver une demande
   d'absence sur un compte de test) ;
2. dans Gmail, ouvrir le message → menu ⋮ → **« Afficher l'original »** ;
3. confirmer **`SPF : PASS`** *et* **`DKIM : PASS`**, tous deux sur
   `sankoftechnologies.com` — pas sur un domaine d'infrastructure Google ;
4. vérifier au passage l'en-tête `Reply-To` : il doit porter l'adresse de
   contact de la chorale émettrice.

> ⚠️ **La console Workspace peut afficher DKIM comme actif alors que
> l'enregistrement DNS n'a pas propagé.** C'est le message reçu qui fait foi,
> pas la console. Refaire le contrôle si l'enregistrement a été posé moins de
> 48 h auparavant.

Si `SPF : PASS` mais `DKIM : NEUTRAL` ou absent : la clé DKIM n'est pas publiée
ou pas encore propagée. Les messages partent, mais leur réputation est
mauvaise — à corriger avant d'ouvrir le pilote à de vrais membres.

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

### Mise à jour applicative

```bash
git pull --ff-only
git submodule update --init --recursive
make build
make migrate            # service one-shot, avant de redémarrer l'API
make up
make ps
```

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

1. arrêter la pile : `make down` ;
2. remettre le superprojet et ses sous-modules sur le tag précédent :

   ```bash
   git checkout v1.0.0-mvp.1
   git submodule update --init --recursive
   ```

3. reconstruire : `make build` ;
4. restaurer la sauvegarde **contemporaine de ce tag** — une sauvegarde plus
   récente peut contenir un schéma que les migrations de l'ancienne version ne
   savent pas lire ;
5. redémarrer : `make up`.

Les migrations Django ne sont pas systématiquement réversibles : un rollback de
schéma passe par la restauration d'une sauvegarde, pas par `migrate <version>`.

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
