# C3 — Phase 1 : Diagnostic (lecture seule)

> Tâche C3 « Communication de lancement » — `docs/packs/mise-en-marche.md` l. 296-360.
> Rapport **strictement en lecture seule**. Aucun code écrit, aucune ligne de cron installée,
> aucune diffusion créée, aucune commande exécutée sur l'hôte (le VPS n'a pas été contacté).
> Phase 2 **non entamée** — en attente d'une validation humaine explicite citant ce rapport.

`main` = `4b515b8` (« merge(b1): phase 2 - mesure de la consommation et rapport operateur »),
arbre de travail propre. C1, B0, P2, C2 et B1 sont fusionnés : la page publique `/abonnement`
existe (`chm-frontend/src/app/app.routes.ts` l. 43-44), l'app `diffusion` aussi.

Fichiers inspectés : `CLAUDE.md` (§ Abonnement l. 942-966, § Page publique `/abonnement`
l. 967-985, § Chantiers connus l. 1265-1291), `docs/packs/mise-en-marche.md`,
`docs/packs/abonnement-verrou.md`, `docs/DEPLOIEMENT.md` (§5 Exploitation courante l. 385-712,
§7 Sauvegarde l. 868-916), `Makefile`, `compose.yaml`, `compose.prod.yaml`, `compose.dev.yaml`,
`.env.example`, `scripts/`, `ops/systemd/*`, `ops/backup/*`,
`chm-backend/diffusion/{models,views,urls,serializers,services,admin}.py`,
`chm-backend/diffusion/tests/{test_api,test_admin}.py`,
`chm-backend/chm_config/urls.py`, `chm-backend/abonnements/{constants,models,rappels}.py`,
`chm-backend/abonnements/migrations/0002_backfill_pionnier.py`,
`chm-backend/abonnements/management/commands/{rappeler_echeances_abonnement,transitions_abonnements,gerer_abonnement}.py`,
`chm-frontend/src/app/features/operateur/diffusion/{diffusion.component.ts,diffusion.service.ts}`,
`chm-frontend/src/app/features/public/abonnement/abonnement.component.ts`,
`chm-frontend/src/app/{app.routes.ts,layout/navigation.ts}`.

---

## Synthèse — quatre constats qui commandent la Phase 2

| # | Constat | Effet sur C3 |
|---|---|---|
| **A** | **Le statut « brouillon » n'existe pas.** `Diffusion.Statut` ne connaît que `en_cours`, `terminee`, `partielle`, `echec` (`chm-backend/diffusion/models.py` l. 44-48). Aucun `brouillon` nulle part dans le dépôt (grep exhaustif : seuls `docs/packs/mise-en-marche.md` et un commentaire de `planning/serializers.py` l. 153 emploient le mot, sans rapport). | Le critère de fin « statut *brouillon*, non envoyé » (`pack` l. 350-351) **n'est pas atteignable aujourd'hui**. Le seul chemin d'écriture existant envoie dans la même requête. → **STOP, à arbitrer** (§ 1.6 et § 1.8). |
| **B** | **Aucune commande `manage.py` de diffusion, aucune notion de brouillon côté API.** `POST /api/diffusion/` crée **et** expédie (`diffusion/views.py` l. 159 → `services.envoyer_diffusion`). L'app `diffusion` n'a même pas de répertoire `management/`. | Il n'y a **aucun moyen documenté, ni outillé, de « préparer sans envoyer »** qui laisse une trace dans l'historique. § 1.5 et § 1.7. |
| **C** | **Le cron des rappels d'échéance n'existe nulle part dans le dépôt.** Ni `docs/DEPLOIEMENT.md`, ni `Makefile`, ni compose, ni `.env.example`, ni `scripts/`, ni `ops/`. La docstring de la commande renvoie à une section de `docs/DEPLOIEMENT.md` **qui n'existe pas** (`rappeler_echeances_abonnement.py` l. 5 « cf. `docs/DEPLOIEMENT.md` »). | Le volet documentaire de C3 est **réellement à faire** (« ajout du cron dans `docs/DEPLOIEMENT.md` si absent », pack l. 322). § 2.1 et § 3. |
| **D** | **L'état du VPS est indéterminable sans accès hôte** — contrôle restreint respecté, aucune commande distante lancée. | § 2.3 donne les commandes **lecture seule** exactes que l'humain doit passer ; § 2.4 conclut de façon tranchée (présent / absent / indéterminable). |

**Conséquence opérationnelle immédiate :** la Phase 2 telle qu'écrite au pack (créer un
brouillon, canaux e-mail, toutes les chorales, non envoyé) **exige un changement de code**
dans `diffusion` (un statut + un chemin de création sans envoi). Ce changement n'est pas dans
le périmètre déclaré de C3 (« Inclus : message de diffusion préparé… »), et le pack pose
comme arrêt propre « Toute action d'envoi de la diffusion : STOP, acte humain » (l. 359).
Trois options sont chiffrées en § 1.8 ; **aucune n'est appliquée**.

---

## 1. Comment créer un brouillon de diffusion

### 1.1 Le modèle exact

