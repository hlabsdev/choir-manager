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
make prod-up && make prod-smoke                   # redémarrer et contrôler
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
