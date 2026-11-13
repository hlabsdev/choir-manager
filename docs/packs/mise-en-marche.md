# Pack de délégation C — Mise en marché de l'abonnement

Chemin proposé dans le dépôt : `docs/packs/mise-en-marche.md` (superprojet).
Complément du pack `abonnement-verrou.md` (A1 à A3, livré en `v2.5.0`) et du
pack `messages-quotas.md` (B0 à B3). Lisible par tout agent de code (Claude
Code, Codex, autre) : aucune fonction propre à un outil n'est requise.

## 1. Mode d'emploi

- Trois tâches ordonnées : **C1 → C2 → C3**. Une tâche = une session.
- Chaque tâche commence par une phase 1 en lecture seule qui produit un
  rapport écrit, puis l'agent s'ARRÊTE. L'humain valide en citant le rapport
  avant la phase 2.
- C2 ne démarre qu'après C1 fusionnée et vérifiée. C3 après C2 v1.
- **Ce pack est indépendant du pack B** : aucune tâche C n'attend un rapport
  d'observation, aucune décision DB (quota) n'est nécessaire. Les deux packs
  se coordonnent sur trois surfaces seulement, listées en §3.
- **Les montants (P1) et les périodicités (P2) ne bloquent AUCUNE tâche de
  code.** Ils sont lus depuis la base (`TarifPlan`) et activables par l'admin
  une fois tranchés. Le placeholder `0` reste valide pour tester la chaîne.
- Hors de ce pack : quotas de messages (pack B), paiement en ligne,
  facturation, génération de devis ou de reçus PDF.
- Le protocole de session du dépôt est dans `CLAUDE.md`. Si l'outil lit
  `AGENTS.md`, ce fichier doit renvoyer vers `CLAUDE.md`.

## 2. Faits constatés dans le dépôt (à ne pas redécouvrir)

- L'app `abonnements` est livrée : modèle 1:1 `Abonnement`, historique
  append-only, service unique d'écriture, garde structurelle, registre de
  fonctionnalités à défaut fermé, refus 403 `fonctionnalite_non_incluse`,
  écran « Mon abonnement » Bureau en lecture seule, console opérateur A3,
  `manage.py rappeler_echeances_abonnement --jours 30,7`.
- L'app `diffusion` existe et sert déjà à annoncer à toutes les chorales, un
  groupe ou une seule ; e-mail par défaut, SMS/WhatsApp en option.
- La page `/contact` publique a `environment.contactEmail` en dur côté front,
  qui doit correspondre à `EMAIL_REPLY_TO_PLATEFORME` côté back.
- Il n'existe **aucun tarif ni périodicité** dans le code ni en base.
- Il n'existe **aucune page publique** qui explique l'abonnement Pro, ses
  tarifs ou son mode d'activation.
- L'opérateur change aujourd'hui un abonnement via l'admin Django ou en
  shell — aucun outil dédié.

## 3. Coordination avec le pack B (contrats à ne pas casser)

Trois surfaces sont partagées avec `messages-quotas.md`. Ne pas les écrire
deux fois.

| Surface | Propriétaire | Ce que l'autre pack consomme |
|---|---|---|
| `abonnements/services.py::changer_etat(chorale, plan, echeance, motif, acteur)` | C1 (déjà livré par A1) | B2 appelle ce même service pour l'**octroi de crédits** (méthode ajoutée, même fichier) |
| `abonnements/models.py::TarifPlan` | C1 (créé ici) | B1 range son **quota par plan et par canal** dans ce même modèle, dans un champ `quota_sms` / `quota_whatsapp` |
| `/mon-abonnement` (front) | C2 v1 (bouton « Comment passer en Pro ? ») | B3 y ajoute **son bloc consommation** sans réécrire l'en-tête |

Conséquence : C1 et B1 ne sont **pas** en conflit de fichier si B1 attend que
C1 ait livré `TarifPlan`. Inversement, B1 peut livrer sans C1 et poser son
propre modèle de quota — mais alors on aura deux modèles de paramètres de plan
à fusionner plus tard. **Ordre recommandé : C1 avant B1.**