**`chm-backend/diffusion/models.py`** — deux modèles, aucun n'est un `ChoraleOwnedModel`
(`Diffusion` n'appartient à aucun tenant : elle peut viser toutes les chorales, l. 24-27).

#### `Diffusion` (l. 36-135)

| Champ | Type | Ligne | Défaut / valeurs |
|---|---|---|---|
| `auteur` | FK `AUTH_USER_MODEL`, `null`, `SET_NULL` | 50-57 | — (opérateur) |
| `auteur_libelle` | `CharField(150)` | 58-62 | `""` — recopié à l'écriture |
| `cible` | `CharField(20)` + `Cible` | 63-68 | `"tous"` ; `tous` / `groupe` / `chorale` |
| `chorale` | FK `Chorale`, `null`, `SET_NULL` | 69-76 | `null` sauf cible `chorale` |
| `groupe` | `JSONField`, `null` | 77-86 | `{"type":"plan","plan":"pro"}` ou `{"type":"selection","chorales":[1,2]}` |
| `sujet` | `CharField(200)` | 87 | **obligatoire** |
| `message` | `TextField` | 88 | **obligatoire** |
| `canaux` | `JSONField`, `default=dict` | 89-93 | `{"email": true, "sms": false, "whatsapp": true}` (forme documentée) |
| `nb_destinataires` | `PositiveIntegerField` | 95-97 | `0` |
| `nb_envoyes` | `PositiveIntegerField` | 98-100 | `0` |
| `nb_echecs` | `PositiveIntegerField` | 101-103 | `0` |
| `nb_ignores` | `PositiveIntegerField` | 104-107 | `0` |
| `statut` | `CharField(20)` + `Statut`, `db_index` | 109-115 | **`en_cours`** |
| `envoyee_le` | `DateTimeField`, `null` | 116-119 | `null` |
| `created_at` / `updated_at` | hérités de `TimeStampedModel` | 36 | `auto_now_add` / `auto_now` |

`Meta` (l. 121-128) : `ordering = ["-created_at", "-pk"]`, deux index (`diffusion_recente_idx`,
`diffusion_statut_idx`). `__str__` (l. 130-131) : `"{sujet} — {cible} ({statut})"`.

#### `Diffusion.Statut` — **la liste exhaustive, sans brouillon** (l. 44-48)

```python
class Statut(models.TextChoices):
    EN_COURS = "en_cours", "En cours"
    TERMINEE = "terminee", "Terminée"
    PARTIELLE = "partielle", "Partiellement envoyée"
    ECHEC = "echec", "Échec"
```

Valeurs en base : `en_cours`, `terminee`, `partielle`, `echec`. **Aucune valeur `brouillon`.**
Le défaut `EN_COURS` (l. 112) n'est pas un brouillon : `envoyer_diffusion` le remplace dans la
même requête par `terminee`/`partielle`/`echec` (l. 754-760), et `envoyee_le` est toujours
renseigné (l. 760). Une ligne `en_cours` persistée serait l'état transitoire d'un envoi
interrompu, pas un brouillon.

#### `DiffusionDestinataire` (l. 138-221)

Une tentative = **un destinataire (chorale) × un canal**. Champs : `diffusion` (CASCADE, l. 152-157),
`chorale` (SET_NULL, l. 158-164), `chorale_nom` (l. 165-169), `membre` (SET_NULL, l. 170-177),
`canal` (`email`/`sms`/`whatsapp`, l. 178-180), `coordonnee` (l. 181-185), `statut`
(`en_attente`/`envoye`/`echec`/`ignore`, l. 186-192), `erreur` (l. 193-197), `envoye_le` (l. 198-200).
Contrainte `unique_diffusion_chorale_canal` (l. 206-214).

⚠️ Ce modèle n'a **aucun champ « contenu préparé »** : une ligne y est toujours le produit d'une
tentative d'envoi. Un brouillon n'aurait rien à y faire.

### 1.2 Les routes API existantes

Montage : `chm-backend/chm_config/urls.py` l. 59 — `path("api/diffusion/", include("diffusion.urls"))`.
Déclarations : `chm-backend/diffusion/urls.py` l. 13-23.

| Méthode | Route | Vue | Écrit ? | Ligne |
|---|---|---|---|---|
| `POST` | `/api/diffusion/` | `DiffusionView.post` | **OUI — crée ET envoie** | `views.py` l. 147-179 |
| `GET` | `/api/diffusion/` | `DiffusionView.get` (historique, `?limite=1..200`, défaut 50) | non | `views.py` l. 120-145 |
| `GET` | `/api/diffusion/previsualisation/` | `DiffusionPrevisualisationView.get` | **non — zéro écriture** | `views.py` l. 182-211 |
| `GET` | `/api/diffusion/<pk>/` | `DiffusionDetailView.get` | non | `views.py` l. 214-227 |

Toutes les quatre : `permission_classes = [EstOperateur]` (`views.py` l. 108) — l'**opérateur de
plateforme** uniquement (`is_superuser` **et** aucun `Membre`, cf. `CLAUDE.md` § Opérateur).
Réponses `Cache-Control: no-store` + `Pragma: no-cache` (`views.py` l. 110-114) : la
prévisualisation contient des adresses e-mail et des téléphones.

**Il n'existe aucune route de création différée, aucun `PUT`/`PATCH`, aucune action `envoyer`
séparée.** Le schéma est « composer → prévisualiser (GET) → poster (envoi immédiat) ».

### 1.3 Existe-t-il une commande `manage.py` ?

**Non.** L'app `diffusion` **n'a pas de répertoire `management/`** (`find chm-backend/diffusion -type f`
ne renvoie que `admin.py`, `apps.py`, `models.py`, `serializers.py`, `services.py`, `urls.py`,
`views.py`, `migrations/0001_initial.py`, `tests/`). Aucune commande d'envoi ni de composition
n'existe dans les autres apps : le seul point d'entrée de création est
`diffusion.services.envoyer_diffusion()` (`services.py` l. 612).

### 1.4 Existe-t-il un écran opérateur ?

**Oui** — `/operateur/diffusion`, et c'est le seul chemin d'usage prévu par le produit.

- Route : `chm-frontend/src/app/app.routes.ts` l. 163-169, `path: 'operateur/diffusion'`,
  `canActivate: [operateGuard]` → `DiffusionOperateurComponent`.
- Entrée de navigation : `chm-frontend/src/app/layout/navigation.ts` l. 337
  (`{ path: '/operateur/diffusion', label: 'Diffusion', icon: 'send' }`).
- Composant : `chm-frontend/src/app/features/operateur/diffusion/diffusion.component.ts`.
  Deux gestes seulement : `previsualiser()` (l. 326, GET sans écriture) et `envoyer()` (l. 363,
  POST). Après succès, le formulaire est **vidé** (l. 393-395) : rien ne reste en brouillon.
- Client HTTP : `diffusion.service.ts` l. 145-165 (`previsualiser`, `envoyer`, `historique`, `detail`).
- Admin Django : **lecture seule stricte**. `diffusion/admin.py` l. 84-99 :
  `get_readonly_fields` renvoie tous les champs, `has_add_permission` = `False` (l. 90-91),
  `has_change_permission` = `False` (l. 93-96), `has_delete_permission` = `False` (l. 98-99).
  Docstring l. 5-14 : « le seul chemin de création est
  `diffusion.services.envoyer_diffusion()` ». **On ne peut donc pas créer un brouillon par
  l'admin non plus.**

### 1.5 Ce qui déclenche l'envoi — le code exact

L'envoi n'est pas un état à atteindre : c'est **la création elle-même**. Chaîne complète :

1. `POST /api/diffusion/` → `views.py` l. 147 ; `cible = donnees.get("cible") or Diffusion.Cible.TOUS`
   (l. 150), `canaux = donnees.get("canaux")` (l. 164).
2. `views.py` l. 159 : `diffusion = envoyer_diffusion(...)` — appel **inconditionnel**, dans la
   requête HTTP. Aucun paramètre de type `brouillon`/`dry_run`/`envoyer=false` n'est lu.
3. `services.py` l. 629-664 : validation du contenu, des canaux, de la cible, du plafond
   (`DIFFUSION_MAX_DESTINATAIRES`, défaut 500, l. 647) et de la joignabilité. Tout refus lève
   `DiffusionRefusee` **avant** toute écriture (l. 626-628).
4. `services.py` l. 666-679 : `Diffusion.objects.create(...)` avec `statut=Diffusion.Statut.EN_COURS`.
5. `services.py` l. 681-713 : `bulk_create` des `DiffusionDestinataire` (`en_attente` si la
   coordonnée existe, `ignore` sinon).
6. **`services.py` l. 718-735 : boucle d'envoi.** Pour chaque ligne non ignorée,
   `_envoyer_canal(...)` (l. 723) appelle réellement le fournisseur :
   - e-mail → `envoyer_email_externe(...)`, `services.py` l. 501-513 ;
   - SMS → `envoyer_sms(...)` l. 536 ou `envoyer_sms_chorale(...)` l. 548 ;
   - WhatsApp → `envoyer_whatsapp(...)` l. 567.
7. `services.py` l. 754-764 : statut final `terminee` (0 échec) / `partielle` (au moins un
   succès) / `echec`, puis `envoyee_le = timezone.now()` et `save()`.
8. `services.py` l. 766-783 : `journaliser(EvenementAudit.Action.DIFFUSION, ...)`
   (`action = "diffusion"`, `audit/models.py` l. 81) avec `source=API`.

**Il n'existe aucune fonction `envoyer()` séparée, aucune machine à états, aucun champ
« programmée le », aucune reprise.** Le geste « créer » et le geste « envoyer » sont le même
appel. C'est ce qui interdit un brouillon sans code nouveau.

### 1.6 Le nom du statut « brouillon » tel qu'il est codé

**Il n'y en a pas.** Recherche exhaustive (`grep -rn -i 'brouillon' --include=*.py --include=*.ts
--include=*.html --include=*.md`, tout le dépôt, `.git` et `node_modules` exclus) : 7 occurrences,
**aucune dans le code de `diffusion`** :

| Fichier | Ligne | Nature |
|---|---|---|
| `docs/packs/mise-en-marche.md` | 320, 327, 334, 344, 350, 351 | le pack C3 lui-même (la demande) |
| `CLAUDE.md` | 1305 | « brouillons de planification » — sans rapport |
| `chm-backend/planning/serializers.py` | 153 | commentaire sur un « brouillon fusionné » de série — sans rapport |

Côté front, `StatutDiffusion` (`diffusion.service.ts` l. 23) est le miroir exact des quatre
valeurs serveur : `'en_cours' | 'terminee' | 'partielle' | 'echec'`. Aucun `'brouillon'`.

**Un brouillon ne part pas — parce qu'un brouillon ne peut pas exister.** La question
« quel code déclenche l'envoi » a une seule réponse : l'appel à
`diffusion.services.envoyer_diffusion()` (`services.py` l. 612), atteint uniquement par
`POST /api/diffusion/` (`views.py` l. 159). Il n'y a pas de garde à contourner, il n'y a pas
d'état intermédiaire à protéger.

### 1.7 Le seul chemin qui n'écrit rien

`GET /api/diffusion/previsualisation/` (`views.py` l. 182-211 → `services.previsualiser_diffusion`
l. 791-857) résout les destinataires **sans créer ni envoyer quoi que ce soit** — c'est écrit
noir sur blanc l. 802-808 et `views.py` l. 16 (« la prévisualisation ne crée AUCUNE ligne »).
Elle accepte `cible`, `sujet`, `message`, `canaux`, `groupe`, `inclure_suspendues`,
`inclure_demo`, et renvoie par destinataire : e-mail retenu et sa source (`chorale`/`responsable`),
téléphone, `canaux_effectifs`, `motifs`, `plan`, `statut_abonnement`, `suspendue`, `demo`
(l. 860-885).

**Mais elle ne persiste rien.** Conséquence directe : elle ne peut pas satisfaire le critère
« le brouillon apparaît dans la liste des diffusions » (`pack` l. 350-351) — la liste
(`GET /api/diffusion/`) ne lit que des lignes `Diffusion`, et la prévisualisation n'en crée pas.

### 1.8 Le chemin exact demandé : toutes les chorales, e-mail seul, sans envoyer

**État factuel : ce chemin n'existe pas.** Décomposition de la demande et de ce qui existe :

| Exigence du pack | Existe ? | Où |
|---|---|---|
| Cible = **toutes les chorales** | **OUI** | `cible="tous"` est le défaut du modèle (`models.py` l. 66) et de la vue (`views.py` l. 150) ; `Cible.TOUS` |
| Canaux = **e-mail uniquement** | **OUI** | `CANAUX_PAR_DEFAUT = {"email": True, "sms": False, "whatsapp": False}` (`services.py` l. 75), appliqué par `normaliser_canaux` (l. 111-112) quand `canaux` est absent ; côté GET, `_canaux_depuis_requete` (`views.py` l. 72-75) renvoie le même triplet sans paramètre |
| **Sans envoyer** | **NON** | tout `POST` appelle `envoyer_diffusion` (`views.py` l. 159), qui envoie (§ 1.5, étape 6) |
| Persister un **brouillon** | **NON** | aucun statut (`models.py` l. 44-48), aucun champ, aucun service, aucune route, aucune commande, admin fermé en écriture |

**Les trois options réalistes pour la Phase 2 — aucune n'est appliquée ici :**

- **Option A — ajouter le statut et le chemin de création (changement de code dans `diffusion`).**
  Le minimum cohérent avec l'existant : `Statut.BROUILLON = "brouillon", "Brouillon"` dans
  `models.py` (migration `0002` sur `Diffusion`), une fonction `creer_brouillon(...)` dans
  `services.py` réutilisant `valider_contenu` + `normaliser_canaux` + `resoudre_chorales` mais
  **sans** `resoudre_destinataires`, **sans** `DiffusionDestinataire`, **sans** `journaliser` ; une
  branche `POST` dédiée (`?brouillon=true` ou `statut="brouillon"`) dans `views.py` ; un bouton
  « Enregistrer le brouillon » dans l'écran ; tests dans `diffusion/tests/test_api.py`.
  Empreinte estimée : 5 fichiers backend + 2 frontend + 1 migration. **Hors périmètre déclaré de
  C3** (qui ne prévoit que « message de diffusion préparé »), et non demandé par le pack
  `abonnement-verrou.md` § Diffusion. → **décision humaine requise.**
- **Option B — ne rien persister, livrer le texte ici même.** Le corps du message est prêt en
  § 4 ; l'opérateur le colle dans `/operateur/diffusion`, clique « Prévisualiser », lit les
  destinataires, et **s'arrête**. Zéro code, zéro écriture. Ne satisfait pas le critère
  « apparaît dans la liste » mais satisfait l'objectif réel (les chorales pilotes sont
  informées) **et** la décision non négociable « la tâche ne l'envoie pas ».
- **Option C — trace hors `diffusion`.** Consigner le texte dans ce rapport (§ 4) et/ou dans
  une note d'exploitation, pour que la composition survive à la session. Aucun code.

**Recommandation** (à valider, pas appliquée) : **B + C** pour la Phase 2 si l'humain veut
respecter strictement « aucune écriture de code » et « aucun envoi » ; **A** seulement si le
statut brouillon est considéré comme un besoin produit durable (il ne l'est pas aujourd'hui :
l'écran n'a jamais eu de brouillon, et `docs/packs/abonnement-verrou.md` ne le prévoit pas).
Dans les deux cas, **le texte du § 4 est le livrable utile**.

### 1.9 Si un opérateur voulait malgré tout envoyer — ce qu'il ferait (pour information, non exécuté)

`POST /api/diffusion/` avec :

```json
{
  "cible": "tous",
  "sujet": "…",
  "message": "…",
  "canaux": { "email": true, "sms": false, "whatsapp": false },
  "inclure_suspendues": false,
  "inclure_demo": false
}
```

`inclure_demo` par défaut `false` (`views.py` l. 168, `_bool` l. 45-50) : les chorales de
démonstration (`core/services_operateur.py` l. 320-332, détection par préfixe `DEMO`, nom
contenant « démo » ou adresses en `.demo`) sont exclues. `inclure_suspendues` par défaut
`false` aussi : une chorale `is_active=False` ne reçoit rien.

⚠️ **La cible « tous » inclut les chorales créées hors pilote.** Il n'existe aucun ciblage
« pilotes » : `Cible` ne connaît que `tous`, `groupe` (par `plan` ou par sélection d'identifiants
explicites, `models.py` l. 77-86) et `chorale`. Pour ne toucher que les pilotes, il faudrait
`cible="groupe"` + `{"type":"selection","chorales":[<ids>]}` — ce qui **contredit** l'exigence
« destinataires = toutes les chorales » du pack (l. 344-345). À arbitrer en Phase 2 (§ 4.3).

---

## 2. Le cron sur le VPS

> ⚠️ **Contrôle restreint respecté.** Aucun `ssh`, aucune commande sur l'hôte, aucune lecture
> de `crontab`, de `/etc/cron.d/` ni de `systemctl`. Tout ce qui suit sur le VPS est
> **déduit du dépôt** ou **explicitement marqué indéterminable**.

### 2.1 Recensement, dans le dépôt, de tout ce qui planifie `rappeler_echeances_abonnement`

Recherche : `grep -rn 'rappeler_echeances_abonnement\|rappeler-echeances\|rappels-abonnement'`
sur tout le dépôt (`.git` et `.pyc` exclus). **Résultat : 0 occurrence dans un mécanisme de
planification.** Les 9 occurrences trouvées sont documentaires ou du code applicatif :

| Fichier | Ligne | Ce qui est écrit | Planifie ? |
|---|---|---|---|
| `CLAUDE.md` | 74 | « rappels d'échéance (`rappeler_echeances_abonnement --jours 30,7`, idempotents) » | non — inventaire de livraison |
| `docs/packs/mise-en-marche.md` | 32 | « `manage.py rappeler_echeances_abonnement --jours 30,7` » | non — fait constaté |
| `docs/packs/mise-en-marche.md` | 108 | « Le pattern de `manage.py rappeler_echeances_abonnement` (idempotence, …) » | non |
| `docs/packs/mise-en-marche.md` | 317, 335 | la tâche C3 elle-même | non |
| `docs/packs/rapports/C1-phase1.md` | 8, 95 | rapport C1 | non |
| `chm-backend/abonnements/rappels.py` | 5 | « Commande quotidienne `manage.py rappeler_echeances_abonnement --jours 30,7` » | non — docstring |
| `chm-backend/abonnements/management/commands/rappeler_echeances_abonnement.py` | 8 | la commande elle-même | **c'est la cible, pas le planificateur** |
| `RELEASE_NOTES.md` | 192 | « **Rappels d'échéance** : `manage.py rappeler_echeances_abonnement …` » | non — notes de version |

#### a) `docs/DEPLOIEMENT.md` — **aucune section, aucune ligne**

`grep -n -i 'cron\|rappeler_echeances\|timer' docs/DEPLOIEMENT.md` : 8 résultats, **aucun ne
concerne l'abonnement**. La section « cron » du dépôt est en réalité **trois blocs `cron`
d'exploitation courante** (§5), plus une règle générale. Mot pour mot :

**l. 665-669** — purge des refresh tokens (le plus proche d'un modèle générique). Mot pour
mot, la phrase puis le bloc :

````
Entrée cron de l'hôte (la pile n'embarque pas d'ordonnanceur) :

```cron
17 4 * * *  cd /chemin/vers/choir-manager && make purge-tokens >> /var/log/chm-purge-tokens.log 2>&1
```
````
(l. 665 = phrase, l. 667-669 = bloc `cron`). **C'est la seule phrase du dépôt qui dise où vivent
les tâches planifiées, et elle ne mentionne pas l'abonnement.**

**l. 631-634** — rappels d'événements (`rappeler_evenements`, **pas** l'abonnement) :

````
```cron
# Le dépôt de production vit dans /root/choir-manager (PAS /srv/chm/choir-manager).
0 11 * * * cd /root/choir-manager && make prod-rappels >> /var/log/chm-rappels.log 2>&1
```
````
Titre de la sous-section : **« ### Rappels d'événements — À PLANIFIER »** (l. 616).

**l. 704-706** — purge du journal d'audit :

````
```cron
23 4 1 * *  cd /chemin/vers/choir-manager && docker compose exec -T backend python manage.py purger_journal_audit --jours 365 --confirmer >> /var/log/chm-purge-audit.log 2>&1
```
````

**Autres titres « À PLANIFIER »** : l. 640 « ### Purge des refresh tokens — À PLANIFIER ». Il n'y a
**pas** de « ### Rappels d'échéance d'abonnement — À PLANIFIER ». La section n'existe pas.

#### b) `Makefile` — aucune cible

- l. 13 : `COMPOSE_PROD := docker compose -f compose.yaml -f compose.prod.yaml`
- l. 403-404, la seule cible de rappels :
  ```
  prod-rappels: ## PROD — envoie les rappels des événements à venir (à planifier)
          $(COMPOSE_PROD) exec -T backend python manage.py rappeler_evenements --jours 1
  ```
  → `rappeler_evenements`, **jamais** `rappeler_echeances_abonnement`.
- l. 22 (`.PHONY`) : `prod-rappels` y figure ; **aucune** cible `prod-rappels-abonnement`,
  `prod-transitions`, ni équivalent.
- `grep -n -i 'cron\|rappel\|echeance' Makefile` : 2 résultats (l. 26 et l. 403), tous deux sur
  les événements.

#### c) Compose (`compose.yaml`, `compose.prod.yaml`, `compose.dev.yaml`) — rien

`grep -n -i 'cron\|rappel\|echeance\|scheduler'` : **0 résultat**. Aucun service
d'ordonnancement (pas de `cron`, pas de `celery beat`, pas de `ofelia`). C'est cohérent avec
`docs/DEPLOIEMENT.md` l. 665 : « la pile n'embarque pas d'ordonnanceur ».

#### d) `.env.example` — rien

Les deux seules occurrences de « rappel » (l. 13, l. 159) sont du texte de commentaire sans
rapport avec une planification. Aucune variable `CRON`, `RAPPEL_`, `ECHEANCE_`.

#### e) `scripts/` et `ops/` — rien pour l'abonnement

- `scripts/` : `smoke-medias.sh` uniquement (l. 43 et 79 appellent `manage.py shell`, sans rapport).
- `ops/backup/` : quatre scripts de sauvegarde/alerte.
- `ops/systemd/` : **quatre unités, toutes pour la sauvegarde** —
  `choirmanager-backup.service` (`ExecStart=/root/choir-manager/ops/backup/backup.sh`, l. 16),
  `choirmanager-backup.timer` (`OnCalendar=*-*-* 02:15:00`, l. 5),
  `choirmanager-backup-freshness.service` (l. 10),
  `choirmanager-backup-freshness.timer` (`OnCalendar=*-*-* 12:00:00`, l. 5).
  **Aucune unité d'abonnement.** Ces fichiers sont versionnés mais `docs/DEPLOIEMENT.md` ne
  documente **pas** de procédure `systemctl enable` : il ne fait que citer les deux services
  à propos d'`EnvironmentFile` (l. 890-892).

#### f) La référence cassée, à corriger en Phase 2

`chm-backend/abonnements/management/commands/rappeler_echeances_abonnement.py` l. 5-6 :

````
À planifier une fois par jour (cron hôte, cf. docs/DEPLOIEMENT.md), APRÈS
`transitions_abonnements` :

    python manage.py rappeler_echeances_abonnement --jours 30,7
````

`transitions_abonnements.py` l. 5 dit exactement la même chose. **Les deux docstrings renvoient à
une section de `docs/DEPLOIEMENT.md` qui n'a jamais été écrite.** C'est le symptôme le plus net :
le contrat d'exploitation existe dans le code, pas dans la doc.

### 2.2 Ce qui existe réellement, côté code, pour l'idempotence (utile à l'humain qui planifie)

- Paliers par défaut : `PALIERS_PAR_DEFAUT = "30,7"` (`abonnements/rappels.py` l. 58) — donc
  `--jours` peut être omis, mais le pack et la docstring recommandent `--jours 30,7`.
- Idempotence **par échéance et par palier**, pas seulement par jour :
  `dernier_rappel_le` / `dernier_rappel_echeance` / `dernier_rappel_jours`
  (`abonnements/models.py` l. 117-135, `rappels.py` l. 102-116, 229-233). Rejouer la commande
  **le même jour ne duplique rien** ; en revanche une exécution **quotidienne est requise** pour
  attraper les paliers J-30 et J-7 au bon jour.
- Chaque envoi réel écrit **une ligne d'audit** `action="rappel_echeance"`,
  `source=COMMANDE` (`rappels.py` l. 237-258 ; `audit/models.py` l. 83). **C'est la meilleure
  preuve d'exécution passée, et elle est en base** (§ 2.3, commande 5).
- Les abonnements `lecture_seule` et les chorales suspendues sont ignorés (docstring l. 16-17).
- `--dry-run` n'écrit **strictement rien** (l. 12-14) : c'est la commande à préférer pour un
  premier test manuel.
- Ordre imposé : **après** `transitions_abonnements` (docstring l. 5-6), qui applique
  `pionnier → libre` à D5 et `actif → grace (15 j) → lecture_seule` (D3,
  `constants.py` l. 21-24).

### 2.3 À vérifier par l'humain — commandes **LECTURE SEULE** exactes

> Toutes les commandes ci-dessous **ne modifient rien** : ce sont des lectures (`-l`, `ls`, `cat`,
> `grep`, `list-timers`, `logs`, `shell -c` avec des `print`/`count`). Aucune n'installe,
> n'édite, ne recharge ni ne redémarre quoi que ce soit. Exécuter **sur le VPS**, connecté
> en root (le dépôt de production vit dans `/root/choir-manager`, cf. `docs/DEPLOIEMENT.md`
> l. 632).

**1. Crontab de l'utilisateur root (l'emplacement que privilégie la documentation)**

```bash
sudo crontab -l
```

*À observer :* une ligne contenant `rappeler_echeances_abonnement` (et, le cas échéant,
`transitions_abonnements`). Relever **mot pour mot** l'heure, les cinq champs de périodicité,
la commande et la redirection de log. Noter aussi les lignes `rappeler_evenements` /
`purge-tokens` / `purger_journal_audit` : leur présence prouve que l'hôte utilise bien le
crontab comme ordonnanceur, leur absence prouve l'inverse. `no crontab for root` est une
information en soi (crontab root absent).

**2. Crontab de l'utilisateur applicatif**

Identifier d'abord qui possède le dépôt de production (lecture seule) :

```bash
sudo stat -c '%U:%G %n' /root/choir-manager /root/choir-manager/.git
```

Puis, pour l'utilisateur constaté (`<utilisateur>` à remplacer par la valeur affichée ;
si c'est `root`, la commande 1 suffit) :

```bash
sudo crontab -l -u <utilisateur>
```

*À observer :* mêmes éléments. Si `sudo` refuse, c'est un fait à rapporter (l'utilisateur n'a
pas de crontab lisible), pas une raison de tenter une écriture.

**3. `/etc/cron.d/`, `/etc/crontab` et les répertoires cron système**

```bash
ls -la /etc/cron.d/
ls -la /etc/cron.hourly /etc/cron.daily /etc/cron.weekly /etc/cron.monthly
```

Puis le contenu des fichiers pertinents — d'abord un repérage, puis la lecture des seuls
fichiers qui matchent :

```bash
sudo grep -rn -i 'choir-manager\|choirmanager\|manage.py\|abonnement' /etc/cron.d/ /etc/crontab 2>/dev/null
```

```bash
sudo cat /etc/cron.d/<fichier-qui-matche>
```

*À observer :* un fichier dédié (ex. `/etc/cron.d/choirmanager`) contenant
`rappeler_echeances_abonnement`. Attention à la syntaxe propre à `/etc/cron.d/` : **sixième
champ obligatoire = l'utilisateur** (`m h dom mon dow user commande`), contrairement au
crontab utilisateur. Un fichier présent mais sans le 6ᵉ champ ne s'exécute jamais — c'est un
piège à signaler si on le rencontre.

**4. Timers systemd (si l'hôte a choisi cette voie)**

```bash
systemctl list-timers --all
```

```bash
systemctl list-timers --all | grep -i 'choir\|chm\|abonnement\|rappel'
```

```bash
systemctl list-unit-files 'choirmanager*' --all
```

*À observer :* les `choirmanager-backup.timer` et `choirmanager-backup-freshness.timer` sont
attendus si `ops/systemd/` a été installé (ce sont les seules unités versionnées). Un timer
`choirmanager-rappels*` ou `chm-*` serait une trouvaille non documentée dans le dépôt.

**5. Trace d'exécution réelle — cinq sources, de la plus faible à la plus forte**

a) Les fichiers de log nommés par la doc (`/var/log/chm-*.log`) :

```bash
ls -la /var/log/chm-*.log 2>/dev/null
```

```bash
sudo grep -rn -i 'rappeler_echeances\|rappel(s) d.échéance\|rappels d.échéance' /var/log/chm-*.log 2>/dev/null | tail -30
```

b) Le log de cron lui-même :

```bash
sudo journalctl -u cron --since '-30 days' --no-pager | grep -i 'rappeler_echeances\|transitions_abonnements' | tail -30
```

*(sur un hôte sans journald pour cron : `sudo grep -i 'rappeler_echeances' /var/log/syslog /var/log/cron 2>/dev/null | tail -30`)*

c) Les logs du conteneur backend (la sortie de la commande y apparaît, elle est bavarde :
`N rappel(s) d'échéance envoyé(s).`, `rappeler_echeances_abonnement.py` l. 106-109) :

```bash
cd /root/choir-manager && sudo docker compose -f compose.yaml -f compose.prod.yaml logs --since 720h backend 2>&1 | grep -i 'rappel\|échéance' | tail -40
```

d) **La preuve applicative, en base** — les marqueurs d'idempotence laissés par chaque envoi
(`Abonnement.dernier_rappel_le`, `models.py` l. 124-127) :

