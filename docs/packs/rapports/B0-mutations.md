# B0 — Journal des mutations (rouge → vert)

**Date** : 2026-11-13 (Africa/Lome)
**Superprojet** : `/home/hermann/work/ventures/chm/chm-wt-b0` — point de départ `e9e55062ca35623e2ed1849fee2f87e01ba451ae`
**Backend** : `chm-backend`, branche `feat/b0-canal-backend`, point de départ `814c0b59f74ca599678887500fd55bc2ebcaa877`
**Commit de la garde structurelle** : `62115bff5b986ea1375305688c76f4e058f68a5b` (« test(b0): garde structurelle du service unique de suspension »)
**Commit de ce rapport** : le commit du superprojet qui porte ce fichier (docs + CLAUDE.md).

## Environnement

Toutes les commandes ont été lancées depuis `chm-wt-b0/chm-backend`, avec :

```bash
export DATABASE_URL="postgres://chm:chm@127.0.0.1:5433/chm_b0"
export REDIS_URL="redis://127.0.0.1:6380/1"
export DJANGO_SECRET_KEY="<secret de test>"
export DJANGO_DEBUG="True"
export DJANGO_ALLOWED_HOSTS="localhost,127.0.0.1,testserver"
PY=/home/hermann/work/ventures/chm/choir-manager/chm-backend/venv/bin/python
```

Suites lancées séquentiellement, une à la fois. Aucune dépendance installée.

## Résumé

| # | Mutation | Fichier visé | Rouge | Vert après restauration |
|---|---|---|---|---|
| (a) | Retrait de la garde `canal_desactive` dans `envoyer_sms` | `notifications/sms.py:164-178` | 2 échecs (sms suspendu) | 5 passed |
| (b) | Retrait du motif obligatoire dans `suspendre_canal` | `notifications/services.py:533` | 1 échec (motif vide) | 40 passed |
| (c) | Écriture sauvage de `SuspensionCanal` hors service | `notifications/suspensions.py:43` | 1 échec (garde structurelle) | 2 passed |

---

## Mutation (a) — garde `canal_desactive` retirée de `envoyer_sms`

**Cible** : `notifications/sms.py`, bloc `if canal_est_desactive(membre.chorale, "sms"): …` (lignes 164-178), retiré en entier. Les commentaires §3 et l'avertissement structuré partent avec lui.

**Commande** :

```bash
$PY -m pytest notifications/tests/test_garde_canal_desactive.py -q
```

**Sortie ROUGE** (`exit=1`) :

```text
E           AssertionError: Expected '_poster_sms' to not have been called. Called 1 times.
...
E       AssertionError: assert []
...
FAILED notifications/tests/test_garde_canal_desactive.py::test_sms_canal_suspendu_ne_cree_aucune_ligne_et_journalise
FAILED notifications/tests/test_garde_canal_desactive.py::test_sms_suspendu_prime_sur_fonctionnalite_non_incluse
2 failed, 3 passed in 3.74s
```

Le premier test prouve qu'un SMS part malgré la suspension ; le second prouve que l'ordre §5 est perdu (c'est l'avertissement `abonnements.verrou` qui apparaît au lieu de « canal suspendu »). Les trois autres tests (WhatsApp et indépendance des canaux) restent verts : la mutation est bien ciblée sur le seul SMS.

**Restauration** :

```bash
git checkout -- notifications/sms.py
git diff --stat -- notifications/sms.py   # aucune sortie
```

**Sortie VERTE** (`exit=0`) :

```text
.....                                                                    [100%]
5 passed in 3.09s
```

---

## Mutation (b) — motif obligatoire retiré de `suspendre_canal`

**Cible** : `notifications/services.py:533`, ligne `motif = _motif_obligatoire(motif, "suspendre")` retirée (le `_motif_obligatoire` de `reprendre_canal` est conservé).

**Commande** :

