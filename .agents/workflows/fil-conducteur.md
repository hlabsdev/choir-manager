---
description: Source unique de l'état réel, du prochain jalon et de l'ordre de travail de ChoirManager
updated: 2026-07-24
---

# ChoirManager — Fil conducteur global

Ce fichier est l'unique workflow actif du superprojet. Il remplace les audits,
checklists et plans historiques qui décrivaient des états désormais dépassés.

Il doit être mis à jour à chaque changement de jalon, après vérification du code
et des tests. Un élément n'est marqué terminé que si son comportement est
implémenté, vérifié et documenté.

## 1. Référence actuelle

| Élément | Valeur |
| --- | --- |
| Date du constat | 24 juillet 2026 |
| Stade produit | MVP fonctionnel en développement |
| Prochain jalon | Préproduction sécurisée et pilote utilisateur |
| Version de référence | `v1.0.0-mvp.1` |
| Branche de référence | `release/mvp-v1` |
| Commit superprojet du jalon | `30295e3` |
| Backend du jalon | `77869d6` |
| Frontend du jalon | `9abe5ad` |
| Runbook du prochain bloc | `docs/PLAN_DEPLOIEMENT_DOCKER_POSTGRES_WSL.md` |

### Ordre de fiabilité des informations

En cas de contradiction, appliquer cet ordre :

1. comportement du code et résultats des tests exécutés ;
2. migrations, configuration et routes réellement présentes ;
3. README du backend et README du frontend ;
4. README global et présent fil conducteur ;
5. anciens documents de conception et échanges historiques.

`CLAUDE.md` reste utile pour les conventions d'architecture, mais certaines de
ses indications opérationnelles datent d'une phase antérieure — notamment
l'absence supposée de tests et l'ancien guard des finances. Le code actuel et
les README des sous-projets priment sur ces passages.

## 2. Verdict produit

Le **MVP fonctionnel est terminé** : les principaux parcours métier existent
dans l'API et l'interface. Le projet est adapté à la démonstration, au
développement et à une recette encadrée.

Le projet **n'est pas prêt pour la production**. Le prochain travail ne consiste
pas à ajouter immédiatement de nouveaux modules métier, mais à sécuriser,
industrialiser et valider l'exploitation réelle. La migration PostgreSQL et la
préparation Docker sont désormais incluses dans la stabilisation du MVP actuel ;
elles ne constituent pas encore une nouvelle version fonctionnelle.

## 3. État fonctionnel vérifié

| Domaine | Backend | Frontend | État |
| --- | :---: | :---: | --- |
| Authentification, refresh et changement de mot de passe | Oui | Oui | Terminé pour le MVP |
| Isolation multi-tenant et suspension d'une chorale | Oui | Oui | Terminé pour le MVP |
| Membres, fiches, filtres et soft-delete | Oui | Oui | Terminé pour le MVP |
| Pupitres, postes, mandats et organigramme | Oui | Oui | Terminé pour le MVP |
| Demande de chorale et modération opérateur | Oui | Oui | Terminé pour le MVP |
| Invitation et inscription d'un choriste | Oui | Oui | Terminé pour le MVP |
| Répétitions, pointage et permissions d'absence | Oui | Oui | Terminé pour le MVP |
| Chants, thèmes, partitions et séances travaillées | Oui | Oui | Terminé pour le MVP |
| Journal, tarifs, campagnes, cotisations et paiements | Oui | Oui | Terminé pour le MVP |
| Annonces et pièces jointes | Oui | Oui | Terminé pour le MVP |
| Notifications in-app et emails ciblés | Oui | Oui | Terminé pour le MVP |
| Rapports financier, présences, effectifs et répertoire | Oui | Oui | Terminé pour le MVP |
| Exports CSV et PDF | Oui | Oui | Terminé, dépendances PDF à installer |
| Dashboard et navigation adaptés aux rôles | Oui | Oui | Terminé pour le MVP |

### Validation exécutée le 24 juillet 2026

- backend : 129 tests validés ;
- frontend : 32 tests Vitest validés dans 7 fichiers ;
- les deux sous-modules étaient propres et synchronisés avec leurs branches
  `origin/main` au moment du jalon ;
- le superprojet fige les sous-modules avec des pointeurs Git de type `160000`.

Lors de la vérification backend sous Codex, 127 tests ont réussi dans la suite
globale et 2 fixtures utilisant `tmp_path` ont d'abord été bloquées par les
permissions du répertoire temporaire système. Ces deux tests ont ensuite été
relancés avec un `--basetemp` autorisé et ont réussi. Il s'agit donc d'une
contrainte de l'environnement d'exécution, pas d'une régression applicative.

## 4. Architecture à préserver

Ces règles ne sont pas négociables lors des prochaines étapes :

- `Chorale` reste la racine du tenant ; aucune donnée métier ne doit échapper au
  filtrage serveur ;
