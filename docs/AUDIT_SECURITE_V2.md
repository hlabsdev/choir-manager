# Audit de sécurité — ChoirManager (v1)

**Date de l'audit** : 11 novembre 2026
**Périmètre** : superprojet `hlabsdev/choir-manager` (branche `feat/v2-refonte`),
sous-modules `chm-backend/` (Django REST 5 + DRF) et `chm-frontend/` (Angular 21),
configuration Docker/Compose, scripts d'exploitation, CI, historique Git.
**Auditeur** : agent sécurité (équipe de refonte v2).
**Version auditée** : pointeurs de sous-modules `chm-backend 959a773`, `chm-frontend e92c1f0`, remontés le 11/11.
**Nature** : audit statique, sur lecture du code et de la configuration. **Aucun test dynamique intrusif n'a été lancé contre la production** `choirmanager.sankof.tech`.

> Les correctifs marqués « backend-dev » ont été appliqués pendant l'audit par l'agent backend (fichiers modifiés/non commités dans `chm-backend/`). Ceux marqués « ops (audit) » sont de l'auditeur. Le reste est **recommandé**, non appliqué. Aucun commit n'a été fait.

---

## 1. Résumé exécutif

**Note de risque globale : 7,5 / 10** (10 = risque maximal). Le socle serveur v1 est
nettement meilleur que la moyenne d'un projet de cette taille : isolation multi-tenant
revérifiée en base à chaque requête, permissions objet par rôle, médias privés derrière
un endpoint contrôlé, jetons de reset/vérification hachés et à usage unique, plafonds
d'authentification comptés sur les échecs seulement. **Les risques qui restent sont
concentrés côté client et chaîne d'approvisionnement**, pas dans la logique métier.

Trois constats **critiques** dominent :

1. **Les JWT (access 30 min + refresh 7 jours) vivent dans `localStorage`**
   (`chm-frontend/src/app/core/auth/auth.service.ts:381-382`) et la déconnexion
   **n'appelle jamais** l'endpoint de révocation qui existe pourtant côté serveur
   (`authentication/views.py:454`). Une XSS, une extension malveillante ou une
   sauvegarde de navigateur donne une session rejouable jusqu'à **7 jours**.
   La CSP (ajoutée le 11/11) est une défense en profondeur, **pas une correction** de
   ce modèle de jeton.
2. **Des données personnelles réelles de 27 personnes sont suivies par Git**
   (`docs/membres_hdgab.csv`, noms + 26 numéros de téléphone + une adresse Gmail
   personnelle), et le fichier reste dans **tout l'historique** malgré la règle
   `.gitignore` ajoutée plus tard (sans effet rétroactif).
3. **`npm audit` : 52 vulnérabilités, dont 3 critiques** (`piscina` prototype
   pollution → RCE, `proxy-addr` IP spoofing, `tar` smuggling) et 22 élevées,
   majoritairement dans la chaîne de build/dev, mais aussi dans des paquets Angular
   **livrés au navigateur** (`@angular/core`, `@angular/compiler`, `@angular/common`,
   `@angular/router` — advisories de contournement de la sanitisation XSS).

**Priorités P0 (avant toute nouvelle mise en production)** : passer les jetons hors de
`localStorage` (ou, à défaut, brancher la révocation serveur au logout + CSP effective),
retirer le CSV du suivi **et purger l'historique** (procédure en annexe C), mettre à
jour les dépendances frontend, supprimer l'adresse personnelle du bundle de production.

**Priorités P1** : `MFA` opérateur/Bureau, refus explicite de `DJANGO_SECRET_KEY=change-me`,
verrouillage du `/admin/` (MFA + limitation de tentatives), police auto-hébergée,
fin de la cohérence CSP/index.html, épinglage SHA des actions GitHub.

**Corrections déjà obtenues pendant l'audit** : CSP + en-têtes sur toutes les réponses
API/admin (`core/middleware_securite.py`), corrélation de logs `X-Request-ID`
(`core/logging_utils.py`), neutralisation des formules CSV (`core/csv_securite.py`),
JWT lié à l'empreinte du mot de passe (`CHECK_REVOKE_TOKEN`, `authentication/jwt_authentication.py`),
cookies sécurisés forcés en production (`compose.prod.yaml`), adresse d'alerte de
sauvegarde sortie du dépôt, mot de passe du smoke test aléatoire et nettoyé, dumps de
sauvegarde en `0600`, audit de dépendances en CI.

### Décompte des constats

| Sévérité | Nombre | Dont corrigés (total ou partiel) pendant l'audit |
| --- | ---: | ---: |
| Critique | 3 | 0 |
| Élevé | 9 | 3 (E-07, E-08, E-09) + E-05 partiel |
| Moyen | 12 | 4 (M-05 partiel, M-09, M-10, M-11) |
| Faible | 6 | 0 |
| **Total** | **30** | **8** |

> Le tableau détaillé (section 3) fait foi ; le compte ci-dessus inclut les constats
> « corrigés » dans leur sévérité d'origine, pour ne pas effacer le risque historique.

---

## 2. Périmètre, méthode et limites

### 2.1 Ce qui a été audité

| Domaine | Fichiers / zones |
| --- | --- |
| Configuration serveur | `chm_config/settings.py`, `chm_config/env.py`, `chm_config/urls.py` |
| Authentification | `authentication/*` (views, serializers, services, services_email, jwt_authentication, models), `core/throttles.py` |
| Autorisations / tenant | `core/tenancy.py`, `core/permissions.py`, `core/mixins.py`, `core/admin_scoping.py`, `core/admin_corbeille.py` |
| Médias privés | `core/medias.py`, `core/views_medias.py`, `chm-frontend/nginx.conf`, directive `MediaProtegeDirective` |
| Données métier | `membres/import_excel.py`, `membres/serializers.py`, `membres/views.py`, `rapports/exports.py`, `rapports/views.py`, `audit/*`, `notifications/services.py` |
| Frontend | `core/auth/*`, `core/tenant/*`, `navigation-auth.ts`, `environments/*`, `index.html`, services HTTP, directive média |
| Infra | `compose.yaml`, `compose.dev.yaml`, `compose.prod.yaml`, `compose.api-direct.yaml`, `.env.example`, `Dockerfile` x2, `.dockerignore` x2 |
| Exploitation | `ops/backup/*.sh`, `ops/systemd/*`, `scripts/smoke-medias.sh`, `Makefile` |
| CI / hooks | `.github/workflows/ci.yml`, `.githooks/pre-commit` |
| Données / historique | `docs/membres_hdgab.csv`, `git log --all`, `git log -S`, `git grep` sur tous les arbres suivis |
| Hors périmètre applicatif | `membres_models.py` (prototype historique), `reponse claude 1.txt`, guides `.docx` (binaires) |

### 2.2 Méthode

