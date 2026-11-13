# C1 — Phase 1 : Diagnostic (lecture seule)

> Tâche C1 « Socle tarifs et outillage opérateur unifié » (`docs/packs/mise-en-marche.md`).
> Rapport **en lecture seule**. Aucune écriture de code, aucune migration. Phase 2 **non entamée** —
> en attente d'une validation humaine explicite citant ce rapport.

Fichiers inspectés : `abonnements/{services,models,admin,views,urls,registre,constants}.py`,
`abonnements/management/commands/rappeler_echeances_abonnement.py`,
`core/services.py::provisionner_chorale`, `core/management/commands/{provision_chorale,seed_listes,export_chorale}.py`,
`core/medias.py`, `audit/admin_hooks.py`, `core/admin_scoping.py`, `core/views.py`,
`core/tests/test_garde_permissions.py`.

---

## 1. `abonnements/services.py::changer_etat` — signature et comportement

**Signature réelle** (`services.py:107-118`) :

```python
@transaction.atomic
def changer_etat(
    abonnement, *,
    plan=None, statut=None,
    date_echeance=INCHANGE, note_operateur=INCHANGE,
    auteur=None, motif="",
    source=TransitionAbonnement.Source.MANUEL,
) -> Abonnement
```

- **Premier argument positionnel = `abonnement` (l'instance), PAS `chorale`.**
  ⚠️ La table de coordination §3 du pack écrit `changer_etat(chorale, plan, echeance, motif, acteur)` :
  c'est **inexact**. La commande `gerer_abonnement` devra d'abord résoudre la chorale → son
  `Abonnement` (OneToOne `chorale.abonnement`) avant d'appeler le service. À signaler au pack B
  (B2 appellera le même service pour l'octroi de crédits).
- **Échéance** : gérée via `date_echeance`, avec une **sentinelle `INCHANGE`** (`services.py:59`)
  qui distingue « ne pas toucher » de « mettre à `None` explicitement ».
- **Motif** : paramètre `motif=""`, recopié tel quel dans `TransitionAbonnement.motif` lorsqu'une
  ligne d'historique est créée.
- **Auteur** : paramètre `auteur=None`, stocké dans `TransitionAbonnement.auteur` (`SET_NULL`, nul =
  transition automatique).
- Comportement : `@transaction.atomic` + `select_for_update()` (sérialise cron/opérateur) ;
  validation de la transition par `transition_autorisee()` (`TransitionInvalide` sinon) ;
  **no-op idempotent** si aucun changement effectif (ni écriture, ni historique, ni notification) ;
  l'historique `TransitionAbonnement` n'est écrit que si `{plan, statut, date_echeance}` changent ;
  notification Bureau **uniquement** sur `source=AUTOMATIQUE`. → La commande C1 passera
  `source=MANUEL` et devra notifier le Bureau elle-même (cf. §Phase 2 du pack, `notifier()`).

> ⚠️ **Point à trancher (dépendance C1).** Le service **ne vérifie PAS** que `motif` est fourni —
> il accepte `motif=""` sans lever. L'obligation de motif vit aujourd'hui **hors service** :
> `AbonnementChangeForm.clean` (admin, `admin.py:71-75`) et `ChangementEtatAbonnementSerializer`
> (DRF). Or le critère de fin C1 « Mutation : retirer la vérification `motif` **dans le service** →
> test rouge » **suppose une vérification de motif au niveau du service**, qui n'existe pas encore.
> Décision Phase 2 : ajouter la garde de motif dans `changer_etat` (impacte admin/DRF/commande d'un
> coup) **ou** la laisser côté commande/action admin. À confirmer avant de coder.

---

## 2. Scoping de `AbonnementAdmin` + disponibilité de `response_action` (`AuditAdminMixin`)

- `AbonnementAdmin` (`admin.py:80`) hérite de **`PlateformeOnlyAdminMixin`** (pas de
  `ChoraleScopedAdminMixin`) : l'écran est **réservé à l'opérateur de plateforme** et masqué à
  tout administrateur de tenant, même superuser. C'est le bon scoping pour un objet de plateforme
  (il n'y a pas de scoping par chorale ici : l'opérateur voit tous les abonnements).
- `has_add_permission → False`, `has_delete_permission → False`. La seule écriture passe par
  `save_model()` qui appelle `changer_etat(..., auteur=request.user, source=MANUEL)` — jamais
  `obj.save()`.
- **`response_action` est déjà disponible sur `AbonnementAdmin`.** `core/admin_scoping.py:60` :
  `class PlateformeOnlyAdminMixin(AuditAdminMixin)`, et `admin_hooks.py` confirme que **les deux
  mixins d'admin du projet héritent de `AuditAdminMixin`**, qui surcharge `response_action`
  (`admin_hooks.py:45-62`) pour journaliser les actions groupées (`queryset.update()` n'émet aucun
  signal). Les actions admin « Activer Pro » / « Repasser en Standard » de C1 sont donc **déjà
  branchées sur l'audit de synthèse** ; `response_action` est le point d'accroche naturel pour
  capturer un motif (c'est le seul endroit qui voit à la fois l'action demandée ET le queryset,
  comme le pattern P3b).

---

## 3. `provision_chorale` résout-il le nom de chorale de façon floue ? Réutilisable ?

- **Non.** `core/services.py::provisionner_chorale` (`:215`) **crée** une chorale ; il ne résout
  **aucune** chorale existante. Il vérifie seulement l'unicité à la création
  (`nom__iexact`, `prefix__iexact`, `:243-246`). ⚠️ La référence du pack
  (« modèle de commande avec résolution floue du nom de chorale ») est **inexacte** sur ce point.
- **Le résolveur réutilisable d'une chorale existante** est dans
  `core/management/commands/seed_listes.py:28-34` :
  `Chorale.objects.filter(Q(nom__iexact=cible) | Q(prefix__iexact=cible))` + message d'erreur
  « Aucune chorale « … » ». Même idée dans `membres/.../import_members.py:61` (`prefix__iexact`).
  C'est une résolution **insensible à la casse, exacte sur nom OU préfixe** — pas une recherche par
  sous-chaîne (« floue » au sens large). `gerer_abonnement --chorale X` peut copier exactement ce
  motif (idéalement extrait en helper partagé). ⚠️ `seed_listes` **itère** sur tous les résultats ;
  pour un changement d'état sur **une** chorale, la commande devra **rejeter l'ambiguïté** (>1 match).
- **Ce qui EST réutilisable de la commande `provision_chorale`** : l'enveloppe d'audit
  `with contexte_audit(source="commande", acteur_libelle="...")` (`provision_chorale.py:67`,
  `seed_listes.py:38`). `gerer_abonnement` devra la reprendre pour tracer hors requête HTTP, plus
  `--dry-run` et `journaliser()` sur le modèle de `export_chorale.py` / `rappeler_echeances_abonnement`.

---

## 4. `/api/abonnements/droits/` protégé par `EstMembreDuTenant` ? `/tarifs/` en `AllowAny` ?

- **Oui.** `DroitsChoraleView.permission_classes = [EstMembreDuTenant]` (`views.py:48`). Une
  session sans tenant (exclue, suspendue, opérateur) reçoit `SansTenantActifError` (`views.py:56-57`) :
  l'opérateur de plateforme n'a pas de chorale dont décrire les droits.
- **Le nouvel endpoint `GET /api/abonnements/tarifs/` doit être `AllowAny` — CONFIRMÉ.** Justifié
  par : pack §80 (« page publique `/abonnement` publique, aucun guard »), §127/§161 (« endpoint
  public », « `AllowAny`, lecture seule »), §5 (tarifs lus en base, lecture anonyme). Précédent
  interne : `core/views.py` monte déjà plusieurs vues publiques en `AllowAny` (`:31,117,202` —
  suggestions / demande-chorale). Lecture seule, exposant au moins `plan`, `periodicite`,
  `montant`, `devise`.
- ⚠️ **Dépendance à prévoir en Phase 2** : la garde `core/tests/test_garde_permissions.py` échoue
  pour toute vue réduite à `AllowAny`/`IsAuthenticated` **hors liste d'exceptions**. La nouvelle vue
  `/tarifs/` publique devra être **ajoutée à cette allowlist**, sinon la suite passe au rouge.

---

## 5. Où ajouter `TarifPlan` : `models.py` vs module séparé ? (proposition, sans trancher)

Deux emplacements possibles, présentés **sans décision** :

**Option A — `abonnements/models.py`** (aux côtés de `Abonnement`/`TransitionAbonnement`).
- Pour : la table de coordination §3 du pack **nomme littéralement** `abonnements/models.py::TarifPlan`,
  et B1 (pack messages) prévoit d'y ajouter `quota_sms` / `quota_whatsapp` — contrat de fichier
  explicite. Découverte automatique par migrations/admin, zéro import à câbler.
- Contre : `models.py` est déjà dense et porte la **machine à états gardée** (`garde.py`,
  `AbonnementQuerySet`) ; `TarifPlan` est un **catalogue de paramètres** sans rapport avec cette garde.

**Option B — module séparé `abonnements/parametres.py`** (catalogue de tarifs isolé).
- Pour : sépare le catalogue tarifaire du modèle d'état verrouillé ; s'aligne sur l'esprit
  « registre extensible » de `core/medias.py` et sur la séparation `abonnements/registre.py` (A2).
- Contre : Django doit **importer** le modèle pour que migrations/admin le voient (import dans
  `models.py` ou `apps.ready`) ; et le pack §3 pointe explicitement `models.py::TarifPlan`, donc
  B1 chercherait son modèle ailleurs que prévu.

> **Observation (non tranchante)** : le **contrat de coordination §3 + B1** penche pour l'Option A ;
> la **propreté de séparation** (garde d'état ≠ catalogue) penche pour l'Option B. À arbitrer par
> l'humain. Rappels de contrainte C1 : `plan` ∈ `{pro}` seul (libre/pionnier gratuits, sans ligne) ;
> unicité partielle `WHERE actif=True` sur `(plan, periodicite, devise)`.

---

## Dépendances / questions bloquantes pour la Phase 2

1. **Vérification de `motif` dans le service** : aujourd'hui absente de `changer_etat` (vit dans
   l'admin form + serializer). Le critère de fin C1 suppose une garde de motif *au niveau du
   service* → décider où l'ajouter avant de coder (cf. §1).
2. **Allowlist de `test_garde_permissions.py`** : la vue publique `/tarifs/` devra y être inscrite
   (cf. §4).
3. **Emplacement de `TarifPlan`** (A vs B, §5) — à trancher par l'humain ; impacte directement B1
   (champs quota).
4. **Signature `changer_etat`** : documenter à B2 que le 1er argument est `abonnement`, pas
   `chorale` (cf. §1), la table §3 du pack est à corriger.

**STOP.** Phase 2 non entamée. En attente d'une validation humaine citant ce rapport.
