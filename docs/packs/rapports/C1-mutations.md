# C1 — Journal des mutations (rouge → vert)

Date : **2026-11-13** (Africa/Lome).
Périmètre : worktree `chm-wt-c1`, sous-module `chm-backend`, branche
`feat/c1-tarifs-backend`. Le code de production livré n'a **pas** changé :
chaque mutation a été appliquée, observée ROUGE, puis retirée
(`git checkout --`) et observée VERTE.

Environnement de test (depuis `chm-wt-c1/chm-backend`) :

```bash
export DATABASE_URL="postgres://chm:chm@127.0.0.1:5433/chm_c1"
export REDIS_URL="redis://127.0.0.1:6380/0"
export DJANGO_SECRET_KEY="dev-only-not-a-real-secret-key-for-local-tests-0123456789"
export DJANGO_DEBUG="True"
export DJANGO_ALLOWED_HOSTS="localhost,127.0.0.1,testserver"
PY=/home/hermann/work/ventures/chm/choir-manager/chm-backend/venv/bin/python
```

Référence avant mutations :
- superprojet HEAD `95e1f6a3fbf12e312b85ffb76984478a003b1771`
- backend HEAD `9b1c6e5dcb28cb0286c3eac66f488eb429e0d88c`
- `abonnements/services.py` sha256 `9a80e9109cabeb91ed3cd0c451193a50e579af59e099d3efbda60f1db91a20ae`
- `abonnements/management/commands/gerer_abonnement.py` sha256 `1932e5ddae384adda4660bb2364383f37fbaf18786279afbebc142671de57956`

---

## Mutation 1 — retirer la vérification du MOTIF dans le service

**Cible** : `abonnements/services.py:136-139`, dans
`changer_etat()` (garde ajoutée au commit `422ccd5`).

**Modification temporaire** : la condition de garde est neutralisée par un
court-circuit `if False and …`, ce qui laisse passer une transition
`source=MANUEL` sans motif. Aucune autre ligne n'est touchée.

```diff
-    if source == TransitionAbonnement.Source.MANUEL and not str(motif or "").strip():
+    # MUTATION TEMPORAIRE (C1) : garde neutralisée pour vérifier le rouge.
+    if False and source == TransitionAbonnement.Source.MANUEL and not str(motif or "").strip():
         raise ValueError(
             "Un motif est obligatoire pour une transition manuelle (source=manuel)."
         )
```

**Commande ROUGE** :

```bash
$PY -m pytest abonnements/tests/test_service.py -q
```

**Extrait ROUGE** :

```
................FF..                                                     [100%]
_________ test_transition_manuelle_sans_motif_refusee_sans_historique __________

>       with pytest.raises(ValueError, match="motif est obligatoire"):
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
E       Failed: DID NOT RAISE ValueError

abonnements/tests/test_service.py:295: Failed
_________ test_transition_manuelle_motif_fait_d_espaces_refusee _____________

>       with pytest.raises(ValueError, match="motif est obligatoire"):
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
E       Failed: DID NOT RAISE ValueError

abonnements/tests/test_service.py:307: Failed
======================= short test summary info ========================
FAILED abonnements/tests/test_service.py::test_transition_manuelle_sans_motif_refusee_sans_historique
FAILED abonnements/tests/test_service.py::test_transition_manuelle_motif_fait_d_espaces_refusee
2 failed, 18 passed in 7.47s
```

Les deux échecs sont les deux tests de garde de motif (motif vide, motif
blanc). Le test automatique sans motif reste vert, ce qui confirme que la
mutation ne porte que sur les transitions manuelles.

**Note — non pertinent pour la commande** : sous cette même mutation,
`abonnements/tests/test_commande_gerer_abonnement.py` et
`abonnements/tests/test_admin_actions.py` restent verts (27 passed). C'est
attendu : la commande et les actions d'admin valident le motif **dans leur
propre couche de saisie** avant d'appeler le service. La garde de service est
la ceinture de sécurité des points d'entrée restants (API, script), et c'est
`test_service.py` qui la verrouille.

**Restauration** :

```bash
git checkout -- abonnements/services.py
sha256sum abonnements/services.py
# 9a80e9109cabeb91ed3cd0c451193a50e579af59e099d3efbda60f1db91a20ae  abonnements/services.py
```