```bash
$PY -m pytest notifications/tests/test_suspension_canal.py \
    notifications/tests/test_commande_canal.py \
    notifications/tests/test_admin_suspension.py -q
```

**Sortie ROUGE** (`exit=1`) :

```text
    def test_motif_vide_refuse_par_le_service_et_par_le_modele(chorale_a):
>       with pytest.raises(ValueError):
             ^^^^^^^^^^^^^^^^^^^^^^^^^
E       Failed: DID NOT RAISE ValueError

notifications/tests/test_suspension_canal.py:46: Failed
...
FAILED notifications/tests/test_suspension_canal.py::test_motif_vide_refuse_par_le_service_et_par_le_modele
1 failed, 39 passed, 9 warnings in 5.54s
```

Le service accepte donc une suspension sans motif (la ligne est écrite ; l'assertion suivante `SuspensionCanal.objects.count() == 0` n'est jamais atteinte). Les suites de la commande et de l'admin restent vertes : leur garde de motif est en amont, et cette mutation ne les couvre pas — c'est bien le service qui est visé.

**Restauration** :

```bash
git checkout -- notifications/services.py
git diff --stat -- notifications/services.py   # aucune sortie
```

**Sortie VERTE** (`exit=0`) :

```text
40 passed, 9 warnings in 11.76s
```

---

## Mutation (c) — écriture sauvage hors du service

**Cible** : `notifications/suspensions.py` (module de production, lecture seule), fonction temporaire ajoutée en fin de fichier :

```python
def _mutation_c_ecriture_sauvage(chorale):
    return SuspensionCanal.objects.create(
        chorale=chorale, canal="sms", motif="Mutation (c) — garde structurelle",
    )
```

**Commande** :

```bash
$PY -m pytest notifications/tests/test_garde_suspension.py -q
```

**Sortie ROUGE** (`exit=1`) :

```text
E       AssertionError: Écriture de SuspensionCanal hors de notifications.services :
E           notifications/suspensions.py:43: SuspensionCanal.objects.create(...)
E         Utiliser suspendre_canal() / reprendre_canal(), seuls points d'écriture : ils portent l'idempotence, le motif obligatoire, l'audit et la notification du Bureau.
E       assert not ['notifications/suspensions.py:43: SuspensionCanal.objects.create(...)']

notifications/tests/test_garde_suspension.py:162: AssertionError
FAILED notifications/tests/test_garde_suspension.py::test_aucune_ecriture_de_suspension_canal_hors_du_service
1 failed, 1 passed in 0.24s
```

Le second test du fichier (auto-contrôle du détecteur) reste vert : l'échec vient bien de l'écriture introduite, pas d'un détecteur cassé.

**Restauration** :

```bash
git checkout -- notifications/suspensions.py
git diff --stat -- notifications/suspensions.py   # aucune sortie
```

**Sortie VERTE** (`exit=0`) :

```text
..                                                                       [100%]
2 passed in 0.07s
```

---

## Vérifications finales (code restauré, garde commitée)

```text
$ $PY manage.py check
System check identified no issues (0 silenced).

$ $PY manage.py makemigrations --check --dry-run
No changes detected

$ $PY -m pytest notifications -q
181 passed, 75 warnings in 11.97s

$ $PY -m pytest abonnements -q
172 passed, 65 warnings in 12.24s

$ $PY -m pytest -q
1151 passed, 682 warnings in 52.73s
```

## Confirmation de restauration

**Code restauré, `git diff` vide sur les fichiers mutés.**

```text
$ git diff --stat 814c0b59f74ca599678887500fd55bc2ebcaa877 -- \
      notifications/sms.py notifications/services.py notifications/suspensions.py
(aucune sortie)

$ git status --short
(aucune sortie)
```

Les trois fichiers mutés sont identiques à leur état d'avant les mutations ; seul le nouveau fichier `notifications/tests/test_garde_suspension.py` a été ajouté, dans le commit `62115bff5b986ea1375305688c76f4e058f68a5b`.
