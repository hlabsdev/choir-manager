# ChoirManager (CHM)

ChoirManager est une application SaaS multi-tenant de gestion de chorales. Elle
centralise les membres et responsabilités, le répertoire musical, les
répétitions et présences, la caisse et les cotisations, les communications,
les notifications et les rapports.

Le produit associe une API Django REST à une interface Angular mobile-first :

- `chm-backend/` : Django 5, Django REST Framework, JWT et SQLite au stade MVP ;
- `chm-frontend/` : Angular 21 standalone et zoneless, Signals, Tailwind CSS 4
  et Vitest.

> **État réel au 26 juillet 2026 :** le périmètre fonctionnel du MVP est
> implémenté, le multi-chorale l'est côté backend ET frontend, et les suites
> passent — 276 tests backend et 87 tests frontend. Le projet reste un
> environnement de développement : il n'est pas encore prêt pour héberger des
> données réelles en production.

Le code, les noms de classes et les champs de base de données sont en anglais.
Les textes d'interface, les logs et les commentaires métier sont volontairement
en français.

## Version et dépôts

Ce dépôt est le **superprojet**. Il conserve la documentation commune et fige
une combinaison compatible des deux dépôts applicatifs au moyen de sous-modules
Git.

| Élément | Référence |
| --- | --- |
| Superprojet | `https://github.com/hlabsdev/choir-manager.git` |
| Backend | `https://github.com/hlabsdev/chm-backend.git` |
| Frontend | `https://github.com/hlabsdev/chm-frontend.git` |
| Ligne de développement | `main` (à jour) |
| Ligne de release | `release/mvp-v1` — **unique**, les tags s'y incrémentent |
| Dernier jalon | tag annoté `v1.1.0-rc.2` (multi-chorale frontend) |
| Backend figé par le jalon | `a41ddb8` |
| Frontend figé par le jalon | `07c9e94` |

Le périmètre du jalon est décrit dans [RELEASE_NOTES.md](RELEASE_NOTES.md). Le
travail à venir et ses critères de sortie sont centralisés dans
[.agents/workflows/fil-conducteur.md](.agents/workflows/fil-conducteur.md).
Le plan technique détaillé de la prochaine étape est disponible dans
[docs/PLAN_DEPLOIEMENT_DOCKER_POSTGRES_WSL.md](docs/PLAN_DEPLOIEMENT_DOCKER_POSTGRES_WSL.md).

## Fonctionnalités disponibles

| Domaine | État | Capacités principales |
| --- | :---: | --- |
| Authentification | Opérationnel | Connexion JWT, refresh mutualisé, déconnexion, changement de mot de passe |
| Multi-tenant | Opérationnel | Isolation des données par chorale, suspension globale d'une chorale |
| Membres | Opérationnel | Liste, recherche, filtres, création, fiche, édition et soft-delete |
| Structure | Opérationnel | Pupitres, postes, mandats, groupes et organigramme |
| Onboarding | Opérationnel | Demande de chorale modérée, provisionnement opérateur, invitation choriste |
| Présences | Opérationnel | Répétitions, pointage mobile, permissions d'absence et validations |
| Répertoire | Opérationnel | Chants, thèmes, partitions et suivi des chants travaillés |
| Finances | Opérationnel | Journal de caisse, catégories, tarifs, campagnes, cotisations et paiements |
| Communications | Opérationnel | Annonces et pièces jointes |
| Notifications | Opérationnel | Notifications in-app, compteur de non-lues et emails ciblés best-effort |
| Rapports | Opérationnel | Finances, présences, effectifs, répertoire, exports CSV et PDF |
| Dashboard | Opérationnel | Indicateurs et actions adaptés au rôle |

