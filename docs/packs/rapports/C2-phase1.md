# C2 — Phase 1 : Diagnostic (lecture seule)

> Tâche C2 « Page publique `/abonnement` et points d'entrée » (`docs/packs/mise-en-marche.md`, l. 205-293).
> Rapport **en lecture seule**. Aucune écriture de code, aucun composant créé, aucune route ajoutée.
> Phase 2 **non entamée** — en attente d'une validation humaine explicite citant ce rapport.

`main` contient C1 et B0 fusionnés (`631ab6c`). C1 est donc réellement livrée : `TarifPlan`,
`GET /api/abonnements/tarifs/` (`AllowAny`) et `manage.py gerer_abonnement` existent.

Fichiers inspectés : `CLAUDE.md` (§ Frontend, § Système de design, § Abonnement),
`docs/packs/mise-en-marche.md`, `docs/packs/rapports/C1-phase1.md`,
`chm-backend/abonnements/{models,views,urls,serializers,registre,droits}.py`,
`abonnements/tests/test_tarifs.py`, `abonnements/management/commands/gerer_abonnement.py`,
`core/tests/test_garde_permissions.py`, `core/permissions.py`,
`chm-frontend/src/app/app.routes.ts`, `app.routes.spec.ts`, `core/auth/{auth.interceptor,auth.service,erreur-acces}.ts`,
`features/public/{landing,a-propos,contact,suggestions}/*`,
`features/abonnement/**`, `shared/components/refus-abonnement/*`, `shared/pipes/money.pipe.ts`,
`src/{styles.css,icons.ts,environments/environment.ts}`.

---

## Synthèse — trois constats qui commandent la Phase 2

| # | Constat | Effet sur C2 |
|---|---|---|
| **A** | `TarifPlan.Periodicite` ne connaît que `mensuel` et `annuel`. **« 6 mois » n'est pas représentable** (ni en base, ni dans l'API, ni dans `gerer_abonnement`). | Si P2 est bien « 6 mois + 1 an », la page **ne peut pas** afficher une grille 6 mois tant que C1 n'a pas reçu une périodicité `semestriel`. Correctif hors périmètre C2 → **STOP, à arbitrer** (§ 7.1). |
| **B** | Le registre A2 (**source unique** des fonctionnalités payantes selon le pack § 5) **n'est pas lisible en anonyme** : `/api/abonnements/droits/` est `EstMembreDuTenant`. Le pack (§ 233) suppose l'inverse. | La page publique ne peut pas lire les libellés Pro sans soit dupliquer la liste dans le front (interdit § 5), soit ajouter une petite vue publique (backend, hors périmètre déclaré) → **à trancher** (§ 7.2). |
| **C** | **Il n'existe aucun composant de mise en page publique.** Les 4 pages publiques dupliquent chacune leur `<header>` et leur `<footer>` en dur dans leur template inline. | `/abonnement` sera la **5ᵉ** copie. Le « pied de page public » n'est pas UN fichier mais **4 fichiers** (§ 1, § 6). |

---

## 1. Où déclarer la route publique `/abonnement`, et quelles routes publiques servent de modèle

**Fichier : `chm-frontend/src/app/app.routes.ts`.**

Les routes publiques sont des routes **de premier niveau**, déclarées **avant** la coquille
authentifiée (`path: ''` + `canActivate: [authGuard, comptePretGuard]` + `children`, l. 68-72) et
avant le repli final `{ path: '**', redirectTo: '/dashboard' }` (l. 247).

Trois modèles exacts, à recopier (l. 21-34) :

| Modèle | Route | Garde | Chargement |
|---|---|---|---|
| `features/public/a-propos/a-propos.component.ts` | `a-propos` | **aucune** | `loadComponent` |
| `features/public/contact/contact.component.ts` | `contact` | **aucune** | `loadComponent` |
| `features/public/suggestions/suggestions.component.ts` | `suggestions` | **aucune** | `loadComponent` |

La landing (`path: ''`, l. 12-20) est la **seule** page publique sous `guestGuard` : elle renvoie
un utilisateur déjà connecté vers `/dashboard`. `CLAUDE.md` (l. 1065-1072) et l'en-tête de
`guestGuard` (`core/auth/auth.guard.ts`, l. 120-124) justifient explicitement que `a-propos`,
`contact` et `suggestions` n'en ont pas : « rien ne justifie de les cacher à quelqu'un déjà
connecté qui les atteint depuis un pied de page ».