## 4. Décisions à arbitrer AVANT dispatch

Aucune tâche ne démarre sans ces décisions. Elles ne bloquent pas le code
(valeurs par défaut en base), seulement la **communication finale** aux
chorales.

| # | Question | Options | Proposition | Décision |
|---|---|---|---|---|
| P1 | Montant du plan Pro | libre | à trancher par l'humain ; placeholder `0` accepté en base | ____ |
| P2 | Périodicités offertes | (a) mensuel seul ; (b) annuel seul ; (c) les deux | (c) : deux lignes `TarifPlan`, le annuel affiché « 2 mois offerts » | ____ |
| P4 | Moyens de paiement acceptés | virement, Mobile Money (T-Money / Flooz) | les trois, à documenter en texte sur la page | ____ |
| P5 | Langue de la page publique | FR uniquement, ou FR + bilingue | FR seul (cohérent avec `/contact`) | ____ |

## 5. Décisions déjà prises (communes aux trois tâches)

- Le service unique d'écriture d'abonnement d'A1 reste le seul point d'écriture
  de `plan` et `statut` — la garde structurelle d'A1 vérifie déjà cela.
- Les tarifs sont **lus depuis la base**, jamais en dur dans le frontend.
- Les tarifs sont gérés par l'**opérateur seul** via l'admin Django et via
  `manage.py gerer_abonnement`. Aucune API d'écriture publique, aucun écran
  Angular opérateur pour les tarifs.
- La page publique `/abonnement` est **publique** (aucun guard), comme
  `/a-propos`, `/contact`, `/suggestions`.
- Toute erreur que le front doit distinguer porte un code machine.
- Aucun paiement en ligne, aucun devis PDF, aucune facture PDF dans ce pack :
  l'activation reste manuelle par l'opérateur, sous 24 h ouvrées.
- `Fonctionnalite.PRO` (registre A2) est la source unique des fonctionnalités
  listées comme payantes sur la page publique — pas de duplication dans le
  front.

---

# Tâche C1 — Socle tarifs et outillage opérateur unifié

Lis d'abord le protocole de session du dépôt (`CLAUDE.md`, ou `AGENTS.md` s'il
existe) et les références ci-dessous.

## Contexte
L'app `abonnements` permet de changer l'état d'une chorale, mais il n'existe
ni tarif, ni outil opérateur dédié pour cette action. Cette tâche pose le
modèle de paramètres de plan (tarif, périodicité, quota — quota consommé plus
tard par le pack B) et une commande `manage.py` unique pour l'opérateur.

