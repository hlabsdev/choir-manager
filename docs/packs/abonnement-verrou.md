# Pack de délégation — Verrou fonctionnel et abonnement par chorale

Chemin proposé dans le dépôt : `docs/packs/abonnement-verrou.md` (superprojet).
Lisible par tout agent de code (Claude Code, Codex, autre) : aucune fonction
propre à un outil n'est requise.

## 1. Mode d'emploi

- Trois tâches ordonnées : **A1 → A2 → A3**. Une tâche = une session. Ne jamais
  enchaîner deux tâches dans la même session.
- Chaque tâche commence par une phase 1 en lecture seule qui produit un rapport
  écrit, puis l'agent s'ARRÊTE. L'humain valide en citant le rapport avant la
  phase 2.
- A2 ne démarre qu'après A1 fusionnée et vérifiée. A3 après A2.
- Hors de ce pack : comptage et quotas des messages SMS/WhatsApp (pack B, à
  rédiger après mesure de la consommation réelle par chorale), paiement en
  ligne, facturation.
- Pour un agent autre que Claude Code : le protocole de session du dépôt est
  dans `CLAUDE.md`. Si l'outil lit `AGENTS.md`, créer ce fichier comme lien ou
  renvoi vers `CLAUDE.md` avant de lancer la première session.

## 2. Décisions à arbitrer AVANT dispatch

Aucune tâche ne démarre tant que ce tableau n'est pas rempli. L'agent ne
tranche aucune de ces décisions.

| # | Question | Options | Proposition | Décision |
|---|---|---|---|---|
| D1 | Valeurs de `plan` | (a) `libre`, `pro`, `pionnier` ; (b) `libre`, `pro` + drapeau pionnier | (a) : un seul champ, le pionnier retombe sur `libre` à échéance sauf passage en `pro` par l'opérateur | **VALIDÉ : (a)** |
| D2 | Répartition des fonctionnalités | voir tableau D2 ci-dessous | voir tableau D2 | ____ |
| D3 | Durée du délai de grâce après échéance | 7, 15 ou 30 jours | 15 jours : laisse le temps à un trésorier de payer en mobile money | **VALIDÉ : 15 jours** |
| D4 | Effet de la « lecture seule » | (a) uniquement sur les fonctionnalités payantes, noyau libre intact ; (b) lecture seule globale de la chorale | (a) : on ne prend jamais en otage les données de base | **VALIDÉ : (a)** |
| D5 | Date de fin du statut pionnier des chorales existantes | date | à fixer par l'humain et à communiquer aux chorales AVANT la migration | **DÉCIDÉ : 31 décembre 2026** |

### Tableau D2 — codes de fonctionnalités (provisoires)

Les codes sont à rapprocher des modules réels en phase 1 de A2.

| Fonctionnalité | Proposition | Tranché |
|---|---|---|
| Membres, répétitions et présences, annonces, répertoire (partitions), notifications in-app | libre | **VALIDÉ : libre** |
| Planning : calendrier visuel | libre | **VALIDÉ : libre** |
| Planning : rappels périodiques programmés | payant | **VALIDÉ : payant** |
| SMS | payant | **VALIDÉ : payant** |
| WhatsApp | payant | **VALIDÉ : payant** |
| Audio (MediaChant) | payant | **VALIDÉ : payant** |
| Finances — caisse (mouvements, catégories, état de caisse) et paiements de cotisations | libre | **DÉCIDÉ : libre — la caisse n'est PAS verrouillée** |
| Finances — gestion fine des campagnes de cotisation (création/édition `CampagneCotisation` + `TarifCotisation`) | payant | **DÉCIDÉ : payant** |
| Exports | payant | **VALIDÉ : payant** |

## 2 bis. Décision opérateur (chantier tableaux de bord / mode assisté)

- **Mode assisté tracé CONFIRMÉ** : l'opérateur ouvre un tenant en lecture
  avec des actions de correction explicites, journalisées, à durée limitée.
  Il ne prend JAMAIS un rôle de bureau : aucun mandat, aucun héritage des
  permissions du tenant. Chaque ouverture et chaque écriture est tracée
  dans l'audit avec motif obligatoire.
- La règle du `CLAUDE.md` (« l'opérateur n'a aucun droit métier ») est
  amendée en conséquence, pas contournée : le mode assisté est une surface
  explicite et auditée, pas une extension des mandats.

## 3. Décisions déjà prises (communes aux trois tâches)

- Un abonnement par chorale (relation 1:1 avec le tenant), jamais par
  utilisateur — le produit facture la chorale.
- Les droits se résolvent par tenant actif, revérifié en base à chaque requête.
  Le serveur fait foi, le front n'est jamais une garde.
- Défaut fermé : une fonctionnalité absente du registre est refusée.
- Jamais de suppression de données pour cause d'impayé ; l'export des données
  reste toujours possible.
