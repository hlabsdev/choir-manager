# Checklist de livraison — cohérence

Trois règles, nées d'incidents réels, et le test qui empêche chacune de
revenir. **Avant toute livraison : `make coherence`** (depuis la racine du
superprojet). La cible lance `core/tests/test_coherence_admin.py` et
`core/tests/test_coherence_livraison.py` ; elle est rapide, sans base, et
peut tourner à chaque commit.

---

## 1. Une vérité = un endroit

**Jamais de valeur dupliquée entre le front et le back.** Adresse de contact,
listes de fonctionnalités, tarifs, périodicités : si une valeur existe côté
serveur, le front la LIT par l'API — il ne la recopie jamais.

**Symptôme qui l'a motivée** : l'adresse de contact vivait à la fois dans
`settings.EMAIL_REPLY_TO_PLATEFORME` et dans les deux `environment*.ts`
(`contactEmail`). Les deux « devaient » correspondre, rien ne le garantissait,
et elles ont divergé : la production affichait un placeholder pendant que les
emails partaient à la vraie boîte. Même mécanique pour `SITE_URL`, absent de
toutes les piles Compose : les emails de vérification partaient **sans lien**,
sans erreur ni trace.

**Ce qui le garde** :
- `test_environnements_front_sans_cle_contact_email` — la clé `contactEmail`
  ne peut pas réapparaître dans `environment*.ts` ;
- `test_environnements_front_sans_adresse_email_litterale` — aucune adresse
  en dur dans les environnements du front ;
- `test_aucun_reglage_django_lu_dans_le_front` — aucun `settings.X` ni
  `EMAIL_REPLY_TO_PLATEFORME` lu dans un `.ts` de production (un exemple en
  commentaire reste toléré) ;
- `test_chaque_variable_env_example_est_consommee_par_compose` — chaque
  variable de `.env.example` est réellement interpolée par une des trois
  piles ; les réglages purement Compose (ports, `--maxmemory`) sont
  allowlistés et justifiés ;
- `test_aucun_placeholder_de_domaine_dans_le_code_de_production` — aucun
  `votre-domaine`, `votredomaine` ni `example.com` dans le code de
  production, hors allowlist étroite et vérifiée.

**Le réflexe** : une valeur qui doit changer sans rebuild du front vit dans
`.env` **et** est transmise par Compose ; le front l'appelle. Si elle n'est
pas dans `.env.example`, elle n'existe pas.

---

## 2. Écrire par la couche qui porte les garanties

`save()` plutôt que `queryset.update()` quand `updated_at`, les signaux ou
l'audit comptent ; un service plutôt qu'une écriture directe ; jamais de
contournement d'une garde (motif obligatoire, rôle, tenant).

**Symptôme qui l'a motivée** : les actions groupées de l'admin faisaient
`queryset.update(...)`. Elles contournaient donc `save()`, l'`auto_now` de
`updated_at` **et** les signaux `post_save` : une chorale suspendue gardait
la date de sa dernière écriture normale, impossible de savoir QUAND. La
suspension n'était pas tracée.

**Ce qui le garde** :
- `test_toute_action_groupee_horodate_explicitement` — tout `.update()` d'un
  `admin.py` porte `updated_at=` (analyse AST, pas une recherche de texte) ;
- `test_allowlist_est_a_jour` — un modèle exempté est vraiment dépourvu
  d'`updated_at` ;
- `test_suspendre_renseigne_horodatage_et_motif` et
  `test_suspendre_exige_un_motif_sans_rien_ecrire` — la suspension reste
  motivée et horodatée.

**Le réflexe** : avant un `.update()`, se demander « qui a besoin des signaux
et de la date ? ». Si la réponse n'est pas « personne », passer par `save()`
ou par le service.

---

## 3. Jamais hors du système de design

Un gabarit d'admin utilise les classes Django (`module`, `submit-row`) ; une
modale utilise les largeurs documentées — `modal-panel--wide` pour la
lecture, `max-w-lg`/`max-w-xl` pour les formulaires, `max-w-md` pour les
confirmations.

**Symptôme qui l'a motivée** : des pop-ups non stylés sont revenus **trois
fois** — un gabarit sous `templates/admin/` sans classe `module` ni
`submit-row` s'affiche comme du HTML brut. Une modale à la largeur improvisée
casse la lecture et l'alignement des actions.

**Ce qui le garde** :
- `test_tout_gabarit_admin_utilise_les_classes_de_l_admin` — chaque gabarit
  hors `base_site.html` porte `module` et `submit-row`.

**Le réflexe** : avant d'écrire un écran, chercher l'équivalent existant et
réutiliser ses classes. Ne pas inventer une largeur ou une structure.

---

## Comment lancer

```bash
make coherence
```

La cible utilise `chm-backend/venv/bin/python` par défaut. Dans un worktree
sans venv local :

```bash
make coherence PYTHON=/chemin/vers/chm-backend/venv/bin/python
```

Pour prouver qu'un test mord, introduire volontairement la régression, voir
`make coherence` échouer, puis restaurer — sans committer la régression.
