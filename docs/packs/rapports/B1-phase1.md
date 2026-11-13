# Rapport B1 — Phase 1 (diagnostic, LECTURE SEULE)

Pack : `docs/packs/messages-quotas.md`, tâche **B1 — Mesure de la consommation, mode observation**.
Protocole de session lu : `CLAUDE.md` (racine). Travail en sous-modules, tests PostgreSQL — non exécutés ici (phase 1 lecture seule).
Statut : **phase 1 terminée, aucune écriture de code/migration. ARRÊT avant phase 2, en attente de validation humaine.**

> ⚠️ **F3 (chemin du dump de production) NON FOURNI.** La question 5 (volume par chorale/mois, jours d'historique) est donc **non exécutable en l'état** : aucune exécution sur dump n'a été faite. Voir §5.

---

## 1. Champs, contraintes et valeurs de statut

### `NotificationSMS` (`chm-backend/notifications/models.py:132-256`) — hérite de `TimeStampedModel`
| Champ | Type | Contraintes / défaut |
|---|---|---|
| `membre` | FK `membres.Membre` | `on_delete=CASCADE`, `related_name=notifications_sms`, **obligatoire** |
| `chorale` | FK `core.Chorale` | `on_delete=SET_NULL`, `null=True, blank=True` — **dénormalisée** (instantané à l'envoi) |
| `telephone` | CharField(32) | numéro NORMALISÉ E164 **sans** `+` (ex. `22898660436`) |
| `telephone_origine` | CharField(32) | `blank=True`, format international d'origine |
| `fournisseur` | CharField(32) | choices `Fournisseur`, défaut `WASSASMS` |
| `gabarit` | CharField(100) | `blank=True` (ex. `planning.creation`) |
| `idempotency_key` | CharField(128) | **`unique=True`, `db_index=True`** |
| `statut` | CharField(20) | choices `Statut`, défaut `EN_ATTENTE`, `db_index=True` |
| `message_id` | CharField(255) | `blank=True` |
| `reponse_api` | CharField(150) | `blank=True` (extrait Success/Failed) |
| `erreur` | TextField | `blank=True`, secrets expurgés |
| `horodatage_envoi` | DateTimeField | `null=True, blank=True` |

- **Statuts SMS** : `en_attente` / `envoye` / `echec`. **Fournisseur** : `wassasms` (seule valeur).
- `Meta.ordering = ["-created_at"]` ; index : `(membre, statut)` et **`(chorale, statut)`**.
- `save()` dénormalise `chorale_id` depuis `membre.chorale_id` si absent, et recopie `telephone` dans `telephone_origine` si vide — **jamais réécrit** (instantané).

### `NotificationWhatsApp` (`chm-backend/notifications/models.py:55-129`) — hérite de `TimeStampedModel`
| Champ | Type | Contraintes / défaut |
|---|---|---|
| `membre` | FK `membres.Membre` | `on_delete=CASCADE`, **obligatoire** |
| `telephone` | CharField(32) | E164 compact figé à l'envoi |
| `gabarit` | CharField(100) | `blank=True` |
| `idempotency_key` | CharField(128) | **`unique=True`, `db_index=True`** |
| `statut` | CharField(20) | choices `Statut`, défaut `EN_ATTENTE`, `db_index=True` |
| `waha_message_id` | CharField(255) | `blank=True` |
| `erreur` | TextField | `blank=True` |
| `horodatage_envoi` | DateTimeField | `null=True, blank=True` |

- **Statuts WhatsApp** : `en_attente` / `envoye` / `echec`.
- `Meta.ordering = ["-created_at"]` ; index : `(membre, statut)`.
- **PAS de FK `chorale`** (choix assumé, docstring l.71-73) : le tenant est lu via `membre__chorale`.

> Une ligne n'est créée **que si l'envoi est réellement tenté** (après les gardes offre/opt-in/numéro, et `SMS_ENABLED`/`WAHA_ENABLED`). Les refus en amont ne produisent aucune ligne — le journal ne contient donc pas tous les « envois voulus », seulement les envois tentés (tous statuts confondus).

## 2. Rattachement chorale, longueur/segments, calcul de taille

- **Rattachement à une chorale :**
  - **SMS : OUI, directement** — FK `chorale` dénormalisée (`SET_NULL`), filtrable/résumable même si le membre change de tenant ou est supprimé. (Peut être `NULL` : si la ligne est ancienne/sans membre résolu, ou membre→chorale supprimée via SET_NULL.)
  - **WhatsApp : INDIRECTEMENT** — pas de FK ; rattachement via `membre__chorale_id`. Conséquence : une ligne historique est attribuée à la chorale **ACTUELLE** du membre (ré-attribution si le membre migre de tenant). À noter pour DB1.
- **Longueur / nombre de segments stockés : NON.** Aucun champ `longueur`, `nb_segments`, `nb_caracteres` ni `cout` sur l'un ou l'autre modèle. Le corps du message n'est même pas conservé (seulement `gabarit`).
- **Calcul de la taille d'un message : INEXISTANT.** Nulle part le code ne compte caractères/segments. Seul fait proche : `sms.py::_poster_sms` tronque le texte à `texte[:480]` (≈ 3 segments GSM-7 de 160) avant l'appel WassaSMS ; WhatsApp n'a aucune borne de taille. **→ Si DB2 = segment, le calcul de segments est à CRÉER en B1 phase 2** (le journal ne le fournit pas ; une unité « message » = 1 ligne `envoye` est disponible immédiatement, une unité « segment » ne l'est pas sans recomposer le texte, qui n'est pas stocké).

## 3. Appelants (exhaustif, hors tests)

### `envoyer_sms(membre, texte, ...)`
| Appelant | Fichier:ligne | Gabarit / contexte |
|---|---|---|
| Rappel d'événement (cron) | `planning/management/commands/rappeler_evenements.py:106` | `planning.rappel`, si `evenement.notifier_sms` |
| Diffusion opérateur (→ responsable) | `diffusion/services.py:532` | `diffusion` |
| Rappel d'échéance d'abonnement (cron) | `abonnements/rappels.py:218` | `abonnement.rappel_echeance` |
| Interne (boucle de groupe) | `notifications/sms.py:342` | appelé par `envoyer_sms_groupe` |

### `envoyer_sms_groupe(membres, texte, ...)`
| Appelant | Fichier:ligne | Gabarit |
|---|---|---|
| SMS immédiat d'un événement créé | `planning/services.py:276` (`notifier_sms_evenement`) | `planning.evenement` |
| SMS 1ʳᵉ occurrence d'une série | `planning/services.py:319` (`notifier_sms_serie`) | `planning.serie` |

### `envoyer_whatsapp(membre, texte, ...)`
| Appelant | Fichier:ligne | Contexte |
|---|---|---|
| Diffusion opérateur | `diffusion/services.py:558` | `diffusion` |
| `notifier(..., par_whatsapp=True)` | `notifications/services.py:348` | canal de `notifier()` ; appelé par : |
| &nbsp;&nbsp;↳ traitement demande d'absence | `presences/views.py:423` | transactionnel |
| &nbsp;&nbsp;↳ rappel d'échéance d'abonnement | `abonnements/rappels.py:203` | si `whatsapp_optin` |

> **Adjacent (non listé dans la question mais même module, à compter pour la mesure) :** `envoyer_sms_chorale(chorale, telephone, ...)` — `notifications/sms.py:242`, appelé par `diffusion/services.py:539` (chorale sans responsable joignable). **Il NE crée PAS de ligne `NotificationSMS`** (pas de `Membre`) : sa trace vit dans `diffusion.DiffusionDestinataire`. **Angle mort de mesure si la source de vérité DB1=(a) est le seul journal `NotificationSMS`.**

## 4. Ce que donnent déjà les tableaux de bord / `/operateur/communications`

### Tableaux de bord opérateur (`core/services_operateur.py`)
- **Effets par chorale** (l.760-850) : pour la période filtrée `[debut, fin)`, agrège **par chorale** : `sms` total + `sms_envoyes`/`sms_echecs`/`sms_en_attente`, idem `whatsapp`. SMS groupé sur `chorale_id` (FK), WhatsApp sur `membre__chorale_id`.
- **Série temporelle** (`serie_temporelle`, l.536) avec **granularité `jour`/`semaine`/`mois`** (`TruncMonth`) : donne l'évolution dans le temps, mais **pas** un croisé chorale × mois simultané.
- Période bornée par `resoudre_periode` (`date_debut`/`date_fin`/`periode=30j`...), plafond `DUREE_MAX_PERIODE_JOURS`.

### Centre `/operateur/communications/<canal>/` (`notifications/views_communications.py`, `communications.py`)
- Un canal par URL (`sms`/`email`/`whatsapp`), lecture seule, permission `EstOperateur`.
- **`resume`** : total / envoyes / echecs / (en_attente pour sms+whatsapp) sur la période filtrée.
- **`stats_par_chorale`** : mêmes compteurs **regroupés par chorale** (SMS via `chorale_id`, WhatsApp via `membre__chorale_id`).
- Filtres : `chorale`, `statut` (multi), `destinataire`, période. Export CSV de la liste complète filtrée (journalisé).

**Conclusion Q4 :** la consommation **par chorale** existe déjà (compteurs de lignes, tous statuts, filtrables par période) ; **par mois**, seulement via la série temporelle agrégée (granularité `mois`) **ou** en re-filtrant période par période. **Aucun croisé natif « chorale × mois »**, aucune notion d'**unité facturable** (ce sont des comptes de **lignes/messages**, jamais de **segments**), aucune comparaison à un **quota**. La séparation des envois `diffusion` (DB7) n'existe pas : les SMS `diffusion` adressés à un membre créent une ligne `NotificationSMS` **comptée dans la chorale** comme les autres (sauf `envoyer_sms_chorale`, hors journal).

## 5. Volume par chorale/mois, jours d'historique — **NON EXÉCUTABLE**

**Le chemin du dump (F3) n'a pas été fourni.** Aucune exécution sur une copie de production n'a été réalisée. Rappel du pack : le journal SMS n'existe que depuis `v2.2.0` (déployée le 12/11/2026), l'historique exploitable est donc très court. Cette question reste **ouverte** et devra être traitée dès que F3 (copie jetable du dump) sera communiqué. Dépendance bloquante pour chiffrer DB4 (valeur de quota) en B2.

## 6. `TarifPlan` porte-t-il `quota_sms`/`quota_whatsapp` ? — **NON : C1 non livrée**

- **Aucun modèle `TarifPlan` n'existe dans le dépôt** : `grep TarifPlan|quota_sms|quota_whatsapp` sur `chm-backend/` → **0 résultat**.
- Le plan d'abonnement actuel est un simple `CharField` `Abonnement.plan` (`abonnements/models.py:68-91`, choices `libre`/`pro`/`pionnier`), **sans aucun champ de quota ni de tarif**.
- `TarifPlan` (+ `quota_sms`/`quota_whatsapp`, « vides tant que B1 n'a pas ») est **spécifié par la tâche C1** du pack `docs/packs/mise-en-marche.md` (l.51, 118-119) mais **pas encore implémenté**.
- **Dépendance confirmée (arrêt propre B1) :** B1 phase 2 écrit son quota par plan/canal **dans `TarifPlan`**. Si C1 n'est pas livrée au moment de B1 phase 2 → **STOP et signaler la dépendance à C1**, exactement comme prévu au pack. État actuel : **C1 non livrée → dépendance active.**

---

## Synthèse des dépendances / questions bloquantes
1. **F3 (dump) manquant** → Q5 non exécutable ; chiffrage DB4 impossible tant qu'il n'est pas fourni.
2. **C1 (`TarifPlan`) non livrée** → B1 phase 2 ne peut pas poser `quota_sms`/`quota_whatsapp` ; STOP prévu.
3. **Unité « segment » non disponible dans le journal** (taille non stockée/non calculée) : si DB2=segment, prévoir un calcul de segments en phase 2 (texte non conservé).
4. **WhatsApp sans FK chorale** : attribution via chorale actuelle du membre (ré-attribution possible) — à acter pour DB1.
5. **`envoyer_sms_chorale` (diffusion sans responsable) hors `NotificationSMS`** : angle mort si la source de vérité DB1=(a) se limite au journal.

**FIN DE PHASE 1 — ARRÊT. Aucune action de phase 2 entamée.**
