# Pack de délégation B — Quotas, crédits et suspension de canal (SMS, WhatsApp)

Chemin proposé dans le dépôt : `docs/packs/messages-quotas.md` (superprojet).
Suite du pack `abonnement-verrou.md` (A1 à A3, livré en `v2.5.0`).
Complément du pack `mise-en-marche.md` (C1 à C3). Lisible par tout agent de
code (Claude Code, Codex, autre) : aucune fonction propre à un outil n'est
requise.

## 1. Mode d'emploi

- Quatre tâches : **B0 → B1 → B2 → B3**. Une tâche = une session.
- **B0 se dispatche immédiatement**, en parallèle de B1 phase 1 et de C1. Elle
  ne requiert ni observation, ni décision DB.
- Chaque tâche commence par une phase 1 en lecture seule qui produit un
  rapport écrit, puis l'agent s'ARRÊTE. L'humain valide en citant le rapport
  avant la phase 2.
- **Délai obligatoire entre B1 phase 2 et B2 phase 2 : trois à quatre
  semaines d'observation en production.** Le journal SMS n'existe que depuis
  `v2.2.0` (déployée le 12/11/2026) : il n'y a aucun historique exploitable
  pour fixer un quota aujourd'hui. B1 ouvre la mesure, B2 n'est cadrée
  qu'avec ses chiffres.
- Hors de ce pack : prix et tarifs (pack C), paiement en ligne, facturation
  des packs de messages, rappels d'échéance.
- Le protocole de session du dépôt est dans `CLAUDE.md`. Si l'outil lit
  `AGENTS.md`, ce fichier doit renvoyer vers `CLAUDE.md`.

## 2. Faits constatés dans le dépôt (à ne pas redécouvrir)

- SMS : `notifications/sms.py::envoyer_sms()` est le seul point d'entrée HTTP
  vers WassaSMS ; `envoyer_sms_groupe()` est plafonné. Le journal est
  `NotificationSMS` (numéro normalisé, fournisseur, statut, message_id).
  `SMS_ENABLED` est faux par défaut, et aucune ligne n'est écrite quand le
  canal est désactivé.
- WhatsApp : `notifications/whatsapp.py::envoyer_whatsapp()` est le seul code
  qui parle à **WAHA**, une passerelle sur un numéro appairé par QR, et non
  l'API officielle de Meta. Pas de tarif par message : le risque est le
  bannissement du numéro. Le canal est transactionnel, sur consentement
  (`Membre.whatsapp_optin`), et `notifier_groupe()` ne l'expose pas.
- Limites existantes : throttles par minute et par chorale (`SMS_MAX_PER_MINUTE`,
  `WAHA_MAX_PER_MINUTE`). Ce sont des garde-fous de débit, pas des quotas.
