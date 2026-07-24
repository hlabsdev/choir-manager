# Plan d'exécution — WSL, Docker et migration PostgreSQL

> Statut : instructions préparatoires uniquement
>
> Date : 24 juillet 2026
>
> Périmètre : MVP ChoirManager
>
> Implémentation : non commencée

Ce document décrit précisément la prochaine intervention. Il ne constitue pas
l'implémentation : aucun Dockerfile, fichier Compose, réglage PostgreSQL ou
package Python ne doit être considéré comme déjà livré.

L'objectif est de faire fonctionner ChoirManager dans WSL avec PostgreSQL sous
Docker, puis de conteneuriser l'ensemble de la pile de manière suffisamment
propre pour préparer une préproduction.

## 1. Décisions actées

- Le développement Docker se poursuit sous WSL 2.
- Le dépôt doit être cloné dans le système de fichiers Linux de WSL, par exemple
  `~/src/choir-manager`, et non travaillé depuis `/mnt/c/...`.
- PostgreSQL remplace SQLite comme base de référence du MVP.
- La configuration Django bascule par `DATABASE_URL`.
- La pile locale cible contient `db`, `migrate`, `backend` et `frontend`.
- Le backend et le frontend restent des sous-modules Git indépendants.
- L'isolation multi-tenant reste une base PostgreSQL partagée et un schéma
  partagé, avec une clé `chorale_id` sur les données métier.
- Aucun schéma PostgreSQL par chorale et aucune Row-Level Security PostgreSQL ne
  sont introduits dans cette étape.
- Les 129 tests backend actuels doivent réussir sous PostgreSQL. La mention de
  118 tests correspond à un ancien état du projet.
- Les 32 tests frontend et le build Angular doivent également rester verts.
- `v1.0.0-mvp.1` reste immuable. Une migration validée donnera lieu à un nouveau
  tag, recommandé : `v1.0.0-mvp.2`.

## 2. Préparer le poste WSL

### 2.1 Vérifier Docker Desktop et WSL

Dans Docker Desktop :

1. activer le moteur WSL 2 ;
2. activer l'intégration pour la distribution WSL utilisée ;
3. conserver les ressources Docker dans WSL ;
4. redémarrer Docker Desktop après toute modification d'intégration.

Dans le terminal WSL :

```bash
docker version
docker compose version
docker run --rm hello-world
```

Les trois commandes doivent réussir avant de toucher au projet.

### 2.2 Cloner dans le système de fichiers Linux

Le clone recommandé est neuf ; il évite de transporter les environnements
virtuels, `node_modules`, permissions et fins de lignes du dossier Windows.

```bash
mkdir -p ~/src
cd ~/src
git clone --recurse-submodules https://github.com/hlabsdev/choir-manager.git
cd choir-manager
git switch main
git pull --ff-only
git submodule sync --recursive
git submodule update --init --recursive
```
PS le clone sous wsl est deja present et c'est elle que nous utilisaons donc maintenant. aussi si necessaire pense a creer un venv dedie pour les comandes a lancer (a moins ce que tu puisse les lancer dorectment sous les dockers des au'ils seront pret)

Vérifier ensuite :

```bash
git status
git submodule status
git -C chm-backend status
git -C chm-frontend status
```

Les trois dépôts doivent être propres.

Configurer les fins de lignes pour Linux :

```bash
git config --global core.autocrlf input
git config --global core.eol lf
```

Ne pas copier dans WSL :

- `chm-backend/venv/` ;
- `chm-frontend/node_modules/` ;
- `chm-frontend/dist/` ;
- les caches Angular ou Pytest ;
- un fichier `.env` Windows ;
- des fichiers contenant des secrets.

Ouvrir le dossier depuis WSL avec `code .` si VS Code et son extension WSL sont
utilisés(deja fait on est actuelement dans vscode sous wsl).

## 3. Branches à utiliser pour l'implémentation

Ne pas développer directement sur `release/mvp-v1`.

Créer les branches suivantes à partir des `main` à jour :

```bash
# Superprojet
git switch -c feat/mvp-postgres-docker

# Backend
git -C chm-backend switch -c feat/mvp-postgres-docker

# Frontend
git -C chm-frontend switch -c feat/mvp-docker-runtime
```