**Déclaration à ajouter** (après `suggestions`, l. 34) :

```ts
{
  // Page publique de l'abonnement : aucun garde, y compris pour un compte
  // connecté (même règle qu'/a-propos, /contact, /suggestions).
  // ⚠️ Ne PAS confondre avec /mon-abonnement (onglet de Mon espace, dans la
  // coquille) : ici on vend, là on constate un état.
  path: 'abonnement',
  loadComponent: () => import('./features/public/abonnement/abonnement.component')
    .then(m => m.PageAbonnementComponent)
},
```

Trois pièges à ne pas commettre :

1. **Ne pas** la mettre dans les `children` de la coquille : elle exigerait alors `authGuard`
   (accès anonyme impossible — critère de fin C2) et s'afficherait avec la barre latérale.
2. **Ne pas** lui donner `guestGuard` : un membre connecté qui clique depuis `/mon-abonnement`
   serait renvoyé vers `/dashboard` au lieu de lire les tarifs.
3. **Nommer la classe autrement que `AbonnementComponent`** : `MonAbonnementComponent` existe
   déjà (`features/abonnement/mon-abonnement/`). `PageAbonnementComponent`
   (sélecteur `app-page-abonnement`) évite toute confusion dans les imports et les specs.

---

## 2. Comment le front appelle une API publique sans JWT — et quel service réutiliser

### 2.1 L'intercepteur n'empêche rien, mais il a un piège

`core/auth/auth.interceptor.ts` :

- **l. 65-70** — le Bearer n'est ajouté **que si un token existe** (`token ? withToken(req, token) : req`).
  Un visiteur anonyme part donc sans en-tête `Authorization`, et un endpoint `AllowAny` répond 200.
  Un visiteur *connecté* enverra son Bearer sur un endpoint `AllowAny` : sans effet (la permission
  ne lit pas l'identité).
- **l. 124-127** — sur **401**, l'intercepteur tente `AuthService.refreshToken()`.
  `auth.service.ts:171-175` : **sans refresh token en storage → `logout()`** ;
  `auth.service.ts:257-268` : `logout()` déconnecte **et `router.navigate(['/auth/login'])`**.
- **l. 79-122** — sur **403**, lecture du seul `code` machine (`core/auth/erreur-acces.ts`) ;
  `fonctionnalite_non_incluse` et `canal_desactive` ne naviguent pas.

**Conséquence opérationnelle, à écrire noir sur blanc dans le composant :** la page
`/abonnement` ne doit appeler **que** des endpoints `AllowAny` qui ne peuvent pas renvoyer 401.
Appeler `/api/abonnements/droits/` depuis cette page (tentant, puisque c'est là que vivent les
libellés A2) **éjecterait le visiteur anonyme vers `/auth/login`** : 401 → pas de refresh →
`logout()` → navigation. C'est le mode de défaillance le plus probable de cette tâche, et il ne
produirait aucune erreur visible en console de test.

### 2.2 Aucun service public n'existe ; `AbonnementService` est le bon point d'accroche

- `features/auth/services/onboarding.service.ts` est le **seul** client « public » existant
  (`POST /core/demandes-chorale/`, `POST /core/suggestions/`, invitations) : il ne couvre pas
  l'abonnement.
- `features/abonnement/services/abonnement.service.ts` porte déjà la base
  `private base` (concaténation de `environment.apiUrl` et de `/abonnements`) et n'a que deux méthodes :
  `charger()` (tenant, `/droits/`) et `changerEtat()` (opérateur).
- **Aucune page publique n'appelle l'API aujourd'hui** : `grep HttpClient features/public/` → 0.
  `/abonnement` est donc le **premier écran public avec un chargement réseau** — d'où l'exigence
  explicite du pack sur les trois états (§ 273).

**Recommandation** : ajouter à `AbonnementService` une méthode **sans état** :

```ts
/** Grille publique — lecture seule, aucune donnée de tenant, appelable en anonyme. */
tarifs(): Observable<TarifPlan[]> {
  return this.http.get<TarifPlan[]>(`${this.base}/tarifs/`);
}
```

Pourquoi ici plutôt qu'un nouveau service :
- même base d'URL, un seul client pour `/api/abonnements` (le dépôt n'a pas de client « par écran »
  ailleurs) ;
