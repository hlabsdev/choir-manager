# CLAUDE.md

Ce fichier guide Claude Code (claude.ai/code) lors de son travail dans ce dépôt.

⚠️ **À mettre à jour à chaque évolution notable** (nouveau lot livré, tag posé,
chantier ouvert/refermé, décision d'architecture) — dans le MÊME commit ou la
MÊME session que le changement, pas après coup. Ce fichier n'a de valeur que
s'il décrit l'état réel : un README qui diverge silencieusement de ce qui
tourne vraiment est pire que pas de README (c'est exactement ce que la purge
de `fil-conducteur.md` a fermé, cf. dernière section). Concrètement : état/tag
en tête de fichier, compteurs de tests, tableau « Chantiers connus » si un
point avance ou se referme, nouvelle sous-section d'Architecture si un lot
introduit une règle non triviale qu'un futur Claude devrait connaître avant
d'y toucher.

## Projet

ChoirManager (CHM) — SaaS multi-tenant de gestion de chorales : membres,
répertoire musical, présences/pointage, finances, annonces, notifications et
rapports. API Django REST + frontend Angular 21.

**État** : **EN PRODUCTION** depuis le 2 août 2026, tag `v1.6.0`, sur
https://choirmanager.sankof.tech (VPS Sankof, derrière la passerelle
`mrs-gateway`). Pilote ouvert à trois chorales réelles. Backend et frontend
passent respectivement plus de 500 et 171 tests. `v1.6.0` clôt le lot email
(unicité insensible à la casse + vérification à usage unique). Le chantier
local suivant est l'autonomie du compte : backend reset self-service,
`must_change_password` et changement volontaire d'email implémenté et validé ;
les trois parcours frontend sont également implémentés et validés. La
livraison/intégration du superprojet reste à faire ; rien de ce chantier local
n'est encore déployé sur le VPS.

PostgreSQL 17 **et Redis** sous Docker Compose. Trois piles :
`compose.yaml` (base, prod-like), `+ compose.dev.yaml` (itération),
`+ compose.prod.yaml` (VPS). Sur le serveur, **toujours les cibles `make
prod-*`** : les cibles de développement omettent `compose.prod.yaml`, ce qui
republierait le port 8080 en clair. Voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md),
qui porte aussi la checklist des actions bloquantes à faire sur l'hôte réel
avant toute mise en exploitation sensible (mesures NUM_PROXIES/mrs-gateway,
réconciliation MediaChant).

⚠️ `REDIS_URL` est **obligatoire** hors DEBUG : le cache porte les compteurs de
throttle, et un repli sur LocMemCache les diviserait par le nombre de workers
Gunicorn sans que rien ne le signale. Le démarrage échoue plutôt que de
dégrader en silence.

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
pytest -q                           # suite complète (~506 tests)
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
npm test             # Vitest (~150 tests)
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

**Quels modèles sont en suppression logique, et pourquoi ceux-là.** Le critère
n'est pas « c'est important » mais **ce qui part en CASCADE avec le DELETE** —
recensé à l'ORM (`_meta.related_objects` + `on_delete`), pas au jugé :

| Modèle | Ce qu'un DELETE emportait |
| --- | --- |
| `Membre` | présences, permissions, cotisations, notifications |
| `Chant` | partitions, médias, séances |
| `MediaChant`, `Mouvement`, `Annonce` | le fichier / la ligne comptable elle-même |
| `Cotisation` | ses paiements |
| **`Repetition`** | **tout le pointage d'une soirée + les séances** — le DELETE le plus destructeur de l'app |
| **`CampagneCotisation`** | **toutes ses cotisations** (pourtant protégées) **et leurs paiements** |

Les deux derniers ont été convertis après coup : `Repetition` parce qu'une
ligne d'agenda anodine emportait une soirée entière de pointage,
`CampagneCotisation` parce que la protection posée sur `Cotisation` était
annulable d'un clic depuis le parent — donc inexistante.

