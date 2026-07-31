---
description: Source unique de l'état réel, du prochain jalon et de l'ordre de travail de ChoirManager
updated: 2026-07-31
---

# ChoirManager — Fil conducteur global

Unique workflow actif du superprojet. Il remplace les audits, checklists et
plans historiques qui décrivaient des états dépassés.

Mis à jour à chaque changement de jalon, après vérification du code et des
tests. Un élément n'est marqué terminé que si son comportement est implémenté,
vérifié et documenté.

## 1. Référence actuelle

| Élément | Valeur |
| --- | --- |
| Date du constat | 26 juillet 2026 |
| Stade produit | MVP fonctionnel, multi-chorale backend **et** frontend |
| Dernier jalon livré | Jalon 4 — passage 1:N frontend (`v1.1.0-rc.2`) |
| Jalon en cours | Jalon 5 — déploiement + sauvegardes testées |
| Base de données | PostgreSQL 17 sous Docker Compose |
| Tests backend | 262 (`pytest -q`) |
| Tests frontend | 87 (Vitest) |
| Feuille de route détaillée | `docs/choirmanager_feuille_de_route_v2.md` |
| Runbook d'exploitation | `docs/DEPLOIEMENT.md` |

### Ordre de fiabilité des informations

En cas de contradiction, appliquer cet ordre :

1. comportement du code et résultats des tests exécutés ;
2. migrations, configuration et routes réellement présentes ;
3. `CLAUDE.md` et README des sous-modules ;
4. présent fil conducteur ;
5. anciens documents de conception et échanges historiques.

## 2. Jalons

| Jalon | Contenu | Tag | État |
| --- | --- | --- | --- |
| 1 | Docker + PostgreSQL | `v1.0.0-mvp.2` | livré |
| 2 | Cloisonnement opérateur / administrateur de tenant | `v1.0.0-mvp.3` | livré |
| 3 | Passage 1:N — backend | `v1.1.0-rc.1` | livré |
| 4 | Passage 1:N — frontend | `v1.1.0-rc.2` | **livré** |
| 5 | Déploiement + sauvegardes testées | — | à venir |
| 6 | Pilote réel 4–6 semaines, une seule chorale | `v1.1.0` | à venir |

## 3. Architecture à préserver

Règles non négociables lors des prochaines étapes :

- `Chorale` reste la racine du tenant ; aucune donnée métier n'échappe au
  filtrage serveur ;
- tout nouveau ViewSet métier applique `ChoraleFilterMixin` et, lorsque
  pertinent, `SoftDeleteMixin` ; tout nouveau modèle de chorale hérite
  normalement de `SoftDeleteModel` ;
- **les rôles se résolvent par tenant actif** (`core/tenancy.py`), jamais depuis
  `user.groups` — cette table est vide et doit le rester ;
- **aucun attribut de tenant sur la requête** : `request.chorale` et
  `request.est_operateur` n'existent plus, on appelle `chorale_active(request)`
  et `requete_est_operateur(request)` au point d'usage ;
- **toute adhésion passe par `membres/services.py::adherer`**, qui réadmet un
  membre retiré au lieu de violer `unique_membre_par_user_et_chorale` ;
- la logique métier reste dans `services.py` ou `signals.py` ;
- les contrôles frontend complètent les permissions API, ne les remplacent
  jamais ; les URLs API restent centralisées dans les environnements Angular ;
- le frontend reste standalone, zoneless, fondé sur les Signals et mobile-first ;
  tout écran asynchrone traite chargement, vide, erreur et nouvelle tentative ;
- code en anglais ; interface, logs et commentaires métier en français.

## 4. Règle de test propre au multi-tenant

**Une suite verte ne prouve rien à elle seule.** La quasi-totalité des tests
sont mono-chorale : ils restent verts même si la résolution par tenant est
entièrement fausse.

Toute garantie de cloisonnement s'écrit dans
`chm-backend/core/tests/test_multi_appartenance.py` et **se valide par
mutation** : rendre la résolution globale doit rendre le test rouge. Le tableau
des mutations de référence et leur résultat attendu vit dans
`chm-backend/README.md`, section « Tests ». Un test vert sous mutation ne prouve
rien et doit être réécrit.

Deux tests structurels (`core/tests/test_resolution_tenant_interne.py`) ferment
les classes de régression qui se reproduisent à chaque nouveau ViewSet : lecture
d'un attribut de tenant supprimé, et création directe de `Membre`.