```bash
cd /root/choir-manager && sudo docker compose -f compose.yaml -f compose.prod.yaml exec -T backend python manage.py shell -c "
from abonnements.models import Abonnement
print('abonnements avec un rappel deja envoye :', Abonnement.objects.exclude(dernier_rappel_le=None).count())
for a in Abonnement.objects.exclude(dernier_rappel_le=None).select_related('chorale').order_by('-dernier_rappel_le'):
    print(' ', a.chorale.nom, '|', a.dernier_rappel_le, '| J-', a.dernier_rappel_jours)
"
```

e) **La preuve par le journal d'audit** — une ligne `action='rappel_echeance'` par envoi réel
(`rappels.py` l. 237-258) :

```bash
cd /root/choir-manager && sudo docker compose -f compose.yaml -f compose.prod.yaml exec -T backend python manage.py shell -c "
from audit.models import EvenementAudit
q = EvenementAudit.objects.filter(action='rappel_echeance')
print('evenements rappel_echeance :', q.count())
print('source commande :', q.filter(source='commande').count())
for e in q.order_by('-created_at')[:10]:
    print(' ', e.created_at, '|', e.resume[:90])
"
```

*À observer :* `0` = **la commande n'a jamais tourné avec succès** sur cet hôte (ou la base a été
restaurée depuis). `> 0` avec des dates régulières = elle tourne. `> 0` mais **aucune ligne
dans les 30 derniers jours** avec des échéances encore futures = elle a tourné puis a été
retirée. Les dates de `dernier_rappel_le` et de `created_at` doivent concorder avec la
périodicité constatée en 1/2/3/4.

