# CLAUDE.md

Ce fichier guide Claude Code (claude.ai/code) lors de son travail dans ce dépôt.

## Projet

ChoirManager (CHM) — SaaS multi-tenant de gestion de chorales : membres,
répertoire musical, présences/pointage, finances, annonces, notifications et
rapports. API Django REST + frontend Angular 21.

**État** : jalon 4 (multi-chorale frontend) figé au tag `v1.1.0-rc.2`. Backend et
frontend passent respectivement ~276 et ~87 tests. PostgreSQL 17 sous Docker
Compose (`compose.yaml` prod-like, `compose.dev.yaml` pour l'itération) — voir
[docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

**Branches** (identiques dans les trois dépôts) : `main` est la ligne de
développement à jour ; `release/mvp-v1` est l'**unique** ligne de release, sur
laquelle les tags s'incrémentent malgré son nom historique. À la clôture d'un
jalon, les deux convergent sur le même commit et le tag annoté y est posé. Les
tags ne vivent que sur le superprojet : ses pointeurs figent déjà les
sous-modules.

- **Code** (variables, classes, champs DB) : anglais.
- **UI, logs, commentaires métier** : français — volontaire et cohérent dans
  tout le projet, ne pas « corriger ».

## ⚠️ Structure en sous-modules Git — à connaître avant tout commit

Ce dépôt racine (`choir-manager`) est un **superprojet** : `chm-backend/` et
`chm-frontend/` sont des **sous-modules Git**, chacun avec son propre remote
GitHub (`hlabsdev/chm-backend`, `hlabsdev/chm-frontend`) et son propre historique.

**Toute modification applicative demande deux commits distincts** :
1. commit (+ push) **dans le sous-module** (`chm-backend/` ou `chm-frontend/`) ;
2. retour à la racine → `git add chm-backend` (ou `chm-frontend`) pour enregistrer
   le nouveau pointeur de commit, puis commit du superprojet.

Ne jamais committer un fichier applicatif directement depuis la racine — il vit
dans son sous-module. `git status` à la racine ne montre que les pointeurs de
sous-module, pas leur contenu interne : utiliser `git -C chm-backend status` /
`git -C chm-frontend status` pour l'état réel de chaque application.

**Garde-fou automatique — `make hooks`, une fois par clone.** Installe un
`pre-commit` (versionné dans `.githooks/`) qui refuse tout commit du
superprojet dont les pointeurs ne décrivent pas la réalité : arbre de
sous-module sale, ou pointeur en retard sur son HEAD. L'erreur s'est produite
deux fois, toujours par le même geste — éditer un fichier du sous-module APRÈS
l'avoir commité et `git add`é. Mécanique plutôt que procédurale, comme le
`.gitignore` sur le CSS généré. `make verif-sous-modules` lance le même
contrôle à la demande ; `git commit --no-verify` le contourne en urgence.

⚠️ Piège si vous touchez à ce hook : Git exporte `GIT_DIR`/`GIT_INDEX_FILE` aux
hooks, en chemins relatifs au superprojet. Un `git -C <sous-module>` les hérite,
échoue **en silence** et renvoie une sortie vide — donc « arbre propre ». Le
hook validait tout à sa première écriture pour cette raison. Tout appel git
dans un sous-module passe par le wrapper `gits()`.

Pour restaurer un jalon figé (ex. `v1.0.0-mvp.2`) : `git checkout <tag> &&
git submodule update --init --recursive`.

## Commandes

### Backend (`chm-backend/`, Django 5 + DRF)
```
python manage.py runserver          # http://localhost:8000
python manage.py makemigrations
python manage.py migrate
pytest -q                           # suite complète (~276 tests)
python manage.py check
python manage.py provision_chorale --nom "..." --prefix XXX \
  --admin-username ... --admin-email ... --admin-first-name ... --admin-last-name ...
python manage.py seed_demo_chorale  # 2e chorale de démo — dev/QA uniquement
```
Virtualenv dans `chm-backend/venv` (jamais commité — le recréer après un clone
frais, puis `pip install -r requirements.txt`). Variables d'env (voir
`chm_config/settings.py`) : `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`,
`DJANGO_ALLOWED_HOSTS`, `CORS_ALLOW_ALL_ORIGINS`, `EMAIL_*` (backend console en
dev), `WEASYPRINT_DLL_DIR` (GTK sous Windows, pour l'export PDF).

### Frontend (`chm-frontend/`, Angular 21 + Tailwind v4 + Vitest)
```
npm run start        # tailwind build (une fois) + ng serve, http://localhost:4200
npm run start:dev    # tailwind --watch en tâche de fond + ng serve
npm run build        # tailwind build + ng build
npm test             # Vitest (~87 tests)
```
Tailwind v4 n'est **pas** branché sur le pipeline esbuild d'Angular — il est
compilé explicitement via son CLI avant chaque serve/build. Si les styles
semblent figés, relancer `npm run tailwind`.

## Architecture

### Multi-tenant via `Chorale`, pas de base séparée par tenant

```
TimeStampedModel (created_at/updated_at)
  Chorale                              — racine du tenant
  ChoraleOwnedModel(TimeStampedModel)  — abstrait, ajoute FK chorale
    SoftDeleteModel(ChoraleOwnedModel) — abstrait, ajoute is_deleted/deleted_at + soft_delete()/restore()
```

Isolation appliquée sur deux couches à garder synchronisées pour tout nouveau
modèle/ViewSet :
- `core/tenancy.py` résout le **tenant actif** : `chorale_active(request)`,
  `membre_actif(request)`, `roles_dans(request)`, `requete_est_operateur(request)`.
  Ce sont des **fonctions appelées au point d'usage**, jamais des attributs de
  requête — `request.chorale` et `request.est_operateur` n'existent plus (voir
  « Un User, N chorales »). `core/middleware.py` ne pose plus que le cache de
  résolution.
- `core/mixins.py` (`ChoraleFilterMixin`), sur chaque ViewSet, filtre
  `get_queryset()` et injecte `chorale` à la création. `SoftDeleteMixin`
  transforme `DELETE` en `soft_delete()`, exclut les supprimés sauf
  `?include_deleted=true` (**opérateur uniquement**), et laisse passer l'action
  `restore` sans ce filtre (sinon 404 systématique sur l'objet qu'on veut
  justement restaurer).

Tout nouveau modèle scopé chorale doit hériter `SoftDeleteModel`, sauf raison
précise de ne pas l'être.

### Un User, N chorales — les permissions vivent sur le tenant, pas sur le User

`Membre.user` est une **ForeignKey** (`related_name="membres"`), avec
`UniqueConstraint(user, chorale)` : un compte a un `Membre` **par chorale**.
`user.membre` n'existe plus — utiliser `core.tenancy.membre_de(user, chorale)`
ou `membre_actif(request)`.

**`user.groups` n'est plus source de vérité et la table est vide** (purgée par
`membres/0007`, plus aucune écriture depuis `membres/signals.py`). Les groupes
Django restent le **vocabulaire** des rôles (`Poste.groupes`) mais ne sont plus
portés par le compte : ils y seraient globaux, donc un mandat de trésorier dans
la chorale A ferait passer `IsTresorier` dans la chorale B. Les rôles sont
résolus à la volée par `roles_dans(request)` — mandats actifs du `Membre` du
tenant actif, une requête SQL mémorisée par requête. **Ne jamais rétablir
d'écriture dans `user.groups`** : ce serait une seconde source de vérité,
fausse par construction.

