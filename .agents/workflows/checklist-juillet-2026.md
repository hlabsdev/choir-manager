# ChoirManager — Checklist fonctionnelle de recette (MVP)

> Objectif : définir, écran par écran, ce que le frontend doit **réellement faire**
> (pas seulement afficher), l'endpoint backend correspondant, et la visibilité par rôle.
> Convention de cochage : `[ ]` à faire · `[~]` partiel/vitrine · `[x]` fonctionnel et vérifié.
>
> Rôles : ADM (Admin/superuser) · BUR (Bureau) · TRE (Trésorier) · MDC (Maître de chœur) · MBR (Membre actif) · HON (Honoraire)

---

## ⏱️ État global au 2026-07-23 (mise à jour)

**MVP complet.** Tous les modules 0 à 6 sont fonctionnels et vérifiés (~86 tests
backend, 32 tests Vitest côté front), plus un module **Annonces** ajouté hors
checklist initiale.

**Fait & vérifié** : auth/refresh/guards · états d'écran · multi-tenant (isolation
testée par app + fix d'une fuite `themes_ids` + seed 2e chorale) · membres
(liste/formulaire/fiche/mandats) · **pupitres/postes + organigramme** (page
`/structure`) · présences (séances/pointage/permissions) · répertoire
(chants/partitions/thèmes/séances) · finances (journal/cotisations/tarifs/actions
groupées) · **rapports** (financier/présences/effectifs/répertoire + exports PDF
WeasyPrint & CSV) · **dashboard** réel et 100 % actionnable · onboarding opérateur
(`provision_chorale`) et **Annonces** (communications).

**Reste hors périmètre MVP** (cf. §7) : audio, push, calendrier externe, emails
auto, app native, module Activités/Planning.

---

## 0. Transversal (conditionne tous les modules)