> **Aucune de ces commandes n'écrit.** `manage.py shell -c` exécute ici uniquement des
> `count()` et des `print()` ; ne pas y ajouter de `.save()`, `.update()` ou `.delete()`.
> Ne **pas** lancer `rappeler_echeances_abonnement` même avec `--dry-run` pendant ce contrôle :
> le diagnostic doit rester sans effet de bord, et un `--dry-run` réussi ne prouverait de toute
> façon rien sur le cron.

### 2.4 Conclusion factuelle

**Sur le dépôt : le cron est ABSENT.** Formulation sans ambiguïté : aucun fichier du dépôt
(`docs/DEPLOIEMENT.md`, `Makefile`, un des trois `compose*.yaml`, `.env.example`, `scripts/`,
`ops/`) ne planifie `rappeler_echeances_abonnement`, ni ne documente comment le faire. Les deux
docstrings qui y renvoient pointent une section inexistante (§ 2.1.f). C'est un constat de
lecture, pas une déduction.

**Sur le VPS : INDÉTERMINABLE SANS ACCÈS HÔTE.** Le dépôt ne contient ni état du crontab, ni
trace d'exécution, ni fichier de log ; et ce contrôle est expressément restreint (§ 2, bandeau).
Il n'existe **aucun élément**, dans ce que j'ai pu lire, permettant d'affirmer que le cron est
présent ou absent sur `choirmanager.sankof.tech`. Les commandes du § 2.3 tranchent la question
en quelques secondes ; tant qu'elles n'ont pas été passées, la seule réponse honnête est
**indéterminable**.