## 5. Jalon 4 — Passage 1:N frontend (LIVRÉ)

### Objectif

Rendre visible et utilisable, côté Angular, ce que le backend expose déjà :
appartenance à plusieurs chorales, changement de chorale, et rôles scopés.

### Ce que le backend fournit déjà

- claim JWT `chorales` : `[{id, nom, prefix, currency}]` — les appartenances
  exploitables ;
- claim `chorales_suspendues` : `[{id, nom}]` — pour expliquer une session sans
  tenant plutôt qu'un écran vide ;
- claim `chorale_id` : le tenant actif ; `membre_id` et `roles` en découlent ;
- `POST /api/auth/switch-chorale/ {chorale_id}` → nouveau couple
  access/refresh ;
- `GET /api/membres/mes-invitations/` + `accepter/` / `refuser/` — accessibles
  **sans tenant actif** ;
- `POST /api/membres/invitations/rejoindre-avec-mon-compte/ {code}`.

### Travaux

- [x] Sélecteur de chorale dans `main-layout` (masqué à une seule chorale),
  appel de `switch-chorale`, remplacement des deux tokens, purge de l'état.
- [x] État « session sans tenant » : bandeau nommant le motif (chorale suspendue
  via `chorales_suspendues`), écran `/mes-invitations` comme page d'arrivée,
  état dédié sur le dashboard.
- [x] Acceptation / refus d'une invitation nominative.
- [x] Adhésion à une chorale supplémentaire par code, depuis un compte connecté.
- [x] **Dette du jalon 2 soldée** : `AuthService.isSuperuser` est supprimé, pas
  rebranché. Les 17 sites de permission métier perdent leur clause superuser
  sans contrepartie — les droits viennent des mandats. `is_operateur` ne pilote
  que la surface plateforme ; `roleGuard` perd sa dérogation et les routes
  opérateur passent par `operateurGuard`.
- [x] Claim `groups` renommé `roles` des deux côtés (`cff1d69`).
- [x] Réinitialisation de mot de passe par le Bureau (manquait — la doc
  l'affirmait sans qu'elle existe) : `POST /api/membres/{id}/
  reinitialiser-mot-de-passe/`, mot de passe temporaire renvoyé une seule
  fois, refusé (409) sur un compte multi-chorale ou superuser (`a41ddb8`,
  `07c9e94`).
- [x] Tests Vitest : 32 → 77 ; tests backend : 237 → 246. Garanties centrales
  validées par mutation.

### Validation manuelle (26 juillet 2026)

Tous les parcours testés à la main sur un compte réellement membre de deux
chorales, résultat **vert** :

- switch de chorale depuis `/dashboard` (le cas `routeReuseStrategy`) ;
- onboarding compte-existant (409 `compte_existant`) ;
- écran sans-tenant (mention claire, invitation visible) ;
- mode opérateur (« Gestion des chorales » → admin Django) ;
- réinitialisation de mot de passe : refusée sur un compte multi-chorale
  avec le message attendu, acceptée sur un compte à une seule chorale.

Point non couvert par les tests, resté non simulé : `switch-chorale` réémet
aussi le *refresh* token ; un refresh silencieux concurrent de la bascule
n'a pas de scénario de course dédié. Non bloquant pour ce jalon.

**Critère de sortie atteint :** une personne membre de deux chorales bascule
de l'une à l'autre dans l'interface, voit des rôles différents dans chacune,
et aucune donnée de l'une n'apparaît dans l'autre.

### Point d'architecture acté

Pour tout endpoint réémettant un couple access/refresh, le chemin dépend d'un
seul critère : **la chorale ouverte change-t-elle ?**

| Cas | Chemin |
| --- | --- |
| Changement de tenant | `TenantContextService.appliquerContexteTenant()` |
| Même tenant, nouveaux tokens | `AuthService.appliquerTokens()` |

`appliquerContexteTenant()` purge l'état applicatif et **renavigue** :
indispensable en cas de changement de chorale — trois implémentations
parallèles, c'était trois occasions d'afficher les données de l'ancienne
chorale sous le nom de la nouvelle — mais néfaste sinon, la personne étant
éjectée de l'écran où elle travaille.

Changent de tenant : `switch-chorale/`,
`invitations/rejoindre-avec-mon-compte/`, `mes-invitations/{id}/accepter/`.
Ne change pas de tenant : `changer-mot-de-passe/` (jalon 5), qui révoque
toutes les sessions et en réémet une en préservant la chorale active.