Le tenant actif vient du claim JWT `chorale_id`, mais n'est **jamais** servi sur
la foi du claim : `chorale_active()` revérifie en base l'appartenance vivante et
l'activité de la chorale (une appartenance a pu être révoquée depuis l'émission,
et SimpleJWT recopie les claims du refresh vers chaque access token).
`POST /api/auth/switch-chorale/` réémet un couple access/refresh — changer de
chorale n'est pas un toggle ; l'ancien token reste sur l'ancien tenant.

Défaut à la connexion : la **dernière chorale utilisée**
(`Membre.derniere_activation_le`), départagée par `pk` croissant.

**Session sans tenant actif** (exclu, chorale suspendue, invitation pas encore
acceptée) : la connexion est **toujours permise** — refuser produirait un 401
indistinguable d'un mauvais mot de passe. Elle n'ouvre que profil, invitations
en attente et adhésion par code ; aucune donnée métier. Sans tenant ≠ opérateur :
`est_operateur` exige `is_superuser` **ET** aucun `Membre`, la conjonction est
indissociable.

`Membre.soft_delete()` ne touche plus à `user.is_active` : retirer quelqu'un
d'une chorale ne ferme pas un compte légitime ailleurs. Toute adhésion passe par
`membres/services.py::adherer()`, qui **restaure** un membre soft-deleted au lieu
d'en créer un second (la contrainte d'unicité l'interdit) sans relever les
mandats clos.