⚠️ **Contrepartie de la suppression logique d'un parent** : ses enfants ne sont
PAS marqués (ce serait la cascade qu'on ferme). Chaque lecture doit donc les
exclure — `PresenceViewSet`, `SeanceChantViewSet`, `CotisationViewSet`,
`TarifCotisationViewSet`, `PaiementCotisationViewSet` et `rapports/services.py`
filtrent sur `…__is_deleted=False`. Sans cela, une répétition « supprimée »
continuerait d'alimenter les taux d'assiduité : silencieux, donc pire que la
cascade.

**`Mandat` est le contre-exemple à connaître** : son `DELETE` est **fermé**
(405, `MethodNotAllowed`) plutôt que rendu logique. Deux raisons — le domaine a
déjà le bon geste (`terminer()`, un mandat clos EST l'archive), et surtout
`roles_dans()` résout les droits sur `is_active=True` : un mandat mis à la
corbeille sans être clôturé continuerait d'accorder ses permissions. Mieux vaut
ne pas ouvrir cette porte que devoir la refermer.

Le reste demeure en suppression physique, délibérément : `Pupitre`, `Poste`,
`Theme`, `CategorieMouvement` sont des vocabulaires de configuration recréables
en quelques secondes, `SeanceChant`/`TarifCotisation` des lignes de liaison,
`Partition` est en voie de retrait. Un nouveau modèle scopé chorale hérite de
`SoftDeleteModel` dès qu'un DELETE lui ferait perdre un historique — sinon non,
une corbeille encombrée de vocabulaire ne se lit plus.

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
plus portés par le compte). `ChoraleScopedAdminMixin` scope **trois** surfaces,
à garder synchronisées — aucune ne couvre les autres :

1. `get_queryset()` → les listes (changelists) ;
2. `formfield_for_foreignkey()`/`formfield_for_manytomany()` → les listes
   déroulantes des formulaires. Elles ne filtrent rien par défaut : sans elles,
   le formulaire d'un Poste ou d'un Membre expose le nom de **toutes** les
   chorales de la plateforme, et les objets des autres tenants dans ses autres
   relations ;
3. `get_list_filter()` → les **choix de la barre latérale de filtres**.
   `RelatedFieldListFilter` les construit avec `field.get_choices()`, sans
   requête ni scope : un filtre « Pupitre » ou « Campagne » énumérait donc les
   objets de tous les tenants. Le filtre `chorale` est retiré, et **tout filtre
   de relation est promu automatiquement** vers
   `core/admin_scoping.py::RelationScopeeListFilter`. Promotion mécanique, pas
   déclarative : un filtre ajouté demain est couvert sans que personne y pense.

Ces trois fuites sont invisibles dans une liste — la donnée n'apparaît que dans
un widget. Chacune est verrouillée dans `core/tests/test_cloisonnement_operateur.py`,
la dernière avec sa mutation de référence.

Un administrateur de tenant rattaché à UNE chorale est scopé ; rattaché à
plusieurs, il ne voit rien — l'admin s'authentifie par session, sans claim de
tenant, et y inventer un tenant de session ouvrirait une troisième source de
vérité. L'admin est un outil d'exploitation opérateur, pas un second front métier.

**Habillage de l'admin.** `templates/admin/base_site.html` (marque, polices) +
`core/static/chm_admin/chm-admin.css` (thème). Le CSS redéfinit le **jeu de
variables** de l'admin Django — teintes, boutons, messages, filtres suivent
sans qu'aucun sélecteur de mise en page soit réécrit ; les quelques règles
structurelles ne couvrent que ce qu'aucune variable n'atteint. Deux points
non évidents : la surcharge vit dans `TEMPLATES["DIRS"]` et non dans
`core/templates/`, car `django.contrib.admin` précède `core` dans
INSTALLED_APPS et le chargeur APP_DIRS le choisirait ; et le thème sombre de
l'admin reste fonctionnel parce que le CSS reprend le triptyque de sélecteurs
de Django (`html[data-theme="light"], :root` / `@media prefers-color-scheme` /
`html[data-theme="dark"]`) — mettre une couleur en dur dans une règle
structurelle le casserait sans que rien ne le signale. Les valeurs sont
recopiées **à la main** du système de design du front : les deux fichiers ne
partagent aucun build.

### Journal d'audit (app `audit`) — chantier n°8, livré

UNE table (`EvenementAudit`) pour tout : écritures métier, gestes d'admin,
authentification, exports, événements déclarés par le front. Un journal par
domaine se serait mieux rangé et se serait moins lu — la question posée à un
audit est « que s'est-il passé sur ce tenant entre telle et telle date ? ».

**Deux natures d'événements, à ne jamais confondre.** Le champ `source`
sépare ce que le SERVEUR a constaté (`api`, `admin`, `commande` — faisant foi)
de ce que le CLIENT a déclaré (`frontend`). Un événement `frontend` arrive par
`POST /api/audit/evenements-client/` : un navigateur peut en forger, en
omettre, en rejouer. Il vaut comme signal d'usage, **jamais** comme preuve ni
comme fondement d'une décision de sécurité. `EvenementAudit.fait_foi` porte la
distinction pour le code, l'étiquette « Déclaré (non probant) » pour l'œil.

Cet endpoint existe pour ce que l'API ne voit pas : toute action qui MODIFIE
quelque chose passe déjà par le serveur et y est tracée. Restent les gestes
purement client — ouvrir un écran, **télécharger** un média déjà chargé (le
`blob:` de `media-chant-lecteur`, exception assumée ci-dessus, dont rien ne
gardait trace), déclencher un export rendu dans le navigateur. Vocabulaire
fermé (`ACTIONS_CLIENT`), `source` forcée côté vue, acteur/chorale/IP pris du
serveur, throttle `audit_client` dédié — sans quoi ce serait l'endroit le plus
simple du produit pour saturer la base.

**Ce qui remplit le journal, sans qu'aucune vue y pense :**
- `audit/signaux.py` branche `post_save`/`post_delete` sur les modèles métier.
  ⚠️ Trois limites : `queryset.update()` n'émet AUCUN signal (les actions
  groupées d'admin sont donc tracées à part, en un événement de synthèse, par
  `AuditAdminMixin.response_action`) ; rien n'est écrit hors contexte d'audit
  (migrations, fixtures et tests ne polluent pas la table — une commande qui
  mérite une trace ouvre `contexte_audit()`, cf. `provision_chorale`) ; la
  suppression logique est un `save()`, reconnue explicitement, sinon toute mise
  à la corbeille passerait pour une « Modification ».