Règles :

1. committer et pousser d'abord les changements dans le sous-module concerné ;
2. ne jamais enregistrer dans le superprojet un commit de sous-module qui
   n'existe pas sur GitHub ;
3. fusionner les branches backend et frontend dans leurs `main` après
   validation ;
4. mettre ensuite à jour les pointeurs de sous-modules dans le `main` du
   superprojet ;
5. faire avancer `release/mvp-v1` seulement lorsque la combinaison complète est
   stable ;
6. créer `v1.0.0-mvp.2` sur ce commit stable, sans modifier
   `v1.0.0-mvp.1`.

La branche de release est une ligne de stabilisation, pas une branche de
développement quotidien.

## 4. Fichiers à créer ou modifier

### 4.1 Superprojet

| Fichier cible | Rôle |
| --- | --- |
| `compose.yaml` | Pile production-like : PostgreSQL, migrations, API et frontend |
| `compose.dev.yaml` | Surcharges de développement : ports, bind mounts, reload |
| `.env.example` | Variables documentées sans secret |
| `.gitignore` | Exclusion de `.env`, sauvegardes, volumes locaux et caches |
| `Makefile` | Commandes courtes et reproductibles sous WSL |
| `docs/DEPLOIEMENT.md` | Exploitation, mise à jour, sauvegarde et rollback |
| `.github/workflows/ci.yml` | Tests backend, tests frontend et build |

Éviter l'ancien nom `docker-compose.yml` pour le nouveau fichier principal ;
utiliser `compose.yaml`.

### 4.2 Backend

| Fichier cible | Modification attendue |
| --- | --- |
| `requirements.txt` | Ajouter `psycopg`, `dj-database-url`, un serveur WSGI et, si retenu, WhiteNoise |
| `chm_config/settings.py` | Lire `DATABASE_URL`, sécuriser les valeurs hors développement |
| `Dockerfile` | Image Python multi-stage, utilisateur non-root, dépendances WeasyPrint |
| `.dockerignore` | Exclure venv, Git, caches, DB SQLite, médias et secrets |
| `docker/entrypoint.sh` | Préparation minimale, avec fins de lignes LF |
| `.env.example` ou documentation racine | Décrire toutes les variables backend |
| endpoint santé existant ou nouveau | Vérifier API et, si souhaité, connexion DB |

Ne pas exécuter systématiquement `migrate` dans chaque processus Gunicorn.
Prévoir un service Compose `migrate` exécuté une fois, puis démarrer le backend
seulement si ce service se termine avec succès.

### 4.3 Frontend

| Fichier cible | Modification attendue |
| --- | --- |
| `Dockerfile` | Build Angular multi-stage puis image Nginx non privilégiée si possible |
| `.dockerignore` | Exclure `node_modules`, `dist`, caches, Git et fichiers locaux |
| `nginx.conf` | SPA fallback et routage `/api` vers le backend |
| environnements Angular | Séparer développement et production |
| `package.json` | Conserver les commandes locales ; rendre `start:dev` portable si possible |

La cible production recommandée utilise une API same-origin :

```text
Navigateur → Nginx frontend → /api/* → backend:8000
```

Le frontend ne doit plus construire en production une URL
`http://<hostname>:8000/api`. En développement non conteneurisé, une URL locale
peut rester disponible dans l'environnement de développement.

## 5. Variables prévues

Le fichier `.env.example` doit contenir uniquement des valeurs factices :

```dotenv
# PostgreSQL local
POSTGRES_DB=choirmanager
POSTGRES_USER=choirmanager
POSTGRES_PASSWORD=change-me
POSTGRES_HOST=db
POSTGRES_PORT=5432
DATABASE_URL=postgresql://choirmanager:change-me@db:5432/choirmanager

# Django
DJANGO_SECRET_KEY=change-me
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOW_ALL_ORIGINS=False
CORS_ALLOWED_ORIGINS=http://localhost

# Email
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL=ChoirManager <no-reply@example.invalid>
```

Points obligatoires :