### Opérateur de plateforme ≠ administrateur de tenant

`core/tenancy.py` est la **source unique de vérité** : ne jamais tester
`is_superuser` directement pour élargir un accès.
- **Opérateur de plateforme** = superuser SANS aucun `Membre` →
  `chorale_active(request)` renvoie `None`, accès global, gère les chorales
  (`est_operateur(user)` renvoie True).
- **Superuser AVEC un `Membre`** = administrateur de tenant : scopé à sa chorale
  exactement comme un membre normal. `is_superuser` **ne confère aucun droit
  métier** — ses permissions viennent uniquement de ses `Mandat`s. Un fondateur
  qui veut tout voir dans sa chorale reçoit un mandat bureau.
- Un non-superuser n'est jamais opérateur.

Conséquences : `IsInGroup`/`IsOwnerOrBureau` ne laissent passer d'office que
l'opérateur ; l'admin Django est cloisonné (`core/admin_scoping.py` :
`ChoraleScopedAdminMixin` scope les querysets, `PlateformeOnlyAdminMixin` masque
Chorale/DemandeChorale/Group — les permissions Django ne suffisent pas, un
superuser passe tous les `has_perm()`) ; le JWT porte un claim `is_operateur`
distinct de `is_superuser` (devenu ambigu — le front doit lire `is_operateur`).

**L'accès admin dépend de `est_operateur`, jamais des groupes** (qui ne sont
plus portés par le compte). `ChoraleScopedAdminMixin` scope **deux** surfaces,
à garder synchronisées : `get_queryset()` pour les listes, ET
`formfield_for_foreignkey()`/`formfield_for_manytomany()` pour les listes
déroulantes des formulaires. Ces dernières ne filtrent rien par défaut : sans
elles, le formulaire d'un Poste ou d'un Membre expose le nom de **toutes** les
chorales de la plateforme, et les objets des autres tenants dans ses autres
relations — une fuite invisible dans les listes. Un administrateur
de tenant rattaché à UNE chorale est scopé ; rattaché à plusieurs, il ne voit rien —
l'admin s'authentifie par session, sans claim de tenant, et y inventer un
tenant de session ouvrirait une troisième source de vérité. L'admin est un
outil d'exploitation opérateur, pas un second front métier.

**Côté front, la dette « god-mode » est soldée** (jalon 4) : `AuthService`
n'expose plus du tout `isSuperuser` — supprimé, pas rebranché sur
`is_operateur`, car tant qu'il existait il restait disponible comme critère
d'affichage. Les permissions métier ne lisent QUE `roles` (mandats du tenant
actif) ; `isOperateur` ne pilote que la surface plateforme (libellé d'identité,
« Gestion des chorales »), jamais un droit métier — un opérateur n'a aucun
mandat, nulle part. Le claim `is_superuser` reste dans `DecodedToken` parce que
le backend l'émet, mais **aucun code front ne le lit** : le rétablir comme
critère d'affichage recréerait exactement la dette.

Deux natures d'accès, deux mécanismes : `roleGuard` (mandats) n'accorde aucune
dérogation à l'opérateur, et les routes opérateur passent par `operateurGuard`.
Même séparation que côté serveur entre `est_operateur` et la résolution par
mandats.

### RBAC : le pivot est `Mandat`, jamais un rôle fixe

Apps : `core`, `authentication`, `membres`, `musique`, `presences`, `finances`,
`communications` (annonces), `rapports`, `notifications`. Routes montées sous
`/api/<app>/` dans `chm_config/urls.py`.

- Un `Membre` porte des `Mandat`s liés à des `Poste`s (M2M vers `Group` Django).
- `Poste.unique_actif=True` : un seul mandat actif à la fois sur ce poste —
  en attribuer un nouveau doit clôturer le précédent (ex. un seul Président).
- Les rôles sont **résolus à la volée par tenant actif**
  (`core/tenancy.py::roles_dans`) : groupes des mandats actifs du `Membre` de
  la chorale ouverte + groupe de base selon `Membre.statut`. Plus aucun signal
  n'écrit dans `user.groups` (`membres/signals.py` ne contient plus que
  l'explication du retrait) — ne jamais rétablir cette écriture.
- `Membre.soft_delete()` clôture les mandats actifs **avant** de sauvegarder le
  membre, et ne touche pas à `user.is_active`. Les mandats clos le restent :
  une réadmission (`membres/services.py::adherer`) ne ressuscite aucune
  permission fantôme, la propriété est portée par les données elles-mêmes.