« Opérationnel » signifie ici présent dans le backend et l'interface, avec les
contrôles d'accès correspondants. Cela ne signifie pas encore « exploitable en
production » : voir [Limites actuelles](#limites-actuelles).

## Profils et accès

Les droits réels sont toujours vérifiés côté API. Le frontend adapte la
navigation et les actions visibles, mais ne constitue jamais la barrière de
sécurité.

| Profil | Usage principal |
| --- | --- |
| Superutilisateur | Administration globale de la plateforme et accès inter-chorales |
| Bureau | Administration de la chorale, membres, structure, annonces et rapports |
| Trésorier | Caisse, cotisations, paiements et rapports financiers |
| Maître de chœur | Répertoire, répétitions, pointage et rapports métier |
| Chef de pupitre | Responsabilités déléguées selon son mandat et les groupes associés |
| Membre actif ou stagiaire | Espace personnel, annonces, notifications et fonctions autorisées |
| Membre honoraire | Accès en lecture limité selon les règles de la chorale |
| Membre inactif | Aucun groupe de base actif |

Un rôle n'est pas stocké comme un simple attribut utilisateur. Il découle d'un
`Mandat`, lié à un `Poste`, lui-même relié à des groupes Django. Les groupes
effectifs sont recalculés automatiquement lors des changements de mandat ou de
statut.

## Parcours d'entrée dans la plateforme

### Créer une chorale

Deux voies existent et partagent le même service de provisionnement :

1. un opérateur exécute `python manage.py provision_chorale` ;
2. un responsable remplit `/auth/demande-chorale`, puis l'opérateur approuve ou
   rejette la demande depuis l'administration Django.

Une demande publique ne crée jamais automatiquement une chorale. Le formulaire
est protégé par limitation de débit, honeypot et détection des demandes en
double.

### Rejoindre une chorale existante

Il n'existe pas d'inscription libre à partir d'un identifiant de chorale. Le
Bureau génère un code d'invitation de huit caractères, éventuellement limité en
durée ou en nombre d'utilisations. Le choriste utilise ensuite
`/rejoindre/:code`. Le backend vérifie le code, inscrit le membre dans la bonne
chorale et ouvre sa session.

Les détails des endpoints et protections sont documentés dans
[chm-backend/README.md](chm-backend/README.md#onboarding).

## Architecture

### Isolation multi-tenant

Une `Chorale` est la racine d'un tenant ; il n'existe pas une base séparée par
chorale.

```text
TimeStampedModel
  Chorale
  ChoraleOwnedModel
    SoftDeleteModel
```

L'isolation repose sur deux couches complémentaires :

1. `ChoraleMiddleware` détermine `request.chorale` à partir du membre connecté ;
2. `ChoraleFilterMixin` filtre les querysets et injecte la chorale à la création.

`SoftDeleteMixin` masque les objets supprimés et transforme les suppressions en
soft-delete. Seul un superutilisateur peut demander les éléments supprimés avec
`?include_deleted=true`.

### Autorisations

La chaîne d'autorisation est :

```text
Membre → Mandat actif → Poste → Groupes Django → Permission API
```

Les groupes ne doivent jamais être modifiés manuellement. Les signaux de
`membres/signals.py` sont la source de vérité.

### Authentification et session

Le backend utilise `djangorestframework-simplejwt`. Le token contient notamment
les groupes, le statut superutilisateur, le nom et la devise de la chorale et
l'identifiant du membre. Angular décode ces claims localement ; il n'existe pas
d'appel `/me/`.

L'access token dure 30 minutes. Le frontend tente un refresh silencieux et
mutualisé sur une réponse 401. La suspension d'une chorale bloque les nouvelles
connexions, invalide l'accès métier des tokens déjà émis et désactive les
invitations.

### Backend

Les applications Django sont `core`, `authentication`, `membres`, `musique`,
`presences`, `finances`, `communications`, `rapports` et `notifications`. Leurs
routes sont montées sous `/api/<application>/`.

La logique métier doit rester dans `services.py` ou `signals.py`, pas dans les
vues ou serializers. Un nouveau modèle appartenant à une chorale doit
normalement hériter de `SoftDeleteModel`, et son ViewSet doit appliquer les
mixins d'isolation.

### Frontend

Le frontend est organisé en composants standalone, sans NgModules et sans
`zone.js`. Les domaines sont lazy-loadés depuis `src/app/features/`. L'état
réactif utilise les Signals et les mises à jour immuables.

Les URLs de l'API sont centralisées dans
`src/environments/environment.ts`. Les icônes proviennent de `lucide-angular`.
Le système visuel commun utilise Indigo comme couleur principale, Ambre comme
accent et des classes réutilisables définies dans `src/styles.css`.

Chaque écran asynchrone doit traiter explicitement les états chargement, vide et
erreur. Les écrans de pointage sont conçus mobile-first avec de grandes zones
tactiles.

## Arborescence du superprojet

```text
choir-manager/
├── chm-backend/                 sous-module Django REST
├── chm-frontend/                sous-module Angular
├── docs/
│   ├── Guide_utilisateur_ChoirManager.docx
│   └── build_user_manual.mjs
├── .agents/
│   ├── rules/                   conventions du projet
│   └── workflows/
│       └── fil-conducteur.md     état réel et feuille de route active
├── README.md
├── RELEASE_NOTES.md
└── VERSION
```

## Installation locale

### Prérequis

- Git avec prise en charge des sous-modules ;
- Python et `venv`, avec une version compatible avec Django 5.1 ;
- Node.js avec une version compatible avec Angular 21 ;
- npm — le projet déclare npm `10.8.2` comme gestionnaire ;
- GTK/Pango/Cairo uniquement si l'export PDF doit fonctionner localement.

### 1. Cloner le superprojet

```bash
git clone --recurse-submodules https://github.com/hlabsdev/choir-manager.git
cd choir-manager
```

Pour compléter un clone réalisé sans les sous-modules :

```bash
git submodule update --init --recursive
```

Pour le prochain cycle Docker, travailler depuis une distribution WSL 2 et
conserver le clone dans le système de fichiers Linux, par exemple
`~/src/choir-manager`. Ne pas utiliser le dépôt monté depuis
`/mnt/c/...` : les bind mounts y sont plus lents et certains événements de
surveillance de fichiers Linux ne sont pas transmis correctement.

Pour restaurer exactement le jalon MVP :

```bash
git checkout v1.0.0-mvp.1
git submodule update --init --recursive
```

### 2. Préparer et lancer le backend

```bash
cd chm-backend
python -m venv venv
```

Activation sous PowerShell :

```powershell
.\venv\Scripts\Activate.ps1
```

Activation sous Bash :

```bash
source venv/Scripts/activate
```

Installation et démarrage :

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

L'API est alors disponible sur `http://localhost:8000`.

Pour créer un compte d'administration de plateforme :

```bash
python manage.py createsuperuser
```

Pour provisionner une première chorale et son compte Bureau :

```bash
python manage.py provision_chorale \
  --nom "Ma Chorale" \
  --prefix MCH \
  --admin-username president_mch \
  --admin-email president@mch.example \
  --admin-first-name Awa \
  --admin-last-name Traore
```

Si `--admin-password` est omis, un mot de passe est généré et affiché une seule
fois.

Pour ajouter une seconde chorale avec des données de démonstration :

```bash
python manage.py seed_demo_chorale
```

Cette commande est réservée au développement et à la QA.

### 3. Préparer et lancer le frontend

Dans un autre terminal :

```bash
cd chm-frontend
npm install
npm run start
```

L'interface est disponible sur `http://localhost:4200` et contacte le backend
sur le même hôte, port `8000`.

Commandes frontend utiles :

```bash
npm run start:dev    # Tailwind en surveillance + serveur Angular
npm run tailwind     # reconstruire les styles générés
npm run build        # build de production Angular
npm test             # tests Vitest
```

Tailwind 4 est compilé par son CLI avant les commandes de démarrage et de build ;
il n'est pas intégré directement au pipeline esbuild d'Angular.

## Configuration

Le backend propose des valeurs de développement non sécurisées. Les variables
suivantes doivent être explicitement définies hors développement :

| Variable | Rôle |
| --- | --- |
| `DJANGO_SECRET_KEY` | Clé secrète Django |
| `DJANGO_DEBUG` | Activation du mode debug |
| `DJANGO_ALLOWED_HOSTS` | Hôtes autorisés, séparés par des virgules |
| `CORS_ALLOW_ALL_ORIGINS` | Autorisation CORS globale ; doit être désactivée en production |
| `WEASYPRINT_DLL_DIR` | Dossier des DLL GTK sous Windows, si nécessaire |
| `EMAIL_BACKEND` | Backend email, console par défaut |
| `EMAIL_HOST`, `EMAIL_PORT` | Serveur et port SMTP |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | Identifiants SMTP |
| `EMAIL_USE_TLS` | Activation de TLS |
| `DEFAULT_FROM_EMAIL` | Adresse d'expédition |

En développement, les emails sont écrits dans la console. Les notifications
email sont best-effort : un échec d'envoi ne doit pas annuler l'action métier.

Le frontend déduit actuellement l'hôte de l'API depuis
`window.location.hostname` et utilise `http://<hôte>:8000/api`. Cette
configuration facilite les essais sur le réseau local, mais doit être remplacée
par une URL HTTPS propre à l'environnement lors du passage en production.

## Rapports PDF

Les exports utilisent WeasyPrint et nécessitent GTK/Pango/Cairo :

- Linux : installer au minimum `libpango-1.0-0`, `libpangocairo-1.0-0` et
  `libgdk-pixbuf-2.0-0` ;
- Windows : installer un runtime GTK3, par exemple via MSYS2 avec
  `mingw-w64-ucrt-x86_64-gtk3`.

Si ces bibliothèques manquent, l'API PDF répond avec un HTTP 503 explicite.
L'export CSV reste disponible.

## Tests et vérifications

Backend :

```bash
cd chm-backend
pytest -q
python manage.py check
```

La suite contient 276 tests couvrant notamment l'authentification, l'isolation
inter-chorales, le RBAC, l'onboarding, les invitations, les membres, les
présences, la musique, les finances, les annonces, les notifications, les
rapports et la suspension d'une chorale.

Frontend :

```bash
cd chm-frontend
npm test
npm run build
```

La suite actuelle contient 87 tests Vitest répartis dans 13 fichiers. Elle couvre
les guards (dont le cloisonnement opérateur), le décodage du token, le chemin
unique de bascule de chorale, le sélecteur de tenant, la coquille applicative, le
dashboard, des utilitaires partagés et des composants clés de structure,
d'annonces et de rapports.

Les garanties multi-chorale se valident **par mutation**, pas par une suite verte
— protocole et tableau des mutations dans `chm-frontend/README.md`.

Dernière vérification documentaire, le 26 juillet 2026 :

- backend : 276 tests réussis ;
- frontend : 87 tests réussis.

## Travailler avec les sous-modules

Un commit du superprojet enregistre seulement le commit sélectionné dans chaque
sous-module. Pour intégrer une modification applicative :

1. effectuer et publier le commit dans `chm-backend/` ou `chm-frontend/` ;
2. revenir à la racine ;
3. indexer le pointeur modifié avec `git add chm-backend` ou
   `git add chm-frontend` ;
4. créer un commit du superprojet décrivant la nouvelle combinaison.

Après un `git pull` du superprojet, synchroniser les composants avec :

```bash
git submodule update --init --recursive
```

## Limites actuelles

Le MVP ne doit pas être déployé tel quel avec des données réelles :

- SQLite est encore la base principale et `db.sqlite3` est suivi dans le dépôt
  backend pour le jalon de démonstration ;
- `DEBUG=True`, `ALLOWED_HOSTS=*`, CORS ouvert et une clé secrète de
  développement sont les valeurs par défaut ;
- les médias sont stockés localement dans `chm-backend/media/` ;
- aucune configuration Docker, CI/CD, sauvegarde, supervision ou déploiement
  reproductible n'est encore fournie dans le superprojet ;
- l'URL API du frontend est encore construite pour un usage local en HTTP ;
- la couverture frontend reste ciblée et il n'existe pas encore de suite E2E
  complète par rôle ;
- SMTP et les dépendances système de WeasyPrint doivent être configurés dans
  l'environnement cible.

Le passage en préproduction, avec PostgreSQL, configuration sécurisée,
stockage persistant, CI et recette E2E, constitue le prochain jalon. Son ordre
d'exécution et ses critères d'acceptation sont définis dans le
[fil conducteur actif](.agents/workflows/fil-conducteur.md).

La migration PostgreSQL et la préparation Docker sont **livrées** (jalon 1,
`v1.0.0-mvp.2`), comme le cloisonnement opérateur/tenant (jalon 2) et le passage
multi-chorale backend puis frontend (jalons 3 et 4, `v1.1.0-rc.2`).

Le modèle de livraison reste le même : développement sur une branche de
fonctionnalité, fusion dans `main` une fois validée, puis convergence de
`release/mvp-v1` sur le même commit et pose d'un tag annoté. Les tags
s'incrémentent sur cette unique ligne de release ; les précédents ne sont jamais
modifiés.

## Hors périmètre du MVP

Les fonctionnalités suivantes sont volontairement différées jusqu'après un
pilote utilisateur : enregistrements audio/vidéo, notifications push et SMS,
calendrier externe, application native, fonctionnement PWA/offline avancé et
module Activités/Planning complet.

## Documentation complémentaire

- [Guide utilisateur Word](docs/Guide_utilisateur_ChoirManager.docx)
- [Plan WSL, Docker et PostgreSQL](docs/PLAN_DEPLOIEMENT_DOCKER_POSTGRES_WSL.md)
- [README backend](chm-backend/README.md)
- [README frontend](chm-frontend/README.md)
- [Notes de version](RELEASE_NOTES.md)
- [Instructions Claude Code](CLAUDE.md)
- [Instructions Codex](AGENTS.md)
- [Règles spécifiques ChoirManager](.agents/rules/choir-manager-rules.md)