- tout nouveau ViewSet métier doit appliquer `ChoraleFilterMixin` et, lorsque
  pertinent, `SoftDeleteMixin` ;
- tout nouveau modèle appartenant à une chorale hérite normalement de
  `SoftDeleteModel` ;
- les permissions proviennent des mandats et postes ; ne jamais modifier
  directement les groupes d'un utilisateur ;
- la logique métier reste dans `services.py` ou `signals.py` ;
- les contrôles frontend complètent les permissions API mais ne les remplacent
  jamais ;
- les URLs API restent centralisées dans les environnements Angular ;
- le frontend reste standalone, zoneless, fondé sur les Signals et mobile-first ;
- tout écran asynchrone traite chargement, vide, erreur et nouvelle tentative ;
- code en anglais ; interface, logs et commentaires métier en français.

## 5. Limites et risques actuels

### Bloquants avant toute donnée réelle

- SQLite est la base active et `db.sqlite3` est suivi dans le dépôt backend ;
- les valeurs par défaut sont `DEBUG=True`, `ALLOWED_HOSTS=*`, CORS ouvert et
  clé secrète de développement ;
- le frontend porte `production: true` tout en construisant encore une URL API
  locale en HTTP sur le port 8000 ;
- les médias sont stockés localement, sans stockage objet ni stratégie de
  persistance ;
- aucune cible de déploiement, image Docker, CI/CD ou procédure de rollback
  n'est définie ;
- SMTP n'est pas configuré pour un environnement réel ;
- aucune stratégie formalisée de sauvegarde, restauration, logs, métriques ou
  alertes n'est fournie.

### Qualité et dette non bloquante

- les 32 tests frontend sont utiles mais beaucoup moins étendus que les 129
  tests backend ;
- aucune suite E2E complète ne rejoue les parcours par rôle dans un navigateur ;
- `chm-backend/membres/models - Copie.py` est un doublon historique à examiner
  puis retirer s'il n'est référencé nulle part ;
- `npm run start:dev` utilise la commande Windows `start /B` et n'est pas
  portable telle quelle ;
- les dépendances système de WeasyPrint ne sont pas provisionnées
  automatiquement ;
- certaines indications de `CLAUDE.md` doivent être réalignées avec l'état
  actuel lors de la prochaine passe de documentation technique.

## 6. Jalon actif — Préproduction sécurisée

### Objectif

Déployer un environnement de préproduction reproductible, sans données réelles,
capable de supporter une recette complète par profils et une répétition de
restauration.

Les instructions d'exécution détaillées, la liste des fichiers à créer, les
commandes WSL, la stratégie `DATABASE_URL`, la matrice multi-tenant et les
critères de validation sont définis dans
`docs/PLAN_DEPLOIEMENT_DOCKER_POSTGRES_WSL.md`. Ce fil conducteur conserve le
pilotage ; le runbook conserve la procédure technique.

### Phase A — Décisions d'exploitation

- [x] Utiliser WSL 2 comme environnement de travail Docker.
- [x] Conserver le clone dans le système de fichiers Linux de WSL.
- [x] Choisir PostgreSQL comme base de référence du MVP.
- [x] Conserver une base et un schéma partagés, isolés par `chorale_id`.
- [ ] Choisir la cible d'hébergement, le domaine et la région.
- [ ] Choisir PostgreSQL managé ou auto-hébergé pour la production.
- [ ] Choisir le stockage persistant des médias et des partitions.
- [ ] Choisir le fournisseur SMTP et l'adresse d'expédition.
- [ ] Définir les environnements `local`, `staging` et `production`.
- [ ] Documenter responsables, accès et politique de secrets.

**Critère de sortie :** une décision écrite existe pour chaque composant et
aucun secret n'est conservé dans Git.

### Phase B — Configuration production-safe

- [ ] Exécuter le plan `docs/PLAN_DEPLOIEMENT_DOCKER_POSTGRES_WSL.md` sur des
  branches de fonctionnalité, jamais directement sur la branche de release.
- [ ] Ajouter une configuration PostgreSQL par variables d'environnement.
- [ ] Séparer clairement les réglages Django de développement et de production.
- [ ] Exiger une vraie `DJANGO_SECRET_KEY` hors développement.
- [ ] Forcer `DEBUG=False`, des `ALLOWED_HOSTS` explicites et un CORS restreint.
- [ ] Créer un exemple d'environnement sans secret.
- [ ] Créer des environnements Angular distincts avec URL API HTTPS.
- [ ] Définir la gestion des fichiers statiques et médias persistants.
- [ ] Configurer SMTP et vérifier les scénarios email existants.
- [ ] Retirer toute base contenant des données réelles du suivi Git ; décider si
  la base SQLite de démonstration reste ou devient un seed reproductible.

**Critère de sortie :** l'application démarre avec une configuration de
préproduction sans valeur de développement implicite.

### Phase C — Déploiement reproductible

