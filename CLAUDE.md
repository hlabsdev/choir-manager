# CLAUDE.md

Ce fichier guide Claude Code (claude.ai/code) lors de son travail dans ce dépôt.

## Projet

ChoirManager (CHM) — SaaS multi-tenant de gestion de chorales : membres,
répertoire musical, présences/pointage, finances, annonces, notifications et
rapports. API Django REST + frontend Angular 21.

**État** : MVP fonctionnel figé au tag `v1.0.0-mvp.1` (branche `release/mvp-v1`).
Backend et frontend passent respectivement ~129 et ~32 tests. SQLite + environnement
de dev unique — pas encore prêt pour la production (migration PostgreSQL/Docker à
venir, voir [.agents/workflows/fil-conducteur.md](.agents/workflows/fil-conducteur.md)).

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

Pour restaurer exactement le jalon MVP : `git checkout v1.0.0-mvp.1 && git
submodule update --init --recursive`.

## Commandes

### Backend (`chm-backend/`, Django 5 + DRF)
```
python manage.py runserver          # http://localhost:8000
python manage.py makemigrations
python manage.py migrate
pytest -q                           # suite complète (~129 tests)
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
npm test             # Vitest (~32 tests)
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
- `core/middleware.py` (`ChoraleMiddleware`) pose `request.chorale` d'après
  `membre.chorale` (superuser → `None`, non filtré ; **chorale suspendue**
  `is_active=False` → `None` aussi, effet immédiat même sur un token JWT déjà émis).
- `core/mixins.py` (`ChoraleFilterMixin`), sur chaque ViewSet, filtre
  `get_queryset()` et injecte `chorale` à la création. `SoftDeleteMixin`
  transforme `DELETE` en `soft_delete()`, exclut les supprimés sauf
  `?include_deleted=true` (superuser), et laisse passer l'action `restore` sans
  ce filtre (sinon 404 systématique sur l'objet qu'on veut justement restaurer).

Tout nouveau modèle scopé chorale doit hériter `SoftDeleteModel`, sauf raison
précise de ne pas l'être.

### RBAC : le pivot est `Mandat`, jamais un rôle fixe

Apps : `core`, `authentication`, `membres`, `musique`, `presences`, `finances`,
`communications` (annonces), `rapports`, `notifications`. Routes montées sous
`/api/<app>/` dans `chm_config/urls.py`.

- Un `Membre` porte des `Mandat`s liés à des `Poste`s (M2M vers `Group` Django).
- `Poste.unique_actif=True` : un seul mandat actif à la fois sur ce poste —
  en attribuer un nouveau doit clôturer le précédent (ex. un seul Président).
- `membres/signals.py::synchroniser_groupes` recalcule `user.groups` à zéro :
  groupes des mandats actifs + groupe de base selon `Membre.statut`. Déclenché
  sur **`post_save` de `Mandat` ET de `Membre`** (création, changement de
  statut, soft-delete/restore) — ne jamais assigner `user.groups` à la main.
- `Membre.soft_delete()` clôture les mandats actifs **avant** de sauvegarder le
  membre (l'ordre compte : le recalcul des groupes doit voir l'état final,
  sinon un membre restauré retrouve des permissions fantômes).
- `core/permissions.py` (`IsBureau`, `IsTresorier`, `IsMaitreChoeur`,
  `IsBureauOrMaitreChoeur`, `IsBureauOrTresorier`, `IsOwnerOrBureau`…) checke
  ces groupes. Superuser toujours passant.

Tester/accorder une permission = créer/activer un `Mandat`, jamais éditer
`user.groups` ni la classe de permission.

### Authentification & onboarding

JWT (`djangorestframework-simplejwt`), access token **30 minutes** (les rôles
décodés côté front se rafraîchissent au prochain refresh silencieux après un
changement de mandat). `CustomTokenObtainPairSerializer` embarque `groups`,
`is_superuser`, `chorale_nom`, `chorale_currency`, `membre_id`… — décodés côté
Angular (`AuthService`), pas d'appel `/me/`. Nouveau claim utile au front →
l'ajouter aussi dans `DecodedToken` (frontend).

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
  login/logout/`changerMotDePasse`), `auth.interceptor.ts` (bearer + refresh
  mutualisé sur 401), `auth.guard.ts` (`authGuard`, `roleGuard([...])` →
  redirige vers `/acces-reserve`, une page contextuelle plutôt qu'un refus brut).
- `features/<domaine>/` — un dossier par domaine (membres, musique, presences,
  finances, communications, rapports, notifications, profil, dashboard,
  structure), chacun avec ses routes lazy-loadées et un `services/`.
- `features/auth/` — en plus du login : `demande-chorale/` et `rejoindre/`
  (routes publiques, hors guard).
- `layout/main-layout/` — coquille des routes authentifiées, sidebar réductible
  en rail d'icônes (auto sous 1280px, préférence mémorisée au-delà), badge de
  notifications non lues.
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

## Pour aller plus loin

- [README.md](README.md) — vue d'ensemble complète, installation, matrice des rôles.
- [RELEASE_NOTES.md](RELEASE_NOTES.md) — périmètre figé par `v1.0.0-mvp.1`.
- [.agents/workflows/fil-conducteur.md](.agents/workflows/fil-conducteur.md) —
  état réel et feuille de route active (prochain jalon : PostgreSQL/Docker).
- [.agents/rules/choir-manager-rules.md](.agents/rules/choir-manager-rules.md) —
  règles de design/UX du projet.
- [chm-backend/README.md](chm-backend/README.md) /
  [chm-frontend/README.md](chm-frontend/README.md) — détails par sous-module.