- `is_superuser` ne donne aucun droit métier. Seul l'opérateur de plateforme
  (superuser sans aucun Membre) change un abonnement.
- Toute erreur que le front doit distinguer porte un code machine, pas une
  forme de corps de réponse.
- Aucun paiement en ligne dans ce pack : l'activation d'un plan est manuelle,
  faite par l'opérateur.

---

# Tâche A1 — Modèle d'abonnement, service de transition, migration pionnier

Lis d'abord le protocole de session du dépôt (`CLAUDE.md`, ou `AGENTS.md` s'il
existe) et les références ci-dessous.

## Contexte
Toutes les fonctionnalités sont aujourd'hui ouvertes à toutes les chorales. Il
n'existe aucun état d'abonnement. Cette tâche pose le modèle et le seul point
d'écriture de l'état, sans encore verrouiller quoi que ce soit.

## Références à lire
- `CLAUDE.md`
- `core/medias.py` (exemple de registre extensible du projet)
- Le service `adherer()` et sa garde structurelle (modèle à imiter pour la
  garde de cette tâche)
- Le point de création de chorale (`provisionner_chorale` ou équivalent)

## Objectif
Chaque chorale possède exactement un `Abonnement`, modifiable uniquement par un
service unique, avec historique des transitions, et toutes les chorales
existantes sont migrées en `pionnier` jusqu'à la date D5.

## Périmètre
- Inclus : modèle `Abonnement` (plan, statut, échéance, note opérateur) ;
  modèle d'historique append-only des transitions (état avant/après, auteur,
  motif, horodatage) ; service unique de changement d'état ; création
  automatique de l'abonnement à la création d'une chorale ; migration de
  données ; commande `manage.py` de transition automatique quotidienne ;
  notification au Bureau à chaque transition automatique via `notifier()`.
- Exclu : verrouillage des fonctionnalités (A2) ; écrans front (A3) ; comptage
  de messages (pack B) ; paiement en ligne et webhooks ; rappels avant
  échéance (J-30, J-7) ; toute modification de la logique de suspension de
  chorale existante au-delà de son articulation décidée en phase 1.

## Décisions déjà prises (non négociables)
- Voir section 3, plus D1, D3 et D5 tranchées dans la section 2.
- Statuts : `actif` → `grace` → `lecture_seule`. Aucun statut de suppression.
- L'écriture de `plan` et `statut` n'existe qu'à un seul endroit : le service.
  — même logique que la garde sur `adherer()`.

## Phase 1 — Diagnostic (lecture seule)
Questions factuelles :
1. Où est défini le modèle de chorale (tenant), et quels sont TOUS les points
   du code qui créent une chorale ?
2. Existe-t-il déjà un statut de chorale (suspendue ou autre) ? Si oui, comment
   s'articule-t-il avec le statut d'abonnement, et que se passe-t-il aujourd'hui
   pour une chorale suspendue ?
3. Où l'opérateur gère-t-il les chorales aujourd'hui (admin Django, endpoint,
   écran front) ?
4. Existe-t-il une infrastructure d'historique ou d'audit réutilisable ?
5. Comment les tâches planifiées sont-elles lancées aujourd'hui (commande
   `manage.py` + cron hôte, autre mécanisme) ?
6. Liste les chorales existantes en base de production avec leur état.
   (Le feuille de route cite RPL, CVN, ECH : confirmer ou corriger.)
Bac à sable d'exécution autorisé : copie jetable du dump de production, dont le
chemin est fourni par l'humain dans le message de lancement ; sinon aucune
exécution.
Livrable : `docs/packs/rapports/A1-phase1.md`
Puis STOP. Attends un message qui cite la validation.

## Phase 2 — Implémentation (après validation)
1. Modèles `Abonnement` (1:1 chorale) et historique des transitions.
2. Service unique de changement d'état, atomique, avec verrou de ligne pour les
   transitions concurrentes.
3. Branchement de la création automatique de l'abonnement sur chaque point de
   création de chorale recensé en phase 1.
4. Migration de données : toutes les chorales existantes en plan `pionnier`,
   échéance = D5. Migration inverse fournie.
5. Commande `manage.py` quotidienne : transitions selon l'échéance et D3,
   idempotente, option `--dry-run`.
6. Garde structurelle : un test échoue si `plan` ou `statut` sont écrits hors
   du service.

## Critères de fin
- [ ] `python manage.py makemigrations --check` ne signale rien.
- [ ] Migration appliquée sur la copie du dump : nombre de chorales = nombre
      d'abonnements, tous en `pionnier` à la date D5 (requête jointe au rapport).