- Lecture intégrale des fichiers à risque, puis vérification croisée des affirmations
  de `CLAUDE.md`/`README.md` avec le code : plusieurs chantiers documentés comme
  « ouverts » ont été refermés pendant l'audit (CSP, CHECK_REVOKE, audit), et au moins
  une affirmation documentaire est fausse (la déconnexion ne révoque pas le refresh).
- `git grep` ciblé sur les motifs d'injection (SQL brut, `mark_safe`, `eval`, uploads,
  redirections, URL), les secrets (`password`, `secret`, `token`, `PRIVATE KEY`, `AKIA`…),
  les e-mails et les adresses personnelles.
- Analyse de l'historique : fichiers jamais/anciennement suivis
  (`git log --all --diff-filter=A/D --name-only`), recherche `-S` sur l'adresse
  personnelle et le mot de passe de smoke, `git log -- .env` (aucun `.env` versionné).
- Lecture du `npm audit` fourni par le Lead le 11/11 (fichier `.npm-audit.json` à la
  racine du superprojet) : 52 vulnérabilités, 3 critiques, 22 élevées, 25 modérées, 2 faibles.

### 2.3 Limites explicites — à lire avant de contester un constat

1. **Pas de test dynamique sur la production.** Aucun scan, fuzzing, tentative
   d'authentification ou de contournement n'a été lancé contre
   `https://choirmanager.sankof.tech`. Les constats sont **statiques** ; un constat
   « critique » n'a pas été exploité, il est jugé exploitable par lecture du code.
2. **Pas de Docker dans l'environnement d'audit** : `docker compose config`, le build
   des images et le test réel de la CSP/Nginx **n'ont pas été exécutés**. La recette
   Nginx (`make smoke-medias`, `make check-deploy`) reste à jouer sur un hôte.
3. **Pas de réseau** : `git ls-remote` (pour épingler les actions GitHub par SHA) et
   une ré-exécution de `npm audit`/`pip-audit` échouent hors ligne. Les compteurs npm
   sont ceux mesurés par le Lead ; ils n'ont pas été rejoués ici.
4. **`bash -n` inutilisable** dans le bac à sable Windows (échec de création de pipe
   Cygwin/MSYS, `Win32 error 5`) : les scripts modifiés ont été **relus manuellement**
   et leur syntaxe contrôlée ligne à ligne, pas exécutés.
5. **Code en mouvement** : d'autres agents modifient `chm-backend/` et `chm-frontend/`
   en parallèle (middleware, CSP, polices, composants). Les constats « corrigés » sont
   ceux observés à l'instant de la rédaction ; un état transitoire est signalé quand
   il l'est (notamment les Google Fonts).