## 6. Jalon 5 — à traiter EN OUVERTURE

### Dette de processus : la réinitialisation de mot de passe

**À reprendre avant toute autre chose au jalon 5.**

Le mécanisme a été livré en fin de session frontend (`a41ddb8`, `07c9e94`),
**sans plan validé ni revue dédiée du modèle de menace** — contrairement aux
quatre jalons précédents, où chaque changement touchant aux permissions avait
été cadré avant d'être écrit. Il est né d'un constat de dernière minute : la
documentation affirmait depuis longtemps que « le Bureau peut refixer un mot de
passe », alors qu'aucun code ne l'implémentait.

Le raisonnement retenu tient, et il est écrit dans `membres/services.py` : le
mot de passe est la SEULE donnée du modèle qui ne soit pas cloisonnée par
chorale, donc le réinitialiser ouvre le compte entier et toutes ses
appartenances ; d'où le refus (409) des comptes multi-chorale et superuser, avec
le garde-fou placé dans le service et non dans la vue. Neuf tests, dont le test
central validé par mutation.

Ce qui manque n'est pas la logique, c'est **le processus** : aucune revue n'a
cherché ce que ce raisonnement pourrait avoir manqué.

#### Bloc 1 — révocation des sessions ✅ BACKEND FAIT, front à suivre

**Décision de cadrage tenue : l'invalidation des JWT s'est traitée AVANT le
reset par email.** Motif : changer un mot de passe sans rien révoquer était une
fausse promesse de sécurité — l'attaquant gardait l'accès jusqu'à expiration du
refresh, soit 7 jours. Le reset par email augmentera la surface (lien
interceptable, rejouable) : on ne pose pas ce flux sur un socle qui ne révoque
rien. Même logique que PostgreSQL avant la refonte 1:N.

Livré côté backend :

- app `rest_framework_simplejwt.token_blacklist` activée (aucune nouvelle
  dépendance, elle est dans le paquet déjà installé) ;
- `authentication/services.py::revoquer_toutes_les_sessions()` — primitive
  partagée, révoque **tous** les refresh vivants du compte, pas seulement celui
  de la session courante ;
- appelée par les DEUX flux : changement self-service et réinitialisation
  Bureau. Différence assumée : le self-service **réémet** un couple pour la
  session courante (sinon changer son mot de passe déconnecterait celui qui le
  change), le flux Bureau non — le demandeur n'est pas le titulaire ;
- 12 tests, 3 mutations vérifiées (révocation retirée de chaque flux, filtre
  `user` retiré de la primitive).

**Portée réelle, à ne pas surestimer** : seuls les *refresh* sont révocables —
`AccessToken` n'hérite pas de `BlacklistMixin` côté SimpleJWT. Un access volé
reste utilisable jusqu'à sa propre expiration, **30 minutes au plus**. Le gain
est de ramener la fenêtre de 7 jours à 30 minutes, pas de la supprimer.

**Conséquence d'exploitation** : la table `OutstandingToken` grandit à chaque
émission (y compris à chaque rotation, soit toutes les 30 min par session
active). Purge quotidienne `make purge-tokens` à planifier — cf.
`docs/DEPLOIEMENT.md` § Exploitation courante.

##### Fast-follow frontend — À FAIRE IMMÉDIATEMENT APRÈS

`AuthService.changerMotDePasse()` ignore aujourd'hui la réponse de l'endpoint,
qui porte désormais un couple `access`/`refresh` frais. Tant qu'il n'applique
pas ces tokens, l'onglet qui vient de changer son mot de passe **se déconnecte
lui aussi** à l'expiration de son access (≤ 30 min), au même titre que les
sessions qu'on voulait fermer.

Le backend est correct ; c'est le confort visé qui n'est pas atteint. Petite
session front dédiée, à ne pas repousser — sinon la dette traîne et le
comportement paraîtra être un bug.

#### Autres points non instruits

À examiner dans la revue, sans ordre imposé entre eux :

- pas de limitation de débit sur l'endpoint — un Bureau compromis peut
  réinitialiser en boucle ;
- aucune journalisation côté serveur, seulement une notification in-app au
  destinataire (aucune trace côté Bureau ni côté exploitant) ;
- pas d'obligation de changer le mot de passe temporaire à la première
  connexion.