- **surtout** : ne rien stocker dans un signal. `droits`/`chargement`/`erreur` sont purgés au
  changement de tenant par `TenantContextService.purgerEtatApplicatif()` ; une grille tarifaire
  n'est pas une donnée de tenant et **ne doit pas** entrer dans cet état (sinon un tarif public
  serait purgé à chaque bascule, sans raison).

Alternative acceptable si l'on préfère ne pas toucher au service tenant : un
`features/public/abonnement/tarifs.service.ts` dédié. Les deux respectent la règle
« URLs API centralisées » : `environment.endpoints` n'a **pas** de clé `abonnements`
(`AbonnementService` concatène `/abonnements` en dur, comme avant) — ne pas en créer une
seulement pour cette page, ce serait deux conventions dans le même module.

### 2.3 Gestion d'erreur attendue dans le composant

```
chargement → squelettes discrets (pas de spinner plein écran)
vide ([]) → « Tarif sur demande » + contact (jamais une page cassée ni une erreur console)
erreur réseau/500 → carte d'erreur + « Réessayer » (modèle : mon-abonnement.component.html)
```
Le motif `subscribe({ next, error })` de `suggestions.component.ts:180-191` est le modèle local.
Aucun `throw` non capturé : le pack impose « pas d'erreur console » sur le cas `[]`.

---

## 3. Contenu exact de la page

Sections imposées par le pack (§ 268-270), dans cet ordre :

1. **Hero** — eyebrow « Abonnement », `.page-title`, `.page-subtitle`, un `.btn-primary`
   (« Nous écrire » → `mailto:` de `environment.contactEmail`) et un `.btn-secondary`
   (« Se connecter » → `/auth/login`). **Aucun bouton « Payer », aucun formulaire de commande**
   (arrêt propre du pack, § 291).