- `core/permissions.py` (`IsBureau`, `IsTresorier`, `IsMaitreChoeur`,
  `IsBureauOrMaitreChoeur`, `IsBureauOrTresorier`, `IsOwnerOrBureau`…) checke
  ces groupes. Seul l'**opérateur de plateforme** passe d'office (pas tout
  superuser — cf. « Opérateur de plateforme ≠ administrateur de tenant »).

Tester/accorder une permission = créer/activer un `Mandat`, jamais éditer
`user.groups` ni la classe de permission.

### Authentification & onboarding

JWT (`djangorestframework-simplejwt`), access token **30 minutes** (les rôles
décodés côté front se rafraîchissent au prochain refresh silencieux après un
changement de mandat). `CustomTokenObtainPairSerializer` embarque `roles`,
`is_superuser`, `is_operateur`, `chorale_id`, `chorale_nom`, `chorale_currency`,
`membre_id`, `chorales` (liste des appartenances, pour le sélecteur de chorale)
et `chorales_suspendues` — décodés côté Angular (`AuthService`), pas d'appel
`/me/`. Nouveau claim utile au front → l'ajouter aussi dans `DecodedToken`
(frontend).

**Le claim de rôles s'appelle `roles`**, et ne porte que les rôles du **tenant
actif**. Il s'appelait `groups`, par héritage de `user.groups` — une table
désormais vide et qui n'est plus source de vérité ; le nom suggérait donc un
état global au compte alors que le contenu est scopé à UNE chorale. Renommé des
deux côtés au jalon 4. Attention en y touchant : un renommage fait d'un seul
côté ne lève aucune erreur au runtime, il vide silencieusement tous les rôles
et dégrade chaque écran en vue « choriste » —
`chm-frontend/src/app/core/auth/auth.service.spec.ts` verrouille le nom.

Pas d'auto-inscription libre. Deux voies pour une **nouvelle chorale**, jamais
automatiques (toujours une revue humaine) :
1. opérateur : `manage.py provision_chorale` ;
2. demande publique modérée : `/auth/demande-chorale` → `DemandeChorale`
   en attente → approbation/rejet dans le Django admin (`core/admin.py`).

Les deux voies partagent `core/services.py::provisionner_chorale` — ne jamais
dupliquer ce bootstrap (pupitres/postes/catégories standards + premier compte
Bureau).

Pour un **choriste**, pas d'inscription via un `chorale_id` deviné : le Bureau
génère un code d'invitation (`InvitationChorale`, `membres/models.py`), le
choriste s'inscrit via `/rejoindre/:code`.

### Notifications — point d'entrée unique

`notifications/services.py` (`notifier`, `notifier_groupe`,
`envoyer_email_externe`) est le SEUL point d'entrée pour créer une notification
in-app ou envoyer un email — jamais `Notification.objects.create` directement
dans une vue. Emails best-effort (`fail_silently=True`) : ne doivent jamais
faire échouer l'action métier qui les déclenche.

### Frontend

Standalone components + Signals uniquement (pas de NgModules, pas de
`zone.js`). Sous `src/app/` :
- `core/auth/` — `AuthService` (état par signals, décodage JWT,
  login/logout/`changerMotDePasse`, `roles`/`isOperateur`/`choraleActive`/
  `chorales`/`aUnTenant`), `auth.interceptor.ts` (bearer + refresh mutualisé sur
  401), `auth.guard.ts` (`authGuard`, `roleGuard([...])` → redirige vers
  `/acces-reserve`, une page contextuelle plutôt qu'un refus brut, et
  `operateurGuard` pour les routes de plateforme).
- `core/tenant/` — `TenantContextService` : **chemin unique** des changements de
  chorale (voir ci-dessous). Rien d'autre ne doit remplacer les tokens.
- `features/<domaine>/` — un dossier par domaine (membres, musique, presences,
  finances, communications, rapports, notifications, profil, dashboard,
  structure), chacun avec ses routes lazy-loadées et un `services/`.
- `features/auth/` — en plus du login : `demande-chorale/` et `rejoindre/`
  (routes publiques, hors guard) et `mes-invitations/` (authentifiée, ouverte
  **sans tenant actif** — c'est la seule issue d'une session sans chorale).
- `features/operateur/` — `gestion-chorales`, réservée à `operateurGuard`.
- `layout/main-layout/` — coquille des routes authentifiées, sidebar réductible
  en rail d'icônes (auto sous 1280px, préférence mémorisée au-delà), badge de
  notifications non lues, bandeau « sans chorale ».
