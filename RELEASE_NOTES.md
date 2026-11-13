# Notes de version — ChoirManager

## `v2.7.0` — communications, exports serveur, cloche & thème

Date : 13 novembre 2026

### Communications opérateur

- Centre `/operateur/communications` : onglets **SMS | E-mail | WhatsApp**,
  filtres (période, statut, chorale, destinataire), résumé, stats par chorale,
  détail, **export CSV** par canal.
- Nouveau journal `NotificationEmail` (destinataire, sujet, gabarit, statut,
  erreur expurgée), écrit best-effort par `_envoyer_email`.

### Exports serveur et impression unifiée

- Les listes (membres, répertoire, caisse, cotisations, assiduité) sont
  exportées **par le serveur** (`?export=csv|pdf`), sur la **liste complète
  filtrée/triée** — plus de générateur PDF dans le navigateur.
- Générateur de document **unifié** (rapports + listes) : une seule palette
  « Papier & scène », un en-tête, un pied de page, un CSV à formules
  neutralisées. Fin de l'ancienne palette violette.
- Exports gatés `exports` (403 `fonctionnalite_non_incluse`, encart local).

### Mise en page

- **Padding standardisé sur toutes les pages** (utilisateurs ET opérateur) :
  les gouttières viennent de `.shell-content`, légèrement augmentées ; le cas
  spécial qui limitait l'élargissement à l'administration est supprimé.
- `page-shell` généralisé (écrans opérateur inclus).

### Cloche et thème

- **Cloche de notifications** : panneau déroulant (récentes, lu / non lu,
  « tout marquer comme lu », lien contextuel), la page `/notifications` reste.
- **Thème clair / sombre / système** persisté, défaut système, sélecteur dans
  le menu compte.

### Validation

- **1099 tests backend PostgreSQL**, **392 tests frontend**, build vert.

---

## `v2.6.0` — design, exports et assiduité payante

Date : 13 novembre 2026

### Design et impression

- Largeur utile unifiée (`.page-shell`), gouttières réduites en web, mobile
  préservé : les rapports et les autres pages ont la même largeur.
- Fiche d'impression refaite : en-tête de document, A4, en-tête de tableau
  répété, lignes insécables, contrôles masqués.
- KPI financiers bornés (plus de débordement des montants).

### Listes, exports et vues

- Exports **CSV, PDF et impression** de la liste complète des membres (tri
  nom/pupitre respecté) et des morceaux.
- Bascule **liste/grille** mémorisée sur les membres et les chants.
- Journal de caisse en pleine largeur ; aperçu des campagnes déplacé sous le
  journal.

### Onglets et navigation

- Brique partagée `section-nav` (onglets + fil d'Ariane, `role=tablist`,
  focus visible, 44 px).
- Présences : **Pointage / Permissions / Assiduité** ; Mon espace :
  **Infos / Sécurité / Cotisations / Présences / Mon abonnement**.
- `/statistiques` et `/mon-abonnement` restent des liens profonds valides.

### Planning et assiduité

- Gratuit : calendrier, événements et répétitions uniques, RSVP, pointage.
- Payant : séries récurrentes au-delà de **2 séries actives** en `libre`
  (illimité en `pro`), assiduité (analytique), exports, rappels.
- Répétitions **uniques ou récurrentes** créables directement depuis le
  pointage (répétitions uniquement).
- Refus `limite_planning_atteinte` avec message exact ; séries existantes
  grand-pérées.

### SMS opérateur

- Numéros normalisés **E164 sans `+`** (`+228 98 66 04 36` →
  `22898660436`), validés par pays.
- `NotificationSMS` enrichi (numéro normalisé/origine, fournisseur, statut,
  message_id, réponse expurgée).
- Écran `/operateur/sms` : résumé, filtres (période, statut, chorale, numéro),
  pagination, détail.

### Validation

- **1040 tests backend PostgreSQL**, **358 tests frontend**, build vert.

> **Libellé :** le plan historiquement appelé « Libre » s'affiche désormais **« Standard »** partout (le code interne `libre` reste inchangé, aucune migration de données).

---

## `v2.5.0` — abonnement par chorale et console opérateur

Date : 12 novembre 2026

### Abonnement et verrou serveur

- **Un abonnement par chorale** (relation 1:1), avec un historique append-only
  des transitions. Un service unique écrit `plan`/`statut` ; toute écriture
  directe est refusée à l'exécution et détectée par un test structurel.