### 0.1 Authentification & session
- [ ] Login : formulaire → `POST /api/auth/token/` → stockage access+refresh → redirection dashboard
- [ ] Erreur de login affichée (mauvais identifiants ≠ écran figé) — message FR clair
- [ ] Refresh automatique sur 401 (intercepteur, mutualisé) → rejouer la requête
- [ ] Échec du refresh → logout + redirection `/login` (jamais d'écran silencieusement vide)
- [ ] Logout : purge tokens + état signals + redirection
- [ ] Guard par rôle multi-rôles (`roleGuard(['bureau','tresorier'])`) sur toutes les routes sensibles
- [ ] L'UI masque les actions non autorisées (boutons/menus) **et** le backend les refuse (403) — les deux, jamais l'un sans l'autre

### 0.2 États d'écran obligatoires (chaque liste/page)
- [ ] État chargement : skeleton loader (pas de blanc)
- [ ] État vide : message + action principale ("Aucun membre — Ajouter le premier")
- [ ] État erreur : message + bouton réessayer (pas d'erreur avalée dans `error: () => isLoading.set(false)`)
- [ ] Toute action d'écriture donne un feedback : toast succès / message d'erreur / bouton désactivé pendant l'envoi

### 0.3 Multi-tenant
- [ ] Toute requête liste/détail est filtrée par `request.chorale` côté backend (mixin présent sur CHAQUE ViewSet)
- [ ] Aucun ID d'une autre chorale accessible par URL directe (test : 404/403)

---

## 1. Membres & Structure

### 1.1 Liste des membres — visible BUR (complet), TRE/MDC (lecture), MBR (non)
- [ ] Liste chargée depuis `GET /api/membres/membres/` (pagination si >50)
- [ ] Recherche par nom (client ou `?search=`) fonctionnelle
- [ ] Filtres : pupitre, statut (actif/inactif/honoraire/stagiaire)
- [ ] Bascule grille/liste (déjà OK) — les DEUX vues utilisent `pupitre_categorie` (champ plat)
- [ ] Bouton **« Ajouter un membre »** (BUR/ADM uniquement) → ouvre formulaire
- [ ] Clic sur un membre → fiche détail

### 1.2 Formulaire membre (création/édition) — BUR/ADM
- [ ] Création : `POST /api/membres/membres/` (crée aussi le User Django associé — définir le flux : mot de passe provisoire ? invitation ?)
- [ ] Édition : `PATCH /api/membres/membres/{id}/`
- [ ] Champs : nom, prénom, email, téléphone, pupitre (select depuis `GET /api/membres/pupitres/`), statut, date d'adhésion, photo (upload)
- [ ] `numero_membre` auto-généré affiché en lecture seule
- [ ] Validations affichées champ par champ (erreurs DRF mappées sur le formulaire)
- [ ] Suppression = **soft delete** avec modale de confirmation → `DELETE` → disparaît de la liste

### 1.3 Fiche membre — BUR (tout), MDC/TRE (lecture), MBR (la sienne uniquement)
- [ ] Infos + pupitre + statut + photo
- [ ] Onglet Mandats : liste `GET /api/membres/mandats/?membre={id}` (le 401 constaté doit être résolu par le refresh)
- [ ] Bouton **« Attribuer un poste »** (BUR/ADM) → select poste + date début → `POST /api/membres/mandats/`
- [ ] Erreur `unique_actif` (poste déjà occupé) affichée clairement avec le nom du titulaire actuel
- [ ] Bouton **« Clôturer le mandat »** → confirmation → `PATCH` (is_active=False, date_fin)
- [ ] Onglet Présences du membre : historique + taux de présence (période sélectionnable)
- [ ] Onglet Cotisations du membre : état payé/impayé par cotisation (TRE/BUR ; MBR voit le sien)

### 1.4 Pupitres & Postes — BUR/ADM
- [ ] CRUD Pupitres (nom, catégorie, ordre) — écran simple ou section paramètres
- [ ] CRUD Postes (nom, type, groupes liés, unique_actif, pupitre concerné pour chef de pupitre)
- [ ] Vue « Organigramme » : bureau actuel + maîtres de chœur + chefs de pupitre (mandats actifs) — lecture pour tous les membres

---

## 2. Répétitions & Présences

### 2.1 Liste des séances — MDC (complet), BUR/MBR/HON (lecture)
- [ ] Liste `GET /api/presences/seances/` triée par date desc, filtre par période
- [ ] Bouton **« Nouvelle séance »** (MDC/ADM) → formulaire : date, heure début/fin, lieu, type (ordinaire/spéciale)
- [ ] Édition du résumé de séance (texte riche simple) après coup

### 2.2 Écran de pointage (le cœur mobile) — MDC, éventuellement chefs de pupitre
- [ ] Ouverture d'une séance → liste des membres actifs groupés par pupitre
- [ ] Tap sur un membre : cycle présent → retard → absent → excusé (gros tap targets — déjà en place, à vérifier branché)
- [ ] Chaque tap persiste immédiatement (`POST/PATCH /api/presences/presences/`) — pas de bouton « enregistrer » global qui perd tout si on quitte
- [ ] Indicateur de synchro (échec réseau → retry visible, pas de perte silencieuse)
- [ ] Compteurs temps réel : présents / absents / taux
- [ ] Demandes de permission (absences annoncées) visibles sur l'écran de pointage (badge sur le membre)

### 2.3 Permissions d'absence — MBR crée, MDC/BUR valide
- [ ] MBR : formulaire « Demander une permission » (séance ou période, motif) → `POST /api/presences/permissions/`
- [ ] MDC/BUR : liste des demandes en attente, boutons **Approuver / Refuser** → `PATCH`
- [ ] Statut visible par le demandeur (en attente/approuvée/refusée)

---

## 3. Répertoire musical

### 3.1 Liste des chants — MDC (complet), tous les autres (lecture)
- [ ] Liste `GET /api/musique/chants/` avec recherche + filtres (style, statut d'apprentissage)
- [ ] Bouton **« Ajouter un chant »** (MDC/ADM) : titre, compositeur, style, tonalité, notes
- [ ] Upload partition (PDF/image) → stockage backend + visualisation/téléchargement depuis la fiche
- [ ] Fiche chant : métadonnées + partitions + historique « travaillé aux séances X, Y » (`SeanceChant`)

### 3.2 Lien séance ↔ chant — MDC
- [ ] Depuis une séance : **« Ajouter un chant travaillé »** → select chant + statut (introduit/en travail/maîtrisé) → `POST /api/musique/seance-chants/`
- [ ] Le statut le plus récent d'un chant = son statut dans le répertoire (calculé backend, pas dupliqué à la main)
- [ ] Vue « Répertoire actif » : chants maîtrisés, filtrable par style — c'est LA vue de sortie pour préparer un concert

---

## 4. Finances & Caisse — TRE (complet), BUR (lecture), MBR (le sien)

### 4.1 Journal de caisse
- [ ] Liste `GET /api/finances/mouvements/` : date, libellé, catégorie, débit/crédit, solde courant
- [ ] **Solde affiché = calculé backend** (agrégat), jamais côté client
- [ ] Bouton **« Nouveau mouvement »** (TRE) : date, montant, sens, catégorie, motif, membre lié (optionnel)
- [ ] Modification/suppression (soft delete) réservée TRE avec confirmation — un mouvement supprimé reste visible ADM avec `?include_deleted`
- [ ] Filtres : période, catégorie, sens

### 4.2 Cotisations
- [ ] Définir une campagne de cotisation (libellé, montant, période, qui est concerné) — TRE/BUR
- [ ] Vue matrice : membres × campagne → payé/partiel/impayé ; tap TRE pour enregistrer un paiement (crée le mouvement lié)
- [ ] MBR : voit uniquement SES cotisations et leur état
- [ ] Relance : au minimum une liste exportable des impayés (l'envoi auto = v2)

---

## 5. Rapports & Exports — BUR/TRE (complet), MDC (lecture) — **module à créer**
- [ ] Rapport de présence : période + filtre pupitre → taux par membre, par pupitre, évolution → export PDF
- [ ] État de caisse : période → solde initial/final, mouvements par catégorie → export PDF
- [ ] État des cotisations : campagne → payé/impayé → export PDF/CSV
- [ ] Répertoire : liste filtrée (style, statut) → export PDF
- [ ] Rapport d'activité de période (synthèse : séances tenues, taux moyen, chants appris, finances) — c'est le livrable « réunion de bureau »
- [ ] Backend : app `rapports` en lecture seule qui agrège les autres apps ; génération PDF (WeasyPrint ou ReportLab)

## 6. Dashboard — par rôle
- [ ] Remplacer les données fictives par `GET /api/core/dashboard/` réel
- [ ] Cartes : effectif actif, taux de présence (4 dernières séances), solde de caisse (si TRE/BUR), prochains événements
- [ ] Le contenu s'adapte au rôle (MBR ne voit pas le solde)
- [ ] Cas superuser et « membre sans profil » gérés proprement (cf. correctifs récents)

## 7. Hors périmètre MVP (rappel — ne pas se disperser)
Enregistrements audio · notifications push · intégration calendrier externe · envoi d'emails automatiques · app native · module Activités/Planning complet (v2 — seuls les « prochains événements » du dashboard peuvent être une table simple si besoin)

---

## Ordre de bataille suggéré (une session Claude Code = un bloc)
1. **0.1 + 0.2** — session déjà lancée (refresh JWT, états d'erreur) : à finir et recetter
2. **2.2 Pointage bout-en-bout** — c'est la valeur cœur, à valider sur mobile en situation réelle
3. **1.2 + 1.3** — formulaires membres + mandats branchés
4. **4.1 + 4.2** — finances (journal + cotisations)
5. **3.1 + 3.2** — répertoire + lien séances
6. **5** — module rapports (backend puis front)
7. **6** — dashboard réel (en dernier : il agrège tout le reste)