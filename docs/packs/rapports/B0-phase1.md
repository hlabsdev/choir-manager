# B0 — Phase 1 (diagnostic, lecture seule)

> Tâche : **Suspension de canal ciblée SMS / WhatsApp** (pack `docs/packs/messages-quotas.md`, §127‑273).
> Portée de cette session : **phase 1 uniquement**, aucune écriture de code ni de migration. Ce rapport est le seul livrable. Après remise → STOP, attente d'une validation humaine citant ce rapport.
> Protocole de session respecté (`CLAUDE.md`) : sous‑modules Git, tests PostgreSQL, point d'entrée unique des canaux.

---

## Réponses aux 5 questions factuelles

### Q1 — Structure de `envoyer_sms()` et point d'insertion de `canal_desactive`

Fichier : `chm-backend/notifications/sms.py`, fonction décorée `@_best_effort` (lignes 121‑238).
Ordre **réel** des gardes dans le corps :

| # | Garde | Lignes | Effet |
|---|-------|--------|-------|
| 1 | `autorise(membre.chorale, "sms", ecriture=True)` → `avertir_fonctionnalite_sautee` → `return False` | 139‑141 | **fonctionnalite_non_incluse** (saut journalisé, best‑effort) |
| 2 | `settings.SMS_ENABLED` | 143‑145 | drapeau d'environnement global |
| 3 | `normaliser_telephone(...)` (numéro présent) | 147‑152 | — |
| 4 | `normaliser_numero_sms(...)` (`NumeroSMSInvalide`) | 158‑165 | — |
| 5 | texte non vide | 167‑169 | — |
| 6 | `get_or_create` ligne `NotificationSMS` / idempotence | 171‑201 | — |
| 7 | throttle par chorale | 203‑207 | — |
| 8 | `_poster_sms` (appel HTTP) | 209+ | — |

**Point d'insertion de `canal_desactive`** : juste **avant** le bloc `autorise(...)` (actuellement ligne 139), afin que `canal_desactive` prime sur `fonctionnalite_non_incluse` (critère de fin testé : chorale suspendue ET `libre` → `canal_desactive` d'abord).