- Plans `libre`, `pro`, `pionnier`. Toutes les chorales existantes passent en
  `pionnier` jusqu'au **31/12/2026**, puis `libre` ; le délai de grâce de
  15 jours s'applique avant la `lecture_seule`. `Chorale.is_active=False`
  (suspension) prime sur l'abonnement.
- **Registre de fonctionnalités à défaut fermé** : SMS, WhatsApp, audio,
  rappels programmés, exports et **toute la finance** (y compris le rapport
  financier JSON) sont payants. En `libre`, lecture et écriture sont refusées ;
  en `lecture_seule`, seule l'écriture tombe.
- Refus `403 fonctionnalite_non_incluse`, distinct de `role_insuffisant` et
  `sans_tenant_actif`. Les tâches planifiées sautent proprement et journalisent.
- Écran « Mon abonnement » en lecture seule pour le Bureau, cadenas de menu,
  gestion du plan par l'opérateur.

### Console opérateur

- **Tableaux de bord globaux** : KPI, séries temporelles, vue par chorale et
  par utilisateur, effets (notifications, SMS, WhatsApp). Télémétrie complétée
  (`planning`, `notifications`, exports, téléchargements de médias).
- **Mode assisté tracé** : session serveur dédiée (réauthentification,
  60 min absolues / 15 min d'inactivité), console de lecture complète, aucune
  prise de rôle de bureau, aucun JWT réémis.
- **Actions de correction** : renvoyer une invitation, corriger email/téléphone,
  corriger les montants (mouvement, cotisation, paiement), créer/clôturer un
  mandat, modifier un poste et ses groupes. Motif obligatoire, avant/après
  structuré, une seule ligne d'audit par action.
- Fermeture de l'accès global implicite de l'opérateur aux ViewSets métier.

### Diffusion opérateur et rappels d'échéance

- **Diffusion** (app `diffusion/`) : l'opérateur compose une annonce pour
  **toutes** les chorales, un **groupe** (plan ou sélection) ou **une seule**.
  E-mail par défaut, SMS et WhatsApp en option. Les destinataires sont résolus
  par chorale — e-mail de contact, repli sur le premier responsable ; téléphone
  du responsable, repli sur le téléphone de la chorale. Prévisualisation avant
  envoi, compte-rendu par canal, historique consultable, audit.
- **Rappels d'échéance** : `manage.py rappeler_echeances_abonnement
  --jours 30,7 [--dry-run]`, idempotent, notifie le Bureau à J-30 et J-7 avec
  le plan, la date et un lien vers `/mon-abonnement`.

### Navigation

- Rail à **4 groupes** et hub `/administration` ; barre d'onglets et fil
  d'Ariane sur les six écrans de gestion ; feuille mobile raccourcie. Les URL
  existantes et les gardes sont inchangées.

### Validation

- **989 tests backend PostgreSQL** (dont concurrence des transitions et des
  corrections), **307 tests frontend**, build de production vert.
- Migration exercée sur une **copie du dump de production** : 11 chorales →
  11 abonnements, tous `pionnier`/`actif` au 31/12/2026, migration inverse puis
  ré-application vérifiées.
- Test fonctionnel local de bout en bout : ajout de valeurs, événement, verrou
  finance, paiement, session assistée et actions.

---

## `v2.4.0` — listes de sélection par tenant

Date : 12 novembre 2026

Les choix qui relèvent de la vie de chaque chorale ne demandent plus un
déploiement : types de rendez-vous, catégories de pupitre, styles de chant,
types de campagne et modes de paiement sont désormais des listes propres au
tenant, semées avec les valeurs historiques et éditables depuis
« Structure → Listes & configuration ».

- socle `core.Liste` / `core.ValeurListe`, API scopée tenant, seed idempotent
  (migration `core/0010`) et commande `seed_listes` ;
- pilote : types d'événement (y compris les séries) et catégories de pupitre,
  avec `Pupitre.actif` ; badges et chips du planning reprennent les couleurs
  de la liste ;
- styles de chant, types de campagne et modes de paiement validés contre les
  listes du tenant ; `PaiementCotisation.mode_paiement` (migration
  `finances/0007`) n'est plus recopié dans `notes` ;
- correctif : la liste des paiements (`GET /api/finances/paiements/`) renvoyait
  une 500 `FieldError` — elle filtre désormais la chorale via
  `cotisation__chorale`, avec un test de non-régression.

Validation : **677 tests backend réussis (6 ignorés)**, **217 tests frontend
réussis**, build Angular de production vert. Validé en local sur la pile
complète (PostgreSQL, API de bout en bout, front servi) avant release.

---

## `v2.3.0` — cartes du répertoire et aperçu de partition

Date : 12 novembre 2026

Les cartes du répertoire lisent désormais les mêmes données que la fiche du
chant : dernier statut d'apprentissage réel et compteurs séparés des
partitions et audios actifs issus de `MediaChant`. Elles ne retombent plus
silencieusement sur « À travailler » quand le statut est absent, ne comptent
plus l'ancien modèle `Partition`, et ignorent les médias ou répétitions placés
à la corbeille.

L'aperçu PDF intégré est de nouveau autorisé par la CSP avec la directive
ciblée `frame-src 'self' blob:`. Le reste de la politique demeure inchangé :
les objets embarqués restent interdits et les pages ne peuvent toujours pas
être intégrées par un site tiers (`frame-ancestors 'none'`).

Validation : **664 tests backend réussis (6 ignorés)**, **214 tests frontend
réussis**, build Angular de production vert.

---

## `v2.0.1` — correctifs de recette

Date : 11 novembre 2026

**Statut : correctifs sur la branche `feat/v2-refonte`, non tagués, non
déployés.** Cette passe corrige les anomalies constatées en test manuel de la
v2.0.0.

### Médias du répertoire

- **Partition en page blanche / audio muet / téléchargement vide** : en
  développement sans Nginx (`ng serve` + `runserver`), personne n'honore
  `X-Accel-Redirect` ; Django renvoyait donc un corps vide. `MEDIA_PROTEGE_
  SERVIR_DIRECT` (actif seulement quand `DJANGO_DEBUG=True`) sert désormais le
  fichier depuis Django ; en production, Nginx seul le sert, inchangé.
- **Consultation de partition** : remplace le `window.open` post-fetch
  (bloqué par les bloqueurs de pop-ups, d'où l'onglet blanc) par une **modale
  d'aperçu** avec iframe `blob:` et bouton de téléchargement.
- **Téléchargement** : garde explicite sur un blob vide (échec visible au lieu
  d'un fichier de 0 octet) et extension déduite du type serveur si le MIME est
  absent.
- **Dépôt par le bureau** : le bureau peut désormais déposer/modifier les
  médias d'un chant, comme le maître de chœur ; les médias coexistent
  (partition + audio) au lieu de se remplacer.

### Profil, séances, structure

- **« Mon espace » d'un bureau / maître de chœur** : le serveur refusait
  `partage_contact` sur sa propre fiche (400 « seule la personne concernée… »).
  La validation autorise maintenant l'auto-édition ; téléphone vide accepté,
  photo comprise.
- **Résumé de séance** : le champ `resume` manquait du sérialiseur de LISTE —
  il était bien enregistré mais disparaissait au rechargement.
- **Pupitres** : l'interface lisait `membres_count` alors que l'API expose
  `nombre_membres` → tous les compteurs affichaient 0.
- **Filtre « Sans pupitre »** ajouté à la liste des membres.
- **Organigramme** : présentation en **bandes compactes par famille de postes**
  (bureau, direction, technique) au lieu d'une longue liste de cartes.

### Export PDF, admin et nommage

- **Export PDF** : commande `manage.py verifier_pdf` (+ `make verif-pdf`) qui
  diagnostique WeasyPrint et affiche le remède exact (Docker/Linux ou runtime
  GTK Windows + `WEASYPRINT_DLL_DIR`) ; message 503 enrichi ; procédure
  reproductible dans [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) § 11. Le
  chemin standard `C:\Program Files\GTK3-Runtime Win64\bin` est **détecté
  automatiquement** côté Django : installer GTK suffit sur un poste Windows
  standard. Vérifié sur ce poste : les 4 rapports sortent en
  `application/pdf` (11–14 Ko, en-tête `%PDF`).
- **Admin Django** : la connexion en développement échouait en 403 CSRF
  (`Origin checking failed`). Les origines de dev (4200/8000) sont ajoutées à
  `CSRF_TRUSTED_ORIGINS` et un middleware **de développement seulement**
  normalise `Origin: null` envoyé par certains aperçus embarqués.
- **Nommage** : l'interface utilise « **Chœur** » partout (marque d'usage) ;
  « ChoirManager » reste le nom du produit et du dépôt, expliqué dans le
  README. Les pieds de page mélangeaient encore les deux.

### Validation

- Backend : `602 tests réussis, 6 ignorés`.
- Frontend : `196 tests réussis`.
- Recette navigateur (Chrome headless) : aperçu de partition en modale
  (`blob:`), photo de profil rechargée, connexion admin Django réussie,
  compteurs de pupitres corrects, résumé de séance relu après rechargement.

---

## `v2.0.0` — « Chœur », refonte visuelle et sécurité by design

Date de préparation : 11 novembre 2026

**Statut : version préparée sur la branche `feat/v2-refonte` (superprojet et
sous-modules), tag non posé, non déployée.** La production reste sur `v1.7.0`.

Cette version est une **majeure** : elle ne se contente pas d'ajouter des
écrans, elle remplace l'identité visuelle, referme une partie des chantiers de
sécurité connus et livre des fonctions attendues de longue date. Le périmètre
technique reste Django REST + Angular 21 ; le langage de marque devient
**« Chœur » (ChoirManager 2.0)**.

### 1. Refonte visuelle complète — « Papier & scène »

Nouvelle direction artistique, documentée dans
[docs/DESIGN_V2.md](docs/DESIGN_V2.md) et vérifiée par captures dans
[docs/captures/](docs/captures/) :

- **Design system réécrit** : palette vert pin / corail terre cuite / ivoire /
  encre chaude, typographie éditoriale **Fraunces** (titres, chiffres) et
  **Inter** (interface) **auto-hébergées** — plus aucune requête vers Google
  Fonts, donc compatible avec la CSP stricte ; rayons, ombres, badges, champs,
  tableaux, modales, skeletons et états vides restylés.
- **Coquille inédite** : rail latéral repliable (260 → 80 px, préférence
  mémorisée), carte de chorale, navigation groupée avec indicateur corail,
  barre supérieure avec fil d'Ariane et **palette de commandes `Ctrl/⌘ K`**,
  barre inférieure mobile à cinq destinations dont un bouton de pointage
  surélevé.
- **Écrans refondus** : page publique d'accueil éditoriale (aperçu produit
  dessiné en CSS, sans image), connexion en split éditorial, tableau de bord
  hiérarchisé (prochaine répétition, anneau d'assiduité, caisse, cotisations,
  agenda, activité), liste et fiche membres, structure, import Excel, séances
  et **pointage mobile à grandes zones tactiles**, répertoire et lecteur média,
  finances (solde, graphique, journal), cotisations, annonces, notifications,
  rapports imprimables, espace opérateur, profil.
- **Cohérence** : une seule échelle typographique, des libellés français, des
  états chargement/vide/erreur explicites sur chaque écran, focus visible,
  contrastes AA et respect de `prefers-reduced-motion`.

### 2. Audit de sécurité et correctifs

Rapport complet : [docs/AUDIT_SECURITE_V2.md](docs/AUDIT_SECURITE_V2.md)
(30 constats : 3 critiques, 9 élevés, 12 moyens, 6 faibles ; 4 faux positifs
écartés, 8 corrigés pendant l'audit).

Correctifs livrés :

- **CSP stricte et en-têtes de sécurité** sur les documents HTML (Nginx) et
  sur toutes les réponses Django (middleware) : `default-src 'self'`,
  `script-src 'self'`, `frame-ancestors 'none'`, COOP/CORP,
  `Referrer-Policy`, `Permissions-Policy` ; l'admin Django a été rendu
  compatible (script inline externalisé, polices système).
- **JWT révocable après changement de mot de passe** (`CHECK_REVOKE_TOKEN` via
  claim `pwdv` salé) : la fenêtre résiduelle de 30 minutes tombe à zéro.
- **Déconnexion réellement révoquante** : le front appelle enfin
  `POST /auth/logout/` avant d'effacer le stockage — un refresh copié ne reste
  plus valide 7 jours.
- **Injection de formule CSV** neutralisée sur les exports de rapports et le
  journal d'audit ; échappement HTML des rendus WeasyPrint vérifié.
- **Fuite cross-tenant du pointage** fermée : un `membre_id` d'une autre
  chorale est désormais refusé.
- **`DJANGO_SECRET_KEY=change-me` refusé hors développement** (les
  placeholders documentés ne sont plus des secrets acceptés).
- **Données personnelles** : le CSV de membres réels n'est plus suivi par Git
  (`git rm --cached`, procédure de purge d'historique dans le rapport) ;
  l'adresse email personnelle codée dans le bundle et celle du script d'alerte
  ops sont sorties du code.
- **Ops/CI** : cookies `Secure` forcés en production, `no-new-privileges`,
  `FRONTEND_BIND=127.0.0.1`, dumps `umask 077`, email d'alerte en variable
  d'environnement, mot de passe du smoke test aléatoire et nettoyé,
  `permissions: contents: read` + audit `pip-audit`/`npm audit` en CI.

### 3. Améliorations produit et exploitation

- **Portabilité des données (RGPD)** : `manage.py export_chorale --chorale <id>
  --sortie <fichier.json>` produit un export JSON complet et journalisé du
  tenant, sans aucun secret.
- **Observabilité** : `X-Request-ID` accepté/émis sur chaque réponse, corrélé à
  un log JSON structuré (méthode, chemin, statut, durée, utilisateur).
- **Pointage par le chef de pupitre** : autorisé, strictement borné à son
  pupitre (`Poste.pupitre_concerne`) — décision produit documentée et testée.
- **Expérience** : palette de commandes, recherche et filtres en chips,
  graphiques sans dépendance, impression des rapports, fiches plus lisibles,
  confirmations explicites, meilleurs états vides.

### Validation

- **Backend** : `pytest -q` → **602 tests réussis, 6 ignorés, 0 échec** (61 s,
  PostgreSQL remplacé par SQLite + LocMem faute de Docker sur le poste de
  préparation) ; `manage.py check` et `makemigrations --check` propres.
- **Frontend** : `ng test --watch=false` → **29 fichiers, 196 tests réussis** ;
  build de production **réussi**.
- **Captures** : 13 écrans desktop/mobile dans [docs/captures/](docs/captures/),
  générées sur le build de production avec le jeu de démo réel,
  **zéro erreur console**.

### Limites connues de cette préparation

- Les jetons restent dans `localStorage` (le correctif complet — cookie
  httpOnly — est un chantier séparé) ; la CSP et la révocation à la
  déconnexion réduisent fortement l'exposition sans l'annuler.
- MFA non livrée ; `pip-audit`/`npm audit` signale encore des vulnérabilités
  dans la chaîne de build Angular (correctifs disponibles, à planifier).
- Pas d'API plateforme « chorales » : l'espace opérateur renvoie vers l'admin
  Django, sans données inventées. Les « sessions actives » du profil ne sont
  pas exposées par l'API.
- Tests exécutés sous SQLite/LocMem (pas de PostgreSQL/Redis/Docker sur le
  poste) ; génération PDF non rejouée (DLL GTK absentes).
- Aucun tag, aucun déploiement : le retour arrière consiste à revenir sur
  `main`.

---

## `v1.8.0` — self-service du profil

Date de préparation : 21 août 2026

**Statut : version préparée sur `main`, tag non posé, non déployée.** La
production reste sur `v1.7.0` jusqu'à la création explicite du tag et au
déploiement qui suivra.

### Fonctionnalité principale

La section Identité de « Mon espace » permet désormais au titulaire du compte
de modifier lui-même :

- son prénom et son nom ;
- son numéro de téléphone ;
- sa préférence de partage de contact dans l'annuaire ;
- sa photo de profil, par ajout ou remplacement.

### Sécurité et cloisonnement

- la fiche ciblée reste exclusivement celle du compte connecté dans le tenant
  actif ;
- statut, pupitre, notes internes, rôles, mandats et autres champs réservés au
  Bureau restent exclus de cette surface ;
- les serializers, permissions et querysets backend existants demeurent la
  source réelle d'autorisation, indépendamment des contrôles visuels du front ;
- aucun changement backend n'a été nécessaire pour ce lot. Le pointeur reste
  sur le commit déjà validé `959a773`.

### Cohérence des sauvegardes

Les données globales du `User` sont enregistrées avant celles du `Membre`, par
des appels séquentiels. Un succès global n'est affiché qu'après la fin du
parcours : si la seconde étape échoue, l'interface indique précisément que la
première a déjà été persistée. L'upload de la photo intervient en dernier et
un échec d'upload ne masque pas la réussite des autres informations. Les
doubles soumissions sont ignorées pendant l'opération.

### Expérience utilisateur

- états explicites de chargement, absence de fiche, erreur, succès et réessai ;
- formulaire désactivé pendant la sauvegarde ;
- identité affichée actualisée immédiatement après la réponse serveur réussie ;
- photo protégée rechargée après un upload réussi ;
- fichier conservé pour permettre un nouvel essai si l'upload échoue.

### Portée des données

Le prénom et le nom appartiennent au compte global `User` et sont donc communs
à toutes les chorales de ce compte. Le téléphone, la photo et la préférence de
partage appartiennent au `Membre` du tenant actif. Cette séparation est le
comportement attendu du modèle multi-chorale.

### Validation

- frontend : **29/29 fichiers**, **196/196 tests réussis** ;
- build Angular de production : **réussi** ;
- backend : aucun changement dans ce lot, pointeur inchangé sur `959a773`.

Ces résultats ont été exécutés sur la combinaison publiée avant la préparation
de cette version. La suite backend complète n'a pas été présentée comme une
nouvelle exécution pour ce lot frontend.

### Exploitation et retour arrière

- aucune migration de base de données ;
- aucune nouvelle variable d'environnement ;
- aucun nouveau service Docker ;
- aucun changement du pointeur backend ;
- changement applicatif limité au frontend et au pointeur/documentation du
  superprojet.

Après création du tag, le déploiement suivra la procédure habituelle :

```bash
make prod-deploie TAG=v1.8.0
```

Un retour arrière du code vers `v1.7.0` reste possible avec :

```bash
make prod-retour-arriere TAG=v1.7.0
```

Aucune restauration de schéma n'est nécessaire pour ce lot, puisqu'il
n'introduit aucune migration. La sauvegarde automatique de pré-déploiement
reste néanmoins obligatoire selon la procédure existante.

---

## `v1.0.0-mvp.1` — premier point de référence consolidé

Date de référence : 24 juillet 2026

Cette version constitue le premier point de référence consolidé du MVP de
ChoirManager. Le dépôt racine fige ensemble les versions compatibles du backend,
du frontend, de la documentation utilisateur et des documents de conception.

## Composants figés

| Composant | Dépôt | Commit |
| --- | --- | --- |
| Backend Django REST | `hlabsdev/chm-backend` | `77869d6` |
| Frontend Angular | `hlabsdev/chm-frontend` | `9abe5ad` |
| Documentation et pilotage | dépôt superprojet | commit portant ce tag |

Les deux composants applicatifs sont référencés comme sous-modules Git. Le tag
du superprojet permet donc de restaurer exactement cet assemblage.

## Périmètre fonctionnel

- authentification JWT, renouvellement de session et changement de mot de passe ;
- isolation multi-tenant par chorale et suspension d'une chorale ;
- gestion des membres, pupitres, postes, mandats et invitations ;
- séances, présences, absences et pointage adapté au mobile ;
- répertoire, chants, partitions et thèmes ;
- finances, journal de caisse, tarifs et cotisations ;
- annonces, notifications intégrées et notifications email ciblées ;
- tableaux de bord adaptés aux rôles ;
- rapports financiers, présences, effectifs et répertoire, avec exports CSV/PDF ;
- demande publique d'adhésion d'une chorale avec modération opérateur ;
- guide utilisateur complet livré dans `docs/`.

## Qualité et limites connues

- le backend dispose d'environ 129 tests couvrant notamment l'isolation,
  les permissions, l'onboarding, les notifications et les rapports ;
- le frontend dispose de tests Vitest ciblant les éléments critiques ;
- SQLite et l'environnement de développement unique restent des choix de MVP ;
- l'export PDF exige GTK/Pango/Cairo au runtime ;
- les notifications push, SMS, calendriers externes, l'application native et le
  module Activités/Planning ne font pas partie de ce jalon.

## Restaurer cette version

```bash
git clone --branch v1.0.0-mvp.1 --recurse-submodules \
  https://github.com/hlabsdev/choir-manager.git
```

Pour un clone déjà présent :

```bash
git checkout v1.0.0-mvp.1
git submodule update --init --recursive
```