## Références à lire
- `CLAUDE.md` (sections Abonnement et verrou serveur, Journal d'audit)
- `docs/packs/abonnement-verrou.md` (A1)
- `abonnements/models.py`, `abonnements/services.py`, `abonnements/admin.py`
- `core/services.py::provisionner_chorale` (modèle de commande `manage.py` avec
  résolution floue du nom de chorale, motif, `--dry-run`, `contexte_audit()`)
- Le pattern de `manage.py rappeler_echeances_abonnement` (idempotence,
  `--dry-run`, journalisation)
- `core/medias.py` (modèle de registre extensible)

## Objectif
Chaque ligne `TarifPlan` active est lue par la page publique (C2) et par
`envoyer_sms()` (pack B1). La commande `manage.py gerer_abonnement` permet à
l'opérateur de changer plan/échéance d'une chorale, avec motif et audit.

## Périmètre
- Inclus : modèle `TarifPlan` (plan, périodicité, montant, devise, actif,
  quota_sms, quota_whatsapp — les deux derniers vides tant que B1 n'a pas
  livré) ; endpoint public `GET /api/abonnements/tarifs/` ;
  `manage.py gerer_abonnement` (changement d'état, `--dry-run`, motif
  obligatoire, audit) ; actions admin « Activer Pro » / « Repasser en
  Standard » sur `AbonnementAdmin`, appelant le service A1.
- Exclu : page publique (C2), communication (C3), crédits de messages (B2),
  quota (B1/B2), prix en ligne, devis et factures PDF.

## Décisions déjà prises (non négociables)
- Voir §5, plus P1, P2, P4 tranchées en §4.
- Une ligne `TarifPlan` par (plan, périodicité, devise) active ; contrainte
  d'unicité partielle `WHERE actif=True`.
- `plan` d'un `TarifPlan` n'admet que `pro` (les plans `libre` et `pionnier`
  sont gratuits et n'ont pas de ligne tarifaire).
- La commande appelle le service A1 (`changer_etat`) — pas d'écriture directe
  de `plan`/`statut` hors service, la garde structurelle d'A1 doit rester
  verte.
- Motif obligatoire sur toute action modifiante.

## Phase 1 — Diagnostic (lecture seule)
Questions factuelles :
1. Signature exacte et comportement actuel de
   `abonnements/services.py::changer_etat`. Gère-t-il `echeance`, le motif,
   l'auteur ?
2. Comment l'admin `AbonnementAdmin` est-il scopé opérateur, et le pattern
   `response_action` déjà utilisé dans le dépôt (cf. `AuditAdminMixin`) est-il
   disponible ?
3. `provision_chorale` résout-il le nom de chorale de façon floue ? Peut-on
   réutiliser la même fonction ?
4. L'endpoint `/api/abonnements/droits/` (A2) est-il protégé par
   `EstMembreDuTenant` ? Le nouvel endpoint `/tarifs/` doit-il être
   `AllowAny` ? Confirmer.
5. Où ajouter `TarifPlan` : `abonnements/models.py`, ou un module séparé
   `abonnements/parametres.py` ? Proposer sans trancher.
Livrable : `docs/packs/rapports/C1-phase1.md`
Puis STOP. Attends un message qui cite la validation.

## Phase 2 — Implémentation (après validation)
1. Modèle `TarifPlan` avec contrainte d'unicité partielle.
2. Admin `TarifPlanAdmin` scopé opérateur, avec actions
   « Activer Pro 12 mois » / « Repasser en Standard » via le service A1
   (motif obligatoire via `response_action`).
3. Endpoint `GET /api/abonnements/tarifs/`, `AllowAny`, lecture seule.
4. `manage.py gerer_abonnement` :
   ```
   manage.py gerer_abonnement --chorale X --etat
   manage.py gerer_abonnement --chorale X --plan pro --periodicite annuel \
     --motif "..." [--echeance YYYY-MM-DD] [--dry-run]
   ```
   L'échéance est calculée depuis `--periodicite` si omise. La commande
   journalise via `journaliser()` (audit) et notifie le Bureau via `notifier()`
   (e-mail + in-app) après succès.
5. Garde structurelle : un test échoue si `TarifPlan` est écrit hors de
   l'admin/commande (aucun endpoint d'écriture n'existe — mais la garde doit
   le prouver).

## Critères de fin
- [ ] `python manage.py makemigrations --check` ne signale rien.
- [ ] Suite complète verte sous PostgreSQL.
- [ ] Le endpoint `/api/abonnements/tarifs/` retourne 200 en anonyme et
      expose au moins les champs `plan`, `periodicite`, `montant`, `devise`.
- [ ] `manage.py gerer_abonnement` en `--dry-run` n'écrit rien (état inchangé
      après exécution).
- [ ] Sans `--motif`, la commande refuse en erreur claire (non silencieuse).
- [ ] Mutation (retirer la vérification `motif` dans le service) : test rouge,
      puis restauré (log joint).
- [ ] Mutation (retirer la garde structurelle d'A1) : test rouge, puis
      restauré (log joint).

## Tests exigés
- Seul l'opérateur peut changer l'état via la commande ou l'action admin
  — mutation : oui
- Le changement produit une ligne d'historique avec motif et auteur
  — mutation : oui
- Un `TarifPlan` sans devise échoue en validation (non silencieux)
  — mutation : oui
- `manage.py gerer_abonnement --etat` est en lecture seule
  — mutation : non

## Arrêts propres à cette tâche
- Tout besoin de stocker un montant en dur dans le frontend : STOP.
- Tout besoin de créer un endpoint d'écriture de `TarifPlan` : STOP.
- Toute question de prix ou de paiement : hors périmètre, STOP.

---

# Tâche C2 — Page publique `/abonnement` et points d'entrée

Lis d'abord le protocole de session du dépôt (`CLAUDE.md`, ou `AGENTS.md` s'il
existe) et les références ci-dessous.