- `audit/contexte.py` porte le QUI dans une `ContextVar` (pas un thread-local :
  sous ASGI, plusieurs requêtes partagent un thread et le journal attribuerait
  l'action à quelqu'un d'autre). Il stocke la REQUÊTE, pas un utilisateur
  résolu — même piège que les `SimpleLazyObject` de `core/middleware.py`.
- `audit/authentification.py` regroupe ce qu'aucun modèle ne produit :
  connexions, **échecs de connexion** avec l'identifiant tenté, déconnexions,
  bascules de tenant, changements de mot de passe. ⚠️ Jamais de mot de passe ni
  de jeton, même tronqué : un journal est plus lu et plus exporté que le reste.

**Un journal ne se corrige pas.** Les trois `has_*_permission` de son admin
sont fermées, y compris pour l'opérateur. La rétention passe par
`manage.py purger_journal_audit --jours N --confirmer` (défaut non destructif).
Export CSV (tableur) et JSONL (outil de logs) en flux, `donnees` restant
structuré en JSONL. `journaliser()` est le seul point d'entrée et **ne lève
jamais** — même arbitrage que les emails best-effort : une trace ratée est un
incident d'exploitation, une action métier annulée faute de trace est un
incident utilisateur. Contrepartie assumée : ce n'est pas un registre
transactionnellement garanti.

### Corbeille de plateforme — `/admin/corbeille/`

Écran GLOBAL (pas un par entité) listant tout ce qui est supprimé
logiquement, avec restauration et suppression définitive. Réservé à
l'**opérateur**, même règle que `?include_deleted=true` : consulter la
corbeille, c'est lire ce qu'une chorale a décidé de faire disparaître.

Global plutôt que par entité parce qu'une corbeille est presque toujours vide
(six écrans vides valent moins qu'un), que la question qu'on lui pose est
temporelle et non typée, et que concentrer le seul geste irréversible de
l'admin sur UNE page en fait un endroit qu'on connaît. Les modèles sont
découverts par introspection de `SoftDeleteModel` — un modèle ajouté demain y
apparaît sans que personne y pense. La purge exige la saisie du mot
`SUPPRIMER` et est journalisée AVANT l'effacement (après, `str(objet)` ne dit
plus rien).

**Plus aucun bouton de suppression n'efface**, c'est ce qui donne son sens à
la restauration : `SoftDeleteAdminMixin` surcharge `delete_model()` et
`delete_queryset()` et retire `delete_selected` du menu ; côté API,
`MediaChantViewSet` et `CotisationViewSet` ont reçu le `SoftDeleteMixin` qui
leur manquait. Pour MediaChant, deux erreurs se compensaient exactement (le
queryset ne filtrait pas `is_deleted` non plus), donc rien ne dépassait tant
que la suppression logique n'était écrite nulle part. Une garde par
introspection (`core/tests/test_corbeille.py`) refuse désormais tout ViewSet
d'un `SoftDeleteModel` dépourvu du mixin.

Les étiquettes d'état et la corbeille en masse sont mutualisées dans
`core/admin_display.py` (`badge`, `colonne_badge`, `colonne_booleen`,
`SoftDeleteAdminMixin`). ⚠️ La suppression logique en masse **itère et appelle
`soft_delete()`**, jamais `queryset.update(is_deleted=True)` :
`Membre.soft_delete()` clôture les mandats actifs, un `update()` laisserait des
rôles encore résolus par `roles_dans()`. `SoftDeleteAdminMixin` ajoute ses
actions par `get_actions()` et non par l'attribut `actions`, qu'un ModelAdmin
enfant écraserait silencieusement.

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

### Unicité de l'email (bloc A) & téléphone au format international

**Email — insensible à la casse, casse préservée à l'écriture.** Contrainte
posée en index unique partiel sur `LOWER(email)` (`core/migrations/
0007_email_insensible_casse.py`, SQL brut : `auth.User` n'est pas un modèle
du dépôt, ses migrations n'ont pas de `Meta.constraints`). Un email vide
n'est jamais « déjà pris » — le champ reste facultatif, l'index est
conditionnel (`WHERE email <> ''`) pour la même raison. Point de passage
unique : `core/services.py::normaliser_email` (trim seul, casse préservée —
certains fournisseurs la respectent en partie locale) et `email_deja_pris`
(comparaison `iexact`, `exclure_user_id` pour l'auto-édition). **Six points
d'écriture** convergent dessus — création/édition par le Bureau, profil
personnel, inscription par code, `provision_chorale`, `import_members`,
admin Django (`UserChangeFormEmailUnique`, sans quoi le `ModelForm` ignore
une contrainte posée hors état des migrations et une collision remonterait
en `IntegrityError` brute, 500). Conflit signalé par un CODE MACHINE dédié
(`EmailDejaUtiliseError`, `email_deja_utilise`, 409) plutôt qu'un simple 400
— le front doit pouvoir distinguer un doublon d'une erreur de saisie.

**Vérification (bloc B).** L'état global `authentication.VerificationEmail`
porte `email_verifie_le` (nul par défaut, donc sans régression pour les
comptes existants). Les liens sont signés, expirent et sont à usage unique ;
seule leur empreinte est conservée. Toute écriture de `User.email` invalide le
timestamp et la demande pendante. La demande est plafonnée par compte dans
Redis, et l'email part de la plateforme, jamais d'une chorale. Rien ne bloque
encore un compte non vérifié : le reset self-service sera son premier usage.

**Autonomie du compte (chantier local après v1.6.0).** Le front expose le reset
public sur le chemin contractuel exact `/auth/reset-mot-de-passe`, puis consomme
le jeton dans le même écran. Le claim `must_change_password` ferme toute la
coquille métier via `comptePretGuard` et renvoie vers une surface isolée qui ne
charge aucune donnée de chorale ; les 403 portant le code machine
`mot_de_passe_a_changer` appliquent le même repli. `returnUrl` n'accepte qu'une
route interne absolue, jamais une destination externe. Enfin, `mon-espace`
affiche l'état réel de vérification et permet le changement d'email global avec
réauthentification, en reflétant immédiatement la remise à null de la
vérification.

**Téléphone — format international obligatoire, INDÉPENDANT du pays de la
chorale.** `Membre.telephone`, `Chorale.telephone`, `DemandeChorale.
contact_telephone` sont des `PhoneNumberField` (django-phonenumber-field) :
un numéro sans indicatif (`+…`) est refusé, quelle que soit la chorale.
`Chorale.pays` (nouveau, `django-countries`, ISO 3166-1 alpha-2) est
PUREMENT informatif — jamais un critère de validation, dans un sens comme
dans l'autre : un choriste togolais peut avoir un numéro français. Ne
JAMAIS coupler les deux validations, même « pour aider » — c'est précisément
le piège que ce lot referme. Stockage E164 (indexable), affichage
international espacé (`PHONENUMBER_DEFAULT_FORMAT = "INTERNATIONAL"`, ex.
`+228 90 00 00 00`) : les deux réglages sont **distincts** et ne doivent pas
être confondus, `PHONENUMBER_DB_FORMAT` reste au défaut E164.

Même helper partagé que l'email : `core/services.py::normaliser_telephone`/
`valider_telephone` (lève `django.core.exceptions.ValidationError`, à
charge de l'appelant de la reconvertir dans sa propre convention — `ValueError`
pour les commandes, `ProvisionnementError` pour `provisionner_chorale`, un
champ DRF dédié côté serializer).

⚠️ **Piège vérifié en le corrigeant** : un `serializers.SerializerMethodField`
**ne passe jamais par `to_representation`** — contrairement à un champ DRF
déclaré, il renvoie sa valeur Python brute telle quelle. Deux endroits
(`MembreAnnuaireSerializer.get_telephone`, `UserProfileSerializer.
get_telephone`) renvoyaient l'objet `PhoneNumber` brut, invisible en test
tant qu'aucun membre du jeu de données n'avait de téléphone renseigné —
l'annuaire et le profil plantaient en 500 dès le premier cas réel. Tout
`SerializerMethodField` qui expose un `PhoneNumberField` doit `str()`
explicitement sa valeur.

De la même façon, `ModelSerializer` **ne mappe PAS automatiquement**
`PhoneNumberField` vers son équivalent DRF — la génération auto retombe sur
un `CharField` nu (marche en lecture via `str()`, mais AUCUNE validation de
format à l'écriture). Tout champ `telephone`/`contact_telephone` sur un
serializer doit être redéclaré explicitement avec
`phonenumber_field.serializerfields.PhoneNumberField`.

**Migration de correction de données** (`membres/migrations/
0011_corrige_telephones_locaux_togo.py`, AVANT l'`AlterField` du champ) :
règle générique, pas une liste figée de matricules — tout `telephone` non
vide qui ne commence pas par `+` est préfixé `+228` (déploiement togolais,
cf. `TIME_ZONE`) puis revalidé ; jamais forcé aveuglément, une valeur encore
invalide après préfixage est laissée telle quelle plutôt que corrompue. Un
nouveau déploiement dans un autre pays qui hériterait de données locales non
conformes doit écrire l'équivalent avec SON indicatif — ne pas réutiliser
« +228 » en dur pour un contexte différent.

**Frontend** : `shared/components/telephone-input/` (indicatif + drapeau
emoji dérivé du code ISO — deux symboles indicateurs régionaux Unicode,
calculés à la volée, aucune image ni dépendance npm) sur les 3 écrans qui
éditent un téléphone (fiche membre, `rejoindre`, `demande-chorale`).
`shared/data/pays-indicatifs.ts` (242 entrées) généré depuis les MÊMES
bibliothèques que le backend (`phonenumbers` + `django_countries`), jamais
transcrit à la main — un référentiel qui diverge entre front et back donnerait
un indicatif accepté d'un côté et rejeté de l'autre, silencieusement. `profil.
component.ts` n'expose aujourd'hui aucune édition de téléphone — rien à y
brancher tant que cet écran n'en a pas besoin.

### Notifications — point d'entrée unique

`notifications/services.py` (`notifier`, `notifier_groupe`,
`envoyer_email_externe`) est le SEUL point d'entrée pour créer une notification
in-app ou envoyer un email — jamais `Notification.objects.create` directement
dans une vue. Emails best-effort : n'utilisent plus `fail_silently=True`
(qui avalait les échecs sans trace) mais un `try/except` qui journalise —
même promesse tenue autrement : ne jamais faire échouer l'action métier qui
les déclenche.

**Le gabarit de marque est la NORME, pas une option.** Il n'est rendu que si
l'appelant fournit `contenu_html` : un envoi qui l'oublie part en texte nu,
sans erreur ni trace. C'est ainsi que TOUS les emails aux membres sont restés
en texte nu jusqu'au lot d'uniformisation — `notifier()` ne transmettait aucun
paramètre HTML, donc les messages que les choristes reçoivent le plus souvent
étaient les seuls jamais habillés, alors que le gabarit servait déjà aux
contacts externes. `notifier()` habille désormais l'email lui-même et **dérive
le bouton du `lien`** déjà fourni pour la notification in-app : les appelants
n'ont rien à faire, et un futur `par_email=True` sera habillé sans y penser.
Un nouvel envoi ne doit jamais partir sans `contenu_html` —
`notifications/tests/test_gabarit_uniforme.py` verrouille la règle.

Deux helpers, à utiliser plutôt que de recomposer :
`html_depuis_texte(corps)` (échappe puis restitue paragraphes/sauts de ligne)
et `lien_absolu("/chemin")` (préfixe `SITE_URL`, ou "" si absente).

**HTML — en ALTERNATIVE au texte, jamais à sa place.** `titre_html`/
`contenu_html`/`cta_label`/`cta_url` (optionnels, sur `notifier`/
`envoyer_email_externe`) ajoutent une version HTML aux couleurs de la
plateforme (`notifications/templates/notifications/email/_base.html`) via
`EmailMultiAlternatives.attach_alternative` — un client qui ne rend pas le
HTML reçoit le texte brut, inchangé. Le pied de page HTML (chorale, mention
« sans réponse ») est composé par `_envoyer_email` lui-même, à partir des
MÊMES `chorale`/`reply_to` que la version texte : jamais recalculé par
l'appelant, qui ne fournit que son propre contenu — sinon les deux versions
pourraient diverger. `contenu_html` est réputée sûre (`format_html`/`escape`
côté appelant) : toute chaîne d'origine externe (nom de contact, message d'un
formulaire public) DOIT y passer avant d'entrer dans le HTML, contrairement au
texte brut où ce risque n'existe pas.

⚠️ **`SITE_URL` n'est PAS optionnelle en pratique, et doit être transmise par
Compose.** Elle porte l'origine publique de la pile, pour construire les liens
absolus d'un email — un email n'a pas de requête HTTP dont dériver l'hôte.
Elle était définie dans `.env` et documentée dans `.env.example` mais
transmise par AUCUNE des trois piles : `settings.SITE_URL` valait donc `""`
dans tout conteneur, production comprise. Toute ligne de `compose.yaml` qui
disparaîtrait reproduirait le défaut.

L'ancienne formulation — « vide → l'email reste utile, jamais un lien cassé »
— ne valait que pour l'email d'approbation, dont le texte se suffit. Elle est
FAUSSE pour la vérification d'adresse et la réinitialisation de mot de passe,
où le lien EST le contenu utile : sans `SITE_URL`, `_base.html` masque le
bouton (`{% if cta_url %}`) et le corps texte ne porte aucun lien de secours.
Le message partait donc complet en apparence, sans erreur ni trace, et sans
aucun moyen d'agir pour qui le recevait.

**Surfaces publiques qui envoient déjà un email HTML avec CTA** :
`DemandeChoraleAdmin.approuver_et_provisionner` (bouton « Se connecter » →
`{SITE_URL}/auth/login`) et deux alertes opérateur qui n'existaient pas avant
— `core/views.py::_alerter_operateur_nouvelle_demande` /
`_alerter_operateur_nouvelle_suggestion`, envoyées à
`EMAIL_REPLY_TO_PLATEFORME` avec un bouton direct vers la fiche à traiter.
Sans elles, une `DemandeChorale` ou une `Suggestion` ne se découvrait qu'en
visitant l'admin — invisible potentiellement plus d'un jour.

### Boîte à suggestions

`core.Suggestion` — même famille que `DemandeChorale` : modèle de plateforme
(pas de `chorale`), formulaire public (`POST /api/core/suggestions/`, throttle
`suggestion` à 5/h, honeypot `site_web`), lecture réservée à l'opérateur via
l'admin (`PlateformeOnlyAdminMixin`). Volontairement PAS `SoftDeleteModel` :
aucune donnée sensible ni historique métier à préserver. Page front
`/suggestions`, publique, liée depuis le pied de page des trois pages
publiques et depuis `/contact`.

### Frontend

Standalone components + Signals uniquement (pas de NgModules, pas de
`zone.js`). Sous `src/app/` :
- `core/auth/` — `AuthService` (état par signals, décodage JWT,
  login/logout/`changerMotDePasse`, `roles`/`isOperateur`/`choraleActive`/
  `chorales`/`aUnTenant`), `auth.interceptor.ts` (bearer + refresh mutualisé sur
  401), `auth.guard.ts` (`authGuard`, `roleGuard([...])` → redirige vers
  `/acces-reserve`, une page contextuelle plutôt qu'un refus brut,
  `operateurGuard` pour les routes de plateforme, et `guestGuard` — symétrique
  d'`authGuard` — pour la landing publique : laisse passer un visiteur
  anonyme, renvoie qui est déjà connecté vers `/dashboard`).
- `core/tenant/` — `TenantContextService` : **chemin unique** des changements de
  chorale (voir ci-dessous). Rien d'autre ne doit remplacer les tokens.
- `features/<domaine>/` — un dossier par domaine (membres, musique, presences,
  finances, communications, rapports, notifications, profil, dashboard,
  structure), chacun avec ses routes lazy-loadées et un `services/`.
- `features/auth/` — en plus du login : `demande-chorale/` et `rejoindre/`
  (routes publiques, hors guard) et `mes-invitations/` (authentifiée, ouverte
  **sans tenant actif** — c'est la seule issue d'une session sans chorale).
- `features/public/` — pages publiques d'information : `landing/` (« / »,
  seule route sous `guestGuard`), `a-propos/`, `contact/` (coordonnées
  statiques, `environment.contactEmail` — DOIT correspondre à
  `EMAIL_REPLY_TO_PLATEFORME` côté backend, deux artefacts de déploiement
  distincts) et `suggestions/` (formulaire public, `core.Suggestion`).
  `a-propos`/`contact`/`suggestions` n'ont AUCUN garde, contrairement à la
  landing : rien ne justifie de les cacher à quelqu'un déjà connecté qui les
  atteint depuis un pied de page.
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

### Sécurité — trois acquis à ne pas défaire

Livrés avant la mise en production (lots 1 à 3), chacun validé par mutation.
Les défaire ne casserait aucun test évident, d'où ce rappel.

1. **Cloisonnement INTRA-tenant** (pas seulement cross-tenant). Trois niveaux de
   sérialisation de la fiche membre — annuaire / personnel / staff. `notes` et
   les métadonnées de suppression ne sortent QUE du niveau staff. Aucun ViewSet
   métier ne doit se contenter de `IsAuthenticated` : `EstMembreDuTenant` au
   minimum. La garde `core/tests/test_garde_permissions.py` le vérifie et
   embarque ses propres mutations.
2. **Plafonds d'authentification sur les ÉCHECS seulement**, et le plafond par
   identifiant est évalué **après** la vérification du mot de passe — sinon
   n'importe qui verrouille le compte d'un tiers. `DJANGO_NUM_PROXIES` doit être
   la valeur EXACTE de la topologie : trop haut les plafonds sont contournables,
   trop bas tous les clients partagent un compteur.
3. **Médias privés** derrière `/api/core/medias/<type>/<id>/`, qui vérifie le
   tenant **sur l'objet** puis délègue à Nginx via `X-Accel-Redirect`. Il n'y a
   plus de `location /media/` publique et il ne doit pas y en avoir. Un nouveau
   type de fichier se déclare dans `core/medias.py::REGISTRE`, nulle part
   ailleurs. Côté front, une image protégée s'affiche via
   `MediaProtegeDirective` — un `<img src>` n'envoie jamais le Bearer.

`make smoke-medias` est le seul contrôle qui prouve le maillon Nginx : les
tests Django prouvent que Django ÉMET l'en-tête, jamais que Nginx sert le
fichier.

### Module Médias du répertoire (MediaChant) — généralisation de Partition

Demande du terrain (pilote) : réécouter les lignes de pupitre, le tutti, les
accompagnements d'un chant — pas seulement lire une partition. `MediaChant`
(`musique/models.py`) généralise `Partition` : `type_fichier`
(partition/audio/vidéo — **vidéo déclarée, non implémentée**) × `portee`
(pupitre/tutti/accompagnement). Écriture : maître de chœur (tout le tenant) ou
chef de pupitre, restreint à SON pupitre via `Poste.pupitre_concerne` — pas le
simple groupe `chef_pupitre`, qui dit QUE mais jamais DE QUEL pupitre.

**`Partition` existe encore, volontairement.** `MediaChant` est additif, pas
un remplacement : le front (`media-chant-*` components) lit/écrit
exclusivement `MediaChant` depuis le bloc 3, mais `Partition` reste en base et
son endpoint n'est pas retiré. `musique/services.py::synchroniser_medias_chant_depuis_partitions()`
(exposée par `manage.py reconcilier_medias_chant`, idempotente, rejouable en
autonome) recopie chaque `Partition` en miroir `MediaChant` sans jamais
copier ni déplacer de fichier. Ordre de bascule non négociable (issue
chm-backend#2) : **réconciliation → bascule du front → retrait de
`Partition`** — jamais l'inverse, sous peine de Partition déposées
silencieusement invisibles. Checklist des actions hôte dans
`docs/DEPLOIEMENT.md`.

Téléchargement (audio et partition) : cf. l'exception assumée ci-dessous.

**Exception assumée — téléchargement MediaChant.** Le bouton de
téléchargement (`media-chant-lecteur.component.ts`, module audio) fait
sciemment sortir un fichier du contrôle d'accès de l'application : une fois
récupéré, ce n'est plus un `blob:` éphémère mais une copie locale hors de
toute permission. Ce n'est pas une faille — un choriste autorisé à lire le
fichier pouvait déjà le capturer (capture d'écran, enregistrement audio), le
téléchargement ne lui donne rien de nouveau qu'il n'avait déjà — mais c'est un
choix produit assumé, pas un relâchement de la garantie du lot médias privés :
sur une partition sous droits, "télécharger" invite à la diffusion là où
l'écoute/consultation en ligne seule ne le faisait pas. À réévaluer si la
chorale ou un ayant droit le signale.

### Écran de pointage — optimistic update

`PresencesListComponent` (`chm-frontend/src/app/features/presences/`) :
chaque tap persiste immédiatement (`patchEntry()` mute le signal `entries`
AVANT l'appel HTTP), jamais de bouton « enregistrer » global. Échec réseau →
`sync='error'` visible (carte rouge, « Réessayer »), jamais de rollback
silencieux ; retaper une carte en erreur renvoie le MÊME statut sans cycler.
Compteurs (présents/retards/absents/excusés/taux) : `computed()` sur
`entries()`, réactifs à chaque tap sans rechargement.

**Divergence connue avec le besoin d'origine** : l'écriture (`canPointer`) est
réservée à `maitre_choeur`/`bureau` — **pas** `chef_pupitre`, alors que le
besoin exprimé au lancement du module laissait la porte ouverte (« le cas
échéant »). Constaté en testant l'écran (aucun bug, comportement stable), pas
encore tranché comme un choix produit définitif — à trancher si le besoin se
confirme, pas à « corriger » sans validation.

## Chantiers connus, non bloquants

Aucun n'empêche le pilote d'utiliser l'outil. Ordre de risque décroissant,
pas de difficulté — hérité de l'ancien suivi de jalons (`fil-conducteur.md`,
purgé une fois son contenu périmé absorbé ici) et tenu à jour ici désormais,
pas ailleurs.

| # | Chantier | Pourquoi |
| --- | --- | --- |
| 1 | **Test 401 intermittent** (`chm-backend#1`) | Investigué en profondeur (issue à jour) : la piste initiale (threads + `transaction=True`) est RÉFUTÉE. 41 exécutions complètes, une seule reproduction, cause non isolée. Classé « connu, non reproduit, sous surveillance » — revisiter si le symptôme réapparaît en usage réel, avant plusieurs chorales simultanées. |
| ~~2~~ | ~~**Identité / email vérifié**~~ | **Livré** — email facultatif, unicité insensible à la casse et vérification à usage unique ; prérequis du reset self-service. |
| 3 | **Autonomie du compte — livraison** | Backend et frontend implémentés localement : reset self-service réservé aux emails vérifiés, lien court signé et idempotent, garde globale `must_change_password`, changement volontaire d'email réauthentifié et trois parcours Angular. Il reste à intégrer les pointeurs du superprojet et livrer le lot après convergence des deux sessions. |
| ~~4~~ | ~~**`must_change_password` backend**~~ | **Implémenté localement** — mot de passe Bureau/provisionnement généré marqué temporaire ; surface réduite à profil GET, changement du secret et logout jusqu'au choix du titulaire. |
| 5 | **CSP stricte** | Les JWT vivent dans `localStorage` : une XSS les lit. Aucune CSP posée à ce jour. |
| 6 | **`CHECK_REVOKE_TOKEN`** | Lierait la validité du JWT au hash du mot de passe, ramènerait la fenêtre résiduelle de 30 min à zéro. À éprouver contre les flux multi-chorale avant activation. |
| 7 | **MFA** | Obligatoire pour l'opérateur, recommandé Bureau/Trésorier. |
| ~~8~~ | ~~**Journal d'audit**~~ | **Livré** — app `audit`, cf. section dédiée ci-dessus. |
| 9 | **Observabilité** | Corrélation par requête, remontée centralisée, alertes (SMTP disponible). |
| 10 | **Verrouillage des dépendances** | `requirements.txt` en plages de versions : deux builds peuvent différer. Audit de vulnérabilités en CI à ajouter. |

Backlog de fond, à prioriser depuis les retours d'usage uniquement : PWA et
partitions hors ligne, calendrier externe, notifications push/SMS, module
Activités/Planning, application native.

## Pour aller plus loin

- [README.md](README.md) — vue d'ensemble complète, installation, matrice des rôles.
- [RELEASE_NOTES.md](RELEASE_NOTES.md) — périmètre des jalons figés.
- [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) — procédures d'exploitation et
  checklist des actions bloquantes sur l'hôte réel.
- [.agents/rules/choir-manager-rules.md](.agents/rules/choir-manager-rules.md) —
  règles de design/UX du projet.
- [chm-backend/README.md](chm-backend/README.md) /
  [chm-frontend/README.md](chm-frontend/README.md) — détails par sous-module.

Ce fichier est désormais la SEULE feuille de route à jour — l'ancien
`.agents/workflows/fil-conducteur.md` et les brouillons de planification
initiale ont été purgés (git en garde l'historique) : ils divergeaient
silencieusement de l'état réel, exactement le défaut que cette section
« Chantiers connus » ferme.