**Le SMTP du jalon 5 rouvre ce flux de toute façon** (réinitialisation par
email, avec jeton à usage unique). C'est à ce moment-là que l'ensemble doit être
repris proprement — plan, modèle de menace, validation par mutation — et
**non traité comme un acquis** parce qu'un mécanisme existe déjà.

#### Bloc 2 — bannissement à la rotation ✅ FAIT

`BLACKLIST_AFTER_ROTATION` passe à `True` (`2e7bc82`, `324cda0`). Un refresh
intercepté cesse d'être exploitable dès que le titulaire légitime l'a fait
tourner ; auparavant il restait rejouable jusqu'à expiration, 7 jours. Traité
AVANT le SMTP, qui produira des tokens depuis un lien email interceptable.

**Ce durcissement créait une régression, corrigée dans le même bloc.** Le verrou
de refresh du front est porté par l'instance du service, donc par onglet, alors
que `localStorage` est partagé : deux onglets rafraîchissant dans la même
fenêtre (~200 ms) voyaient le second présenter un jeton déjà banni. Comme
`logout()` efface le stockage partagé, les DEUX onglets tombaient.
`AuthService.rattraperCourseEntreOnglets()` distingue « mon jeton a été tourné
par un frère » (une reprise) de « mon jeton est mort » (déconnexion), et trace
chaque occurrence en `console.warn` — à surveiller pendant le pilote.

**Choix de conception acté** : un changement de chorale **n'invalide pas**
l'ancien refresh. `switch-chorale/`, `rejoindre-avec-mon-compte/` et
`mes-invitations/{id}/accepter/` ne reçoivent aucun refresh en entrée — le
serveur ignore lequel le client détient et ne peut donc pas le bannir. C'est
acceptable parce que `chorale_active` revérifie l'appartenance vivante à chaque
requête : ce sont plusieurs sessions légitimes du même compte, pas une session
fantôme survivant à une révocation. Révoquer toutes les sessions à chaque
changement de chorale serait pire — on déconnecterait les autres appareils pour
un simple changement de contexte. Verrouillé par
`test_un_switch_de_chorale_n_invalide_PAS_l_ancien_refresh`.

**Volume** : chaque rotation crée désormais 2 lignes au lieu d'1. Sur un pilote
réaliste, ~160 lignes/jour, ~1 100 sur les 7 jours de rétention. La purge
quotidienne reste suffisante, aucun ajustement. `flushexpiredtokens` nettoie les
deux tables (CASCADE).

### Reste du jalon 5