**Ce qui est certain dans les deux cas :** si le cron existe sur l'hôte, il est **invisible du
dépôt** — donc personne ne peut le relire, le versionner, ni le reprovisionner après une
migration de serveur. Le volet documentaire de C3 reste nécessaire même si le cron tourne.

---

## 3. Si le cron est absent de la documentation

### 3.1 Ce que `docs/DEPLOIEMENT.md` prescrit exactement

**Il ne prescrit rien pour cette commande** — il n'y a pas de procédure à citer, puisque la
section n'existe pas (§ 2.1.a). La procédure **générique** applicable est celle des trois
sections « À PLANIFIER » existantes, et elle tient en quatre règles constantes :

1. **L'ordonnanceur est sur l'HÔTE, pas dans la pile.** `docs/DEPLOIEMENT.md` l. 665, mot pour
   mot : « *Entrée cron de l'hôte (la pile n'embarque pas d'ordonnanceur)* ». Aucun service
   compose ne planifie (§ 2.1.c).
2. **La commande est celle de la pile de PRODUCTION**, c'est-à-dire `docker compose -f
   compose.yaml -f compose.prod.yaml … exec -T backend python manage.py …`
   (`Makefile` l. 13 ; `docs/DEPLOIEMENT.md` l. 624-625, 705). ⚠️ Ne **jamais** utiliser une
   cible `make` de développement : elle omet `compose.prod.yaml` (`CLAUDE.md` l. 161-164).
3. **Le dépôt de production est `/root/choir-manager`**, et la doc l'écrit explicitement
   (`docs/DEPLOIEMENT.md` l. 632 : « *Le dépôt de production vit dans /root/choir-manager (PAS
   /srv/chm/choir-manager)* »). Les deux autres exemples utilisent le placeholder
   `/chemin/vers/choir-manager` (l. 668, 705) : c'est une **incohérence de la doc**, à ne pas
   recopier telle quelle en production.
4. **Sortie redirigée vers un fichier de log nommé** `/var/log/chm-<tâche>.log 2>&1`
   (l. 633, 668, 705).

### 3.2 L'emplacement cohérent avec le reste du dépôt

**→ Le crontab de l'hôte, en root (`crontab -e` sous root, ou `/etc/cron.d/<fichier>` avec le
6ᵉ champ utilisateur).**

Justification, sans hypothèse :

- Les **trois** tâches applicatives déjà documentées sont des entrées de crontab hôte, avec
  `cd <dépôt> && <commande docker compose>` (l. 631-634, 665-669, 704-706). C'est le seul
  mécanisme que la doc d'exploitation décrit.
- `ops/systemd/` n'existe que pour la **sauvegarde**, et la doc n'en documente ni l'installation
  ni l'activation (elle ne cite les deux services qu'à propos d'`EnvironmentFile`, l. 890-892).
  Introduire un timer systemd pour une tâche applicative créerait **deux** surfaces
  d'ordonnancement là où la doc n'en connaît qu'une — et personne ne penserait à le chercher
  dans `systemctl` lors d'un futur diagnostic.
- L'utilisateur est **root**, parce que le dépôt de production est dans `/root/` (l. 632) et que
  les scripts d'exploitation pilotent Docker en root (`ops/systemd/choirmanager-backup.service`
  l. 13-14 : « Les scripts pilotent Docker et rclone en root »). Un `docker compose exec` exige
  l'accès au socket Docker, ce qui est cohérent avec un crontab root.

**Réserve honnête :** `/etc/cron.d/` est **équivalent** (et préférable si l'on veut un fichier
versionné déposé par l'exploitation). Les deux conviennent ; le crontab root est celui que la
doc illustre, `/etc/cron.d/` est celui qui se sauvegarde et se relit le plus facilement. Le
choix revient à l'humain ; **la ligne, elle, est la même** (au champ utilisateur près).

### 3.3 La ligne de cron candidate — **NON INSTALLÉE**

Deux entrées, car l'ordre est une contrainte de code (la docstring de
`rappeler_echeances_abonnement.py` l. 5-6 impose « APRÈS `transitions_abonnements` »).

**Ligne principale (le rappel des échéances) :**

```cron
10 6 * * * cd /root/choir-manager && docker compose -f compose.yaml -f compose.prod.yaml exec -T backend python manage.py rappeler_echeances_abonnement --jours 30,7 >> /var/log/chm-rappels-abonnement.log 2>&1
```

**Ligne préalable (transitions dues : `actif → grace → lecture_seule`, `pionnier → libre` à D5) :**

```cron
5 6 * * * cd /root/choir-manager && docker compose -f compose.yaml -f compose.prod.yaml exec -T backend python manage.py transitions_abonnements >> /var/log/chm-transitions-abonnements.log 2>&1
```

**Variante en une seule entrée** (si l'humain préfère un seul point d'entrée, et si l'on veut que
le rappel ne parte pas quand les transitions ont échoué) :

```cron
5 6 * * * cd /root/choir-manager && docker compose -f compose.yaml -f compose.prod.yaml exec -T backend python manage.py transitions_abonnements && docker compose -f compose.yaml -f compose.prod.yaml exec -T backend python manage.py rappeler_echeances_abonnement --jours 30,7 >> /var/log/chm-rappels-abonnement.log 2>&1
```

Notes de conception, à reporter dans la doc en Phase 2 :

- **Horaire 06:05 / 06:10** : quotidien, tôt, **hors** des fenêtres déjà prises — `02:15`
  (sauvegarde, `choirmanager-backup.timer` l. 5), `04:17` (purge tokens, doc l. 668), `04:23`
  le 1er du mois (purge audit, doc l. 705), `11:00` (rappels d'événements, doc l. 633), `12:00`
  (fraîcheur de sauvegarde). L'ordre 06:05 → 06:10 laisse le temps aux transitions.
- **`--jours 30,7` explicite** : la valeur par défaut de la commande est déjà `"30,7"`
  (`rappels.py` l. 58), mais l'écrire fige le contrat d'exploitation et rend le crontab lisible.
- **`exec -T`** : indispensable hors TTY (même choix que doc l. 624-625, 705) ; sans `-T`,
  `docker compose` alloue un pseudo-TTY et le job cron échoue ou se bloque.
- **`cd /root/choir-manager`** : nécessaire pour que compose trouve le fichier `.env` de la pile.
- **`--dry-run` d'abord** : avant d'installer, l'humain peut lancer **manuellement**
  `… exec -T backend python manage.py rappeler_echeances_abonnement --jours 30,7 --dry-run` —
  il n'écrit rien (docstring l. 12-14) et affiche exactement les rappels dus.
- **Surveillance** : la sortie est redirigée ; sans supervision, une panne silencieuse ne se voit
  qu'à l'absence de lignes. Le journal d'audit (§ 2.3, commande 5) est le contrôle de dernier
  recours — `0` ligne `rappel_echeance` sur 30 jours alors que des échéances approchent est
  l'alarme.

### 3.4 Ce que `docs/DEPLOIEMENT.md` devra contenir après validation (Phase 2, **rien n'est écrit ici**)

Une sous-section `### Rappels d'échéance d'abonnement — À PLANIFIER` dans le § 5 « Exploitation
courante », **entre** « Rappels d'événements » (l. 616-638) et « Purge des refresh tokens »
(l. 640-679) — c'est-à-dire à l'endroit où un exploitant la cherchera. Elle doit dire :
fréquence quotidienne et pourquoi, **l'ordre avec `transitions_abonnements`**, la ligne exacte
ci-dessus, le chemin de log, le fait que la commande est idempotente par échéance **et** par
palier, et **la preuve de bon fonctionnement** (compter les `EvenementAudit` `rappel_echeance`).
Corriger au passage les deux docstrings qui renvoient à cette section
(`rappeler_echeances_abonnement.py` l. 5-6, `transitions_abonnements.py` l. 5-6) : elles
deviendront vraies.