## Contexte
C1 est livrée : tarifs et outillage opérateur existent. Il manque la page
publique où un user atterrit pour comprendre ce qu'il achète et comment
s'abonner.

## Références à lire
- `docs/packs/rapports/C1-phase1.md` et le code livré en C1
- `CLAUDE.md` (sections Frontend, Système de design)
- `chm-frontend/src/app/features/public/` (structure des pages publiques
  existantes : `a-propos`, `contact`, `suggestions`)
- `chm-frontend/src/app/features/operateur/` (pour voir ce qui existe déjà et
  qu'on n'étend PAS)
- L'écran `/mon-abonnement` (existant, en lecture seule Bureau)
- Le gestionnaire de 403 `fonctionnalite_non_incluse` (A3)

## Objectif
La page `/abonnement` est publique, liste les fonctionnalités Pro, affiche les
tarifs depuis l'API, et explique en 4 étapes comment s'abonner. Trois points
d'entrée y mènent (footer public, `/mon-abonnement`, encart 403).

## Périmètre
- Inclus : écran `/abonnement` (route publique, sans guard) ; trois liens
  (footer public, bouton sur `/mon-abonnement`, encart `fonctionnalite_non_incluse`) ;
  lecture des tarifs via `GET /api/abonnements/tarifs/` ; lecture des
  fonctionnalités Pro via le registre A2 (déjà exposé par `/api/abonnements/droits/`).
- Exclu : quotas et crédits (B1/B2/B3), formulaire de commande en ligne,
  paiement, génération de devis.

## Décisions déjà prises (non négociables)
- Voir §5, plus P1, P2, P4 tranchées en §4.
- Pas de montant en dur côté front : lecture depuis l'API, fallback « tarif
  sur demande » si l'API renvoie une liste vide (ne jamais casser la page).
- Pas de second système de design : réutiliser `.page-shell`, `.card`,
  `.btn-primary`, `.eyebrow`, `.page-title`, `.page-subtitle` (cf.
  `CLAUDE.md` § Système de design).
- Le message de refus 403 `fonctionnalite_non_incluse` ajoute un lien
  « En savoir plus sur l'abonnement » pointant vers `/abonnement`, sans
  montant ni lien de paiement.

## Phase 1 — Diagnostic (lecture seule)
Questions factuelles :
1. Où est déclaré le pied de page public, et comment y ajouter un lien sans
   casser les trois pages existantes ?
2. Où est le gestionnaire de 403 `fonctionnalite_non_incluse` (composant,
   service), et comment y ajouter le lien ?
3. `/mon-abonnement` : structure actuelle (onglet, en-tête uniformisé). Où
   placer le bouton « Comment passer en Pro ? » ?
4. Le registre A2 expose-t-il un libellé utilisable pour chaque
   fonctionnalité Pro, ou seulement un code machine ?
5. Les classes `.page-shell` / `.card` / `.btn-primary` sont-elles utilisables
   telles quelles dans `features/public/`, ou faut-il un ajustement ?
Livrable : `docs/packs/rapports/C2-phase1.md`
Puis STOP. Attends un message qui cite la validation.

## Phase 2 — Implémentation (après validation)
1. Composant `features/public/abonnement/`, route `/abonnement` sans guard.
2. Sections : hero, fonctionnalités Pro (registre A2), comparatif
   Standard/Pro (tableau 2 colonnes), tarifs (API), 4 étapes d'activation,
   FAQ (dont la bascule Pionnier → Standard au 31/12/2026 + 15 j de grâce et
   la politique D4 : noyau libre intact, aucune donnée supprimée), contact
   (mêmes coordonnées que `/contact`).
3. Trois points d'entrée : lien footer public, bouton `/mon-abonnement`,
   lien dans l'encart 403.
4. Gestion explicite chargement / vide / erreur sur l'appel tarifs.