- [ ] Migration inverse exécutée sans erreur sur la copie.
- [ ] Suite complète verte sous PostgreSQL (pas SQLite).
- [ ] Commande de transition lancée deux fois de suite : même état final.
      `--dry-run` n'écrit rien.
- [ ] Mutation de la garde exécutée, test vu rouge, code restauré (log joint).

## Tests exigés
- Création d'une chorale → un abonnement existe — mutation : oui
- Transition invalide (ex. `lecture_seule` → `grace`) refusée — mutation : oui
- Deux transitions concurrentes sur la même chorale, sous PostgreSQL — mutation : oui
- Écriture directe de `statut` hors service détectée — mutation : oui
- Seul l'opérateur de plateforme peut déclencher le service depuis une vue — mutation : oui

## Arrêts propres à cette tâche
- Une chorale existante dans un état ambigu (suspendue, supprimée) : STOP et
  demander la règle.
- Plus d'un point de création de chorale non couvert par le service : STOP et
  lister.
- Toute question sur le montant, la facturation ou le paiement : hors périmètre,
  STOP.

---

# Tâche A2 — Registre de fonctionnalités et verrou côté serveur

Lis d'abord le protocole de session du dépôt (`CLAUDE.md`, ou `AGENTS.md` s'il
existe) et les références ci-dessous.

## Contexte
A1 est livrée : chaque chorale a un plan et un statut. Il faut maintenant que
chaque fonctionnalité payante soit refusée côté serveur pour une chorale non
éligible, y compris quand l'appel vient d'une tâche planifiée et pas d'une
requête HTTP.

## Références à lire
- `docs/packs/rapports/A1-phase1.md` et le code livré en A1
- `core/medias.py` (modèle du registre)
- Le code des envois SMS et WhatsApp, du module planning et de ses rappels
  programmés (chemins à identifier en phase 1)

## Objectif
Aucune fonctionnalité payante de la table D2 n'est utilisable par une chorale
dont le plan ou le statut ne l'autorise pas, par aucune voie d'entrée.

## Périmètre
- Inclus : registre code de fonctionnalité → plan minimal ; fonction de
  résolution des droits d'une chorale ; permission appliquée à chaque point
  d'entrée payant ; endpoint exposant les droits de la chorale active ; prise
  en compte du statut `lecture_seule` selon D4 ; comportement des tâches
  planifiées pour une chorale non éligible.
- Exclu : compteurs et quotas de messages (pack B) ; écrans front (A3) ;
  modification du fonctionnement interne des fonctionnalités ; tarifs.

## Décisions déjà prises (non négociables)
- Voir section 3, plus D2 et D4 tranchées dans la section 2.
- Code machine du refus : `fonctionnalite_non_incluse` (403), distinct de
  `role_insuffisant` et `sans_tenant_actif`.
- Tâche planifiée pour une chorale non éligible : elle saute l'envoi et émet un
  avertissement structuré (chorale, fonctionnalité). Elle ne plante pas et
  n'échoue pas en silence.

## Phase 1 — Diagnostic (lecture seule)
Questions factuelles :
1. Liste exhaustive des points d'entrée de chaque fonctionnalité payante de D2 :
   vues HTTP, tâches planifiées, signaux, appels internes.
2. Les envois SMS et WhatsApp passent-ils par un point unique (par exemple
   `notifier()` / `notifier_groupe()`) ou par plusieurs appelants directs ?
3. Où sont définis les codes machine existants (`sans_tenant_actif`,
   `role_insuffisant`, …) et comment le front les reçoit-il ?
4. Quel endpoint le front utilise-t-il aujourd'hui pour connaître les droits de
   l'utilisateur, et peut-il porter les droits de fonctionnalités ?
5. Rapproche les codes provisoires de D2 des modules réels et propose le
   mapping.
Bac à sable d'exécution autorisé : aucun
Livrable : `docs/packs/rapports/A2-phase1.md`
Puis STOP. Attends un message qui cite la validation.

## Phase 2 — Implémentation (après validation)
1. Registre des fonctionnalités, défaut fermé.
2. Fonction de résolution et permission réutilisable, appliquées à chaque point
   d'entrée recensé.
3. Endpoint des droits de la chorale active.
4. Test structurel qui liste les routes payantes et échoue si l'une n'a pas la
   permission.
5. Adaptation des tâches planifiées.