---

## 4. Contenu du message de diffusion

### 4.1 Les chorales pilotes

**Le dépôt ne contient aucune liste nominative.** La seule information disponible est
quantitative : `CLAUDE.md` l. 24 — « *Pilote ouvert à trois chorales réelles* ». Aucun fichier
du dépôt (docs, fixtures, seeds, tests) n'énumère leurs noms : ce sont des données de
production, pas des données de code.

Pour obtenir la liste réelle (lecture seule), sur l'hôte :

```bash
cd /root/choir-manager && sudo docker compose -f compose.yaml -f compose.prod.yaml exec -T backend python manage.py shell -c "
from abonnements.models import Abonnement
for a in Abonnement.objects.select_related('chorale').order_by('chorale__nom'):
    print(f'{a.chorale.nom} | plan={a.plan} | statut={a.statut} | echeance={a.date_echeance} | active={a.chorale.is_active}')
"
```

*À observer :* les lignes `plan=pionnier` sont les chorales pilotes historiques ; les lignes
`plan=libre` sans échéance sont les chorales créées **après** le backfill (`services.py` l. 84-85,
`0002_backfill_pionnier.py` l. 5-8) — elles ne sont pas pilotes. Vérifier aussi
`chorale.is_active` : une chorale suspendue ne reçoit rien (§ 1.9).