2. **Fonctionnalités Pro** — issues du registre A2 (`abonnements/registre.py::FONCTIONNALITES` :
   `sms`, `whatsapp`, `audio`, `planning_rappels`, `planning_recurrence`, `assiduite`,
   `finances`, `exports`), chacune avec `libelle` **et** `description` (les deux existent déjà
   côté serveur : `registre.py` les porte, `/droits/` n'expose que `libelle`). **Blocage B**
   ci-dessus : non lisible en anonyme aujourd'hui.
3. **Comparatif Standard / Pro** — 2 colonnes. La colonne « Pro » vient du registre (mêmes
   libellés). La colonne « Standard » **n'a aucune source serveur** : le noyau libre est décrit
   dans la docstring de `registre.py` (membres, présences, annonces, répertoire/partitions,
   notifications in-app, calendrier, événements et répétitions **uniques**, RSVP, pointage,
   2 séries récurrentes) mais **n'est pas une donnée exposée**. Il devra donc être écrit en dur
   côté front — duplication assumée du **noyau gratuit**, pas de la liste payante.
4. **Tarifs** — lus par `GET /api/abonnements/tarifs/`. Contrat réel (vérifié) :
   - `APIView` → **pas de pagination** (`StandardPagination` ne s'applique pas) : le corps est un
     **tableau JSON** nu (verrouillé par `test_tarifs.py::test_liste_accessible_en_anonyme`) ;
   - champs : `plan`, `periodicite`, `montant`, `devise`, `actif`, `quota_sms`,
     `quota_whatsapp` (`serializers.py::TarifPlanSerializer`) ;
   - `montant` est un `DecimalField` DRF **sérialisé en CHAÎNE** (`"15000.00"`) : aucun
     `COERCE_DECIMAL_TO_STRING` n'est posé dans `REST_FRAMEWORK` (`chm_config/settings.py:241`) ;
   - **aucun libellé de périodicité** n'est exposé (`periodicite` = code `mensuel`/`annuel`) ;
   - seules les lignes `actif=True` sortent, déjà ordonnées `(plan, periodicite)`.
   - Affichage : réutiliser **`shared/pipes/money.pipe.ts` (`appMoney`)** avec la devise du
     tarif : `{{ tarif.montant | appMoney:tarif.devise }}`. Le pipe accepte une chaîne, gère
     `NaN` (« — ») et retombe proprement sur `"1 200 XYZ"` si `Intl` ne connaît pas le code.
     **Ne pas réécrire un formateur.**
5. **Périodicités : « 6 mois » et « 1 an ».** ⚠️ La page doit afficher ce que l'API renvoie, code
   par code, avec un **repli = le code brut** (jamais masquer une ligne ni planter sur un code
   inconnu). Aujourd'hui l'API ne peut renvoyer que `mensuel`/`annuel` ; « 6 mois » suppose
   `semestriel` (§ 7.1).
6. **« 2 mois offerts » si annuel** — mention **éditoriale**, affichée seulement si une ligne
   `annuel` est active. **Ne pas la calculer** : avec P1 en placeholder `0`, tout calcul de
   pourcentage divise par zéro ; et « 2 mois offerts » n'a de sens que si `montant_annuel` vaut
   réellement 10/12 de 12 mois pleins (soit `2 × montant_semestriel > montant_annuel`). Tant que
   P1 n'est pas tranché, c'est une **promesse commerciale non vérifiable par le code** → à valider
   humainement, pas à déduire (§ 7.3).
7. **Moyens de paiement (P4)** — **texte seul**, aucune intention de paiement en ligne :
   virement bancaire, Mobile Money (T-Money, Flooz). Une constante unique dans le composant, pour
   qu'une correction orthographique (« T-Money » / « TMoov » / « Flooz ») n'exige pas de relire le
   template (§ 7.4).
8. **4 étapes d'activation** — (1) écrire à l'équipe, (2) confirmation du plan et de la
   périodicité, (3) règlement par un des moyens listés, (4) activation manuelle **sous 24 h
   ouvrées** (fait déjà acté par le pack § 84). Aucune promesse de délai plus courte.
9. **FAQ** — au minimum : bascule Pionnier → Standard au **31/12/2026** (backfill A1), **15 jours
   de grâce** (`abonnements/services.py`, `DUREE_GRACE_JOURS` = 15 ; `actif` → `grace` → `lecture_seule`),
   politique D4 : **noyau libre intact, aucune donnée supprimée** (`lecture_seule` ferme les
   écritures payantes, la lecture reste ouverte — `droits.py`), et « que se passe-t-il si je ne
   renouvelle pas ».
10. **Contact** — mêmes coordonnées que `/contact` : `environment.contactEmail` (l. 30-35 de
    `environment.ts`, avec l'avertissement « DOIT correspondre à `EMAIL_REPLY_TO_PLATEFORME` »).

**Texte à ne pas oublier** (garde-fous du pack) : la page ne dit jamais qu'un paiement est
possible en ligne, ni qu'un devis/reçu est généré, ni qu'un remboursement existe.

---

## 4. Points d'entrée — liste précise des fichiers à toucher

### 4.1 Pied de page public — **4 fichiers**, pas un

Il n'y a **pas** de pied de page partagé (constat C). Chaque page publique embarque le sien :

| Fichier | Ancre | Où insérer « Abonnement » |
|---|---|---|
| `chm-frontend/src/app/features/public/landing/landing.component.ts` | `<footer>` l. 463-513, nav « Informations » l. 486-492 | après `Contact` |
| `chm-frontend/src/app/features/public/a-propos/a-propos.component.ts` | l. 167-180 | dans la nav (Accueil / Contact / Suggestions / Se connecter) |
| `chm-frontend/src/app/features/public/contact/contact.component.ts` | l. 122-136 | idem |
| `chm-frontend/src/app/features/public/suggestions/suggestions.component.ts` | l. 137-151 | idem |

⚠️ Les trois navs courtes ne listent **pas les mêmes liens** (contact n'a pas « Contact »,
a-propos n'a pas « À propos »…) : recopier la ligne au bon endroit, ne pas « harmoniser » au
passage (ce serait un diff inutile sur trois pages validées).

Le lien est un `<a routerLink="/abonnement" class="text-text-muted hover:text-primary-700 transition-colors">Abonnement</a>`
dans les navs courtes, et `class="text-text-main hover:text-primary-700 transition-colors"` dans la
colonne « Informations » de la landing (c'est la classe des autres liens de cette colonne).

### 4.2 `/mon-abonnement` — bouton « Comment passer en Pro ? »

- `chm-frontend/src/app/features/abonnement/mon-abonnement/mon-abonnement.component.html` :
  remplacer le dernier paragraphe (« Pour faire évoluer votre abonnement, rapprochez-vous de
  l'équipe de la plateforme. ») par le même texte **+** un
  `<a routerLink="/abonnement" class="btn btn-secondary btn-sm mt-3">Comment passer en Pro ?</a>`,
  ou une petite carte CTA après la section « Fonctionnalités verrouillées ». **Ne pas** toucher
  l'en-tête (eyebrow / `page-title` / `page-subtitle`) : il est fourni par `ProfilComponent`
  (`profil.component.ts`, l. 85-92) et B3 doit pouvoir poser son bloc consommation sans le réécrire.
- `chm-frontend/src/app/features/abonnement/mon-abonnement/mon-abonnement.component.ts` :
  ajouter `RouterLink` aux `imports` (`imports: [DatePipe, LucideAngularModule]` aujourd'hui — le
  lien ne compilerait pas).
- ⚠️ `mon-abonnement.component.spec.ts:86` verrouille `not.toMatch(/payer|paiement|XOF|€|\$/i)` :
  le libellé du bouton doit rester **« Comment passer en Pro ? »** (aucun mot de la famille
  « paiement »), sinon un test existant tombe.

### 4.3 Encart 403 `fonctionnalite_non_incluse`

- `chm-frontend/src/app/shared/components/refus-abonnement/refus-abonnement.component.ts` —
  **les deux branches** : pleine page (l. 89-92) et encart (l. 106-110). Aujourd'hui un seul lien
  « Voir mon abonnement » → `/mon-abonnement`. Ajouter, à côté, un second lien
  « En savoir plus sur l'abonnement » → `/abonnement` (**sans montant ni lien de paiement**).
- `chm-frontend/src/app/shared/components/refus-abonnement/refus-abonnement.component.spec.ts` —
  ajouter l'assertion `a[href="/abonnement"]` (les deux branches).
- **Rayon d'action** : ce composant est utilisé en **9 endroits** (finances ×2, rapports ×2,
  `profil` (Cotisations), membres, musique, presences-analytique). Le lien apparaîtra partout —
  c'est bien ce que demande le pack, mais c'est un diff à effet large, à annoncer en PR.

---

## 5. Cas « aucun tarif actif » et « montant à 0 »

Consigne humaine : **« tarif sur demande » si l'API renvoie 0 ou une liste vide.** Traduction
technique exacte :

| Cas | Réponse de l'API | Affichage imposé |
|---|---|---|
| Aucune ligne active | `[]` (200) | **Une** carte « Tarif sur demande » à la place de la grille + le contact. **Aucune erreur**, aucun message technique, rien en console. La page reste complète (fonctionnalités, comparatif, étapes, FAQ). |
| Ligne présente, `montant` = `"0.00"` | `[{...,"montant":"0.00"}]` | Sur **cette** ligne : le libellé de périodicité reste affiché, le montant devient **« Tarif sur demande »**. Ne pas afficher « 0 F CFA » (le pipe `appMoney` afficherait `0` : le test doit précéder le formatage). |
| Mélange (une ligne à 0, une non) | `[…]` | Traitement **par ligne** : une ligne réelle, une « sur demande ». |
| Erreur réseau / 500 | — | Carte d'erreur + « Réessayer » (état distinct du cas vide : ne pas confondre « pas de tarif publié » et « serveur injoignable »). |
| `montant` non numérique | hypothèse | Repli « Tarif sur demande » (le pipe rendrait « — » ; ici on veut un mot, pas un tiret). |

**Implémentation** : normaliser en un `computed` unique

```ts
readonly surDemande = (t: TarifPlan) => !Number.isFinite(Number(t.montant)) || Number(t.montant) === 0;
```

et un `computed` de repli global pour `tarifs().length === 0`. Une seule règle, testée deux fois
(liste vide, montant 0), plutôt que deux `@if` dispersés dans le template.

---

## 6. Existe-t-il un composant de mise en page publique réutilisable ?

**Non.** Aucun `public-layout`, aucun `PublicShell`, aucun `app-public-header` : le dossier
`features/public/` ne contient que les 4 composants de page, chacun avec sa copie inline du
`<header>` (marque « Chœur » + badge « 2.0 » + liens) et du `<footer>`.

Ce qui **n'est pas** réutilisable :
- `layout/main-layout/main-layout.component.ts` : coquille **authentifiée** (barre latérale,
  sélecteur de chorale, cloche, `authGuard`) — l'utiliser sur une page publique imposerait une
  session.

Ce qui **est** réutilisable (classes globales de `src/styles.css`, déjà employées par
`contact`/`a-propos`/`suggestions`) :

| Classe / outil | Verdict | Preuve |
|---|---|---|
| `.eyebrow`, `.page-title`, `.page-subtitle`, `.section-title` | **oui, tel quel** | `styles.css` l. 248-280 ; déjà utilisés l. 49-51 de `contact` |
| `.card` (+ `.card-pin/gold/coral/ink`), `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-sm`/`.btn-lg`, `.badge`, `.staff-rule` | **oui, tel quel** | `styles.css` l. 348+ ; déjà utilisés par les 3 pages |
| `.input`, `.field`, `.label` | oui (si un formulaire apparaissait — hors périmètre) | idem |
| **`.page-shell`** | **NON** | `styles.css` l. 1564-1572 : `max-width: 104rem`, et les **gouttières viennent uniquement de `.shell-content`** (l. 1533-1549), qui n'existe que dans la coquille. Sur une page publique, `.page-shell` donnerait une colonne de 1664 px **sans aucun padding**. |
| Largeur publique | à recopier | `mx-auto w-full max-w-4xl px-5 sm:px-8` (contact/a-propos/suggestions). Pour un tableau de tarifs + comparatif, `max-w-5xl` reste cohérent (la landing utilise `max-w-6xl`). |
| `MoneyPipe` (`appMoney`) | **oui** | `shared/pipes/money.pipe.ts` : accepte `number|string|null`, devise en paramètre, `try/catch` Intl |
| Icônes | à compléter | `src/app/icons.ts` est **l'unique** liste. Présents : `CheckCircle`, `Lock`, `Award`, `Mail`, `Banknote`, `ArrowRight`, `LoaderCircle`, `AlertCircle`, `HelpCircle`. **Absents** : `Smartphone` (Mobile Money), `CreditCard`. Toute icône utilisée doit y être ajoutée sous peine d'échec **runtime** seulement. |

**Recommandation** pour C2 v1 : **dupliquer** header/footer dans le nouveau composant (comme les 4
pages existantes). Extraire un `PublicLayoutComponent` toucherait 3 pages validées + la landing
dans la même livraison, pour un gain nul côté utilisateur. À inscrire comme **dette** explicite
(5ᵉ copie) et lot de suivi séparé — fichiers concernés le jour où on le fera :
`features/public/public-layout/public-layout.component.ts` (nouveau) + les 5 pages.

---

## 7. Risques et dépendances

### 7.1 🔴 BLOQUANT — P2 « 6 mois + 1 an » n'est pas représentable (dépendance C1)

- `abonnements/models.py:290-292` : `Periodicite` = `MENSUEL` (`"mensuel", "Mensuel"`) et
  `ANNUEL` (`"annuel", "Annuel"`). **Rien d'autre.**
- `abonnements/migrations/0005_tarifplan.py:19` : les `choices` sont figés dans la migration.
- `abonnements/management/commands/gerer_abonnement.py:74-78` : `MOIS_PAR_PERIODICITE` ne mappe
  que 1 et 12 mois.
- L'API n'expose **aucun** libellé de périodicité (seulement le code).

Trois issues, à trancher **avant** la Phase 2 :
1. **(recommandée)** Amender C1 : `SEMESTRIEL = "semestriel", "6 mois"` + migration `0006`
   (AlterField, sans perte) + une entrée `semestriel: 6` dans `MOIS_PAR_PERIODICITE` + les tests
   du modèle. Change 4 fichiers backend, aucun contrat cassé (valeur additive). La page affiche
   alors `semestriel` → « 6 mois ».
2. Faire exposer par le backend un `periodicite_libelle`
   (`serializers.CharField(source="get_periodicite_display", read_only=True)` sur
   `TarifPlanSerializer`) — additif, mais c'est un fichier **C1** : « Tout besoin de modifier
   `TarifPlan` : STOP, signaler » (arrêt propre C2, § 292). À valider.
3. Garder `mensuel`/`annuel` et considérer P2 comme non tranché → la page n'affiche que ce que
   l'API donne (donc **jamais « 6 mois »**). Aucun code à écrire, mais la consigne humaine n'est
   pas honorée.

Quoi qu'il arrive : **le front ne doit pas inventer de libellé de périodicité**. Soit il mappe
`{ mensuel: 'Mensuel', annuel: 'Annuel', semestriel: '6 mois' }` avec **repli sur le code brut**,
soit il reçoit le libellé du serveur (option 2).

### 7.2 🔴 BLOQUANT — le registre A2 n'est pas lisible en anonyme

- `abonnements/views.py:51` : `DroitsChoraleView.permission_classes = [EstMembreDuTenant]`.
  `core/permissions.py:145-147` : `if not request.user.is_authenticated: return False` → DRF
  `permission_denied` sur un `APIView` sans authentifiant réussi → **401** (pas 403), donc
  l'intercepteur tente un refresh et **éjecte** le visiteur (cf. § 2.1).
- Le pack (l. 233, 242) suppose que `/droits/` « expose déjà » les fonctionnalités Pro à la page
  publique : **c'est faux en l'état**.
- Le pack interdit par ailleurs (§ 5, l. 85-87) de dupliquer dans le front la liste des
  fonctionnalités payantes : « `Fonctionnalite.PRO` (registre A2) est la source unique des
  fonctionnalités listées comme payantes sur la page publique — pas de duplication dans le front ».

Options :
1. **(recommandée)** Petite vue publique additive :
   `GET /api/abonnements/fonctionnalites/` → `AllowAny`, lecture seule, itère
   `registre.FONCTIONNALITES` et rend `{code, libelle, description, nature}` (jamais
   `plan_minimal` : inutile). Fichiers : `abonnements/views.py`, `abonnements/urls.py`, nouveau
   test, **plus une entrée dans `core/tests/test_garde_permissions.py::ALLOWLIST`** (l. 65-119,
   avec sa raison écrite — la garde refuse sinon un `AllowAny` non justifié, exactement comme
   `TarifListView` l. 98-101). C'est du backend **hors périmètre déclaré** de C2 : à valider,
   mais ça ne touche ni `services.py`, ni `TarifPlan` (les deux seuls arrêts propres).
2. Étendre le corps de `/tarifs/` avec la liste des fonctionnalités — modifie le contrat C1 :
   **STOP** (arrêt propre).
3. Liste en dur dans le front — viole le § 5 et la règle « source unique ». À éviter, même
   temporairement : c'est exactement le genre de doublon qui diverge silencieusement.

Décision par défaut si rien n'est tranché : **ne pas livrer la section « fonctionnalités Pro »**
plutôt que la livrer fausse ou dupliquée ? Non — la page serait vide de son contenu principal.
Il faut donc trancher (§ 9, question 1).

### 7.3 🟠 « 2 mois offerts » est une promesse, pas une donnée

Rien dans le dépôt ne contient cette mention (seul le pack, l. 68). Elle n'est vraie que si les
montants la respectent. Avec P1 en placeholder `0`, tout calcul dériverait (division par zéro) et
afficherait « économisez NaN % ». **Décision** : mention éditoriale statique, conditionnée à la
présence d'une ligne `annuel` active, et **vérifiée une fois P1 tranché** par un contrôle humain
(ou par un test de cohérence si l'on veut la garantir : `2 × montant_semestriel ≥ montant_annuel`).
À noter : si P2 = « 6 mois + 1 an », « 2 mois offerts » se mesure par rapport à **deux semestres**
(12 mois), pas par rapport à un mensuel qui n'existera plus.

### 7.4 🟠 P1 — montant non tranché (placeholder 0)

Traité au § 5. Conséquence de conception : **la page doit être juste et belle avec une grille à
0 €**, puisque c'est l'état de recette probable. C'est ce cas que le test doit verrouiller, pas
le cas « 15 000 XOF » qui n'existera peut-être jamais avant la mise en marché.

### 7.5 🟠 P4 — moyens de paiement non tranchés

Virement, T-Money (Togocom), Flooz (Moov) : **texte seul**, aucune icône cliquable, aucun lien
sortant, aucun QR. Les noms d'opérateurs évoluent (T-Money/Moov Money) : une **constante unique**
dans le composant, pas trois occurrences dans le template.

### 7.6 🟡 P5 — langue de la page

Hypothèse retenue : **FR uniquement**, cohérent avec `/contact`, `/a-propos`, `/suggestions` et
`LandingComponent`. Aucune infrastructure i18n n'existe dans le front (`grep` : pas de
`@angular/localize`, pas de fichier de traduction) : un bilingue serait un chantier à part
entière, pas une option de cette page.

### 7.7 🟡 Risques techniques transverses

- **Dette de duplication** (constat C) : 5ᵉ header + 5ᵉ footer, et le lien de pied de page doit
  être ajouté **4 fois**. Si l'un des quatre est oublié, aucun test ne le voit → proposer un test
  de fumée `app.routes.spec.ts` + une assertion textuelle sur `/abonnement` dans chaque footer
  serait disproportionné ; s'en tenir à un **contrôle manuel listé** dans la PR.
- **Icônes** : ajouter les noms dans `src/app/icons.ts` (`Smartphone` si Mobile Money,
  `CreditCard` si carte). Oubli = build vert, écran cassé à l'exécution.
- **401 piégé** (§ 2.1) : tout futur ajout d'appel tenant sur cette page déconnecte les visiteurs.
  Écrire l'interdit en commentaire dans le composant.
- **Deux conventions d'URL** : `environment.endpoints` n'a pas de clé `abonnements` ;
  `AbonnementService` concatène `/abonnements`. Ne pas introduire une clé pour une seule méthode.
- **`mon-abonnement.component.spec.ts:86`** interdit « payer|paiement|XOF|€|$ » dans le texte de
  l'onglet : le CTA doit rester « Comment passer en Pro ? ».
- **Protocole sous-modules** : la livraison C2 touche **exclusivement** `chm-frontend/` (plus
  `CLAUDE.md` à la racine) → deux commits distincts (sous-module, puis pointeur au superprojet),
  hook `make hooks` actif. `CLAUDE.md` doit être mis à jour **dans la même livraison** (§ Frontend :
  la liste `features/public/` et la mention « `/abonnement` publique »).
- **Contenu éditorial à faire valider** : 24 h ouvrées, « 2 mois offerts », noms des opérateurs,
  date de bascule 31/12/2026 — autant de phrases que le code ne peut pas vérifier.

---

## 8. Découpage proposé (5 étapes)

**E0 — Décisions (humain, avant tout code).** Trancher : (a) périodicité `semestriel` ou grille
existante ; (b) registre A2 public (option 1 du § 7.2) ou repli ; (c) formulation « 2 mois
offerts » ; (d) moyens de paiement. Sans (a) et (b), E2 ne peut pas afficher une grille ni des
fonctionnalités justes.

**E1 — Socle front (aucune dépendance aux décisions).** `AbonnementService::tarifs()`,
route `/abonnement` dans `app.routes.ts` (+ test `app.routes.spec.ts` : route de premier niveau,
`canActivate` absent), composant coquille avec hero + états chargement/vide/erreur, icônes
ajoutées. Test : rendu anonyme, `[]` → « Tarif sur demande », pas d'erreur console.

**E2 — Contenu.** Fonctionnalités Pro (selon E0-b), comparatif Standard/Pro, grille tarifaire
(`appMoney` + règle `0` → « Tarif sur demande », libellés de périodicité avec repli sur le code),
4 étapes, FAQ (Pionnier/31-12-2026/15 j/D4), contact. Test : `montant = "0.00"` → « Tarif sur
demande » ; deux lignes (6 mois / 1 an) rendues dans l'ordre de l'API.

**E3 — Points d'entrée.** 4 pieds de page + CTA `/mon-abonnement` (html + `RouterLink`) + double
lien dans `refus-abonnement.component.ts`. Tests : `a[href="/abonnement"]` dans l'encart et en
pleine page ; `mon-abonnement.component.spec.ts` toujours vert (aucun mot « paiement »).

**E4 — Clôture.** `CLAUDE.md` (§ Frontend : `features/public/` + page publique ; § Abonnement :
la page et son point d'entrée), `ng build` sans avertissement nouveau, `npm test` vert, contrôle
manuel des 4 footers, commit sous-module puis pointeur superprojet.

---

## 9. Questions à trancher avant la Phase 2

1. **Périodicité** : ajoute-t-on `semestriel` (« 6 mois ») à `TarifPlan.Periodicite` (amendement
   C1, migration `0006`, + `MOIS_PAR_PERIODICITE`), ou la page n'affiche-t-elle que
   `mensuel`/`annuel` ? *Sans réponse, la page ne peut pas promettre « 6 mois ».*
2. **Registre A2 public** : autorise-t-on une vue `AllowAny` `GET /api/abonnements/fonctionnalites/`
   (backend, + allowlist `test_garde_permissions`), ou accepte-t-on une liste en dur dans le front
   (contraire au § 5 du pack) ? *Sans réponse, la section « fonctionnalités Pro » n'a pas de source.*
3. **« 2 mois offerts »** : mention éditoriale figée (à vérifier une fois P1 tranché) ou calculée
   (interdit tant que P1 = 0) ?
4. **P4** : la liste exacte des moyens de paiement à écrire (libellés des opérateurs) — texte seul.

---

**STOP.** Phase 2 non entamée. Aucun composant créé, aucun fichier de code touché, aucune route
déclarée. En attente d'une validation humaine citant ce rapport.