- [ ] Ajouter les artefacts de déploiement adaptés à la cible choisie.
- [ ] Ajouter un serveur applicatif Django de production.
- [ ] Automatiser migrations, collecte des statiques et démarrage.
- [ ] Provisionner les dépendances GTK/Pango/Cairo de WeasyPrint.
- [ ] Ajouter ou valider un endpoint de santé exploitable.
- [ ] Documenter le déploiement initial, la mise à jour et le rollback.

**Critère de sortie :** un environnement vierge peut être déployé à partir du
code et de variables documentées, sans manipulation cachée.

### Phase D — Intégration continue

- [ ] Backend : dépendances, migrations, `manage.py check` et 129 tests.
- [ ] Frontend : installation verrouillée, 32 tests et build Angular.
- [ ] Superprojet : vérifier l'accessibilité des deux commits de sous-modules.
- [ ] Bloquer la fusion si une vérification obligatoire échoue.
- [ ] Produire des artefacts ou images versionnés pour la préproduction.

**Critère de sortie :** chaque pull request rejoue automatiquement les
vérifications essentielles.

### Phase E — Recette bout-en-bout

- [ ] Tester la création et l'approbation d'une chorale.
- [ ] Tester l'invitation et l'inscription d'un choriste.
- [ ] Rejouer les parcours Bureau, Trésorier, Maître de chœur et Membre.
- [ ] Vérifier les refus d'accès et l'absence de fuite inter-chorales.
- [ ] Tester le pointage sur téléphone et en cas d'erreur réseau.
- [ ] Tester annonces, notifications in-app et emails.
- [ ] Tester exports CSV et PDF avec les dépendances réelles.
- [ ] Ajouter un socle E2E automatisé pour les parcours critiques.
- [ ] Faire une recette du guide utilisateur avec une personne non technique.

**Critère de sortie :** aucun défaut bloquant ou fuite de données ; les défauts
restants sont consignés, priorisés et acceptés.

### Phase F — Exploitation et pilote

- [ ] Définir et tester sauvegarde et restauration de PostgreSQL.
- [ ] Définir sauvegarde et restauration des médias.
- [ ] Centraliser les logs sans données sensibles.
- [ ] Ajouter métriques, alertes et suivi des erreurs.
- [ ] Écrire une procédure d'incident et de rotation des secrets.
- [ ] Créer des données de préproduction non sensibles.
- [ ] Former un petit groupe pilote à partir du guide utilisateur.
- [ ] Collecter les retours et mesurer les parcours réellement utilisés.

**Critère de sortie du jalon :** préproduction stable, restauration démontrée,
recette validée et feu vert explicite pour un pilote contrôlé.

## 7. Ordre de travail immédiat

Le prochain bloc à engager est la **Phase A**, puis la **Phase B**. Aucun choix
de conteneur, base, stockage ou fournisseur ne doit être codé avant d'avoir
arrêté la cible d'hébergement et les contraintes de coût.

Ordre recommandé :

1. décisions d'exploitation ;
2. PostgreSQL, secrets, CORS, HTTPS et environnements frontend ;
3. médias, SMTP et WeasyPrint ;
4. déploiement reproductible ;
5. CI ;
6. recette E2E et sécurité multi-tenant ;
7. sauvegarde/restauration, supervision et pilote.

### Stratégie Git de ce bloc

- backend : `feat/mvp-postgres-docker` ;
- frontend : `feat/mvp-docker-runtime` ;
- superprojet : `feat/mvp-postgres-docker`.

Les commits des sous-modules doivent être publiés avant le commit qui met à jour
leurs pointeurs dans le superprojet. Une fois la combinaison validée, elle est
fusionnée dans les trois branches `main`, puis la branche
`release/mvp-v1` avance sur ce commit stable.

Le tag `v1.0.0-mvp.1` reste immuable. Le tag recommandé pour la combinaison
PostgreSQL/Docker validée est `v1.0.0-mvp.2`.

## 8. Après le pilote

Les fonctionnalités suivantes restent dans le backlog et ne doivent être
priorisées qu'à partir des retours d'usage :

1. PWA et consultation hors ligne des partitions ;
2. calendrier externe ;
3. notifications push ou SMS ;
4. enregistrements audio/vidéo ;
5. module Activités/Planning ;
6. application native.

Le prochain jalon produit sera nommé seulement après le pilote. Une nouvelle
fonctionnalité ne passe devant la préparation production que si une décision
produit explicite documente sa valeur et son urgence.

## 9. Règle de mise à jour

À la fin de chaque bloc :

1. exécuter les tests concernés ;
2. mettre à jour l'état et les preuves dans ce fichier ;
3. mettre à jour les README affectés ;
4. publier d'abord les commits des sous-modules ;
5. mettre à jour leurs pointeurs dans le superprojet ;
6. créer un nouveau tag uniquement pour un jalon stable et reproductible.