## Critères de fin
- [ ] `ng build` sans erreur ni avertissement nouveau.
- [ ] Suite Vitest verte.
- [ ] Test : la page s'affiche sans être authentifié (accès anonyme).
- [ ] Test : si l'API tarifs renvoie `[]`, un message de repli s'affiche,
      pas d'erreur console.
- [ ] Test : un clic sur le lien depuis l'encart 403 navigue vers
      `/abonnement`.

## Tests exigés
- Accès anonyme à `/abonnement` — mutation : non
- Fallback si tarifs vides — mutation : non
- Lien depuis 403 → `/abonnement` — mutation : non

## Arrêts propres à cette tâche
- Tout besoin d'un formulaire de commande en ligne ou d'un bouton « Payer » :
  STOP, hors périmètre.
- Tout besoin de modifier le service A1 ou `TarifPlan` : STOP, signaler.

---

# Tâche C3 — Communication de lancement

Lis d'abord le protocole de session du dépôt (`CLAUDE.md`, ou `AGENTS.md` s'il
existe) et les références ci-dessous.

## Contexte
C2 v1 est livrée : la page publique existe et trois points d'entrée y mènent.
Il reste à annoncer le lancement aux chorales pilotes et à vérifier que les
rappels automatiques d'échéance sont bien planifiés.

## Références à lire
- `docs/packs/rapports/C2-phase1.md` et le code livré en C2
- L'app `diffusion` (livrée en v2.5.0) : `docs/packs/abonnement-verrou.md` §
  « Diffusion opérateur »
- `docs/DEPLOIEMENT.md` (section cron)
- `CLAUDE.md` § « Chantiers connus » (pour vérifier que rien d'autre n'est en
  attente)

## Objectif
Les chorales pilotes savent que la page `/abonnement` existe, que les tarifs
sont publiés, et que leur statut Pionnier se termine au 31/12/2026. Le cron
qui déclenche `rappeler_echeances_abonnement` est réellement actif.

## Périmètre
- Inclus : message de diffusion préparé (brouillon dans `diffusion`, non
  envoyé) ; vérification de la présence du cron sur le VPS (rapport écrit) ;
  ajout du cron dans `docs/DEPLOIEMENT.md` si absent.
- Exclu : décision d'envoyer ou non (acte humain après lecture du rapport) ;
  modification du contenu de la page publique.

## Décisions déjà prises (non négociables)
- Le brouillon de diffusion est un **brouillon** : la tâche le crée, elle ne
  l'envoie pas. L'envoi est un acte humain séparé.
- Le rapport de vérification de cron est factuel : présent / absent, chemin
  exact, commande exacte. Pas de « probablement ».

## Phase 1 — Diagnostic (lecture seule)
Questions factuelles :
1. Comment créer un brouillon de diffusion (route API, écran, ou commande) ?
2. Sur le VPS, le cron qui exécute `rappeler_echeances_abonnement` existe-t-il
   aujourd'hui ? Quelle est sa périodicité, son utilisateur, son fichier ?
   (Lecture seule des logs et de `crontab -l`.)
3. Si absent, quelle est la procédure exacte de `docs/DEPLOIEMENT.md` pour
   l'ajouter, et quel emplacement est recommandé ?
Livrable : `docs/packs/rapports/C3-phase1.md`
Puis STOP. Attends un message qui cite la validation.

## Phase 2 — Implémentation (après validation)
1. Créer le brouillon de diffusion (titre, corps, canaux = e-mail
   uniquement), destinataires = toutes les chorales.
2. Si le cron est absent, compléter `docs/DEPLOIEMENT.md` avec la ligne exacte
   à ajouter, sans l'ajouter sur le VPS (acte humain séparé).

## Critères de fin
- [ ] Le brouillon apparaît dans la liste des diffusions, statut
      « brouillon », non envoyé.
- [ ] `docs/DEPLOIEMENT.md` contient la ligne de cron si elle manquait, ou
      mentionne explicitement qu'elle est présente.

## Tests exigés
- Aucun test automatisé (tâche documentaire et opérationnelle).

## Arrêts propres à cette tâche
- Toute action d'envoi de la diffusion : STOP, acte humain.
- Toute modification du VPS : STOP, acte humain.