- `.env` doit être ignoré par Git ;
- les mots de passe ne doivent pas être passés comme arguments de commande ;
- un mot de passe contenant des caractères réservés doit être encodé dans
  `DATABASE_URL` ;
- l'environnement de production doit utiliser le gestionnaire de secrets de la
  plateforme, pas un fichier `.env` committé ;
- `CORS_ALLOWED_ORIGINS` doit remplacer l'ouverture globale lorsque
  `CORS_ALLOW_ALL_ORIGINS=False`.

## 6. Conception de `compose.yaml`

### 6.1 Service `db`

Utiliser une version majeure PostgreSQL explicitement fixée. Recommandation pour
ce jalon : `postgres:17-bookworm`, à garder identique entre développement,
préproduction et production.

Le service doit prévoir :

- `POSTGRES_DB`, `POSTGRES_USER` et `POSTGRES_PASSWORD` ;
- un volume nommé `postgres_data` ;
- un `healthcheck` avec `pg_isready` ;
- aucune publication publique du port en production ;
- en développement seulement :
  `127.0.0.1:5432:5432` si un client SQL hôte est nécessaire ;
- une politique de redémarrage adaptée à l'environnement ;
- un arrêt gracieux.

Ne pas utiliser `latest`. En préproduction, verrouiller aussi le digest de
l'image après validation.

### 6.2 Service `migrate`

Le service doit :

- réutiliser exactement l'image du backend ;
- dépendre de `db` avec `condition: service_healthy` ;
- exécuter `python manage.py migrate --noinput` ;
- sortir avec le code Django ;
- ne pas redémarrer en boucle.

### 6.3 Service `backend`

Le service doit :

- dépendre de `migrate` avec `condition: service_completed_successfully` ;
- démarrer un serveur WSGI de production, pas `runserver` ;
- exposer le port 8000 uniquement sur le réseau Compose ;
- exécuter l'application avec un utilisateur non-root ;
- recevoir `DATABASE_URL` et les réglages Django par environnement ;
- monter un volume média uniquement si le stockage local est retenu pour le
  pilote ;
- fournir un `healthcheck`.

Le nombre de workers ne doit pas être copié arbitrairement : le régler selon la
mémoire et le CPU de la cible, puis le tester.

### 6.4 Service `frontend`

Le service doit :

- servir le build Angular ;
- attendre que le backend soit sain si le proxy API l'exige ;
- publier le seul port utilisateur, par exemple `127.0.0.1:8080:8080` ;
- rediriger toutes les routes applicatives vers `index.html` ;
- transmettre `/api/` au backend sans perdre le préfixe attendu ;
- servir ou router `/media/` selon la stratégie de stockage choisie ;
- envoyer des en-têtes HTTP de sécurité adaptés.

### 6.5 Volumes et réseaux

Volumes minimaux :

```text
postgres_data
media_data        seulement pour le stockage local du pilote
```

Un réseau Compose interne suffit. La base ne doit pas être joignable depuis
l'extérieur de la machine.

## 7. Adapter Django à `DATABASE_URL`

Ajouter les dépendances PostgreSQL dans le backend :

```text
psycopg[binary]
dj-database-url
```

La configuration cible doit être équivalente à :

```python
DATABASES = {
    "default": dj_database_url.config(
        conn_max_age=60,
        conn_health_checks=True,
    )
}
```

La syntaxe exacte doit être adaptée à la version installée de
`dj-database-url`, puis couverte par un test de configuration.

Règles :

- `DATABASE_URL` est obligatoire hors mode de développement SQLite explicitement
  autorisé ;
- aucun fallback silencieux vers `db.sqlite3` dans le conteneur ;
- les connexions persistantes utilisent `CONN_HEALTH_CHECKS=True` ;
- la timezone Django reste explicite et cohérente ;
- les migrations restent la source de vérité du schéma ;
- aucun SQL PostgreSQL ne doit contourner le filtrage multi-tenant.

Pendant la transition, un fallback SQLite local peut être conservé seulement
si sa présence est claire et testée. Le critère final du jalon exige que CI et
Compose utilisent PostgreSQL.

## 8. Première bascule PostgreSQL

### 8.1 Commencer par une base vide

