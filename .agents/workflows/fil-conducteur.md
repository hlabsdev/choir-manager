---
description: Source unique de l'état réel, du prochain jalon et de l'ordre de travail de ChoirManager
updated: 2026-07-25
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
| Date du constat | 25 juillet 2026 |
| Stade produit | MVP fonctionnel, multi-chorale backend |
| Dernier jalon livré | Jalon 3 — passage 1:N backend (`v1.1.0-rc.1`) |
| Prochain jalon | Jalon 4 — passage 1:N frontend (`v1.1.0-rc.2`) |
| Base de données | PostgreSQL 17 sous Docker Compose |
| Tests backend | 217 (`pytest -q`) |
| Tests frontend | 32 (Vitest) |
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
| 4 | Passage 1:N — frontend | `v1.1.0-rc.2` | **à engager** |
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

## 5. Jalon 4 — Passage 1:N frontend

### Objectif

Rendre visible et utilisable, côté Angular, ce que le backend expose déjà :
appartenance à plusieurs chorales, changement de chorale, et rôles scopés.

### Ce que le backend fournit déjà

- claim JWT `chorales` : `[{id, nom, prefix, currency}]` — les appartenances
  exploitables ;
- claim `chorales_suspendues` : `[{id, nom}]` — pour expliquer une session sans
  tenant plutôt qu'un écran vide ;
- claim `chorale_id` : le tenant actif ; `membre_id` et `groups` en découlent ;
- `POST /api/auth/switch-chorale/ {chorale_id}` → nouveau couple
  access/refresh ;
- `GET /api/membres/mes-invitations/` + `accepter/` / `refuser/` — accessibles
  **sans tenant actif** ;
- `POST /api/membres/invitations/rejoindre-avec-mon-compte/ {code}`.

### Travaux

- [ ] Sélecteur de chorale dans `main-layout` (lecture du claim `chorales`),
  appel de `switch-chorale`, remplacement des deux tokens, rechargement de
  l'état applicatif.
- [ ] État « session sans tenant » : écran dédié listant les invitations en
  attente et le motif (chorale suspendue via `chorales_suspendues`), au lieu
  d'un dashboard vide inexpliqué.
- [ ] Acceptation / refus d'une invitation nominative.
- [ ] Adhésion à une chorale supplémentaire par code, depuis un compte connecté.
- [ ] **Dette du jalon 2** : basculer les ~25 lectures de `is_superuser` sur
  `is_operateur` (déjà dans `DecodedToken`), dont `AuthService.hasRole()` qui
  renvoie `true` pour tout superuser — un administrateur de tenant voit
  aujourd'hui une UI « god-mode » que le backend refuse déjà.
- [ ] Renommer le claim `groups` en `roles` **des deux côtés à la fois**. Le nom
  a été volontairement conservé au jalon 3 (contenu scopé au tenant actif) pour
  que le front continue de fonctionner sans modification ; le renommer seul
  casserait `hasRole()`.
- [ ] Tests Vitest sur le switch et sur l'état sans tenant.

**Critère de sortie :** une personne membre de deux chorales bascule de l'une à
l'autre dans l'interface, voit des rôles différents dans chacune, et aucune
donnée de l'une n'apparaît dans l'autre.

## 6. Décisions arrêtées (ne pas re-proposer)

- **Aucun email au titulaire d'un compte existant** lorsqu'une inscription
  publique est tentée avec son adresse. Le 409 `compte_existant` oriente déjà
  la personne au clavier, qui est celle qui agit ; prévenir le titulaire
  ajouterait un vecteur de nuisance — n'importe qui pourrait faire partir des
  emails vers une adresse en la saisissant en boucle — sans bénéfice de
  sécurité, la divulgation étant déjà bornée par la nécessité de détenir un
  code d'invitation valide pour atteindre ce formulaire.

## 7. Limites et dette connues

- le frontend lit encore `is_superuser` (cf. jalon 4 ci-dessus) ;
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

## 8. Discipline Git

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

## 9. Après le pilote

Backlog, à prioriser depuis les retours d'usage uniquement : PWA et partitions
hors ligne, calendrier externe, notifications push/SMS, enregistrements
audio/vidéo, module Activités/Planning, application native.

## 10. Règle de mise à jour

À la fin de chaque bloc : exécuter les tests concernés, mettre à jour l'état et
les preuves ici, mettre à jour `CLAUDE.md` et les README affectés, publier les
commits des sous-modules, puis leurs pointeurs, puis taguer si le jalon est
stable.