**Commande VERTE** (identique) :

```bash
$PY -m pytest abonnements/tests/test_service.py -q
```

**Extrait VERT** :

```
....................                                                     [100%]
20 passed in 5.22s
```

Statut : **ROUGE (2 failed, 18 passed) → VERT (20 passed)**.
Code restauré : sha256 identique à l'état initial, `git diff` vide.

---

## Mutation 2 — retirer la GARDE STRUCTURELLE d'A1

**Cible** : `abonnements/tests/test_garde_structurelle.py`
(`test_aucune_ecriture_de_plan_ou_statut_hors_du_service`). La garde lit
l'AST de tous les modules de production (hors `tests/` et `migrations/`) et
refuse toute affectation de `plan`/`statut`, tout `update()`/`bulk_update()`
et toute création directe d'`Abonnement` hors `abonnements/services.py`.

La garde fonctionnant par **introspection AST**, l'écriture sauvage est placée
dans un module de **production** — pas dans un test.

**Modification temporaire** : ajout d'une fonction dans
`abonnements/management/commands/gerer_abonnement.py` (commandes = code de
production), juste après le logger du module :

```diff
+def _mutation_c1_ecriture_sauvage(abonnement):
+    """MUTATION TEMPORAIRE (C1) — écriture directe de plan, hors service."""
+    abonnement.plan = Abonnement.Plan.PRO
+    abonnement.save(update_fields=["plan", "updated_at"])
```

L'affectation fautive est ligne 74 du fichier ainsi modifié.

**Commande ROUGE** :

```bash
$PY -m pytest abonnements/tests/test_garde_structurelle.py -q
```

**Extrait ROUGE** :

```
>       assert not fautifs, (
            "Écriture de plan/statut hors de abonnements.services :\n  "
            + "\n  ".join(fautifs)
            + "\nUtiliser changer_etat() / creer_abonnement(), seuls points "
              "d'écriture de l'abonnement."
        )
E       AssertionError: Écriture de plan/statut hors de abonnements.services :
E           abonnements/management/commands/gerer_abonnement.py:74: abonnement.plan = ...
E         Utiliser changer_etat() / creer_abonnement(), seuls points d'écriture de l'abonnement.
E       assert not ['abonnements/management/commands/gerer_abonnement.py:74: abonnement.plan = ...']

abonnements/tests/test_garde_structurelle.py:121: AssertionError
======================= short test summary info ========================
FAILED abonnements/tests/test_garde_structurelle.py::test_aucune_ecriture_de_plan_ou_statut_hors_du_service
1 failed, 4 passed in 3.52s
```

La garde **nomme le fichier fautif et la ligne** : c'est bien l'écriture dans
un module de production qui est détectée, pas un artefact de test.

**Restauration** :

```bash
git checkout -- abonnements/management/commands/gerer_abonnement.py
sha256sum abonnements/management/commands/gerer_abonnement.py
# 1932e5ddae384adda4660bb2364383f37fbaf18786279afbebc142671de57956  abonnements/management/commands/gerer_abonnement.py
```

**Commande VERTE** (identique) :

```bash
$PY -m pytest abonnements/tests/test_garde_structurelle.py -q
```

**Extrait VERT** :

```
.....                                                                    [100%]
5 passed in 4.76s
```

Statut : **ROUGE (1 failed, 4 passed) → VERT (5 passed)**.
Code restauré : sha256 identique à l'état initial, `git diff` vide.

---

## Vérifications finales après restauration

```bash
$PY manage.py check
# System check identified no issues (0 silenced).

$PY manage.py makemigrations --check --dry-run
# No changes detected

$PY -m pytest abonnements -q
# 204 passed

$PY -m pytest -q
# 1144 passed in 75.22s

git status --short     # (vide, superprojet et sous-module)
git diff               # (vide, superprojet et sous-module)
```

**Confirmation : code restauré, `git diff` vide des deux côtés.**
Aucune écriture sauvage ni garde neutralisée ne subsiste ; seuls ce journal
et la mise à jour de `CLAUDE.md` sont ajoutés par le commit de documentation.