## Critères de fin
- [ ] Le test structurel passe : aucune route payante recensée sans permission.
- [ ] Mutation (retirer la permission d'une route) : test structurel rouge,
      puis restauré (log joint).
- [ ] Mutation (inverser le défaut du registre) : au moins un test rouge,
      puis restauré (log joint).
- [ ] Suite complète verte sous PostgreSQL.
- [ ] Une tâche planifiée lancée pour une chorale `libre` n'envoie rien et
      journalise l'avertissement (test).

## Tests exigés
- Chorale `libre` → 403 `fonctionnalite_non_incluse` sur chaque fonctionnalité
  payante — mutation : oui
- Chorale `pionnier` et chorale `pro` actives → accès autorisé — mutation : oui
- Chorale en `lecture_seule` : écritures payantes refusées, lectures
  autorisées, noyau libre intact (selon D4) — mutation : oui
- Fonctionnalité absente du registre → refusée — mutation : oui
- Un superuser membre d'une chorale `libre` n'obtient aucun accès payant —
  mutation : oui

## Arrêts propres à cette tâche
- Un point d'entrée payant qui ne peut pas être rattaché à une chorale
  (aucun tenant dans le contexte) : STOP et lister.
- Un envoi de message qui contourne le point d'envoi commun : le signaler en
  phase 1, ne pas le « corriger » en passant.

---

# Tâche A3 — Interface opérateur et affichage côté Bureau

Lis d'abord le protocole de session du dépôt (`CLAUDE.md`, ou `AGENTS.md` s'il
existe) et les références ci-dessous.

## Contexte
Le modèle (A1) et le verrou serveur (A2) existent. Il manque l'écran par lequel
l'opérateur change l'état d'une chorale, et ce que voient le Bureau et les
membres quand une fonctionnalité n'est pas incluse.

## Références à lire
- `docs/packs/rapports/A1-phase1.md` et `A2-phase1.md`
- `chm-frontend/README.md`
- Le composant de bandeau déjà utilisé pour l'état « sans tenant actif »

## Objectif
L'opérateur change le plan et le statut d'une chorale depuis l'interface, le
Bureau voit l'état de son abonnement en lecture seule, et un refus
`fonctionnalite_non_incluse` produit un message clair au lieu d'une erreur
brute.

## Périmètre
- Inclus : endpoint opérateur qui appelle uniquement le service d'A1 ; écran
  opérateur (liste des chorales avec plan, statut, échéance ; action de
  changement avec motif obligatoire) ; écran « Mon abonnement » en lecture seule
  pour le Bureau ; gestion front du code `fonctionnalite_non_incluse` ; cadenas
  sur les entrées de menu des fonctionnalités non incluses.
- Exclu : affichage de prix ou de tarifs ; lien ou bouton de paiement ; édition
  de l'abonnement par le Bureau ; rappels avant échéance ; comptage de
  messages.

## Décisions déjà prises (non négociables)
- Voir section 3.
- Message affiché sur refus : « Fonctionnalité non incluse dans l'abonnement de
  votre chorale », sans montant ni lien de paiement.
- Le cadenas est un confort d'affichage. Le refus réel reste côté serveur.

## Phase 1 — Diagnostic (lecture seule)
Questions factuelles :
1. Où l'opérateur gère-t-il les chorales dans le front aujourd'hui, et existe-t-il
   déjà un écran à étendre plutôt qu'à créer ?
2. Comment le front gère-t-il aujourd'hui les 403 par code machine, et où
   brancher le nouveau code ?
3. Le bandeau « sans tenant actif » est-il réutilisable pour signaler la
   `lecture_seule` ?
4. Comment le front connaît-il l'état de la chorale active (service existant à
   étendre avec les droits d'A2) ?
Bac à sable d'exécution autorisé : aucun
Livrable : `docs/packs/rapports/A3-phase1.md`
Puis STOP. Attends un message qui cite la validation.

## Phase 2 — Implémentation (après validation)
1. Endpoint opérateur de changement d'état, branché sur le service d'A1.
2. Écran opérateur.
3. Écran « Mon abonnement » côté Bureau.
4. Gestion du code `fonctionnalite_non_incluse` et cadenas de menu.
5. Signalement de la `lecture_seule` via le composant de bandeau retenu.

## Critères de fin
- [ ] `ng build` sans erreur ni avertissement nouveau.
- [ ] Suite Vitest verte.
- [ ] Un membre du Bureau qui appelle l'endpoint opérateur reçoit 403
      `role_insuffisant` (test backend).
- [ ] Mutation (appeler le service autrement que par l'endpoint prévu, ou
      retirer la permission opérateur) : test rouge, puis restauré (log joint).
- [ ] Changement d'état sans motif refusé (test).

## Tests exigés
- Seul l'opérateur peut changer un abonnement — mutation : oui
- Chaque changement apparaît dans l'historique avec auteur et motif —
  mutation : oui
- Le front affiche le message sur `fonctionnalite_non_incluse` et ne plante pas
  sur un autre 403 — mutation : non
- Le Bureau ne voit aucun contrôle d'édition de l'abonnement — mutation : non

## Arrêts propres à cette tâche
- Tout besoin d'afficher un montant ou un lien de paiement : STOP, hors
  périmètre.
- Tout besoin de modifier le service d'A1 : STOP et signaler, ne pas modifier
  en passant.