La première validation ne doit pas importer immédiatement `db.sqlite3`.

Ordre :

```bash
docker compose config
docker compose build --pull
docker compose up -d db
docker compose ps
docker compose run --rm migrate
docker compose run --rm backend python manage.py check
docker compose run --rm backend python manage.py showmigrations
```

Toutes les migrations doivent être appliquées sans modification manuelle de la
base.

Provisionner ensuite des données propres :

```bash
docker compose run --rm backend python manage.py createsuperuser
docker compose run --rm backend python manage.py provision_chorale ...
docker compose run --rm backend python manage.py seed_demo_chorale
```

La commande de seed reste interdite en production.

### 8.2 Importer éventuellement les données SQLite

Traiter l'import comme une opération séparée et réversible :

1. sauvegarder le fichier SQLite hors du dépôt ;
2. archiver un hash et la date de cette sauvegarde ;
3. exporter uniquement les données métier nécessaires avec Django
   `dumpdata`, pas les tables de sessions ni les permissions générées ;
4. migrer une base PostgreSQL vide ;
5. charger les données ;
6. réinitialiser les séquences PostgreSQL après les clés primaires importées ;
7. comparer les nombres d'objets globaux et par chorale ;
8. vérifier les fichiers médias associés ;
9. conserver un journal de migration ;
10. ne supprimer aucune sauvegarde avant validation utilisateur.

Exclusions minimales à examiner lors du `dumpdata` :

```text
contenttypes
auth.permission
admin.logentry
sessions.session
```

Ne pas automatiser cet import dans l'entrypoint normal. Une initialisation de
conteneur doit pouvoir démarrer une base propre sans dépendre de l'ancienne
SQLite.

## 9. Rejouer les tests sous PostgreSQL

### 9.1 Baseline obligatoire

Le baseline actuel est :

```text
Backend  : 129 tests
Frontend : 32 tests dans 7 fichiers
```

Avant toute modification, collecter et enregistrer le nombre réel :

```bash
docker compose run --rm backend pytest --collect-only -q
```

Après la bascule :

```bash
docker compose run --rm backend \
  python manage.py makemigrations --check --dry-run

docker compose run --rm backend python manage.py check
docker compose run --rm backend pytest -q

docker compose run --rm frontend npm test
docker compose run --rm frontend npm run build
```

La CI doit exécuter les tests backend avec un service PostgreSQL. Une suite
SQLite optionnelle peut rester utile pour détecter les dépendances spécifiques,
mais elle ne remplace plus PostgreSQL.

Le rôle PostgreSQL utilisé par les tests doit pouvoir créer et supprimer la base
de test Django et lire la base système `postgres`. Ne pas accorder ce privilège
au rôle applicatif de production : utiliser un rôle ou un service de test
distinct.

Si moins de 129 tests sont collectés, arrêter la validation et expliquer
précisément les tests manquants. Ne pas accepter une baisse silencieuse.

### 9.2 Faux verts à rechercher

PostgreSQL peut révéler des comportements masqués par SQLite :

- contraintes de type plus strictes ;
- casse et comportement des recherches ;
- tri des valeurs `NULL` ;
- comparaisons de dates et fuseaux horaires ;
- précision des `Decimal` ;
- clés étrangères et contraintes uniques ;
- séquences après import de clés primaires ;
- transactions imbriquées ;
- verrous et concurrence ;
- agrégations et `distinct` ;
- ordre non déterministe sans `order_by`.

Tout test qui ne frappe pas réellement PostgreSQL doit être corrigé. Vérifier
dans le test que `connection.vendor == "postgresql"` pour la suite PostgreSQL.

## 10. Audit multi-tenant spécifique à PostgreSQL

Le passage à PostgreSQL ne change pas le modèle de tenancy :

```text
Une base PostgreSQL
  └── un schéma applicatif partagé
       ├── chorale A : lignes avec chorale_id=A
       └── chorale B : lignes avec chorale_id=B
```

L'isolation repose toujours sur :

1. `ChoraleMiddleware` qui établit `request.chorale` ;
2. `ChoraleFilterMixin` qui filtre les querysets et injecte la chorale ;
3. les permissions DRF ;
4. les validations de relations ;
5. les tests d'isolation.