- `layout/chorale-selector/` — bascule de tenant. **Masqué à une seule chorale**
  (cas de la quasi-totalité des comptes réels) : le nom seul est affiché.

**Règle générale pour tout endpoint qui réémet un couple access/refresh :**

| Cas | Chemin |
| --- | --- |
| **Changement de tenant** | `TenantContextService.appliquerContexteTenant()` |
| **Même tenant, nouveaux tokens** | `AuthService.appliquerTokens()` |

Le critère n'est **pas** « l'endpoint renvoie-t-il des tokens ? » mais « la
chorale ouverte change-t-elle ? ». `appliquerContexteTenant()` purge l'état
applicatif et **renavigue** : indispensable en cas de changement de chorale,
néfaste sinon — la personne serait éjectée de l'écran où elle travaillait.

Changent de tenant : `switch-chorale/`,
`invitations/rejoindre-avec-mon-compte/`, `mes-invitations/{id}/accepter/`.
Ne change pas de tenant : `changer-mot-de-passe/`, qui révoque toutes les
sessions du compte et en réémet une seule en préservant la chorale active.
Ordre non interchangeable : tokens, puis purge de l'état applicatif, puis
renavigation. Purger après avoir navigué laisserait le nouvel écran se peupler
depuis des signaux encore chargés de l'ancien tenant, et l'utilisateur verrait
un instant les données de l'ancienne chorale sous le nom de la nouvelle. La
renavigation neutralise temporairement la réutilisation de route : sans cela,
basculer depuis `/dashboard` réutiliserait l'instance en place. Tout futur store
partagé (`providedIn: 'root'` conservant des données de chorale) doit être purgé
dans `purgerEtatApplicatif()`.
- URLs API centralisées dans `src/environments/environment.ts` — jamais d'URL
  backend en dur dans un composant/service.
- Icônes `lucide-angular` — importer dans `app.config.ts` et ajouter au
  `LucideIconProvider`.

### Système de design (`src/styles.css`)

Classes composants réutilisables à privilégier plutôt que de recomposer des
utilitaires Tailwind : `.btn` (+ `.btn-primary|secondary|ghost|danger|accent`,
`.btn-sm|lg`, `.btn-icon`), `.card`/`.glass-card`, `.field`/`.label`/`.input`
(+ `.select`, `.switch`, `.segmented`, `.range`, `.check`/`.radio`), `.badge`
(+ variantes sémantiques), `.modal-overlay`/`.modal-panel`,
`.page-title`/`.page-subtitle`/`.section-title`. Palette indigo (primaire) /
ambre (accent). Choisir le contrôle de formulaire selon la donnée : booléen →
switch, petit choix exclusif → segmented, liste → select, plage → slider.

## Conventions

- Logique métier dans `services.py`/`signals.py`, jamais dans les vues ou
  serializers.
- Mobile-first ; écrans de pointage à grandes zones tactiles ; skeleton loaders
  sur les appels async ; chaque écran gère explicitement chargement/vide/erreur.
- Sécurité réelle toujours côté serveur (`get_queryset()`) — jamais un simple
  masquage d'élément dans Angular.
- Tests : `pytest -q` (backend) et `npm test` (frontend) doivent rester verts.
  Un nouveau comportement métier mérite un test de régression.
- **Multi-tenant : une suite verte ne prouve rien à elle seule.** La quasi-
  totalité des tests sont mono-chorale et restent verts même si la résolution
  par tenant est fausse. Toute garantie de cloisonnement s'écrit dans
  `core/tests/test_multi_appartenance.py` et se valide **par mutation** : rendre
  la résolution globale doit rendre le test rouge (protocole et tableau des
  quatre mutations de référence dans `chm-backend/README.md`).

## Pour aller plus loin

- [README.md](README.md) — vue d'ensemble complète, installation, matrice des rôles.
- [RELEASE_NOTES.md](RELEASE_NOTES.md) — périmètre des jalons figés.
- [.agents/workflows/fil-conducteur.md](.agents/workflows/fil-conducteur.md) —
  état réel et feuille de route active.
- [.agents/rules/choir-manager-rules.md](.agents/rules/choir-manager-rules.md) —
  règles de design/UX du projet.
- [chm-backend/README.md](chm-backend/README.md) /
  [chm-frontend/README.md](chm-frontend/README.md) — détails par sous-module.