### 4.2 Le statut Pionnier se termine au 31/12/2026 — vérifié dans le code et le backfill

| Preuve | Fichier | Ligne | Contenu |
|---|---|---|---|
| Constante de décision | `chm-backend/abonnements/constants.py` | 18-21 | `# D5 — fin du statut pionnier des chorales existantes, décidée par l'humain.` → `DATE_FIN_PIONNIER = date(2026, 12, 31)` |
| Backfill (date recopiée en dur) | `abonnements/migrations/0002_backfill_pionnier.py` | 5-8, 26, 29-44 | « *le statut pionnier court jusqu'au 31 décembre 2026* » ; `DATE_FIN_PIONNIER = date(2026, 12, 31)` ; **toutes** les chorales existantes reçoivent `plan="pionnier"`, `statut="actif"`, `date_echeance=DATE_FIN_PIONNIER` |
| Transition automatique | `abonnements/services.py` | 293, 322 | « `pionnier` arrivé à échéance → `libre` immédiatement (D5) » ; message « Fin du statut pionnier (échéance du …) » |
| Grâce après bascule | `abonnements/constants.py` | 23-24 | `DUREE_GRACE_JOURS = 15` (D3) — après le 31/12/2026, 15 jours de grâce puis `lecture_seule` |
| Cohérence éditoriale front | `chm-frontend/.../public/abonnement/abonnement.component.ts` | 335-337 | FAQ : « *Les chorales encore en Pionnier basculent en Standard au 31 décembre 2026.* » |

⚠️ **Deux précisions qui changent le ton du message :**

1. « Pionnier » n'est **pas** une fin d'accès : la chorale repasse en **plan `libre`**, dont le
   libellé visible est **« Standard »** (`CLAUDE.md` l. 28-31 ; `models.py` l. 73 affiche
   « Pionnier » mais `libre` s'affiche « Standard » depuis la migration `0004`). Il ne faut donc
   **pas** écrire « votre accès se termine » — c'est faux et anxiogène. Le bon message est :
   « le plan Pionnier (offre de lancement) se termine, vous basculez en Standard, gratuit ».
2. Le passage est **automatique** (`transitions_abonnements`, § 3.3) : aucune action n'est
   demandée à la chorale. Le message ne doit pas ressembler à une facture ni à une relance.

### 4.3 Le brouillon attendu — spécification si l'Option A est retenue

| Champ | Valeur |
|---|---|
| `cible` | `"tous"` (`pack` l. 344-345 : « destinataires = toutes les chorales ») |
| `chorale` / `groupe` | `null` |
| `canaux` | `{"email": true, "sms": false, "whatsapp": false}` — e-mail **uniquement** |
| `inclure_suspendues` | `false` (défaut) — une chorale suspendue ne reçoit rien |
| `inclure_demo` | `false` (défaut) — exclut les chorales de démonstration |
| `statut` | `brouillon` — **n'existe pas**, cf. § 1.6 |
| `sujet` | `Nouveau sur Chœur : la page Abonnement, et ce que devient le plan Pionnier` (≤ 200 car., `models.py` l. 87) |
| `message` | § 4.4 |

⚠️ **Incohérence à arbitrer :** « toutes les chorales » (pack l. 345) et « annoncer aux chorales
pilotes » (pack l. 303, 315) ne désignent pas le même ensemble si la production contient des
chorales hors pilote (démo exclues, mais aussi toute chorale créée depuis). Le choix
`cible="tous"` respecte le pack à la lettre ; il faudra confirmer que personne d'autre ne doit
recevoir ce message. C'est une question à poser à l'humain, pas à trancher ici.

### 4.4 Corps du message — prêt à l'emploi

> Conventions respectées : français, vouvoiement, ton sobre et non commercial ; les faits
> viennent du code (§ 4.2) et de la page publique ; aucun prix n'est cité (les tarifs
> s'affichent depuis `TarifPlan`, et la page retombe sur « Tarif sur demande » — décision P1 non
> tranchée) ; « 2 mois offerts » reste **éditorial**, jamais calculé (`CLAUDE.md` § Page publique
> `/abonnement`) — donc **pas** repris ici comme une offre chiffrée ; le lien pointe la page
> réelle (`/abonnement`, route publique de premier niveau, `app.routes.ts` l. 43).