### 10.1 Matrice minimale de tests

Pour chaque domaine métier :

- une liste ne retourne que les lignes de la chorale connectée ;
- un détail d'une autre chorale répond 404 ou 403, jamais 200 ;
- une création force la chorale de la requête ;
- un payload contenant un autre `chorale_id` est ignoré ou rejeté ;
- une mise à jour ne peut pas déplacer un objet vers une autre chorale ;
- une relation vers un objet d'une autre chorale est rejetée ;
- recherche, filtre, tri, pagination et agrégation restent scopés ;
- soft-delete et restore restent scopés ;
- les rapports et le dashboard n'agrègent aucune donnée externe ;
- les notifications restent filtrées par destinataire ;
- la suspension d'une chorale bloque accès et invitations ;
- le superutilisateur conserve son comportement global explicitement testé.

> **Avenant A — comportement superutilisateur : ne pas le figer.**
>
> Le dernier point ci-dessus est volontairement **gelé en l'état** pour ce
> jalon. Les tests existants qui décrivent le superutilisateur comme voyant
> toutes les chorales (`core/tests/test_api_integration.py`) sont conservés,
> mais **aucun nouveau test ne doit graver cette règle**.
>
> Raison : la règle « superuser voit toutes les chorales » change au jalon
> suivant. Multiplier les tests qui l'affirment transformerait un choix produit
> révisable en contrainte de régression, et rendrait le prochain jalon
> inutilement coûteux.
>
> Concrètement, pour la migration PostgreSQL/Docker : ne pas étendre la
> couverture du comportement global du superutilisateur ; se limiter à vérifier
> que la bascule de base de données ne l'a pas altéré.

### 10.2 Contraintes et index

Auditer les modèles et migrations :

- chaque modèle métier possède une FK `chorale` non nullable, sauf justification
  documentée ;
- les contraintes uniques métier incluent `chorale` lorsqu'une valeur peut être
  répétée entre tenants ;
- les FK ajoutent leurs index standards ;
- les requêtes fréquentes peuvent nécessiter des index composites commençant
  par `chorale`, par exemple `(chorale, statut)` ou `(chorale, date)` ;
- aucune validation importante n'existe seulement dans Angular ;
- les serializers limitent les querysets des champs relationnels à la chorale.

Ne pas ajouter PostgreSQL RLS pendant cette migration. RLS pourra être évaluée
plus tard comme défense supplémentaire, après stabilisation du modèle actuel.

### 10.3 Concurrence à tester

PostgreSQL rend possible une validation plus réaliste de :

- la consommation concurrente d'une invitation limitée, protégée par
  `select_for_update` ;
- l'unicité d'un mandat actif pour un poste `unique_actif` ;
- les paiements et mouvements financiers créés dans une transaction ;
- la génération de matricules ou numéros séquentiels ;
- les doubles soumissions.

Ajouter des tests transactionnels ciblés pour les chemins où deux requêtes
simultanées pourraient contourner une vérification applicative.

Les tests de `select_for_update` doivent utiliser `TransactionTestCase` ou
`pytest.mark.django_db(transaction=True)`. Un `TestCase` Django enveloppé dans
une transaction peut masquer une utilisation incorrecte du verrouillage et
produire un faux vert.

## 11. Vérifications de sécurité avant préproduction

Exécuter avec les réglages proches de la production :

```bash
docker compose run --rm backend python manage.py check --deploy
```

Résoudre ou justifier chaque avertissement concernant :

- HTTPS et redirection SSL ;
- cookies sécurisés ;
- HSTS ;
- clé secrète ;
- debug ;
- hôtes autorisés ;
- CORS et CSRF ;
- logs sensibles ;
- permissions des médias ;
- taille et type des uploads ;
- durée et rotation des tokens.

Ajouter une vérification que l'image finale ne contient ni `.env`, ni SQLite,
ni dépôt `.git`, ni environnement virtuel, ni `node_modules` de développement.

## 12. Sauvegarde et restauration

Avant le pilote :