6. **Guides `.docx` non extraits** (absence de `python-docx` dans l'environnement) :
   ils sont binaires et peuvent contenir des captures d'écran ; non audités. À vérifier
   avant publication externe.
7. **Pas de rotation de secret, pas de réécriture d'historique, pas de suppression de
   données** : ces gestes sont hors mandat et nécessitent une décision d'exploitation
   (annexe A/C). Le CSV de données personnelles est **toujours sur le disque**, comme
   demandé.

---

## 3. Tableau des constats

Légende statut : **Corrigé** = correctif présent dans l'arbre de travail au 11/11 ;
**Corrigé (ops)** = correctif de configuration appliqué par l'auditeur ; **Recommandé** =
non appliqué, à traiter ; **Hors périmètre** = constaté, non corrigeable dans ce dépôt
ou dans cette mission.

### 3.1 Critique

| ID | Sévérité | Emplacement | Preuve | Impact | Correctif recommandé | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| C-01 | **Critique** | `docs/membres_hdgab.csv:1-28` (27 lignes de données) | En-tête `nom,prenoms,…,email,telephone,…` ; 26 numéros `+228 …` réels ; ligne 10 : `GOLO,Kekeli Hermann,kekeligolo@gmail.com,kekeligolo@gmail.com,+228 91025263,…`. Ajouté par `git log --follow` → commit `b5949dc`. `.gitignore:33` ignore `docs/membres_*.csv` mais la règle a été ajoutée ensuite (`f24757d`) et **n'a aucun effet rétroactif**. | Publication de données personnelles (noms, téléphones, e-mail) dans un dépôt GitHub, y compris via forks/clones et l'historique. Risque RGPD et risque d'ingénierie sociale (les numéros sont réels). | **Ne pas supprimer le fichier du disque** : `git rm --cached docs/membres_hdgab.csv`, commit, puis purge d'historique `git filter-repo` avant toute publication (annexe C). Rotation non applicable (données, pas secret). Envisager l'information des personnes concernées. | **Constaté — non corrigé volontairement** (procédure fournie) |
| C-02 | **Critique** | `chm-frontend/src/app/core/auth/auth.service.ts:129,171,253-254,381-382,427` ; `chm-frontend/src/app/core/auth/auth.interceptor.ts:11-12` | `setTokens()` écrit `access_token` **et** `refresh_token` dans `localStorage` ; `initAuth()` les relit ; l'intercepteur les renvoie en `Authorization`. Durées : `chm-backend/chm_config/settings.py:304-305` (access 30 min, refresh 7 jours). Aucun stockage `httpOnly`. La CSP ajoutée le 11/11 (`nginx.conf:170`) réduit la surface XSS mais **ne rend pas les jetons illisibles au JavaScript**. | Toute XSS (ou extension navigateur, ou accès au poste) exfiltre le refresh → session rejouable jusqu'à 7 jours, y compris après déconnexion (cf. E-01). Le modèle « Bearer dans localStorage » est le risque central du frontend v1. | v2 : access en mémoire, refresh en cookie `httpOnly` + `SameSite=Strict` (SPEC §Sécurité HTTP). v1 (si maintenu) : stocker l'access en mémoire et le refresh en cookie `httpOnly` émis par le backend ; à défaut, réduire la durée du refresh et brancher la révocation au logout. | **Recommandé** (v2 couvre par construction) |
| C-03 | **Critique** | `chm-frontend/package-lock.json` ; `.npm-audit.json` (racine, mesure Lead 11/11) | `npm audit` : **52 vulnérabilités — 3 critiques, 22 élevées, 25 modérées, 2 faibles**. Critiques nommées : `piscina` (prototype pollution → RCE), `proxy-addr` (usurpation d'IP), `tar` (smuggling d'archives). Élevées dont `@angular/core`, `@angular/compiler`, `@angular/common`, `@angular/router` (contournement de la sanitisation XSS), `vite`/`launch-editor` (fuite de hash NTLM sous Windows), `postcss`, `undici`, `@babel/core`. | Majorité en dépendances de **build/dev** (non embarquées telles quelles), donc exploitabilité production plus faible qu'annoncé — **mais** les paquets Angular sont **compilés dans le bundle livré**, et une faille de sanitisation Angular est directement une XSS exploitable. Une compromission de la chaîne de build peut aussi publier un bundle altéré. | `npm audit fix` puis mise à jour ciblée d'Angular 21 vers le correctif ; `npm audit --omit=dev` pour suivre le sous-ensemble runtime ; ajouter `npm audit --audit-level=high` en CI (fait, voir E-05) ; regénérer `package-lock.json` et vérifier le bundle. | **Recommandé** |

### 3.2 Élevé

| ID | Sévérité | Emplacement | Preuve | Impact | Correctif recommandé | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| E-01 | **Élevé** | `chm-frontend/src/app/core/auth/auth.service.ts:252-257` ; backend `chm-backend/authentication/views.py:454` (`LogoutView`), `authentication/urls.py:19` | `logout()` ne fait que `localStorage.removeItem(...)` + navigation. `git grep '/auth/logout'` côté frontend : **aucun appel**. Le backend, lui, sait blacklister le refresh présenté (`LogoutView`, `RefreshToken(brut).blacklist()`). | Un refresh volé/copié **reste valide jusqu'à 7 jours** après que la personne s'est déconnectée, alors que la documentation (`CLAUDE.md`) et la vue serveur promettent l'inverse. Faux sentiment de sécurité. | Appeler `POST /api/auth/logout/` avec le refresh **avant** de purger le stockage (best-effort, sans bloquer la déconnexion locale). v2 : `POST /logout` efface le cookie refresh + révoque la famille (SPEC:99-101). | **Recommandé** |
| E-02 | **Élevé** | `chm-backend/chm_config/env.py:29-74` ; `.env.example:47` | `CLE_DEV = "dev-insecure-key-change-in-production-!@#$%^&*()"` est refusée hors DEBUG, mais `resoudre_secret_key()` **n'a aucun contrôle de longueur ni de valeur** : un opérateur qui laisse `DJANGO_SECRET_KEY=change-me` démarre sans erreur. Preuve : `.env.example:47` fournit exactement cette valeur. | Clé de signature JWT/CSRF/sessions **faible et connue** : un attaquant peut forger un access token (si `pwdv`/claims reproduits — cf. E-07) ou attaquer les sessions admin. Le garde-fou « fermé par défaut » de `env.py` a un trou. | Refuser explicitement `change-me`, `changeme`, `secret`, les valeurs < 32 caractères et la clé de dev hors DEBUG ; générer la clé (la doc le fait déjà pour `POSTGRES_PASSWORD`). v2 : secrets hors dépôt, `CHM_SECRET` ou fichier 600 (SPEC:162-164). | **Recommandé** |
| E-03 | **Élevé** | `chm-backend/requirements.txt` (aucune dépendance MFA) ; `chm_config/settings.py:299-355` (pas de MFA) ; `CLAUDE.md:857` (chantier n°7) | Aucun second facteur n'existe pour l'opérateur de plateforme ni pour les comptes Bureau/Trésorier. Le `/admin/` (accès total aux données) n'est protégé que par mot de passe. | Compromission d'un mot de passe = compromission complète du tenant ou de la plateforme, sans barrière supplémentaire. Un opérateur est une cible à fort effet de levier. | MFA TOTP obligatoire pour l'opérateur, fortement recommandée Bureau/Trésorier ; v2 est « MFA-ready » (SPEC:24) mais doit être implémentée avant production v2. | **Recommandé** |
| E-04 | **Élevé** | `chm-frontend/src/environments/environment.ts:29` | `contactEmail: 'kekeligolo@gmail.com'` — adresse **personnelle** dans le bundle de production (servie à tous les visiteurs et présente dans `dist/`). Même adresse que `docs/membres_hdgab.csv:10` et l'ancien `ops/backup/alert-backup.sh` (corrigé, cf. M-09). | Fuite de donnée personnelle dans un artefact public, et adresse de contact qui ne correspond pas à l'adresse de plateforme réelle (`EMAIL_REPLY_TO_PLATEFORME`). | Remplacer par une adresse de rôle (`contact@votre-domaine`) avant tout build de production ; la valeur doit être injectée au build, pas codée en dur. | **Recommandé** |
| E-05 | **Élevé** | `chm-backend/requirements.txt:5-74`, `chm-backend/Dockerfile:10,27`, `chm-frontend/Dockerfile:8,28`, `.github/workflows/ci.yml:74,78,140,184` (actions), `ci.yml:198-236` (job d'audit ajouté) | Toutes les dépendances Python sont en **plages** (`Django>=5.1,<6.0`, etc.), aucun `--require-hashes`, aucun `pip-sync` ; images de base sur tags mutables (`python:3.12-slim-bookworm`, `node:22-bookworm-slim`, `nginxinc/nginx-unprivileged:1.27-alpine`) ; actions GitHub épinglées par tag majeur (`actions/checkout@v4`…), tags **mutables**. Aucun digest dans les `FROM`. | Deux builds peuvent différer ; une compromission d'un registre/paquet/action peut injecter du code dans l'image ou la CI. C'est le chantier n°10 de `CLAUDE.md`, ouvert. | Verrouiller (`pip-compile`/`uv lock`, `hashes`), épingler les images par digest, épingler les actions par SHA (impossible hors ligne ici — à faire en revue connectée). CI : job `pip-audit`/`npm audit` **ajouté** par l'auditeur (`ci.yml`, job `audit-dependances`) ; ajouter Trivy/Grype sur les images et un scan de secrets. | **Corrigé partiellement (ops)** — audit CI ajouté ; verrouillage/digests/SHA **recommandés** |
| E-06 | **Élevé** | `chm-backend/chm_config/urls.py:24` (`path("admin/", admin.site.urls)`) ; `chm-frontend/nginx.conf:86` (`location ^~ /admin/`) ; `chm-backend/chm_config/settings.py` (aucun throttle admin) | L'admin Django est **exposé sur l'origine publique** (`/admin/`), accessible à tout compte `is_staff`, sans MFA ni limitation de tentatives (Django ne throttlee pas `AdminSite.login`), avec une URL connue. | Cible de brute force / credential stuffing à forte valeur (données de tous les tenants pour l'opérateur ; données du tenant pour un admin de tenant). | Restreindre `/admin/` à un réseau/IP de confiance au niveau du gateway, ajouter MFA et un throttle sur la connexion admin ; à défaut, journaliser et alerter les échecs (déjà audités via `audit`, mais pas bloquants). | **Recommandé** |
| E-07 | **Élevé** | `chm-backend/authentication/jwt_authentication.py:1-100` ; `authentication/serializers.py:81-87` ; `chm_config/settings.py:299-355` | **Corrigé pendant l'audit** : claim `pwdv` = SHA-256 salé du hash de mot de passe, vérifié à chaque requête (`_egal_constant`), donc un access token émis avant un changement de mot de passe est refusé immédiatement. Avant, `CHECK_REVOKE_TOKEN` était absent (fenêtre de 30 min). | Avant correction : un access volé survivait jusqu'à 30 min à un changement de mot de passe. Après : fenêtre quasi nulle (les jetons antérieurs au déploiement sont refusés → reconnexion via refresh, effet documenté). | Garder ; tester la migration des jetons existants (le commentaire l'assume). | **Corrigé (backend-dev)** |
| E-08 | **Élevé** | `chm-backend/rapports/exports.py:24,167-170` ; `audit/admin.py:23,160-167` ; `core/csv_securite.py` | **Corrigé pendant l'audit** : tout export CSV passe par `neutraliser_formule_tableur()` (préfixe `'` sur `=`, `+`, `@`, tab/CR et `-` non numérique). Avant, un nom de membre ou un `objet_libelle` commençant par `=` était exécuté par Excel (`=HYPERLINK(...)`, DDE). | Injection de formule dans le poste de la personne qui ouvre l'export (staff, opérateur) : exfiltration de cellules, voire exécution locale sur anciennes versions d'Excel. | Garder ; ajouter un test de régression sur chaque export CSV et vérifier que **tous** les writers passent par l'utilitaire (grep `csv.writer`). | **Corrigé (backend-dev)** |
| E-09 | **Élevé** | `Makefile:141-150` (`sauvegarde`), `Makefile:247-250` (`prod-sauvegarde-pre-deploiement`) ; `ops/backup/backup.sh:8-16` | **Corrigé pendant l'audit** : les dumps `pg_dump` étaient créés avec le `umask` par défaut (0644) dans `backups/` (0755) ; ils contiennent **toutes** les données personnelles de la plateforme. `umask 077` ajouté aux deux recettes de sauvegarde. Le script `ops/backup/backup.sh` était déjà correct (`chmod 700` sur le staging). | Lecture de l'intégralité de la base par tout compte local de l'hôte. | Garder ; vérifier les dumps historiques déjà présents sur l'hôte (`chmod 600`/suppression selon rétention). | **Corrigé (ops)** |

### 3.3 Moyen

| ID | Sévérité | Emplacement | Preuve | Impact | Correctif recommandé | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| M-01 | Moyen | `chm-frontend/src/index.html:18-20` vs `chm-frontend/nginx.conf:170` | La CSP nginx impose `font-src 'self'` et `style-src 'self' 'unsafe-inline'`, mais `index.html` charge encore `https://fonts.googleapis.com/css2?...` (lien bloqué : ni `fonts.googleapis.com` en `style-src`, ni `fonts.gstatic.com` en `font-src`). Un agent frontend a commencé l'auto-hébergement (`public/fonts/`, `@fontsource-variable/*` dans `package.json`) mais `index.html` n'est pas encore basculé. | En production, polices non chargées (rendu dégradé) ; dépendance à un tiers (IP des visiteurs envoyée à Google, disponibilité, pas de SRI possible). Incohérence d'une correction de sécurité en cours. | Retirer les trois `<link>` Google et servir les polices auto-hébergées (déjà dans `public/fonts/`), ou, transitoirement, ajouter les domaines à la CSP. Vérifier le rendu après build. | **Recommandé (correctif en cours par l'agent frontend)** |
| M-02 | Moyen | `chm-backend/core/admin_corbeille.py:207,211,225,237,259,262` | `retour = request.POST.get("retour") or reverse("admin-corbeille")` puis `redirect(retour)` : le paramètre POST est **arbitraire**. | Redirection ouverte depuis une page d'admin authentifiée (phishing post-purge) ; nécessite un POST + CSRF, donc opérateur ciblé. | Valider `retour` comme chemin interne (`urlsplit`, schéma interdit, `netloc` vide, préfixe `/admin/`) ou le retirer des formulaires. | **Recommandé** |
| M-03 | Moyen | `chm-backend/core/views.py:47-53` (`_adresse_ip`) | `HTTP_X_FORWARDED_FOR.split(",")[0]` est stocké tel quel dans `DemandeChorale.adresse_ip` / `Suggestion.adresse_ip` (formulaires publics). Le client peut forger l'en-tête. Les **throttles**, eux, utilisent `NUM_PROXIES` correctement (`env.py:resoudre_num_proxies`). | Les IP d'audit/anti-abus de ces objets ne sont pas fiables (preuve affaiblie, fausses attributions). | Utiliser la même résolution que DRF (`get_ident`/`NUM_PROXIES`) ou ne pas stocker l'IP du tout ; documenter la provenance. | **Recommandé** |
| M-04 | Moyen | `chm-backend/chm_config/settings.py:480-500` | Seuls `SESSION_COOKIE_SECURE`/`CSRF_COOKIE_SECURE` sont réglés ; `SESSION_COOKIE_SAMESITE` et `SESSION_COOKIE_AGE` restent aux défauts Django (`Lax`, 2 semaines). | Cookie de session admin envoyé sur navigation inter-site (`Lax` limite mais n'élimine pas) ; session longue après un poste partagé. | `SESSION_COOKIE_SAMESITE = "Strict"` (l'admin est same-origin), `SESSION_COOKIE_AGE` raisonnable, rotation de session à la connexion (`cycle_key` déjà par Django). | **Recommandé** |
| M-05 | Moyen | `chm-backend/core/middleware_securite.py`, `core/logging_utils.py`, `chm_config/settings.py` (`LOGGING`) | **Corrigé pendant l'audit** : `X-Request-ID` accepté seulement s'il est syntaxiquement sain (regex 8-128), `ContextVar`, ligne JSON par requête, formateur `FormateurJson`. Résiduel : aucun envoi centralisé (Loki/ELK/Sentry), aucune alerte sur 5xx/échecs d'authentification. | Sans centralisation ni alerte, une attaque lente ou une panne reste invisible ; l'observabilité était le chantier n°9 de `CLAUDE.md`. | Brancher un collecteur (journald → Loki) et des alertes (taux de 401/429, erreurs 5xx, sauvegarde) ; v2 : journal d'audit + console opérateur (SPEC:105-106). | **Corrigé partiellement (backend-dev)** |
| M-06 | Moyen | `chm-backend/audit/serializers.py:57-61`, `audit/views.py:92-93` ; `settings.py` taux `audit_client` | La charge `donnees` acceptée du client est un `DictField` limité à 20 clés, sans limite de taille des valeurs ; throttle 200/h. | Un membre peut gonfler lentement la table d'audit (stockage/coût), pas la compromettre. | Borner la taille sérialisée de `donnees` (ex. 4 Ko) et le nombre d'événements/jour ; déjà étiqueté « non probant » et throttlé, donc risque limité. | **Recommandé** |
| M-07 | Moyen | `chm-backend/membres/models.py:555-561`, `membres/views.py:526-575` (vérification par code) | Code d'invitation : 8 caractères sur un alphabet de 31 (~39,6 bits), vérification publique à `20/hour` (`settings.py` scope `invitation_verifier`). | Brute force en ligne d'un code actif : improbable (39 bits + throttle) mais pas impossible si des codes partagés restent valides longtemps et si le throttle est contourné (cf. M-08). | Suffisant en l'état ; envisager 10-12 caractères ou une expiration courte par défaut ; ne jamais réutiliser un code à usage unique. | **Accepté / recommandé** |
| M-08 | Moyen | `compose.prod.yaml` (pas de `limit_req`), `chm-frontend/nginx.conf` (pas de `limit_req`), `chm-backend/core/throttles.py` | Toute la limitation de débit est applicative (DRF + Redis). Le gateway `mrs-gateway` et Nginx n'imposent aucune limite. | Si Redis tombe, le démarrage est refusé (bon), mais le gateway peut être saturé avant Django ; des attaques volumétriques ne sont pas absorbées en amont. | Ajouter `limit_req_zone`/`limit_conn` sur Nginx (login, API, uploads) et/ou au gateway ; conserver les throttles applicatifs (défense en profondeur). | **Recommandé** |
| M-09 | Moyen | `ops/backup/alert-backup.sh:1-40` ; `ops/systemd/choirmanager-backup*.service` | **Corrigé pendant l'audit** : l'adresse `kekeligolo@gmail.com` était codée en dur (ligne 10 avant correction) et versionnée. Remplacée par `BACKUP_ALERT_EMAIL` **obligatoire** (`:?`), injectée via `docker exec -e`, chargée par `EnvironmentFile=-/etc/choirmanager/backup.env` (600). | Fuite de donnée personnelle (historique inclus) et point de panne silencieux si l'adresse change. | Opérationnel : créer `/etc/choirmanager/backup.env` (procédure `docs/DEPLOIEMENT.md` §7, ajoutée) ; purger l'adresse de l'historique (annexe C). | **Corrigé (ops)** |
| M-10 | Moyen | `scripts/smoke-medias.sh:30-72,129` | **Corrigé pendant l'audit** : mot de passe fixe `SmokeMedias2026!` (compte réel en base, commité dans l'historique `56b54bb`) remplacé par `secrets.token_urlsafe(24)` généré par exécution, passé par env, jamais affiché ; `trap EXIT` qui supprime la partition/le chant et neutralise le compte (`set_unusable_password`, `is_active=False`) en cas d'échec. | Avant : mot de passe de compte de test public dans Git ; tout clone pouvait se connecter sur une pile où le script avait tourné. | Garder ; purger le mot de passe de l'historique (annexe C). | **Corrigé (ops)** |
| M-11 | Moyen | `.env.example:64-84` ; `compose.prod.yaml:20-33` ; `compose.yaml:227-233` | **Corrigé pendant l'audit** : `.env.example` porte les valeurs de **dev** (`DJANGO_COOKIE_SECURE=False`, `DJANGO_ACCEPT_INSECURE_COOKIES=True`, `FRONTEND_BIND=0.0.0.0`). Un `.env` copié en prod envoyait les cookies admin en clair et publiait le port sur le LAN. `compose.prod.yaml` **force** désormais `DJANGO_COOKIE_SECURE=True`/`DJANGO_ACCEPT_INSECURE_COOKIES=False`/`DJANGO_DEBUG=False` ; défaut `FRONTEND_BIND=127.0.0.1` dans `compose.yaml`/`.env.example`. | Avant : cookies de session admin sur HTTP et exposition réseau non voulue, par simple copie de fichier. | Garder ; ne pas retirer l'override prod (commentaire explicite dans `compose.prod.yaml`). | **Corrigé (ops)** |
| M-12 | Moyen | `compose.yaml:139-148` ; `docs/DEPLOIEMENT.md` §9 ; `Makefile:_prod-check-deploy` | `DJANGO_SECURE_SSL_REDIRECT=False` est le défaut de la pile et `security.W008` est explicitement toléré (TLS terminé par `mrs-gateway`). HSTS est posé par Django (`settings.py:495-497`) mais pas sur les réponses HTML servies par Nginx. | Si le gateway est mal configuré ou si l'on atteint l'origine en HTTP, cookies `Secure` protègent encore, mais pas de redirection/HSTS au premier saut. | Vérifier le gateway (redirection 80→443, HSTS sur le domaine public) ; ne pas activer `SECURE_SSL_REDIRECT` côté Django derrière un proxy (boucle). | **Recommandé (documenté)** |

### 3.4 Faible

| ID | Sévérité | Emplacement | Preuve | Impact | Correctif recommandé | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | Faible | `.vscode/launch.json:17-22` | Configuration Django Dev `runserver 0.0.0.0:8000`. | Expose le serveur de dev au LAN (DEBUG, pas de TLS) si lancé sur un réseau non sûr. | `127.0.0.1:8000` par défaut ; documenter l'override pour tester depuis un téléphone. | **Recommandé** |
| F-02 | Faible | `chm-frontend/src/app/features/musique/components/media-chant-lecteur/media-chant-lecteur.component.ts:113-114` | `window.open(this.urlBlob, '_blank')` sans `noopener`. | Blob same-origin : risque limité (la page ouverte est notre propre contenu, sans HTML) ; par principe, `noopener,noreferrer`. | Ajouter les options `'noopener,noreferrer'`. | **Recommandé** |
| F-03 | Faible | `chm-frontend/src/app/core/auth/auth.service.ts:405-425` (`isTokenExpired`) | Décodage `window.atob(base64)` **sans** conversion base64url (`-`/`_`), contrairement à `decodeAndSetUser` (lignes 389-401). Peut lever sur un payload contenant ces caractères → `catch` renvoie `true` → déconnexion. | Bug de disponibilité (déconnexion au démarrage), pas de sécurité. | Normaliser l'alphabet base64url avant `atob`, ou réutiliser un décodeur commun. | **Recommandé** |
| F-04 | Faible | `membres_models.py:108-362` (prototype historique, non exécuté) | Six pièges si ce fichier était réutilisé : `sync_groupes_membre` écrit `user.groups` **global** (escalade cross-tenant, lignes 332-362) ; `soft_delete()` fait `mandats.filter(...).update(...)` — **aucun signal** `post_save`, donc les groupes ne sont pas retirés malgré le commentaire (lignes 211-215) ; désactive `user.is_active` globalement (208) ; manager par défaut incluant les soft-deleted (108-117, `objects = as_manager()` 171) ; `generer_numero` non thread-safe (222-233) ; `Mandat.clean()` non appliqué par `save()`. | Faux sentiment de sécurité si le prototype sert de modèle. | Ne pas réutiliser ; la v1 a corrigé le RBAC par mandats/tenant et la v2 repart de zéro (`SPEC`). | **Hors périmètre / non corrigé (prototype)** |
| F-05 | Faible | `docs/membres_hdgab.csv` (historique) ; `ops/backup/alert-backup.sh` (historique) ; `scripts/smoke-medias.sh` (historique) | Trois jeux de données personnelles/secrets de test sont dans l'historique Git, pas seulement dans l'arbre : e-mail personnel (`ed06581`, `b5949dc`), mot de passe smoke (`56b54bb`). | Même après correction de l'arbre, l'historique conserve les valeurs. | Purge d'historique (annexe C) avant publication de l'historique ; à défaut, considérer ces secrets comme compromis (mot de passe smoke obsolète, e-mail personnel public). | **Constaté — non corrigé volontairement** |
| F-06 | Faible | `reponse claude 1.txt:1-40` (suivi), `docs/Guide_utilisateur_ChoirManager*.docx` (binaires) | Artefact de conversation conservé à la racine ; guides non textuellement audités. Aucun secret trouvé dans `reponse claude 1.txt`. | Bruit/hygiène ; risque résiduel de capture d'écran avec données réelles dans les guides. | Retirer l'artefact de conversation du dépôt ; vérifier les captures des guides avant toute diffusion. | **Recommandé** |

### 3.5 Faux positifs écartés (pour éviter les conclusions hâtives)

| Élément | Pourquoi ce n'est PAS une fuite |
| --- | --- |
| `POSTGRES_PASSWORD=change-me` (`.env.example:21`), `DJANGO_SECRET_KEY=change-me` (`.env.example:47`) | Placeholders explicitement documentés (« remplacer toutes les valeurs `change-me` »). Le placeholder `change-me` **n'est pas** un secret. **Nuance** : pour `DJANGO_SECRET_KEY`, le problème n'est pas qu'il soit versionné (il ne l'est pas en réel) mais que `env.py` **accepte** cette valeur hors DEBUG (E-02). |
| `POSTGRES_PASSWORD=choirmanager-ci` et `DJANGO_SECRET_KEY=ci-only-not-a-production-secret` (`.github/workflows/ci.yml:35,62`) | Identifiants de **CI de test**, éphémères, sur un service PostgreSQL privé au runner ; jamais utilisés en production. Ce n'est pas une fuite. |
| `POSTGRES_PASSWORD=restore-test-only` (`ops/backup/restore-test.sh:21`) | Conteneur PostgreSQL **jetable et local** créé pour un test de restauration, détruit en sortie (`trap cleanup EXIT`, ligne 10-14), jamais exposé. Ce n'est pas un secret. |
| `DJANGO_SECRET_KEY=build-time-only-never-used-at-runtime` (`chm-backend/Dockerfile:34-42`) | Nécessaire seulement à `collectstatic` pendant le build ; la valeur n'est pas embarquée dans l'image finale (multi-stage) et n'a aucun usage runtime. |
| `reponse claude 1.txt` | Contenu de conseil produit, aucun secret ni donnée personnelle (vérifié `git grep`). |
| Aucun `.env` dans l'historique | `git log --all -- .env .env.local .env.prod` : **aucun résultat**. Le `.gitignore` a tenu. |
| `docs/membres_hdgab.csv` e-mails `@temp.invalid` | Les adresses sont fictives, **mais** les noms et les **numéros +228** sont réels : le fichier reste une fuite de données personnelles (C-01). La fictionalisation partielle ne suffit pas. |

---

## 4. Constats documentés dans `CLAUDE.md` — état réel après lecture du code

| # | Chantier documenté | Ce que le code réel montre (11/11) | Statut |
| --- | --- | --- | --- |
| 5 | **CSP stricte** | Absente avant l'audit. **Ajoutée** : Nginx (`nginx.conf:157-195`, CSP sur `/index.html` et `/`, `font-src 'self'`) **et** middleware backend (`core/middleware_securite.py:57-113`, CSP + COOP/CORP/Permissions-Policy sur toutes les réponses, y compris API/admin). Résidu : `index.html:18-20` charge encore Google Fonts et contredit `font-src 'self'` (M-01) ; `style-src 'unsafe-inline'` reste nécessaire à Angular/admin (assumé, documenté dans le middleware). | **Corrigé (avec réserve M-01)** — la CSP ne corrige pas C-02 (localStorage) |
| 6 | **`CHECK_REVOKE_TOKEN`** | **Implémenté** : claim `pwdv` (SHA-256 salé par `SECRET_KEY` du hash de mot de passe), vérifié à chaque requête avec `hmac.compare_digest` (`authentication/jwt_authentication.py:33-100`) ; posé à l'émission (`authentication/serializers.py:81-84`). Les jetons sans `pwdv` (pré-déploiement) sont refusés → reconnexion transparente via refresh. | **Corrigé (backend-dev)** |
| 7 | **MFA** | **Toujours absente** : aucune dépendance TOTP/WebAuthn dans `requirements.txt`, aucun second facteur dans `settings.py`. Un opérateur reste protégé par un seul mot de passe (E-03). | **Ouvert** |
| 9 | **Observabilité** | **Partiellement livrée** : `X-Request-ID` borné, `ContextVar`, logs JSON structurés (`core/logging_utils.py`, `settings.py` `LOGGING`), ligne par requête. **Manquent** : collecte centralisée et alertes (M-05). | **Partiel** |
| 10 | **Verrouillage des dépendances** | **Toujours ouvert** : plages de versions Python, tags d'images mutables, actions GitHub non épinglées (E-05). La CI a désormais un job d'audit (`audit-dependances`) mais n'empêche pas la dérive de versions. | **Partiel (audit CI ajouté)** |
| — | **JWT en `localStorage`** | **Toujours vrai** (`auth.service.ts:381-382`). La CSP ajoutée est une défense en profondeur, pas la correction. | **Ouvert (C-02)** |
| — | **Déconnexion / révocation** | `CLAUDE.md` affirme que la déconnexion révoque le refresh. **Faux** : le front n'appelle jamais `LogoutView` (E-01). | **Contredit par le code** |

### Corrections appliquées pendant l'audit (traçabilité)

| Fichier | Correctif | Auteur |
| --- | --- | --- |
| `chm-backend/core/middleware_securite.py`, `core/logging_utils.py`, `settings.py` | CSP/CORP/COOP/Permissions-Policy sur toutes les réponses + `X-Request-ID` + logs JSON (M-05, chantier 5/9) | backend-dev |
| `chm-backend/authentication/jwt_authentication.py`, `authentication/serializers.py` | `CHECK_REVOKE_TOKEN` : JWT lié au hash de mot de passe (E-07) | backend-dev |
| `chm-backend/core/csv_securite.py`, `rapports/exports.py`, `audit/admin.py` | Neutralisation d'injection de formule CSV (E-08) | backend-dev |
| `chm-frontend/nginx.conf` | CSP stricte + COOP/CORP sur les documents HTML (chantier 5) | Lead |
| `ops/backup/alert-backup.sh`, `ops/systemd/*.service`, `docs/DEPLOIEMENT.md` | Adresse d'alerte sortie du dépôt, variable obligatoire, `EnvironmentFile` 600 (M-09) | audit (ops) |
| `scripts/smoke-medias.sh` | Mot de passe aléatoire + nettoyage du compte/média (M-10) | audit (ops) |
| `compose.prod.yaml`, `.env.example`, `compose.yaml` | Cookies `Secure` forcés en prod, `FRONTEND_BIND` sûr, `no-new-privileges` (M-11) | audit (ops) |
| `Makefile` | `umask 077` sur les sauvegardes (E-09) | audit (ops) |
| `.github/workflows/ci.yml` | `permissions: contents: read` + job `pip-audit`/`npm audit` (E-05) | audit (ops) |
| `.gitignore` | Rappel de non-rétroactivité + `docs/membres_*.xlsx` | audit (ops) |

---

## 5. Correspondance v1 → contre-mesures v2

La v2 (`v2/docs/SPEC.md`) reprend le domaine documenté et corrige les défauts v1 **par
construction**. Table de correspondance (constat → contre-mesure v2) :

| Constat v1 | Contre-mesure v2 (référence SPEC) | Couverture |
| --- | --- | --- |
| C-02 JWT en `localStorage`, XSS → vol | Access **en mémoire** seulement ; refresh en cookie `chm_refresh` `httpOnly`, `SameSite=Strict`, `Path=/api/auth`, rotation + détection de réutilisation → révocation de famille (`SPEC.md:99-101`, `160-161`). | **Complète** |
| C-02 / chantier 5 CSP | CSP stricte + `nosniff`, `X-Frame-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `COOP`, `Cache-Control: no-store` sur `/api` (`SPEC.md:136-150`). | **Complète** |
| E-01 logout non révocateur | `POST /logout` efface le cookie refresh et révoque la famille (`SPEC.md:310`) ; jetons jamais en localStorage. | **Complète** |
| E-02 `change-me` accepté | `CHM_SECRET` ou secret aléatoire persisté `chmod 600`, aucun secret dans le code/dépôt (`SPEC.md:162-164`). | **Complète** |
| E-03 MFA absente | « MFA-ready » (`SPEC.md:24`) : le modèle est prévu, **reste à implémenter** avant production. | **Partielle** |
| E-04 e-mail personnel dans le bundle | v2 n'embarque aucune adresse personnelle ; seeds de démo fictifs (`SPEC.md:278-284`). | **Complète** |
| E-05 dépendances non verrouillées | Serveur **zéro dépendance npm** (`node:http`, `node:sqlite`, `node:crypto`, `SPEC.md:35-39`) ; frontend lockfile ; la CI v1 reçoit déjà l'audit. | **Complète côté serveur** ; frontend à verrouiller/auditer |
| E-06 `/admin/` exposé | Console opérateur dédiée + RBAC par mandats, surface réduite (`SPEC.md:108-134`, `452-465`) ; l'admin Django n'existe pas en v2. | **Complète** (reste MFA) |
| E-07 CHECK_REVOKE | JWT 15 min + `iat/exp/nbf` contrôlés, 30 s de tolérance, refresh révocable par famille (`SPEC.md:99-101`, `158-159`). | **Complète** |
| E-08 injection CSV/PDF | v2 doit exposer les exports avec neutralisation (la SPEC ne la mentionne pas explicitement) — **recommandation à intégrer** : réutiliser la règle de `core/csv_securite.py` côté v2, et échapper le HTML des gabarits PDF. | **À ajouter à la SPEC** |
| M-02 redirection ouverte | v2 : pas de paramètre `retour` non validé ; navigation interne uniquement. | **Complète par construction** (à vérifier en QA) |
| M-03 IP forgeable | v2 : `audit_events` enregistre l'IP résolue serveur ; l'`X-Forwarded-For` doit être borné par un nombre de proxys (à documenter côté v2). | **Partielle** |
| M-04 cookies de session | v2 : refresh cookie `httpOnly` + `SameSite=Strict` ; sessions de console opérateur à durcir (âge/rotation). | **Partielle** |
| M-05 observabilité | Journal d'audit `audit_events` + `X-Request-ID` (v1 livré) ; v2 doit brancher la console opérateur (`SPEC.md:105-106`, `460-465`). | **Partielle** |
| M-07 code d'invitation | v2 : invitations nominatives / codes (à confirmer dans la SPEC) ; conserver l'entropie et l'expiration. | **À vérifier** |
| M-08 rate limiting | Plafonds d'authentification (10/15 min IP, 5/15 min email, évalués après échec) (`SPEC.md:154-157`) + throttles applicatifs. | **Complète côté app** |
| C-01 données personnelles | v2 : aucun jeu de données réel dans le dépôt ; seeds fictifs. **Le CSV v1 doit quand même être retiré/purgé** (annexe C). | **Complète pour v2, pas pour l'historique v1** |
| Isolation multi-tenant | Tenant résolu depuis le jeton **puis revérifié en base** (`SPEC.md:102-104`), RBAC par mandats, tests dédiés. | **Complète** |
| Médias privés | `/api/media/:id` avec session + tenant de l'objet, aucun fichier en direct (`SPEC.md:165-166`). | **Complète** |
| XSS Angular (sanitisation) | v2 React + CSP stricte ; pas de `dangerouslySetInnerHTML` par défaut ; à verrouiller par revue/ESLint. | **À vérifier en QA** |

---

## 6. Annexes — procédures

### Annexe A — Rotation des secrets

À exécuter sur l'hôte de production, hors dépôt, sans committer de valeur.

1. **`DJANGO_SECRET_KEY`** (signe JWT, sessions, CSRF, empreintes `pwdv`)
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(64))"
   # .env : DJANGO_SECRET_KEY=<nouvelle valeur> (ou gestionnaire de secrets)
   sudo docker compose -f compose.yaml -f compose.prod.yaml up -d backend
   ```
   Conséquences : **tous les JWT existants sont invalidés** (signature + `pwdv`) ;
   sessions admin invalidées ; les liens de vérification/reset en cours deviennent
   invalides. Prévenir les utilisateurs d'une reconnexion.
2. **`POSTGRES_PASSWORD`** : nouveau mot de passe, report dans `DATABASE_URL` (encodage
   URL des caractères réservés), `ALTER ROLE` sur la base, redémarrage db + backend,
   sauvegarde avant. Ne pas modifier le rôle de CI (distinct).
3. **`EMAIL_HOST_PASSWORD`** (mot de passe d'application Google) : révoquer l'ancien
   dans la console Google, créer le nouveau, mettre à jour `.env`, tester un envoi
   (procédure `docs/DEPLOIEMENT.md` §5 Email).
4. **`BACKUP_ALERT_EMAIL`** : fichier `/etc/choirmanager/backup.env` 600 (M-09) ; ne
   jamais remettre l'adresse dans un fichier suivi.
5. **Rclone / stockage de sauvegarde** : si le secret rclone a pu fuiter, régénérer la
   configuration (`rclone config`), révoquer l'ancien accès Google Drive, vérifier que
   les sauvegardes sont chiffrées (`chm-crypt:`) et que `restore-test.sh` passe.
6. **Vérification post-rotation** : `make prod-ps`, `make prod-smoke`, un login réel,
   un reset de mot de passe, `make prod-verif-sauvegarde`.

### Annexe B — Purge / révocation des jetons

- **Révocation volontaire** : la vue `POST /api/auth/logout/` blackliste le refresh
  présenté (idempotente, 205). Le changement de mot de passe révoque **tous** les
  refresh vivants (`authentication/services.py:revoquer_toutes_les_sessions`) et, depuis
  E-07, invalide immédiatement les access (claim `pwdv`).
- **Purge des jetons expirés** (obligatoire, planifiée) :
  ```bash
  make purge-tokens   # docker compose exec backend python manage.py flushexpiredtokens
  ```
  cron recommandé dans `docs/DEPLOIEMENT.md` §5 (`17 4 * * *`). Sans purge, la table
  `token_blacklist_outstandingtoken` croît à chaque connexion.
- **Après incident (jeton volé)** : changer le mot de passe du compte (révoque tous les
  refresh + tous les access via `pwdv`), journaliser l'événement, vérifier les connexions
  dans le journal d'audit (`audit_events`, filtre `connexion`/`echec_connexion`).
- **Faiblesse connue v1** : le logout est côté client uniquement (E-01) — tant qu'il
  n'est pas branché, considérer qu'un refresh volé reste valide jusqu'à sa rotation ou
  son expiration (7 jours).

### Annexe C — Retrait des données personnelles (`docs/membres_hdgab.csv`) et purge d'historique

> **À ne pas exécuter à l'aveugle** : réécrire l'historique casse les clones/fork et
> exige un `push --force-with-lease` coordonné. Le fichier **reste sur le disque**
> pendant l'opération (`git rm --cached` ne le supprime pas). Aucune de ces commandes
> n'a été exécutée par l'auditeur.

1. **Arrêter le suivi sans supprimer le fichier local** :
   ```bash
   git rm --cached docs/membres_hdgab.csv
   git commit -m "chore(secu): retirer le fichier de membres (données personnelles) du suivi"
   ```
   `.gitignore:33` ignore déjà `docs/membres_*.csv` ; le fichier devient non suivi.
2. **Purger l'historique** (avant toute publication de l'historique) avec
   [`git filter-repo`](https://github.com/newren/git-filter-repo) :
   ```bash
   git filter-repo --path docs/membres_hdgab.csv --invert-paths
   # Purger aussi les valeurs sensibles présentes dans d'autres chemins :
   git filter-repo --replace-text <(printf 'kekeligolo@gmail.com==>***@exemple.invalid\nSmokeMedias2026!==>***\n')
   git push --force-with-lease --all
   git push --force-with-lease --tags
   ```
3. **Après la réécriture** : tous les contributeurs re-clonent ; les PR/forks ouverts
   doivent être recréés ; purger les caches GitHub (Support) si nécessaire ; vérifier
   `git log --all -S'kekeligolo@gmail.com'` (aucun résultat), idem pour le mot de passe
   smoke ; considérer les anciens clones comme compromis.
4. **Si l'historique ne peut pas être réécrit** (miroirs externes) : considérer l'adresse
   e-mail et les numéros comme publics, informer les personnes concernées (RGPD art. 34),
   et au minimum ne plus jamais réutiliser ce fichier.
5. **Ne pas oublier les copies hors Git** : poste de l'auditeur, artefacts de CI,
   `dist/`, sauvegardes, pièces jointes d'e-mails.

### Annexe D — Checklist de vérification avant mise en production v2 / maintien v1

```bash
# 1. Static analysis et tests
cd chm-backend && python manage.py check --deploy   # W008 attendu (TLS au gateway)
pytest -q
cd ../chm-frontend && npm test && npm run build
# 2. Dépendances
pip-audit -r ../requirements.txt
npm audit --audit-level=high          # et npm audit --omit=dev pour le runtime
# 3. Compose / images
docker compose -f compose.yaml -f compose.prod.yaml config
docker build -t ... ; make audit-image
# 4. En-têtes et CSP (hôte réel, jamais la prod sans accord)
curl -sSI https://votre-domaine/ | grep -iE 'content-security-policy|strict-transport|x-frame|referrer|permissions-policy'
curl -sSI https://votre-domaine/api/core/health/ | grep -iE 'content-security-policy|x-request-id'
# 5. Médias privés à travers Nginx
make prod-smoke SMOKE_BASE_URL=https://votre-domaine
# 6. Sauvegarde / restauration
make prod-sauvegarde && make prod-verif-sauvegarde && make prod-restauration-test
# 7. Données personnelles
git ls-files docs/ | grep -E 'membres_.*\.(csv|xlsx)$'   # doit être vide
git log --all -S'kekeligolo@gmail.com' --oneline          # doit être vide après purge
# 8. Journal / jetons
make purge-tokens
# 9. Vérifier la cohérence CSP ↔ index.html (polices auto-hébergées)
grep -n 'fonts.googleapis\|fonts.gstatic' chm-frontend/src/index.html   # doit être vide
```

### Annexe E — Commandes Git et preuves utilisées

```text
git log --all --diff-filter=A --name-only                 # fichiers jamais ajoutés
git log --all --oneline --follow -- docs/membres_hdgab.csv # b5949dc (ajout)
git log --all -S'kekeligolo@gmail.com' --oneline           # ed06581, b5949dc
git log --all -S'SmokeMedias2026' --oneline                # 56b54bb
git log --all --oneline -- .env .env.local .env.prod       # aucun résultat
git grep -nIiE 'password|secret|token|PRIVATE KEY|AKIA'  # placeholders seulement
git grep -nI 'kekeligolo@gmail.com'                        # 3 occurrences (dont 1 corrigée)
git -C chm-frontend grep -nI '/auth/logout' -- src        # aucun résultat (E-01)
```
`nmbr` : `npm audit` (Lead, 11/11), `.npm-audit.json` (racine) : 3 critiques / 22 élevées
/ 25 modérées / 2 faibles / 52 total.

---

## 7. Conclusion

Le backend v1 est **globalement bien construit** sur les axes qui comptent le plus
(isolation tenant, permissions, médias, reset de mot de passe, throttles) et a été
nettement renforcé pendant l'audit (CSP serveur, CHECK_REVOKE, CSV, observabilité).
Le risque résiduel est **structurel côté client** : stockage des jetons en
`localStorage`, logout non révocateur, MFA absente, chaîne npm non maîtrisée. Ces
points sont traités **par construction** dans la v2 (`jetons en mémoire + refresh
httpOnly`, CSP, RBAC, rate limiting, audit, MFA-ready), mais deux actions restent
indispensables et **indépendantes de la v2** :

1. **retirer les données personnelles du dépôt et de son historique** (C-01) — c'est
   une obligation, pas une recommandation ;
2. **traiter les 52 vulnérabilités npm** avant de construire/publier une image
   frontend (C-03), et vérifier la cohérence CSP ↔ polices (M-01) sur l'hôte réel.

Aucun commit n'a été effectué. Le dépôt reste modifié dans l'arbre de travail, comme
demandé.