- **Il n'existe aujourd'hui AUCUNE suspension par canal** : SMS et WhatsApp ne
  peuvent être désactivés ni globalement (hors `SMS_ENABLED`/`WAHA_ENABLED`
  d'environnement) ni par chorale. B0 ajoute cette couche, **au-dessus** du
  verrou de fonctionnalités (A2) et du quota (B2).
- Précédent de quota métier : `limite_planning_atteinte` (séries récurrentes
  en plan `libre`). Le refus de quota de messages suit ce modèle.
- Les envois de l'opérateur (app `diffusion`) passent par les mêmes canaux
  mais sont à la charge de la plateforme.
- Le verrou de fonctionnalités (A2) vérifie `fonctionnalite_non_incluse`
  APRÈS `canal_desactive` (B0) et AVANT `quota_messages_epuise` (B2). L'ordre
  complet est fixé en §5.

## 3. Faits à fournir par l'humain avant dispatch de B1

| # | Fait | Valeur |
|---|---|---|
| F1 | WassaSMS facture-t-il par message ou par segment (160 caractères en GSM-7, moins avec certains accents) ? Coût unitaire exact | ____ |
| F2 | `SMS_ENABLED` est-il actif en production, et depuis quelle date ? | ____ |
| F3 | Chemin de la copie jetable du dump de production pour la phase 1 | ____ |

B0 ne requiert aucun de ces faits.

## 4. Décisions à arbitrer

Aucune tâche ne tranche à la place de l'humain. B0 n'attend **aucune**
décision DB (le motif de suspension est un texte libre, l'opérateur décide).
B1 n'a besoin que de DB1 à DB3 et DB7.

| # | Question | Options | Proposition | Décision |
|---|---|---|---|---|
| DB1 | Source de vérité de la consommation | (a) compter les lignes du journal existant sous verrou de l'abonnement ; (b) compteur dédié débité atomiquement | (a) si la phase 1 confirme que le journal est complet et rattaché au tenant | ____ |
| DB2 | Unité de comptage | message ou segment | segment si F1 dit que le fournisseur facture au segment | ____ |
| DB3 | Période du quota | (a) mois calendaire ; (b) mois glissant depuis la date d'abonnement ; (c) enveloppe sur la période d'abonnement | (a) : simple à expliquer, indépendant de la périodicité de paiement | ____ |
| DB4 | Valeur du quota SMS du plan Pro | nombre par période | à fixer APRÈS l'observation : couvrir la consommation de 90 % des chorales observées. Le plan `pionnier` reçoit le même quota que `pro` | ____ |
| DB5 | Envoi groupé supérieur au solde | (a) refuser tout le lot et prévenir le Bureau ; (b) envoyer jusqu'au solde | (a) : un envoi partiel est imprévisible pour le Bureau | ____ |
| DB6 | Seuils d'alerte au Bureau | pourcentages | 80 % et 100 %, une fois par période et par seuil | ____ |
| DB7 | Envois de l'opérateur (`diffusion`) | comptés dans le quota chorale, ou compteur plateforme séparé | compteur séparé, hors quota chorale | ____ |
| DB8 | WhatsApp | quota commercial, ou seulement plafond de sécurité anti-bannissement | plafond quotidien par chorale (valeur à fixer), mesure sans quota commercial | ____ |
| DB9 | Validité des crédits additionnels | expirent à la période / n'expirent pas tant que l'abonnement est actif | n'expirent pas, suspendus en `lecture_seule` | ____ |

## 5. Décisions déjà prises (communes aux quatre tâches)

- Le quota se vérifie côté serveur, dans `envoyer_sms()` (et
  `envoyer_whatsapp()` pour son plafond), jamais dans une vue ni dans le front.
- **Ordre d'évaluation des gardes dans `envoyer_sms()` et `envoyer_whatsapp()`**,
  et aucune autre combinaison n'est admise :
  1. `SMS_ENABLED` / `WAHA_ENABLED` (drapeau d'environnement global, existant) ;
  2. `sans_tenant_actif` (A1) ;
  3. **`canal_desactive` (B0)** — override opérateur explicite, priorité
     absolue sur les règles suivantes ;
  4. `fonctionnalite_non_incluse` (A2) ;
  5. `quota_messages_epuise` (B2) ;
  6. présence du numéro, idempotence, throttle (existants) ;
  7. appel HTTP.
  **B0 doit être inséré AVANT `fonctionnalite_non_incluse`** et **B2 APRÈS**
  `fonctionnalite_non_incluse`. Quand B2 sera livrée, elle ne doit pas
  réordonner ces gardes.
- Refus de quota : code machine `quota_messages_epuise` (403), distinct de
  `fonctionnalite_non_incluse`, `canal_desactive`, `role_insuffisant` et
  `sans_tenant_actif`.
- Refus de canal suspendu : code machine `canal_desactive` (403), avec un
  champ `canal` (`sms` / `whatsapp`) dans le corps pour que le front puisse
  afficher un message ciblé.
- Une tâche planifiée qui dépasse le quota saute l'envoi, journalise et
  prévient le Bureau. Elle ne plante pas et n'échoue pas en silence. Même
  comportement pour une tâche planifiée dont le canal est suspendu.
- Un crédit ne s'ajoute que par un service unique, réservé à l'opérateur, avec
  motif obligatoire et événement d'audit, comme le changement d'état
  d'abonnement (A1) et la suspension de canal (B0). Le fichier
  `abonnements/services.py` porte **à la fois** `changer_etat` (A1) **et**
  `octroyer_credit` (B2). Le fichier `notifications/services.py` porte
  **à la fois** `envoyer_sms`/`envoyer_whatsapp` **et** `suspendre_canal`/
  `reprendre_canal` (B0). Pas de duplication de pattern.
- `QUOTA_MODE` (`observation` par défaut, `enforcement`) est une exception
  assumée et limitée au défaut fermé : elle protège les chorales pilotes
  pendant la mesure. Une valeur inconnue empêche le démarrage (même logique
  que `chm_config/env.py::resoudre_waha`). Le passage à `enforcement` est un
  acte humain daté, jamais un effet d'une tâche.
- Aucun prix, aucun lien de paiement, aucun achat en ligne dans ce pack.
- La suspension de canal (B0) n'a **aucun front opérateur**. Elle est pilotée
  exclusivement par `manage.py canal` et par des actions Django admin sur
  `SuspensionCanalAdmin`. Le front Bureau n'expose qu'un message de refus
  quand un envoi est tenté ; aucune surface d'écriture.

---

# Tâche B0 — Suspension de canal ciblée (SMS / WhatsApp)

Lis d'abord le protocole de session du dépôt (`CLAUDE.md`, ou `AGENTS.md` s'il
existe) et les références ci-dessous.

## Contexte
Un opérateur doit pouvoir désactiver, **indépendamment**, l'envoi SMS et/ou
WhatsApp d'une chorale précise, pour un motif quelconque (incident WAHA,
abus, demande de la chorale, impayé spécifique aux messages). Aujourd'hui
seuls des drapeaux globaux existent (`SMS_ENABLED`, `WAHA_ENABLED`) : les
couper coupe la plateforme entière. Aucune surface opérateur front n'est
créée : la commande `manage.py` et l'admin Django suffisent.

## Références à lire
- `CLAUDE.md` (sections Notifications, WhatsApp, Journal d'audit)
- `notifications/sms.py`, `notifications/whatsapp.py`, `notifications/services.py`
- `notifications/models.py` (`NotificationSMS`, `NotificationWhatsApp`)
- `abonnements/services.py` (modèle du service unique avec motif + audit)
- `core/services.py::provisionner_chorale` (modèle de commande `manage.py`
  avec résolution floue du nom de chorale, `--dry-run`, `contexte_audit()`)
- `core/admin.py` (`PlateformeOnlyAdminMixin`, `AuditAdminMixin.response_action`)
- `docs/packs/mise-en-marche.md` (C1, pour le pattern `manage.py
  gerer_abonnement` : même ergonomie, même motif obligatoire)

## Objectif
SMS et WhatsApp peuvent être suspendus et repris, indépendamment, pour une
chorale donnée, avec motif obligatoire, trace d'audit, et sans aucun front
opérateur Angular. La garde est insérée dans `envoyer_sms()` et
`envoyer_whatsapp()` **avant** `fonctionnalite_non_incluse`.

## Périmètre
- Inclus : modèle `SuspensionCanal` (append-only, une suspension active max
  par couple (chorale, canal)) ; service `suspendre_canal` / `reprendre_canal`
  avec motif obligatoire, audit, notification best-effort au Bureau ;
  insertion de la garde `canal_desactive` dans `envoyer_sms()` et
  `envoyer_whatsapp()` ; `manage.py canal` (subflags `--suspendre`,
  `--reprendre`, `--etat`, `--chorale`, `--canal`, `--motif`) ;
  `SuspensionCanalAdmin` (lecture seule + actions via `response_action`,
  motif obligatoire) ; ajout du code `canal_desactive` au gestionnaire front
  de 403 (message ciblé avec le canal).
- Exclu : tout écran Angular opérateur dédié ; toute API d'écriture publique ;
  toute modification du comportement global `SMS_ENABLED`/`WAHA_ENABLED` ;
  toute prolongation programmée (la suspension est binaire, jusqu'à reprise
  manuelle).

## Décisions déjà prises (non négociables)
- Voir §5.
- La suspension prime sur `fonctionnalite_non_incluse` et sur
  `quota_messages_epuise`, mais **pas** sur `sans_tenant_actif` ni sur les
  drapeaux d'environnement globaux.
- La suspension n'est jamais demandée par le Bureau : elle est posée par
  l'opérateur seul, jamais par la chorale.
- `SuspensionCanal` est un `ChoraleOwnedModel` : il hérite du cloisonnement
  tenant et apparaît dans la corbeille de plateforme si nécessaire
  (suppression logique non requise ici — la reprise passe par `fin=now`,
  pas par un DELETE).
- Le service `suspendre_canal`/`reprendre_canal` est le **seul** point
  d'écriture. Un test structurel échoue si un autre chemin écrit dans
  `SuspensionCanal`.
- Aucun `SMS_ENABLED`/`WAHA_ENABLED` global n'est modifié par cette tâche.

## Phase 1 — Diagnostic (lecture seule)
Questions factuelles :
1. Structure exacte de `envoyer_sms()` : ordre des gardes actuelles, où
   insérer `canal_desactive` (après `sans_tenant_actif`, avant
   `fonctionnalite_non_incluse`).
2. Idem pour `envoyer_whatsapp()`.
3. `notifier()` (in-app + e-mail) est-il disponible depuis le service de
   suspension sans créer de dépendance circulaire ? Confirmer le chemin
   d'appel.
4. La résolution floue du nom de chorale dans `provision_chorale` est-elle
   réutilisable telle quelle, ou faut-il un helper `core/services.py` ?
5. Le gestionnaire front de 403 (`fonctionnalite_non_incluse`) traite-t-il
   déjà un champ structuré dans le corps ? Le code `canal_desactive` peut-il
   porter `{code: "canal_desactive", canal: "sms"}` ?
Livrable : `docs/packs/rapports/B0-phase1.md`
Puis STOP. Attends un message qui cite la validation.

## Phase 2 — Implémentation (après validation)
1. Modèle `SuspensionCanal` (chorale, canal, debut, fin, motif), avec
   contrainte d'unicité partielle `WHERE fin IS NULL` sur (chorale, canal).
2. Service unique `suspendre_canal(chorale, canal, motif, acteur=None)` :
   valide canal et motif non vides, crée la ligne, journalise via
   `journaliser()`, notifie best-effort le Bureau via `notifier()`
   (in-app + e-mail). Idempotent : si une suspension active existe déjà,
   retourne sans erreur.
3. Service unique `reprendre_canal(chorale, canal, motif, acteur=None)` :
   clôt la ligne active, journalise, notifie. Idempotent : si aucune
   suspension active, retourne sans erreur.
4. `canal_est_desactive(chorale, canal) -> bool` : lit la suspension active.
5. Insertion de la garde dans `envoyer_sms()` et `envoyer_whatsapp()` :
   ```
   if canal_est_desactive(chorale, "sms"):
       raise RefusEnvoi(code="canal_desactive", canal="sms")
   ```
   L'exception est convertie en 403 `{code: "canal_desactive", canal: "sms"}`
   dans la vue HTTP. Dans une tâche planifiée, elle est interceptée,
   journalisée (avertissement structuré) et l'envoi est sauté.
6. `manage.py canal` :
   ```
   manage.py canal --chorale X --canal sms --etat
   manage.py canal --chorale X --canal sms --suspendre --motif "..."
   manage.py canal --chorale X --canal sms --reprendre --motif "..."
   ```
7. `SuspensionCanalAdmin` scopé opérateur, en lecture seule, plus deux
   actions « Suspendre SMS » / « Suspendre WhatsApp » avec formulaire
   intermédiaire `response_action` (motif obligatoire), appelant le service.
8. Ajout du code `canal_desactive` au gestionnaire front de 403 (message
   ciblé « L'envoi SMS est désactivé pour votre chorale, contactez
   l'opérateur », idem WhatsApp).

## Critères de fin
- [ ] `python manage.py makemigrations --check` ne signale rien.
- [ ] Suite complète verte sous PostgreSQL.
- [ ] Un envoi SMS à une chorale suspendue est refusé avec 403
      `{code: "canal_desactive", canal: "sms"}` (test).
- [ ] Un envoi WhatsApp à une chorale suspendue est refusé avec 403
      `{code: "canal_desactive", canal: "whatsapp"}` (test).
- [ ] Suspendre SMS ne suspend pas WhatsApp (test d'indépendance).
- [ ] L'ordre des gardes est respecté : une chorale suspendue ET `libre` voit
      `canal_desactive` en premier, pas `fonctionnalite_non_incluse` (test).
- [ ] Sans motif, la commande et l'action admin refusent (test).
- [ ] Mutation (retirer la garde dans `envoyer_sms`) : test rouge, puis
      restauré (log joint).
- [ ] Mutation (retirer le motif obligatoire dans le service) : test rouge,
      puis restauré (log joint).
- [ ] Test structurel : `SuspensionCanal` n'est écrit que par
      `suspendre_canal`/`reprendre_canal` (mutation : ajouter une écriture
      sauvage → test rouge, puis restauré, log joint).

## Tests exigés
- Refus SMS sur chorale suspendue — mutation : oui
- Refus WhatsApp sur chorale suspendue — mutation : oui
- Indépendance des deux canaux — mutation : oui
- Priorité de `canal_desactive` sur `fonctionnalite_non_incluse` — mutation : oui
- Priorité de `sans_tenant_actif` sur `canal_desactive` — mutation : non
- Motif obligatoire — mutation : oui
- Service unique (garde structurelle) — mutation : oui
- Tâche planifiée saute l'envoi et journalise — mutation : oui
- Notification best-effort au Bureau — mutation : non

## Arrêts propres à cette tâche
- Une voie d'envoi qui contourne `envoyer_sms()` ou `envoyer_whatsapp()` :
  STOP et lister.
- Un besoin d'écran Angular opérateur : STOP, hors périmètre.
- Un besoin de suspendre pour une durée programmée : STOP, hors périmètre v1.
- Toute question de prix ou de montant : STOP.

---

# Tâche B1 — Mesure de la consommation, en mode observation

*(Inchangée par rapport à la version précédente du pack. Le lecteur se
reporte au corps d'origine, sections 1 à 5 et aux critères de fin. Seule la
garde d'ordre en §5 a changé : B1 doit respecter l'insertion de
`canal_desactive` avant `fonctionnalite_non_incluse`.)*

## Contexte
Les canaux SMS et WhatsApp sont ouverts sans plafond commercial. Aucune donnée
ne dit combien chaque chorale consomme. Cette tâche rend la consommation
mesurable et visible sans rien bloquer.

## Références à lire
- `CLAUDE.md` (sections Notifications, WhatsApp, Planning, SMS)
- `notifications/sms.py`, `notifications/whatsapp.py`, `notifications/services.py`
- Les modèles `NotificationSMS` et `NotificationWhatsApp`
- L'app `abonnements` (service unique et registre de fonctionnalités)
- L'app `diffusion`
- Le centre `/operateur/communications` et les tableaux de bord opérateur

## Objectif
Pour chaque chorale, chaque canal et chaque période, la consommation est
calculable, comparée à un quota virtuel, et visible de l'opérateur, sans
qu'aucun envoi ne soit bloqué.

## Périmètre
- Inclus : service de calcul de consommation ; quota par plan et par canal
  dans `TarifPlan` (livré par C1) ; `QUOTA_MODE` avec son résolveur ;
  événement d'audit unique par chorale et par période quand le quota virtuel
  est dépassé ; séparation des envois `diffusion` ; commande de lecture
  `manage.py rapport_consommation_messages`.
- Exclu : blocage d'envoi (B2) ; crédits (B2) ; alertes au Bureau (B2) ;
  écrans front (B3) ; plafond WhatsApp (B2) ; suspension de canal (B0) ;
  toute modification du fonctionnement des canaux.

## Décisions déjà prises (non négociables)
- Voir §5, plus DB1, DB2, DB3 et DB7 tranchées en §4.
- La mesure ne modifie aucun résultat d'envoi : en mode observation, le
  comportement des canaux est strictement identique à aujourd'hui.
- Le quota par plan et par canal vit dans `TarifPlan` (C1), pas dans une
  configuration séparée. Si C1 n'est pas livrée au moment de B1 phase 2,
  STOP et signaler.

## Phase 1 — Diagnostic (lecture seule)
1. Champs exacts, contraintes et valeurs de statut de `NotificationSMS` et
   `NotificationWhatsApp`.
2. Chaque ligne est-elle rattachée à une chorale ? Longueur ou segments
   stockés ? Comment la taille d'un message est-elle calculée ?
3. Liste exhaustive des appelants de `envoyer_sms()`, `envoyer_sms_groupe()`
   et `envoyer_whatsapp()`.
4. Que donnent déjà les tableaux de bord opérateur et
   `/operateur/communications` comme consommation par chorale et par mois ?
5. Sur la copie du dump : volume par chorale et par mois, jours d'historique.
6. `TarifPlan` de C1 porte-t-il bien `quota_sms` et `quota_whatsapp` ?
   Confirmer avant d'y écrire.
Bac à sable d'exécution autorisé : copie jetable du dump (chemin F3).
Livrable : `docs/packs/rapports/B1-phase1.md`
Puis STOP. Attends un message qui cite la validation.

## Phase 2 — Implémentation (après validation)
1. Service de calcul de la consommation par chorale, canal et période.
2. `TarifPlan.quota_sms` / `quota_whatsapp` et `QUOTA_MODE` avec résolveur
   de démarrage.
3. Détection du dépassement virtuel : un événement d'audit par chorale et par
   période, sans effet sur l'envoi.
4. Séparation des envois `diffusion` selon DB7.
5. `manage.py rapport_consommation_messages --periode AAAA-MM [--csv]`.
6. Affichage de la consommation et du quota virtuel dans le tableau de bord
   opérateur existant.

## Critères de fin (inchangés, plus)
- [ ] Le code `canal_desactive` reste prioritaire sur `quota_messages_epuise`
      (non testé en B1 puisque le quota n'est pas encore actif, mais vérifié
      à la lecture du code).

## Tests exigés (inchangés)

## Arrêts propres à cette tâche (inchangés, plus)
- Un `TarifPlan` sans champ `quota_sms`/`quota_whatsapp` : STOP et signaler
  la dépendance à C1.

---

# Tâche B2 — Quota, crédits, blocage et alertes

*(Inchangée par rapport à la version précédente, à trois ajouts près.)*

À NE DISPATCHER QU'APRÈS trois à quatre semaines d'observation en production
et le rapport de consommation de B1. DB4, DB5, DB6, DB8 et DB9 doivent être
tranchées.

## Contexte
B1 mesure. Il faut maintenant que le quota soit réellement appliqué, qu'un
opérateur puisse créditer une chorale, et que le Bureau soit prévenu avant le
blocage.

## Références à lire
- `docs/packs/rapports/B1-phase1.md` et le code livré en B1
- Le rapport de consommation observé
- `notifications/sms.py`, `notifications/whatsapp.py`
- Le service d'A1 et le service de B0 (pattern à imiter)
- `limite_planning_atteinte` dans le module planning

## Objectif
Un envoi qui dépasserait le quota d'une chorale est refusé côté serveur de
façon atomique, y compris sous concurrence, et le Bureau en est prévenu.

## Périmètre
- Inclus : réservation atomique avant l'appel au fournisseur ; refus
  `quota_messages_epuise` ; modèle append-only de crédits et service unique
  d'octroi (`abonnements/services.py::octroyer_credit`) ; `manage.py crediter`
  (même ergonomie que `manage.py gerer_abonnement` de C1) ; alertes au Bureau
  aux seuils DB6 ; comportement d'envoi groupé selon DB5 ; plafond quotidien
  WhatsApp selon DB8 ; documentation de la bascule `QUOTA_MODE=enforcement`.
- Exclu : activation de `enforcement` en production (acte humain séparé) ;
  écrans (B3) ; paiement et facturation des packs ; modification des tarifs
  (C1) ; modification de la suspension de canal (B0).

## Décisions déjà prises (non négociables)
- Voir §5 et les décisions DB4 à DB9.
- Ordre d'évaluation : `sans_tenant_actif` → **`canal_desactive` (B0)** →
  `fonctionnalite_non_incluse` (A2) → `quota_messages_epuise` (B2). **Ne pas
  réordonner : B0 prime sur B2.**
- Un envoi échoué définitivement ne consomme pas de quota. Une même clé
  d'idempotence ne consomme qu'une fois.
- Le service `octroyer_credit` vit dans `abonnements/services.py`, à côté de
  `changer_etat`. La garde structurelle d'A1 couvre les deux.
- `manage.py crediter` suit l'ergonomie de `manage.py gerer_abonnement` (C1) :
  ```
  manage.py crediter --chorale X --canal sms --nombre N --motif "..."
  manage.py crediter --chorale X --canal sms --etat
  ```
- Aucun front opérateur dédié : commande `manage.py` et action Django admin
  suffisent.

## Phase 1 — Diagnostic (lecture seule)
*(Inchangée, plus Q6 sur `manage.py crediter`.)*

Q6. La commande `manage.py gerer_abonnement` (C1) est-elle réutilisable comme
squelette pour `manage.py crediter` (résolution de chorale, motif,
`--dry-run`, audit) ? Confirmer.

## Phase 2 — Implémentation (après validation)
1. Réservation atomique avec verrou de ligne sur l'abonnement de la chorale.
2. Refus `quota_messages_epuise` dans les voies HTTP ; saut journalisé dans
   les tâches planifiées. **La garde reste APRÈS `canal_desactive`.**
3. Modèle de crédits append-only et service `octroyer_credit` (opérateur
   seul, motif obligatoire, audit), avec garde structurelle.
4. `manage.py crediter` (même ergonomie que `gerer_abonnement`).
5. Alertes aux seuils DB6, idempotentes par chorale, période et seuil.
6. Envoi groupé selon DB5.
7. Plafond quotidien WhatsApp selon DB8.
8. `QUOTA_MODE=enforcement` documenté dans `docs/DEPLOIEMENT.md`, non activé.

## Critères de fin (inchangés, plus)
- [ ] `canal_desactive` reste prioritaire sur `quota_messages_epuise` (test).
- [ ] `manage.py crediter` sans motif refuse (test).
- [ ] `manage.py crediter` en `--dry-run` n'écrit rien (test).

## Tests exigés (inchangés, plus)
- Priorité `canal_desactive` > `quota_messages_epuise` — mutation : oui
- `manage.py crediter` motif obligatoire — mutation : oui

## Arrêts propres à cette tâche (inchangés, plus)
- Toute tentative de réordonner les gardes pour mettre `quota_messages_epuise`
  avant `canal_desactive` : STOP.

---

# Tâche B3 — Consommation côté Bureau et crédit côté opérateur

*(Inchangée, à deux ajouts près.)*

## Contexte
Le quota existe côté serveur (B2). Le Bureau doit voir où il en est avant
d'être bloqué, l'opérateur doit pouvoir créditer une chorale sans shell, et
le Bureau doit être averti lorsqu'un canal est suspendu.

## Références à lire
- `docs/packs/rapports/B2-phase1.md` et le code livré en B2
- `docs/packs/mise-en-marche.md` (C2, pour la structure de `/mon-abonnement`)
- `chm-frontend/README.md`
- La gestion front de `fonctionnalite_non_incluse` et de `canal_desactive`
  (B0)

## Objectif
Le Bureau voit sa consommation et son quota dans « Mon abonnement », un refus
`quota_messages_epuise` produit un message clair, un refus `canal_desactive`
affiche le canal concerné, et l'opérateur crédite une chorale depuis
l'interface (action admin, pas d'écran Angular).

## Périmètre
- Inclus : endpoint de lecture de la consommation pour le Bureau ; bloc de
  consommation dans « Mon abonnement » ; affichage « canal SMS suspendu » /
  « canal WhatsApp suspendu » si applicable (lecture seule, pas d'édition) ;
  gestion front des codes `quota_messages_epuise` et `canal_desactive` ;
  action opérateur de crédit via `SuspensionCanalAdmin`-style
  `response_action` (motif obligatoire).
- Exclu : prix, achat, paiement ; édition du quota ou de la suspension par le
  Bureau ; historique détaillé message par message.

## Décisions déjà prises (non négociables)
- Voir §5.
- Message sur refus quota : « Le quota de messages de votre chorale est atteint
  pour cette période », sans montant ni lien de paiement.
- Message sur refus canal : « L'envoi SMS est désactivé pour votre chorale.
  Contactez l'opérateur. » (idem WhatsApp.)
- Le Bureau ne voit que ses propres chiffres et jamais ceux d'une autre
  chorale.
- Aucun front opérateur Angular : l'action de crédit vit dans l'admin Django
  (`response_action`, motif obligatoire).

## Phase 1 — Diagnostic (lecture seule)
1. Où s'affiche l'état de l'abonnement côté Bureau, et comment y ajouter le
   bloc consommation sans casser l'en-tête uniformisé (C2 v1 l'a posé) ?
2. Comment le front traite aujourd'hui les 403 par code machine, et où
   brancher `quota_messages_epuise` et `canal_desactive` ?
3. L'action admin de crédit peut-elle porter motif obligatoire via
   `response_action` (déjà utilisé par `AuditAdminMixin`) ? Confirmer.
4. Les écrans de création d'événement et de série (`notifier_sms`) peuvent-ils
   afficher le solde restant et l'état de suspension avant l'envoi ?
Livrable : `docs/packs/rapports/B3-phase1.md`
Puis STOP. Attends un message qui cite la validation.

## Phase 2 — Implémentation (après validation)
1. Endpoint de lecture de la consommation de la chorale active (utilisé /
   quota par canal, plus l'état des suspensions).
2. Bloc de consommation dans « Mon abonnement » (réutilise l'en-tête C2 v1).
3. Gestion de `quota_messages_epuise` et de `canal_desactive`.
4. Action admin d'octroi de crédit, motif obligatoire.

## Critères de fin
- [ ] `ng build` sans erreur ni avertissement nouveau.
- [ ] Suite Vitest verte.
- [ ] Un Bureau qui lit la consommation d'une autre chorale reçoit un refus
      (test backend).
- [ ] Un Bureau qui appelle l'action de crédit reçoit 403 `role_insuffisant`
      (test backend).
- [ ] Mutation (retirer le filtre par chorale de l'endpoint de lecture) : test
      rouge, puis restauré (log joint).

## Tests exigés
- Isolation de la lecture entre chorales — mutation : oui
- Seul l'opérateur peut créditer — mutation : oui
- Front affiche `quota_messages_epuise` et `canal_desactive` sans planter sur
  un autre 403 — mutation : non
- Bloc affiche utilisé/quota par canal et l'état des suspensions, sans édition
  — mutation : non

## Arrêts propres à cette tâche
- Tout besoin d'afficher un prix ou un lien de paiement : STOP.
- Tout besoin de modifier le service de crédits de B2 ou de suspension de B0 :
  STOP et signaler.