- documenter `pg_dump` et `pg_restore` ;
- tester une restauration dans une nouvelle base ;
- sauvegarder séparément les médias ;
- chiffrer les sauvegardes ;
- définir leur rétention ;
- vérifier qu'une sauvegarde d'une version peut être restaurée avec les
  migrations correspondantes ;
- enregistrer le temps réel de restauration.

`docker compose down` ne doit pas effacer les données. Ne jamais utiliser
`docker compose down -v` hors d'un environnement jetable explicitement confirmé.

> **Dette explicite pour le jalon déploiement — restauration `pg_dump`/`pg_restore`.**
>
> Une restauration a été exercée **une fois, manuellement**, pendant la bascule
> initiale (§8) : `pg_dump -Fc` de la base de travail, restauration dans une
> base PostgreSQL neuve (`choirmanager_restore`), comparaison des volumétries
> (`chorales`, `membres`, `users`, `mandats`) — identiques des deux côtés. Ce
> n'était **pas** un test automatisé : aucun job CI ni test pytest n'exerce ce
> chemin, rien ne le rejoue à chaque changement de schéma, et il n'a été mené
> qu'une fois sur un volume de données modeste (quelques dizaines de lignes).
>
> Restent non faits, à traiter avant tout pilote réel :
> - sauvegarde chiffrée et politique de rétention (§12, points « chiffrer » et
>   « définir leur rétention ») — non implémentées ;
> - sauvegarde séparée des médias (`media_data`) — documentée dans
>   `docs/DEPLOIEMENT.md` mais jamais exécutée ;
> - mesure du temps réel de restauration ;
> - validation qu'une sauvegarde d'une version donnée se restaure avec les
>   migrations de cette même version (rollback, cf. §8 de `DEPLOIEMENT.md`) ;
> - un test automatisé (ou au moins une procédure documentée rejouée
>   régulièrement) plutôt qu'une vérification ad hoc.
>
> Ne pas considérer le critère correspondant du §13 comme acquis tant que ce
> qui précède n'est pas fait.

## 13. Critères d'acceptation du jalon

La migration Docker/PostgreSQL est terminée seulement si :

- [ ] un clone neuf sous WSL démarre avec des commandes documentées ;
- [ ] `docker compose config` est valide ;
- [ ] PostgreSQL est sain avant les migrations ;
- [ ] toutes les migrations Django s'appliquent sur une base vide ;
- [ ] `DATABASE_URL` est la source de configuration dans Compose et en CI ;
- [ ] 129 tests backend réussissent réellement sous PostgreSQL ;
- [ ] 32 tests frontend réussissent ;
- [ ] le build Angular réussit ;
- [ ] la matrice multi-tenant ne révèle aucune fuite ;
- [ ] les tests de concurrence critiques sont verts ;
- [ ] les exports CSV et PDF fonctionnent dans l'image backend ;
- [ ] l'image finale ne contient aucun secret ni donnée SQLite ;
- [ ] une sauvegarde PostgreSQL est restaurée avec succès ;
- [ ] la documentation WSL, exploitation et rollback est à jour ;
- [ ] les commits des sous-modules sont publiés avant le commit superprojet ;
- [ ] `release/mvp-v1` pointe sur la combinaison validée ;
- [ ] un nouveau tag annoté `v1.0.0-mvp.2` est créé et publié.

## 14. Commandes de synchronisation après publication

Sur WSL, pour recevoir uniquement la documentation préparatoire :

```bash
cd ~/src/choir-manager
git switch main
git pull --ff-only
git submodule sync --recursive
git submodule update --init --recursive
git status
```

Après la future implémentation, utiliser les mêmes commandes. Le superprojet
sélectionnera alors automatiquement les bons commits backend et frontend.

## 15. Références techniques

- Docker Desktop — bonnes pratiques WSL :
  <https://docs.docker.com/desktop/features/wsl/best-practices/>
- Docker Compose — ordre de démarrage et healthchecks :
  <https://docs.docker.com/compose/how-tos/startup-order/>
- Image officielle PostgreSQL :
  <https://hub.docker.com/_/postgres>
- Django — configuration des bases :
  <https://docs.djangoproject.com/en/5.1/ref/settings/#databases>