⚠️ **Divergence à arbitrer vs §5 du pack.** §5 fixe l'ordre : `SMS_ENABLED` (#1) → `sans_tenant_actif` (#2) → `canal_desactive` (#3) → `fonctionnalite_non_incluse` (#4). Or **dans le code, `autorise` (fonctionnalite) s'exécute AVANT `SMS_ENABLED`** — l'inverse du pack. Et `canal_desactive` **ne doit pas primer sur le drapeau d'environnement** (§5, « pas sur les drapeaux d'environnement globaux »). Insérer naïvement `canal_desactive` juste avant `autorise` le placerait aussi **avant** `SMS_ENABLED`, donc le ferait primer sur le drapeau global — ce que le pack interdit. → **Recommandation phase 2** : réordonner en tête de fonction pour obtenir `SMS_ENABLED` → `canal_desactive` → `autorise`. Il n'existe pas de garde `sans_tenant_actif` dans cette fonction (elle reçoit un `membre`, donc une `membre.chorale` toujours présente — voir note d'architecture plus bas).

### Q2 — Structure de `envoyer_whatsapp()` et point d'insertion

Fichier : `chm-backend/notifications/whatsapp.py`, fonction décorée `@_best_effort` (lignes 205‑357).
Ordre **réel** des gardes :

| # | Garde | Lignes |
|---|-------|--------|
| 1 | `autorise(membre.chorale, "whatsapp", ecriture=True)` → `avertir_fonctionnalite_sautee` → `return False` | 239‑241 (**fonctionnalite_non_incluse**) |
| 2 | `settings.WAHA_ENABLED` | 244‑246 |
| 3 | `membre.whatsapp_optin` (consentement) | 249‑251 |
| 4 | numéro présent | 254‑256 |
| 5 | texte non vide | 258‑260 |
| 6 | idempotence (`idempotency_key`) | 265‑305 |
| 7 | throttle par chorale | 309‑315 |
| 8 | `_poster_waha` (POST) | 317+ |

**Point d'insertion** : juste **avant** le bloc `autorise(...)` (ligne 239), mêmes réserves qu'en Q1 (le drapeau `WAHA_ENABLED` est après `autorise` ; pour respecter « ne prime pas sur le drapeau global » viser `WAHA_ENABLED` → `canal_desactive` → `autorise`). ⚠️ La **docstring** lignes 220‑233 décrit déjà un ordre idéalisé (« 1. canal désactivé ») qui ne correspond PAS au code actuel : à mettre à jour en phase 2.

### Q3 — `notifier()` disponible depuis le service de suspension sans dépendance circulaire ?

**Oui, directement.** §5 impose `suspendre_canal`/`reprendre_canal` dans `chm-backend/notifications/services.py` — **le fichier même où `notifier()` est défini** (ligne 271). Appel local, aucun import, aucun risque de cycle. Pour cibler le Bureau, réutiliser `abonnements/services.py::destinataires_bureau` (lignes 203‑225) — c'est déjà le point unique de résolution du Bureau (transitions auto + rappels). `abonnements/services` importe `notifier` **paresseusement** (dans la fonction, ligne 238), donc son chargement n'importe jamais `notifications` au niveau module → import de `destinataires_bureau` en tête de `notifications/services.py` **acyclique** (chaîne `notifications.services → abonnements.services → {django, .models, .garde}`, pas de retour).

⚠️ **Mais un cycle guette sur la GARDE, pas sur le service.** Le helper de lecture `canal_est_desactive(chorale, canal)` est appelé **depuis `sms.py` et `whatsapp.py`**. Or `notifications/services.py` importe `from .whatsapp import envoyer_whatsapp` en tête (ligne 41). Si `canal_est_desactive` vivait dans `services.py`, alors `whatsapp.py` ferait `from .services import canal_est_desactive` → `services` importe `whatsapp` (encore en cours de chargement) → **ImportError circulaire**. → **Recommandation phase 2** : placer la **lecture** `canal_est_desactive` dans un module léger sans dépendance (modèle/manager, ou `notifications/canal.py`), et l'**écriture** `suspendre_canal`/`reprendre_canal` dans `services.py`. C'est exactement la séparation déjà faite côté abonnements : lecture dans `droits.py`, écriture dans `services.py`.

### Q4 — Résolution floue du nom de chorale réutilisable, ou helper `core/services.py` ?

**Il faut un helper.** `provisionner_chorale` (`core/services.py`, 214‑333) et la commande `provision_chorale` **CRÉENT** une chorale : elles ne résolvent **aucune** chorale existante par nom flou — elles vérifient seulement l'unicité (`nom__iexact`, `prefix__iexact`, lignes 243‑246) avant création. Non réutilisable tel quel pour `manage.py canal --chorale X`.
Le seul motif de résolution d'une chorale **existante** est **dupliqué en ligne** dans `core/management/commands/seed_listes.py:31` : `qs.filter(Q(nom__iexact=cible) | Q(prefix__iexact=cible))` (+ message « Aucune chorale … »). `import_members.py:61` fait un `prefix__iexact` seul. `diffusion/services.py::resoudre_chorales` résout un **groupe** (pluriel), pas une cible unique.
→ **Recommandation phase 2** : créer `core/services.py::resoudre_chorale(identifiant) -> Chorale` (match `nom__iexact | prefix__iexact`, erreur claire si introuvable/ambigu), réutilisable par `manage.py canal` (B0), `manage.py crediter` (B2) et `manage.py gerer_abonnement` (C1, pas encore implémentée). Note : la commande attendue de C1 (`gerer_abonnement`, cf. `mise-en-marche.md` §162‑166) **n'existe pas encore** ; le squelette d'ergonomie à imiter est donc `provision_chorale` (`contexte_audit(source="commande", …)`, `CommandError`), pas `gerer_abonnement`.

### Q5 — Le gestionnaire front de 403 traite‑t‑il déjà un corps structuré ? `{code, canal}` possible ?

**Oui, le corps structuré est déjà le contrat.** Côté backend `core/exceptions.py` : les exceptions sérialisent un `detail` = dict, donc le corps 403 est `{"code": …, "detail": …}` + champs annexes — `FonctionnaliteNonIncluseError` ajoute `fonctionnalite` (lignes 92‑99), `LimitePlanningAtteinteError` ajoute `limite`. Un `CanalDesactiveError(canal="sms")` → `{"code": "canal_desactive", "canal": "sms", "detail": …}` suit ce modèle à l'identique.
Côté front `chm-frontend/src/app/core/auth/erreur-acces.ts` :
- `interpreterErreurAcces(err)` lit `err.error.code` (union `NatureRefus`, lignes 32‑41) ;
- `codeFonctionnalite(err)` lit déjà le **champ structuré annexe** `err.error.fonctionnalite` (lignes 79‑86) → **gabarit exact à cloner** pour `canal`.
- L'intercepteur `auth.interceptor.ts` (79‑111) ne navigue PAS sur `fonctionnalite_non_incluse` (refus commercial, le composant décide) — `canal_desactive` doit suivre la même politique (aucune navigation).
→ **Changements phase 2 (front, B0)** : ajouter `'canal_desactive'` à l'union `NatureRefus` + une branche dans `interpreterErreurAcces` ; ajouter un helper `canalDesactive(err): 'sms'|'whatsapp'|null` calqué sur `codeFonctionnalite` ; pas de navigation dans l'intercepteur. Le message ciblé « L'envoi SMS est désactivé… » relève surtout de B3.

---

## Notes d'architecture à valider avant la phase 2 (impact sur le périmètre)

1. **Deux couches, pas une** pour `fonctionnalite_non_incluse`, à répliquer pour `canal_desactive` :
   - **Couche HTTP (403)** : `abonnements/permissions.py::EnvoiSmsPayant.has_permission` (176‑180) appelle `verifier_requete(request, "sms")` → lève le 403. C'est **là** qu'un Bureau voit `fonctionnalite_non_incluse`.
   - **Couche service (best‑effort)** : `autorise(...)` dans `envoyer_sms`/`envoyer_whatsapp` → `return False` + log de saut, pour couvrir appels internes et tâches planifiées.
   Pour que le critère « refus 403 `{code:canal_desactive}` » soit observable, la garde `canal_desactive` doit être insérée **aux deux couches**, dans le bon ordre à chaque fois (`canal_desactive` AVANT `fonctionnalite`).

2. **⚠️ Tension `@_best_effort` vs `raise RefusEnvoi` (bloquant à trancher).** La phase 2 du pack (§217‑224) propose `if canal_est_desactive(...): raise RefusEnvoi(...)` **à l'intérieur de `envoyer_sms`/`envoyer_whatsapp`**. Or ces fonctions sont décorées `@_best_effort` et **ne lèvent jamais** : le décorateur (sms.py 106‑118, whatsapp.py 180‑202) **avalerait** `RefusEnvoi` et renverrait `False`. Le 403 n'atteindrait jamais la vue. La solution cohérente avec le dépôt : **saut journalisé (return False) au service** + **403 levé à la couche permission** (nouvelle `CanalDesactiveError` via une permission type `EnvoiSmsPayant`), exactement comme `fonctionnalite_non_incluse`. À faire valider.

3. **⚠️ WhatsApp n'a AUCUNE surface d'envoi HTTP Bureau.** `envoyer_whatsapp` n'est déclenché qu'en interne (`presences/views.py` via `notifier(par_whatsapp=True)`, best‑effort) et par `diffusion/services.py` (opérateur, à la charge plateforme). Il n'existe pas de permission HTTP `whatsapp` analogue à `EnvoiSmsPayant`. Le critère de fin « envoi WhatsApp refusé avec 403 `{code:canal_desactive, canal:whatsapp}` » n'a donc pas de chemin HTTP évident côté Bureau → à clarifier (test unitaire sur l'exception/helper, ou surface concernée).

4. **Modèle `SuspensionCanal`** : les modèles de canal (`NotificationSMS`/`NotificationWhatsApp`) héritent de `TimeStampedModel` et portent une FK `chorale` explicite (models.py 55, 132, 164, 287) ; le pack demande un `ChoraleOwnedModel` (dispo `core.models`, déjà importé notifications/models.py:15). Admins notifications déjà en `ChoraleScopedAdminMixin` ; `SuspensionCanalAdmin` sera en revanche **opérateur** → `PlateformeOnlyAdminMixin` (core/admin_scoping.py 60‑86) + actions via `AuditAdminMixin.response_action` (audit/admin_hooks.py 45‑62).

## Dépendances / questions bloquantes pour la phase 2
- **B‑Q1** : valider la **réorganisation d'ordre** en tête de `envoyer_sms`/`envoyer_whatsapp` (`<FLAG>_ENABLED` → `canal_desactive` → `autorise`), le code divergeant aujourd'hui de §5.
- **B‑Q2** : valider le choix **saut best‑effort au service + 403 à la permission** plutôt que `raise RefusEnvoi` dans la fonction `@_best_effort` (cf. note 2).
- **B‑Q3** : préciser la **surface de test du 403 WhatsApp** (note 3).
- **B‑Q4** : confirmer la création du helper **`core/services.py::resoudre_chorale`** (Q4), partagé B0/B2/C1.
- **B‑Q5** : placement de **`canal_est_desactive`** hors de `notifications/services.py` pour éviter le cycle d'import (Q3).

_Aucun fichier applicatif, migration ou test n'a été créé. Fin de phase 1._