SMTP (et le reset par email qu'il débloque), sauvegardes testées, CI/CD,
supervision et procédure d'incident. Périmètre à cadrer.

## 7. Décisions arrêtées (ne pas re-proposer)

- **Aucun email au titulaire d'un compte existant** lorsqu'une inscription
  publique est tentée avec son adresse. Le 409 `compte_existant` oriente déjà
  la personne au clavier, qui est celle qui agit ; prévenir le titulaire
  ajouterait un vecteur de nuisance — n'importe qui pourrait faire partir des
  emails vers une adresse en la saisissant en boucle — sans bénéfice de
  sécurité, la divulgation étant déjà bornée par la nécessité de détenir un
  code d'invitation valide pour atteindre ce formulaire.

## 8. Limites et dette connues

- **pas de réinitialisation de mot de passe par email** : la voie actuelle est
  `POST /api/membres/{id}/reinitialiser-mot-de-passe/` (Bureau), qui génère un
  mot de passe temporaire à transmettre de vive voix. Un reset par email
  suppose un SMTP en état de marche — jalon 5. Un compte multi-chorale ou
  superuser est refusé (409) et relève de l'opérateur : le mot de passe ouvre
  le compte entier, donc toutes ses chorales ;
- **pas de sélecteur toutes-chorales pour l'opérateur** : l'API n'expose aucun
  endpoint Chorale, et `switch-chorale` ne peut émettre un token que pour une
  chorale dont le compte est membre — un opérateur n'en a aucune par définition.
  « Gestion des chorales » pointe donc vers l'admin Django, déjà cloisonné côté
  serveur. Ouvrir une vraie consultation inter-tenants serait une décision de
  sécurité (usurpation de tenant), pas un écran de plus ;
- l'admin Django ne propose pas de sélecteur de tenant : un administrateur
  rattaché à plusieurs chorales n'y voit rien (choix assumé — l'admin est un
  outil d'exploitation opérateur, pas un second front métier) ;
- aucune suite E2E navigateur ne rejoue les parcours par rôle ;
- `npm run start:dev` utilise la commande Windows `start /B`, non portable ;
- les dépendances système de WeasyPrint ne sont pas provisionnées
  automatiquement ;
- SMTP, stockage objet des médias, CI/CD, supervision et procédure d'incident
  restent à traiter (jalon 5) ;
- **401 intermittent sur requêtes authentifiées, en suite complète — pas confiné
  à un seul test** — [`chm-backend#1`](https://github.com/hlabsdev/chm-backend/issues/1) :
  `presences/tests/test_pointage.py::test_double_soumission_simultanee_ne_cree_pas_de_doublon`
  (threadé) ET `core/tests/test_api_integration.py::TestFinances::test_generer_puis_payer_cotisation`
  (séquentiel, sans thread) ont chacun montré un `401` inattendu sur une
  requête authentifiée censée réussir — jamais le défaut que le test vérifie
  lui-même. Les deux passent systématiquement en isolation stricte ; le second
  échoue 2 fois sur 3 en invocations répétées rapprochées du même fichier, ce
  qui exclut un problème d'ordre pur (aucun `pytest-randomly` installé, ordre
  déterministe) et pointe vers quelque chose de temporel — possiblement une
  contention entre conteneurs de test consécutifs (chaque run recrée
  `test_choirmanager`), possiblement une fuite de thread `daemon=True` pour le
  premier. Aucune cause confirmée par instrumentation. Préexistant au jalon 3
  pour le premier test (introduit au jalon 2, commit `70dbc80`) ; le second n'a
  pas été vérifié sur une révision antérieure au jalon 3. Non bloquant pour le
  jalon 4, mais à instrumenter avant tout trafic concurrent réel — le symptôme
  touche l'authentification elle-même, pas un mécanisme isolé.

## 9. Discipline Git

### Modèle de branches — une seule ligne de release

Trois branches vivantes, dans les trois dépôts :

| Branche | Rôle |
| --- | --- |
| `main` | ligne de développement **à jour** ; c'est la référence de travail |
| `release/mvp-v1` | **unique** ligne de release ; les tags s'y incrémentent |
| `feat/<sujet>` | branches de fonctionnalité, fusionnées dans `main` puis supprimées |

Il n'existe **qu'une** ligne de release, malgré son nom historique
« mvp-v1 » : tous les jalons successifs y sont portés, et un tag annoté y est
posé à chaque fois (`v1.0.0-mvp.1` → `v1.0.0-mvp.2` → `v1.0.0-mvp.3` →
`v1.1.0-rc.1` → `v1.1.0-rc.2`). Ne pas ouvrir de seconde ligne de release : le
modèle réel n'en a pas besoin, et une ligne supplémentaire non alimentée
finirait par décrire un état qui n'existe nulle part.

À la clôture d'un jalon : `main` et `release/mvp-v1` convergent sur le même
commit, et le tag annoté y est posé. `main` ne doit jamais rester en retard sur
la ligne de release, sous peine de faire mentir la présente description.

**Les tags vivent sur le superprojet uniquement.** Les sous-modules n'en portent
aucun : le commit du superprojet fige déjà leurs pointeurs, donc un tag racine
suffit à reconstituer l'état complet (`git checkout <tag> && git submodule
update --init --recursive`).

### Sous-modules

Le dépôt racine est un **superprojet** ; `chm-backend/` et `chm-frontend/` sont
des sous-modules avec leur propre remote et leur propre historique.

Ordre imposé pour toute modification applicative :

1. commit **et push** dans le sous-module concerné ;
2. retour à la racine, `git add chm-backend` (ou `chm-frontend`) pour enregistrer
   le nouveau pointeur ;
3. commit du superprojet ;
4. tag uniquement sur un jalon stable et reproductible.

Ne jamais committer un fichier applicatif depuis la racine. `git status` à la
racine ne montre que les pointeurs : utiliser `git -C chm-backend status`.

## 10. Après le pilote

Backlog, à prioriser depuis les retours d'usage uniquement : PWA et partitions
hors ligne, calendrier externe, notifications push/SMS, enregistrements
audio/vidéo, module Activités/Planning, application native.

## 11. Règle de mise à jour

À la fin de chaque bloc : exécuter les tests concernés, mettre à jour l'état et
les preuves ici, mettre à jour `CLAUDE.md` et les README affectés, publier les
commits des sous-modules, puis leurs pointeurs, puis taguer si le jalon est
stable.