```text
Bonjour,

Depuis le 2 août 2026, Chœur accompagne votre chorale au quotidien : membres,
répertoire, répétitions et pointage, finances et cotisations. Vous faites partie
des chorales qui ont ouvert la voie, et nous vous en remercions.

Deux nouveautés que vous pouvez consulter dès maintenant.

1. UNE PAGE PUBLIQUE DÉDIÉE À L'ABONNEMENT

   La page https://choirmanager.sankof.tech/abonnement présente le plan
   Standard, gratuit et sans limite de durée, ainsi que le plan Pro, qui ouvre
   les envois SMS et WhatsApp, l'assiduité et les séries de planning illimitées.

   Elle est accessible sans connexion : vous pouvez la partager telle quelle à
   votre bureau, ou la consulter depuis le lien « Voir les offres » de l'écran
   Mon abonnement.

2. LE PLAN PIONNIER SE TERMINE LE 31 DÉCEMBRE 2026

   Votre chorale bénéficie aujourd'hui du plan Pionnier, l'offre de lancement qui
   vous a été réservée. Ce plan prend fin le 31 décembre 2026.

   Au 1er janvier 2027, votre chorale bascule automatiquement en plan Standard,
   sans démarche de votre part et sans interruption de service : vos données,
   vos membres et votre historique sont conservés. Le plan Standard reste
   gratuit, sans limite de durée. Le plan Pro est une option payante ; il n'est
   jamais activé sans votre accord.

   Vous n'avez donc rien à faire. Si vous souhaitez passer en Pro avant cette
   date, ou si vous voulez simplement en parler, répondez à ce message : nous
   vous répondons directement.

Bien à vous,
L'équipe Chœur
```

**Longueur et forme.** 1 600 caractères environ, texte brut — `_envoyer_canal` transmet
`html_depuis_texte(message)` en `contenu_html` (`services.py` l. 511) : le gabarit de marque est
appliqué automatiquement, aucun balisage n'est à écrire, et les sauts de ligne sont restitués.
Éviter le markdown (les astérisques s'afficheraient littéralement).

**Ce qui n'est pas dans le message, volontairement :**

- Aucun montant. Les tarifs Pro sont en base (`TarifPlan`), la page les affiche, et la décision
  P1 n'est pas tranchée : citer un prix dans un e-mail le figerait hors de sa source.
- Aucune date de facturation ni de prélèvement : il n'existe **aucun** paiement en ligne
  (hors périmètre du pack).
- Aucune promesse de remise : « 2 mois offerts » est éditorial sur la page, pas un engagement
  contractualisable.
- Aucun lien de désinscription : c'est un message d'exploitation à des clients identifiés, pas
  une campagne marketing. À signaler si l'humain préfère en ajouter un.

---

## 5. Ce que la Phase 2 peut faire — et ce qu'elle ne peut pas

| Étape du pack | Faisable sans code ? | Détail |
|---|---|---|
| Créer un brouillon de diffusion (l. 344) | **NON** | aucun statut, aucune route, aucune commande, admin fermé (§ 1.6) → Option A (code) ou B (texte seul) |
| Cible toutes les chorales (l. 345) | OUI | `cible="tous"`, défaut (`models.py` l. 66) |
| Canaux e-mail uniquement (l. 344) | OUI | `CANAUX_PAR_DEFAUT` (`services.py` l. 75) |
| Ne pas envoyer (l. 327-328, 359) | OUI | prévisualisation `GET` uniquement (`views.py` l. 182) |
| Compléter `docs/DEPLOIEMENT.md` avec la ligne de cron (l. 346-347) | OUI | section neuve, ligne du § 3.3, emplacement du § 3.2 |
| Vérifier le cron sur le VPS | **NON — acte humain** | § 2.3 ; rien n'a été exécuté ici |

**Points d'arrêt à trancher par l'humain avant toute Phase 2 :**

1. **Le statut `brouillon`** : on ajoute le statut (Option A, changement de code dans
   `diffusion`, hors périmètre déclaré de C3) ou on se contente du texte + prévisualisation
   (Option B, aucun critère « apparaît dans la liste ») ? **Sans cette réponse, l'étape 1 du
   pack n'est pas exécutable.**
2. **Cible « tous » vs « pilotes »** : `cible="tous"` (le pack) ou `groupe/selection` avec les
   identifiants des trois chorales (§ 4.3) ? La liste nominative n'est pas dans le dépôt.
3. **Le cron existe-t-il déjà sur le VPS ?** Les commandes du § 2.3 le disent en quelques
   secondes. Si oui, la Phase 2 se limite à la documentation ; si non, elle documente **et**
   l'humain installe (acte séparé).

---

## 6. Récapitulatif des affirmations et de leur preuve

| Affirmation | Preuve |
|---|---|
| Aucun statut `brouillon` | `diffusion/models.py` l. 44-48 ; grep dépôt entier (§ 1.6) |
| `POST /api/diffusion/` envoie immédiatement | `diffusion/views.py` l. 159 → `services.py` l. 612, 666, 718-735 |
| Aucune commande `manage.py` de diffusion | `diffusion/` n'a pas de `management/` |
| Écran opérateur = composer + envoyer, sans brouillon | `diffusion.component.ts` l. 326, 363 |
| Admin `Diffusion` fermé en écriture | `diffusion/admin.py` l. 84-99 |
| La prévisualisation n'écrit rien | `diffusion/views.py` l. 16, 182-211 ; `services.py` l. 802-808 |
| E-mail par défaut | `diffusion/services.py` l. 75, 111-112 |
| Cron absent de `docs/DEPLOIEMENT.md` | grep (`cron\|rappeler_echeances\|timer`) : 8 résultats, aucun sur l'abonnement |
| Cron absent du `Makefile` | `Makefile` l. 403-404 (`rappeler_evenements` seul) ; `.PHONY` l. 22 |
| Cron absent des compose / `.env.example` | grep : 0 résultat |
| Aucune unité systemd d'abonnement | `ops/systemd/` = 2 services + 2 timers, sauvegarde seulement |
| Ordonnanceur = hôte, pas la pile | `docs/DEPLOIEMENT.md` l. 665, mot pour mot |
| Dépôt de production = `/root/choir-manager` | `docs/DEPLOIEMENT.md` l. 632 |
| Référence doc cassée | `rappeler_echeances_abonnement.py` l. 5-6 ; `transitions_abonnements.py` l. 5-6 |
| Pionnier jusqu'au 31/12/2026 | `constants.py` l. 21 ; `0002_backfill_pionnier.py` l. 5, 26 |
| Grâce de 15 jours après bascule | `constants.py` l. 23-24 |
| Trois chorales pilotes, non nommées | `CLAUDE.md` l. 24 ; aucune liste dans le dépôt |
| Preuve d'exécution = audit `rappel_echeance` | `abonnements/rappels.py` l. 237-258 ; `audit/models.py` l. 83 |
| Idempotence par échéance et palier | `abonnements/models.py` l. 117-135 ; `rappels.py` l. 102-116, 229-233 |

---

*Rapport produit en lecture seule. Aucun fichier de code modifié, aucun fichier créé hors ce
rapport, aucune commande exécutée sur l'hôte. Phase 2 non entamée.*
