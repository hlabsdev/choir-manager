# ChoirManager — Feuille de route d'exécution (révision du 24/07/2026)

> Remplace le document `choirmanager_instructions_tenancy.md`.
> Contexte : `v1.0.0-mvp.1` est taggé, le développement est à l'arrêt, et le
> document `PLAN_DEPLOIEMENT_DOCKER_POSTGRES_WSL.md` existe déjà côté projet.
>
> **Règle de jeu inchangée** : une instruction = une session Claude Code.
> Chaque instruction a un point d'arrêt « attends ma validation » avant tout code.
> Ne pas passer à la suivante tant que la précédente n'est pas relue et taggée.

---

## Ordre révisé — et pourquoi il change

| Jalon | Contenu | Tag visé |
| --- | --- | --- |
| **1** | Docker + PostgreSQL (le plan existant, avec l'avenant ci-dessous) | `v1.0.0-mvp.2` |
| **2** | Cloisonnement superuser / opérateur de plateforme | `v1.0.0-mvp.3` |
| **3** | Passage 1:N — backend | `v1.1.0-rc.1` |
| **4** | Passage 1:N — frontend | `v1.1.0-rc.2` |
| **5** | Déploiement + sauvegardes testées | — |
| **6** | Pilote réel 4–6 semaines, une seule chorale | `v1.1.0` |

**Correction assumée** : la version précédente de ce document plaçait le
cloisonnement superuser *avant* PostgreSQL, au motif qu'il était peu coûteux.
C'était une erreur de raisonnement. La migration PostgreSQL est un changement
d'**infrastructure** appliqué à un code figé et taggé ; le cloisonnement est un
changement de **logique de permissions**. Les mélanger rend tout échec
indiagnosticable : impossible de savoir si une régression vient du moteur de base
ou de la règle de droits. Un seul changement à la fois — le principe qui a déjà
payé sur le diagnostic frontend s'applique ici.

Conséquence directe : pendant le jalon 1, on **ne modifie aucune règle de
permission**, et on n'ajoute **aucun test figeant le comportement superuser
actuel** (voir avenant §A ci-dessous).

---

## Jalon 1 — Docker + PostgreSQL

Le plan `PLAN_DEPLOIEMENT_DOCKER_POSTGRES_WSL.md` fait autorité et est repris tel
quel. Il est bien construit, notamment sur les faux verts (§9.2), la matrice
multi-tenant (§10.1), la concurrence (§10.3) et les critères d'acceptation (§13).

Quatre corrections à y apporter **avant** de lancer la session.

### Avenant §A — Ne pas figer le comportement superuser

Le §10.1 du plan demande que « le superutilisateur conserve son comportement
global explicitement testé ». Ce comportement va changer au jalon 2 : un
superuser qui est aussi membre d'une chorale devra être scopé à cette chorale.

- **Conserver** les tests superuser existants tels quels (ils protègent contre
  une régression involontaire pendant la migration).
- **Ne pas ajouter** de nouveaux tests qui gravent « superuser voit tout ».
- Documenter dans le plan que ce point est volontairement provisoire et sera
  révisé au jalon 2.

### Avenant §B — Auditer CORS avant de conteneuriser

Le README backend mentionne désormais `CORS_ALLOW_ALL_ORIGINS` là où la version
précédente listait `CORS_ALLOWED_ORIGINS`. Le `.env.example` du plan prévoit bien
`CORS_ALLOW_ALL_ORIGINS=False`, mais cela ne dit rien du comportement **quand la
variable est absente**.

À vérifier explicitement dans `chm_config/settings.py` :

- Quelle est la valeur par défaut si la variable n'est pas définie ?
- Si le défaut est permissif, existe-t-il un garde-fou lié à `DJANGO_DEBUG` ?
- Cible : impossible d'obtenir une configuration CORS ouverte avec
  `DJANGO_DEBUG=False`, quelle que soit l'absence de variable. Le défaut doit
  être fermé ; c'est l'ouverture qui doit être explicite, jamais l'inverse.

Même exigence pour `DJANGO_SECRET_KEY` et `DJANGO_ALLOWED_HOSTS` : aucun défaut
de développement ne doit pouvoir survivre à `DJANGO_DEBUG=False`.

### Avenant §C — Deux dépendances non planifiées, à cadrer maintenant

Le module `notifications` a introduit deux besoins d'infrastructure absents du
plan :

1. **SMTP réel en production.** `EMAIL_BACKEND=console` ne suffira plus dès le
   pilote. Décider du fournisseur, et prévoir SPF/DKIM sur le domaine — sans
   quoi les emails partiront en spam. À trancher avant le jalon 5, pas pendant.
2. **Polling 60 s côté frontend.** Il maintient le backend éveillé en permanence.
   Conséquence directe : tout hébergement gratuit à quota d'heures mensuelles est
   disqualifié. Confirme le choix du VPS. Vérifier aussi que le polling
   s'interrompt quand l'onglet est en arrière-plan (`document.hidden`) — sinon
   c'est une charge constante et inutile.

### Avenant §D — Migration de données : trancher explicitement

Le §8 du plan décrit un `dumpdata`/`loaddata` depuis SQLite. **Question à
répondre avant de commencer** : la base SQLite actuelle contient-elle des données
qu'il faut réellement conserver, ou seulement du jeu de test ?

- Si c'est du jeu de test uniquement : repartir d'une base vide + `provision_chorale`
  + `seed_demo_chorale`. Plus simple, plus sûr, et cela valide au passage le
  chemin d'onboarding réel.
- Si des données réelles existent : suivre le §8 du plan, et **tester la
  restauration** avant de considérer la migration faite.

### Instruction de session — Jalon 1

```
Contexte : lis CLAUDE.md, les README backend/frontend, et le document
PLAN_DEPLOIEMENT_DOCKER_POSTGRES_WSL.md à la racine du superprojet. Ce plan
fait autorité pour cette session : suis-le.

Quatre avenants s'y ajoutent, à appliquer :

A. NE PAS figer le comportement superuser. Le §10.1 demande de tester
   explicitement le comportement global du superutilisateur : conserve les
   tests existants, mais n'en ajoute AUCUN nouveau qui grave « superuser voit
   toutes les chorales ». Cette règle change au jalon suivant. Signale-le en
   commentaire dans le plan.

B. Audite la configuration CORS / SECRET_KEY / ALLOWED_HOSTS dans
   chm_config/settings.py AVANT de conteneuriser. Le README mentionne
   CORS_ALLOW_ALL_ORIGINS. Réponds précisément : quelle est la valeur par
   défaut de chacune si la variable d'environnement est absente ? Existe-t-il
   un garde-fou lié à DJANGO_DEBUG ? Cible : avec DJANGO_DEBUG=False, il doit
   être impossible d'obtenir une config permissive par simple oubli de
   variable. Le défaut est fermé ; l'ouverture est explicite.

C. Vérifie que le polling notifications (60s) s'interrompt quand l'onglet est
   en arrière-plan. Si ce n'est pas le cas, signale-le — correction au jalon
   frontend, pas maintenant.

D. Avant de suivre le §8 (migration des données SQLite) : dis-moi ce que
   contient réellement la base SQLite actuelle. Si ce n'est que du jeu de
   test, propose de repartir d'une base vide via provision_chorale +
   seed_demo_chorale plutôt que dumpdata/loaddata.

PHASE 1 — PLAN. Présente-moi :
- le résultat de l'audit B (c'est le seul point qui peut révéler une faille) ;
- ta réponse au point D ;
- la liste des fichiers que tu vas créer/modifier (cf. §4 du plan) ;
- l'ordre dans lequel tu comptes procéder.
Attends ma validation avant d'écrire quoi que ce soit.

PHASE 2 — EXÉCUTION, en suivant le plan. Rappels critiques issus du plan
lui-même, à ne pas perdre de vue :
- les tests de select_for_update DOIVENT utiliser TransactionTestCase ou
  pytest.mark.django_db(transaction=True) — sinon faux vert (§10.3) ;
- vérifier connection.vendor == "postgresql" dans la suite Postgres (§9.2) ;
- si moins de 129 tests sont collectés, arrêter et expliquer (§9.1) ;
- ne jamais rendre un test vert en modifiant son assertion : rapporter.

PÉRIMÈTRE EXCLU de cette session : toute modification des règles de permission,
du modèle Membre, ou de la relation User↔Membre. Aucune fonctionnalité nouvelle.

Discipline Git (cf. §3 du plan) : branches feat/mvp-postgres-docker (superprojet
et backend) et feat/mvp-docker-runtime (frontend). Committer et pousser d'abord
le sous-module, ensuite seulement le pointeur du superprojet. Ne commit pas sans
mon accord.
```

---

## Jalon 2 — Cloisonnement superuser / opérateur de plateforme

Inchangé sur le fond par rapport à la version précédente de ce document, mais
désormais exécuté **sur PostgreSQL**, après le tag `v1.0.0-mvp.2`.

**Règle cible** — superuser AYANT un Membre ⇒ scopé à sa chorale, sans accès à la
gestion des chorales. Superuser SANS Membre ⇒ opérateur de plateforme, god-mode.
Un non-superuser n'est jamais opérateur.

### Instruction de session — Jalon 2

```
Contexte : lis CLAUDE.md et chm-backend/README.md. Le projet tourne désormais
sur PostgreSQL (tag v1.0.0-mvp.2). Session dédiée à UN sujet : séparer
"opérateur de plateforme" et "administrateur de tenant". Rien d'autre.

PROBLÈME
core/middleware.py fait : superuser → request.chorale = None → aucun filtrage.
Donc tout superuser voit toutes les chorales. Or un superuser peut aussi être
membre d'une chorale (fondateur qui chante, président technique). Il ne devrait
alors voir QUE sa chorale.

RÈGLE CIBLE
- Superuser AVEC un Membre → scopé à la chorale de ce membre, exactement comme
  un utilisateur normal. Pas d'accès aux autres chorales ni à la gestion des
  chorales.
- Superuser SANS aucun Membre → opérateur de plateforme : request.chorale = None,
  god-mode, accès à la gestion des chorales.
- Un non-superuser n'est jamais opérateur.

PHASE 1 — ÉTAT DES LIEUX (ne code rien)
1. Recense TOUS les endroits qui testent is_superuser ou qui dépendent de
   request.chorale is None pour élargir un accès : middleware, mixins
   (notamment ?include_deleted=true), permissions, dashboard, admin, rapports,
   notifications.
2. Django admin : quels ModelAdmin exposent Chorale et DemandeChorale ?
   ATTENTION : un superuser passe tous les has_perm() par défaut. Masquer ces
   modèles exige de surcharger explicitement has_module_permission /
   has_view_permission / has_add_permission / has_change_permission sur les
   ModelAdmin. Jouer sur les permissions Django ne suffira pas.
3. Vérifie aussi les QUERYSETS de l'admin, pas seulement l'API : /admin/membres/
   membre/ liste-t-il actuellement les membres de toutes les chorales ? C'est
   l'angle mort classique.
4. Le JWT expose is_superuser. Où le front s'en sert-il ?
Présente ce recensement. Attends validation.

PHASE 2 — IMPLÉMENTATION
1. Introduis une notion explicite d'opérateur plutôt que de tester is_superuser
   partout. Propose la forme (property sur User, helper core/, attribut posé par
   le middleware). Critère : UN seul endroit décide, tout le reste consomme.
2. Middleware : applique la règle cible.
3. Admin : Chorale et DemandeChorale invisibles pour un superuser non-opérateur ;
   querysets de l'admin scopés comme l'API.
4. ?include_deleted=true : réservé à l'opérateur.
5. JWT : ajoute un claim distinguant opérateur / superuser scopé (is_superuser
   devient ambigu, ne t'en contente pas). Ajoute-le à DecodedToken côté front,
   mais NE touche à AUCUN composant Angular dans cette session.
6. Révise les tests du jalon précédent qui gravaient l'ancien comportement
   superuser (cf. avenant A) : ils doivent maintenant refléter la règle cible.

TESTS OBLIGATOIRES
- Superuser membre de A → 403/404 sur une ressource de B (API).
- Superuser membre de A → Chorale/DemandeChorale absents de l'admin.
- Superuser membre de A → queryset admin scopé à A.
- Superuser membre de A → ?include_deleted=true refusé.
- Superuser sans membre → god-mode intact.

Contraintes : aucun composant Angular, aucune modification du modèle Membre.
check + pytest verts. Ne commit pas.
```

---

## Jalon 3 — Passage 1:N (backend)

**Le problème de fond, inchangé** : le RBAC repose sur `user.groups`, qui sont
globaux à l'utilisateur et n'ont aucune notion de tenant. Dès qu'un User a des
membres dans plusieurs chorales, le signal calcule l'union des mandats toutes
chorales confondues ⇒ trésorier dans A ⇒ `IsTresorier` passe aussi dans B.
Escalade de privilèges cross-tenant sur les finances.

**Nouveauté depuis la version précédente de ce document** : le module
`notifications` doit être intégré au chantier (voir §Notifications ci-dessous).

### Instruction de session — Jalon 3

```
Contexte : lis CLAUDE.md et chm-backend/README.md(Fichiers que tu mettra a jours apres chaque palier significatif pour tjrs les conserver a jour). Point de retour v1.0.0-mvp.3
publié sur GitHub — on peut ouvrir un chantier lourd. Session BACKEND
uniquement : passer d'un User = un Membre = une chorale à un User membre de
plusieurs chorales. Aucun composant Angular dans cette session.

AVERTISSEMENT À GARDER EN TÊTE TOUT DU LONG
Le cas mono-chorale continuera de marcher même si la résolution multi-tenant est
fausse. La base de test ne contient que des users mono-chorale. Donc "les tests
existants passent" ne prouve RIEN sur ce chantier. La preuve vient uniquement des
tests multi-appartenance neufs. Ne conclus jamais "ça marche" sur la seule base
de la suite existante restée verte.

LE PROBLÈME DE FOND (relis-le avant de proposer quoi que ce soit)
Le RBAC repose sur user.groups, recalculé par membres/signals.py. Les groupes
Django sont GLOBAUX à l'utilisateur, sans notion de tenant. Dès qu'un User a des
membres dans plusieurs chorales, le signal calcule l'union des mandats actifs
toutes chorales confondues : trésorier dans A ⇒ groupe tresorier sur le User ⇒
IsTresorier passe AUSSI dans B. Escalade de privilèges cross-tenant sur les
finances. Les permissions ne peuvent donc plus vivre sur le User ; elles doivent
se résoudre par tenant actif.

Note : le jalon 2 a déjà introduit core/tenancy.py (est_operateur, chorale_de,
requete_est_operateur). chorale_de(user) suppose aujourd'hui une chorale unique
— il fait partie de ce qui doit évoluer. Réutilise ce module comme point d'ancrage
plutôt que d'en créer un parallèle.

PHASE 1 — PLAN (ne code rien, présente et attends validation)
Recense et présente :
1. Tous les usages de l'accesseur OneToOne user.membre / request.user.membre —
   ils vont tous casser. Propose un helper unique get_membre(user, chorale) et
   dis comment chorale_de() de core/tenancy.py évolue.
2. Tous les points lisant user.groups pour décider d'un droit : permissions,
   vues, serializers, admin, sérialisation JWT, ET core/tenancy.py.
3. Le module notifications : le modèle Notification porte-t-il une FK chorale
   exploitable ? Sinon c'est une migration à intégrer ici (les notifications
   devront être scopées au tenant actif, pas seulement au destinataire).
4. Ta stratégie de migration de données : les 23 membres RPL réels + la démo CVN
   doivent survivre sans perte, chacun rattaché à sa chorale. Réversible si
   possible. IMPÉRATIF : fais un pg_dump AVANT la migration et dis-moi où il est.
5. TRANCHE EXPLICITEMENT le cas Django admin. L'admin utilise user.groups pour
   ses propres permissions. Si on vide user.groups, l'admin des opérateurs peut
   casser. Le jalon 2 a déjà réservé l'admin sensible aux opérateurs — appuie-toi
   dessus. Propose UNE solution nette : les groupes ne sont plus source de vérité
   pour l'API métier ; l'accès admin dépend de est_operateur, pas des groupes.
   NE PROPOSE PAS de garder user.groups actif "pour ne rien casser" en parallèle
   de la résolution scopée. Deux sources de vérité qui divergent = failles
   silencieuses. Je refuserai cette option d'emblée.

PHASE 2 — IMPLÉMENTATION (après validation du plan)

Modèle
- Membre.user : OneToOneField → ForeignKey, related_name explicite (ex.
  "membres"). UniqueConstraint(user, chorale) : un seul Membre par user et par
  chorale.
- soft_delete() d'un Membre ne doit PLUS faire user.is_active = False — le user
  peut être actif ailleurs. C'est devenu faux, corrige-le.
- Suspension d'une chorale : bloque CE tenant, jamais le compte entier.

Résolution des permissions (le cœur — c'est ici que le chantier réussit ou échoue)
- core/permissions.py : chaque classe passe de "ce User a-t-il le groupe X" à
  "le Membre de ce User dans request.chorale a-t-il un mandat actif conférant X".
  Les Group peuvent rester le vocabulaire ; la résolution devient scopée.
- Neutralise COMPLÈTEMENT l'écriture dans user.groups par membres/signals.py. Si
  elle subsiste, c'est une porte dérobée : un droit obtenu dans A resterait
  lisible depuis B.
- Retire groups du payload JWT (devenu faux) ou remplace-le par les seuls rôles
  du tenant actif.
- Perf : la résolution des mandats ne doit pas produire N requêtes SQL par
  vérification de permission. Prévois le select_related / la mise en cache par
  requête.

Tenant actif & JWT
- Le JWT porte le tenant actif (chorale_id) ET la liste des chorales du user
  (id + nom, pour le futur sélecteur front).
- IMPÉRATIF : le middleware REVÉRIFIE côté serveur que ce User a un Membre actif
  non supprimé dans cette chorale, et que la chorale est active. Un claim signé
  n'est pas forgeable, mais l'appartenance a pu être révoquée depuis l'émission.
  Ne jamais faire confiance au claim seul.
- membre_id devient le membre du tenant actif, recalculé à chaque switch.
- POST /api/auth/switch-chorale/ : vérifie l'appartenance, renvoie un nouveau
  couple access/refresh. Changer de chorale = réémettre un token, pas un toggle.
- Connexion : une seule chorale → active d'office ; plusieurs → défaut
  déterministe. Dis-moi lequel tu retiens (dernière utilisée vs plus ancienne).

Notifications
- Scoper /api/notifications/ au tenant actif EN PLUS du destinataire.
- Emails : indiquer de quelle chorale ils proviennent (un destinataire peut en
  recevoir de plusieurs). notifications/services.py reste le point d'entrée unique.

Onboarding d'un utilisateur déjà inscrit
- Le code d'invitation reste le point d'entrée, avec une branche : si le code est
  ouvert par une personne déjà connectée, ou si l'email saisi correspond à un
  compte existant, on ne crée PAS un second compte — on propose de rejoindre avec
  le compte existant, et le Membre n'est créé qu'après ACCEPTATION EXPLICITE de
  la personne.
- Non négociable : c'est toujours la personne qui accepte, jamais un bureau qui
  rattache un compte existant sans son accord. Une initiative bureau prend la
  forme d'une invitation nominative EN ATTENTE, acceptée ou refusée.
- Backend uniquement : endpoints + logique. L'UI viendra au jalon front.

TESTS OBLIGATOIRES (la seule preuve réelle du chantier — validation par mutation)
- LE test central : un User membre de A et B, mandat trésorier dans B ; tenant
  actif = A ⇒ 403 sur les finances de A ET aucune donnée de B visible. Valide-le
  par mutation (rends la résolution non scopée → il doit devenir rouge).
- Switch : nouveau token = bons droits ; ancien token n'ouvre pas le nouveau
  tenant.
- Un Membre soft-deleted dans A conserve l'accès à B.
- Chorale suspendue : ce tenant bloqué, compte intact.
- Claim chorale_id vers une chorale dont le user n'est pas/plus membre → rejeté
  par le middleware.
- Notifications : user membre de A et B ne voit que celles du tenant actif.
- Concurrence unique_actif sur un Poste : toujours verte après la refonte
  (c'est le mandat qui porte désormais la permission — ne la casse pas).
- Toute la suite d'isolation existante reste verte.

Contraintes : PostgreSQL. Aucun composant Angular. Plan avant code, diff avant
commit. Ne commit pas — je relis, en particulier le test central et la
neutralisation de user.groups.
```

---

## Jalon 4 — Passage 1:N (frontend)

Inchangé sur le fond, avec l'ajout des notifications et du polling.

### Instruction de session — Jalon 4

```
Contexte : lis CLAUDE.md et chm-frontend/README.md. Le backend supporte
désormais un User membre de plusieurs chorales (tag v1.1.0-rc.1 + correctif
admin mergé). Session FRONTEND uniquement. Backend non modifié dans cette
session, sauf le renommage de claim décrit au point 0 qui se fait des DEUX
côtés à la fois.

CE QUE LE BACKEND EXPOSE DÉSORMAIS (pour cadrer ton audit, pas à re-découvrir)
- JWT : claim tenant actif (chorale_id), liste des chorales du user
  (id, nom, prefix, currency), claim opérateur (is_operateur, jalon 2), et un
  claim rôles nommé `groups` mais dont le CONTENU est scopé au tenant actif
  (plus l'union toutes chorales d'avant ce chantier).
- Une session peut exister SANS tenant actif (chorale_id: null) : cas d'un user
  qui n'a plus aucune chorale mais a une invitation nominative en attente. Le
  dashboard répond alors 200 avec un objet vide construit explicitement (pas
  d'erreur, pas de queryset qui se trouve vide par hasard) — le front doit
  gérer cet état comme un état normal, pas comme une erreur.
- POST /api/auth/switch-chorale/ {chorale_id} : vérifie l'appartenance côté
  serveur, réémet un COUPLE access/refresh. L'ancien token n'ouvre plus le
  nouveau tenant après coup — ce n'est pas un toggle local.
- Onboarding déjà en place côté API : POST .../invitations/rejoindre-avec-mon-
  compte/ (utilisateur déjà connecté qui ouvre un code) ; 409 explicite si
  l'email saisi correspond à un compte existant (pas de création silencieuse) ;
  modèle InvitationNominative avec GET .../mes-invitations/, POST .../accepter/,
  POST .../refuser/ (initiative bureau, acceptation explicite obligatoire).
- Notifications scopées au tenant actif en plus du destinataire.
- Admin Django : god-mode réservé à l'opérateur (superuser sans aucun Membre),
  un superuser membre d'une chorale n'a plus aucun privilège métier lié à
  is_superuser — ça ne concerne pas directement ce front, mais ça cadre ce que
  "opérateur" doit signifier dans l'UI Angular aussi.

PHASE 0 — renommage du claim (à faire en dernier dans cette session, pas en
premier, une fois que tout le reste fonctionne sur `groups`)
Le nom `groups` a été conservé au jalon 3 uniquement pour ne pas casser le
front pendant la fenêtre entre les deux jalons. Cette raison disparaît
maintenant. En fin de session, une fois tout validé : renomme le claim en
`roles` des deux côtés (authentication/serializers.py côté backend,
DecodedToken + tout lecteur côté front) dans un commit dédié et clairement
identifié, après que le reste du jalon est testé et stable. Ne le fais pas en
ouverture de session — tu perdrais ton signal de référence pendant le
développement du reste.

PHASE 1 — ÉTAT DES LIEUX (ne code rien, présente et attends validation)
Recense et présente :
1. Tout ce qui suppose une chorale unique : DecodedToken, AuthService,
   auth.guard.ts (roleGuard), le layout, NotificationsService, et tout
   composant lisant chorale_nom / membre_id / is_superuser directement plutôt
   que via un service centralisé.
2. Tous les endroits qui lisent `is_superuser` pour afficher un élément d'UI
   (dette du jalon 2, ~25 sites dont hasRole()) — cette session est l'occasion
   de les corriger en les faisant lire `is_operateur` à la place, PAS
   is_superuser. Confirme la liste avant de toucher au code.
3. Le comportement actuel du front face à un dashboard vide / une session sans
   tenant : plante-t-il, ou gère-t-il déjà un état "aucune donnée" ? Ça
   détermine si la gestion du cas chorale_id: null est un ajout ou une
   correction.
Présente ce recensement. Attends ma validation.

PHASE 2 — IMPLÉMENTATION (après validation)

Types & état
- DecodedToken : tenant actif (chorale_id, nom, prefix, currency), liste des
  chorales du user, claim is_operateur. Corrige toute lecture de is_superuser
  qui décidait d'un affichage — elle doit lire is_operateur.
- AuthService : expose en signals la chorale active, la liste des chorales
  disponibles, et le statut opérateur.
- roleGuard : les rôles lus sont ceux du TENANT ACTIF uniquement (le claim
  `groups`/`roles` est déjà scopé côté backend — le guard n'a rien à filtrer
  lui-même, juste à ne jamais mélanger avec un état d'un autre tenant en cache).

Sélecteur de chorale
- Emplacement : haut du layout authentifié, près de l'identité utilisateur,
  visible sur mobile.
- Si une seule chorale : PAS de sélecteur, juste le nom affiché. Ne pas
  encombrer l'interface pour le cas majoritaire (c'est celui de la quasi-
  totalité des utilisateurs réels aujourd'hui).
- Si aucune chorale active (chorale_id: null) : pas de sélecteur non plus,
  mais un état clair — par exemple un bandeau "Vous n'êtes membre d'aucune
  chorale actuellement" avec accès direct aux invitations en attente s'il y en
  a (cf. onboarding ci-dessous).
- Au changement : appelle switch-chorale → remplace access+refresh → PUIS
  réinitialise l'état applicatif dans cet ordre précis : caches de données
  chargées, compteur et liste de notifications, route courante. RISQUE À
  ÉVITER ABSOLUMENT : afficher un instant les données de l'ancienne chorale
  sous le nom de la nouvelle — un signal qui ne se vide pas avant le rechargement
  produit exactement ça.
- Si la route courante n'a plus de sens dans le nouveau tenant (le rôle n'y
  donne plus accès, ou la ressource affichée appartenait à l'ancien tenant) :
  redirige vers le dashboard. Ne redirige PAS vers /acces-reserve — ce n'est
  pas un refus de droit, c'est un changement de contexte.
- États obligatoires pendant le switch : indicateur de chargement sur le
  sélecteur lui-même (pas un skeleton pleine page), et en cas d'échec réseau :
  message clair + retour à l'état précédent (chorale active inchangée), jamais
  un état intermédiaire où le sélecteur affiche une chorale que les tokens ne
  confirment pas encore.

Notifications
- Compteur non-lues et liste : remis à zéro puis rechargés au switch de
  chorale, jamais laissés affichant un total de l'ancien tenant.
- Le polling 60s doit s'interrompre quand l'onglet est en arrière-plan
  (Page Visibility API, document.hidden). C'était déjà une dette signalée —
  si elle n'a jamais été traitée, corrige-la maintenant.

Mode opérateur (god-mode)
- Si is_operateur est vrai : afficher un sélecteur permettant de consulter
  n'importe quelle chorale (liste complète, pas seulement les siennes — un
  opérateur n'a par définition aucun Membre) + une entrée de menu "Gestion des
  chorales".
- STRICTEMENT invisible pour tout autre profil, y compris un superuser membre
  d'une chorale. Rappel de convention : masquer dans l'UI ne suffit jamais, le
  backend refuse déjà côté admin Django — ici c'est la même logique appliquée
  à l'app Angular.
- Si "Gestion des chorales" n'a pas d'écran dédié côté API pour l'instant,
  ne construis pas de CRUD complet dans cette session : un lien vers l'admin
  Django (déjà fonctionnel et cloisonné) est un point d'arrivée acceptable
  pour ce jalon. Dis-moi si tu vois un écart.

Onboarding — deux flux à câbler sur l'API déjà existante
- /rejoindre/:code : si la personne est déjà connectée, appelle
  rejoindre-avec-mon-compte/ directement (écran de confirmation "Rejoindre
  <Chorale> avec votre compte actuel ?"), PAS le formulaire d'inscription.
- Sur ce même écran, si la soumission d'un email (utilisateur non connecté)
  reçoit le 409 du backend : affiche clairement "Un compte existe déjà avec
  cet email — connectez-vous pour accepter l'invitation" avec un lien de
  connexion qui ramène ensuite sur le même code. Ne laisse jamais cet état se
  présenter comme une erreur générique.
- Nouvel écran (ou section de mon-espace) : liste des invitations nominatives
  en attente, via GET .../mes-invitations/, avec actions Accepter / Refuser.
  Si l'utilisateur n'a aucune chorale active, c'est l'écran qu'il doit voir en
  priorité après connexion plutôt qu'un dashboard vide muet.

TESTS (Vitest)
- roleGuard : un rôle élevé venant d'un autre tenant que l'actif ne doit
  jamais passer (le claim étant déjà scopé côté backend, ce test protège
  surtout contre un bug de cache front qui mélangerait deux états).
- Le sélecteur de chorale n'apparaît pas quand il n'y a qu'une chorale.
- Les entrées opérateur (sélecteur toutes-chorales, "Gestion des chorales")
  sont absentes du DOM pour un utilisateur non-opérateur, y compris superuser
  membre d'une chorale.
- Le compteur de notifications est réinitialisé au switch de chorale.
- Un dashboard "vide" (chorale_id: null) affiche l'état dédié, pas une erreur.
- Le renommage groups → roles (phase 0) : un test qui décode le token et lit
  le nouveau nom, pour qu'une régression de nommage soit détectée immédiatement.

Contraintes : signals uniquement (.update(), pas de mutation), control-flow
@if/@for, classes du design system existant (.card, .btn-*, .badge-*, ne
recompose pas d'utilitaires Tailwind à la main), icônes enregistrées dans
app.config.ts. npm run build + npm test verts avant de me rendre la main.

Ne commit pas — je teste le switch de chorale, l'onboarding compte-existant,
et le mode opérateur manuellement avant merge, avec le compte à deux chorales
déjà créé lors des tests du jalon précédent.
```

---

## Jalon 5 — Déploiement

À traiter dans sa propre session, avec le §11 (sécurité) et le §12 (sauvegarde)
du plan Docker comme base. Trois points qui ne sont dans aucun document actuel :

- **SMTP réel** : fournisseur, SPF/DKIM sur le domaine. Sans cela les
  notifications email finissent en spam. À trancher avant de déployer.
- **Sauvegardes** : `pg_dump` quotidien vers un stockage SÉPARÉ (R2, Backblaze
  B2), plus les médias (photos, partitions). Un backup jamais restauré n'est pas
  un backup : tester une restauration complète le jour même du déploiement.
- **Hébergement** : petit VPS (~4 €/mois) + Coolify/Dokploy, frontend sur
  Cloudflare Pages. Le polling 60s disqualifie les offres gratuites à quota
  d'heures.

### Instruction de session — Jalon 5
```
Jalon 5, bloc 1 — prérequis avant tout le reste : invalidation des JWT existants
au changement de mot de passe.

PROBLÈME
Aujourd'hui, changer son mot de passe ne révoque aucun token émis avant. Si le
changement est motivé par une compromission suspectée, l'attaquant garde
l'accès jusqu'à expiration du refresh token (7 jours). C'est une fausse
promesse de sécurité.

PHASE 1 — PLAN (ne code rien, présente et attends validation)
1. SimpleJWT permet plusieurs stratégies : blacklist du refresh token
   (django-rest-framework-simplejwt blacklist app, si pas déjà installée),
   rotation avec révocation, ou un champ de version/timestamp sur User comparé
   à l'iat du token. Recommande une approche et justifie-la au regard de
   l'existant (rotation de refresh déjà en place depuis le jalon 1).
2. Un changement de mot de passe doit invalider TOUS les refresh tokens actifs
   du user, pas seulement celui de la session courante — sinon une session sur
   un autre appareil reste valide indéfiniment.
3. Le user qui vient de changer son mot de passe doit rester connecté sur SA
   session courante (réémission immédiate d'un couple access/refresh), sans quoi
   l'UX se dégrade pour tout le monde à chaque changement volontaire.
4. Vérifie l'articulation avec le garde-fou multi-chorale du reset (refus 409
   sur compte multi-chorale/superuser) : ce garde-fou protège le RESET, il ne
   dit rien sur l'invalidation lors d'un changement de mot de passe volontaire
   (utilisateur connecté qui change son mot de passe depuis son profil) — les
   deux flux sont différents, ne les confonds pas.

PHASE 2 — après validation
Implémente, avec tests obligatoires :
- Ancien refresh token rejeté après changement de mot de passe (toutes sessions).
- Session courante reste fonctionnelle immédiatement après le changement.
- Le flux normal de refresh (rotation) n'est pas cassé pour un user qui n'a
  rien changé.
- Validation par mutation : neutralise l'invalidation, vérifie que le test
  dédié devient rouge.

Contraintes : backend uniquement. Plan avant code. Ne commit pas.
```

## Jalon 6 — Pilote

4 à 6 semaines, **une seule chorale : la tienne**. Vraies répétitions, vrai
pointage sur mobile, vraies cotisations. Aucun ajout de fonctionnalité pendant
cette période, seulement les correctifs bloquants. Noter systématiquement : les
hésitations, les questions posées, les moments où quelqu'un abandonne et ressort
le cahier papier. C'est la vraie recette — pas la checklist.

Le guide utilisateur actuel décrit des hypothèses d'usage, pas des usages
observés. Le considérer comme jetable jusqu'à la fin du pilote.

---

## Point non résolu, à traiter un jour

Le frontend compte 32 tests, dont aucun sur l'écran de pointage — l'écran
identifié comme décisif pour l'adoption. Un test de non-régression sur la
persistance tap-par-tap et le rollback en cas d'échec réseau serait le meilleur
rapport valeur/effort côté front. À caser entre deux jalons, ou juste avant le
pilote.
