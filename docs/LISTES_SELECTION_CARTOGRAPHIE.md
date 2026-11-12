# Cartographie des listes de sélection — socle « listes par tenant »

> Document de travail à **valider avant tout code** de la fonctionnalité
> « listes de sélection persistantes et multi-tenant ». Il recense les listes
> de choix du dépôt et les classe en trois catégories. Rien n'est implémenté
> tant que cette carte n'est pas validée.

## Méthode et critère de tri

Inventaire fait sur `chm-backend/**/models.py`, `**/serializers.py`,
`**/views.py`, `**/admin.py` et sur `chm-frontend/src/app/**` (tableaux
d'options, `ngModel` de `<select>`). Les listes purement décoratives (étapes
d'un assistant, entrées d'un menu) ne sont pas retenues.

Critère appliqué pour dire qu'une liste est un **référentiel tenant** :

1. la changer ne modifie **aucune règle** de calcul, de permission ou de
   workflow ;
2. deux chorales peuvent légitimement avoir des valeurs différentes.

Sinon elle reste **fermée** (règle métier) ou **technique** (vocabulaire
interne / référentiel standard).

## A. Référentiel tenant — à rendre éditable par la chorale

| # | Liste | Source actuelle | Valeurs actuelles | Consommateurs | Cible |
|---|-------|-----------------|-------------------|---------------|-------|
| **A1** | **Types de rendez-vous** (pilote) | `planning.Evenement.Type` + `Serie.type_evenement` (`CharField` + choices) | concert, culte, réunion, audition, veillée, formation, sortie, autre | `planning/models.py`, `serializers.py`, `views.py` (calendrier), `admin.py` (badges), front `planning.component.ts` (`types`, `typeClass`), `styles.css` (`.planning-badge--*`, `.planning-dot--*`) | `Liste(code="type_evenement")` ; code conservé côté `Evenement` ; **couleur/icône/ordre portés par la valeur**. |
| **A2** | **Pupitres** | `membres.Pupitre` (modèle déjà tenant, + `PupitreViewSet`) | Soprano, Alto, Ténor, Basse (seed) + libres | `structure.component.ts`, `Membre.pupitre`, présences, tarifs | Déjà un modèle tenant ; à unifier dans l'écran de gestion. |
| **A3** | **Catégories de pupitre** | `membres.Pupitre.Categorie` (choices) | soprano, mezzo, alto, ténor, baryton, basse, autre | `structure.component.ts` (`CATEGORIES_PUPITRE`) | Candidat `Liste(code="categorie_pupitre")` — **à trancher**. |
| **A4** | **Thèmes de chants** | `musique.Theme` (modèle déjà tenant, + `ThemeViewSet`) | libres | répertoire, chants | Déjà un modèle tenant ; à unifier dans l'écran de gestion. |
| **A5** | **Styles de chant** | `musique.Chant.Style` (choices) | classique, moderne, traditionnel, gospel, liturgique, autre | `repertoire-list.component.ts` (`STYLES`) | Candidat `Liste(code="style_chant")` — **à trancher**. |
| **A6** | **Catégories financières** | `finances.CategorieMouvement` (modèle tenant, + `CategorieMouvementViewSet`) | Cotisation, Don, Subvention, Vente, Autre entrée, Location, Transport, Matériel, Restauration, Impression, Autre sortie (seed) | finances (mouvements) | Déjà un modèle tenant ; à unifier dans l'écran de gestion. |
| **A7** | **Types de campagne** | `finances.CampagneCotisation.TypeCampagne` (choices) | mensuelle, annuelle, ponctuelle, événementielle | finances | Candidat `Liste(code="type_campagne")` — **à trancher**. |
| **A8** | **Modes de paiement** | front uniquement (`MODES_PAIEMENT`) | espèces, mobile money, virement, chèque, autre | `cotisations.component.ts` (modale, CSV) | **Non persisté** aujourd'hui ; candidat si on veut le stocker sur le paiement. |

> ⚠️ Le front `planning.component.ts` mélange dans `types` les types
> d'**événement** et le type structurel `repetition` (qui vient de
> `Serie.Type`). Le pilote doit laisser `repetition` **fermé** : seule la
> partie « événement » devient une liste tenant.

## B. Choix métier fermé — reste en code

| Liste | Emplacement | Pourquoi elle reste fermée |
|-------|-------------|-----------------------------|
| Statut de présence | `presences.Presence.StatutPresence` | pilote les taux d'assiduité et le pointage |
| Statut de membre | `membres.Membre.Statut` | pilote le groupe de base (`GROUPE_BASE_PAR_STATUT`) |
| Statut de demande de permission | `presences.DemandePermission.StatutDemande` | workflow approuver/refuser |
| Statut d'invitation | `membres.InvitationNominative.Statut` | workflow accepter/refuser |
| Statut de demande de chorale | `core.DemandeChorale.Statut` | modération plateforme |
| Statut de suggestion | `core.Suggestion.Statut` | support plateforme |
| Statut de cotisation | `finances.Cotisation.StatutCotisation` | dérivé des paiements (calcul) |
| Réponse événement (RSVP) | `planning.ReponseEvenement.Statut` | workflow RSVP |
| Sens / type de mouvement | `finances.Mouvement.Sens`, `CategorieMouvement.TypeMouvement` | calcul du solde (entrée/sortie) |
| Type de série | `planning.Serie.Type` | structurel : répétition vs événement |
| Fréquence de série | `planning.Serie.Frequence` | moteur de récurrence |
| Statut d'apprentissage | `musique.SeanceChant.StatutApprentissage` | progression pédagogique — **à trancher** |
| Type de notification | `notifications.Notification.Type` | routage interne |
| Statut d'envoi WhatsApp/SMS | `notifications.*.Statut` | technique (livraison) |
| Action / source d'audit | `audit.EvenementAudit.Action/Source` | vocabulaire stable du journal |
| Type de poste | `membres.Poste.TypePoste` | classement d'affichage — **à trancher** |
| Sexe | `membres.Membre.Sexe` | identité (critère de tarif) |

## C. Configuration technique — reste en code / settings

| Liste | Emplacement | Pourquoi |
|-------|-------------|----------|
| Devises | `core.Chorale.Monnaie` | ISO 4217, formatage comptable |
| Type de fichier média | `musique.MediaChant.TypeFichier` | comportement backend (validation/rendu ; vidéo non implémentée) |
| Portée média | `musique.MediaChant.Portee` | technique audio — **candidat tenant à trancher** |
| Jours / mois | front (`JOURS`, `MOIS`, `joursSemaineOptions`) | calendrier |
| Filtres UI | front (`filtresPeriode`, `filtresEtat`, `periodes`, `filtresMesDemandes`) | UX |
| Groupes RBAC | `core/services.GROUPES_RBAC` | vocabulaire fixe des permissions |
| Pays / indicatifs | `shared/data/pays-indicatifs.ts` | référentiel généré (ISO) |

## D. Modèles de configuration déjà tenant (état des lieux)

Ces modèles existent déjà, sont scopés `Chorale`, et plusieurs ont un
`ModelViewSet` : `Pupitre`, `Poste`, `CategorieMouvement`, `Theme`,
`CampagneCotisation` / `TarifCotisation`. Le besoin « listes éditables » les
concerne, mais **les remplacer par un socle générique serait une migration
lourde** (FK `Membre.pupitre`, `Mouvement.categorie`, `Chant.themes`, etc.).
La proposition est donc de **ne pas les remplacer** : le socle générique sert
aux listes de **codes** (dont A1), et l'écran de gestion unifie l'édition.

## E. Décisions à valider avant de coder

1. **Périmètre du pilote** : types de rendez-vous seuls (A1), ou aussi
   pupitres (A2) dès cette session ?
2. **Modèles existants (A2/A4/A6)** : on les garde comme cibles FK et on
   n'unifie que l'écran, ou on les remplace par `Liste`/`ValeurListe` ?
3. **Champ pilote `Evenement.type_evenement`** : reste un `CharField` (code)
   validé contre la liste du tenant, ou devient une FK `ValeurListe` ?
4. **A3/A5/A7/A8** : « référentiel tenant » ou « fermé » ?
5. **`StatutApprentissage`, `Poste.TypePoste`, `Portee`** : fermés ou tenant ?

## F. Architecture proposée (à confirmer avec la carte)

- `Liste` : `chorale`, `code` (stable, unique par chorale), `nom`,
  `description`, `type_valeur` (texte/couleur…), `modifiable` (bool),
  `created_at/updated_at`.
- `ValeurListe` : `liste`, `code`, `libelle`, `ordre`, `actif`,
  `par_defaut`, `couleur`, `icone`, `parent` (optionnel), `created_at/updated_at`.
- Contraintes : `unique(chorale, code)` sur `Liste`, `unique(liste, code)` sur
  `ValeurListe` ; désactivation (`actif=False`), jamais de suppression d'une
  valeur référencée.
- API : `/api/core/listes/` et `/api/core/listes/{code}/valeurs/` (CRUD borné
  au tenant actif, lecture membre, écriture bureau/MDC), cache par
  `(chorale, code)`.
- Migration : pour chaque chorale, seed des valeurs actuelles (A1 en premier)
  + commande idempotente `seed_listes` ; les occurrences existantes gardent
  leur code.
- Front : un composant `select-liste` unique (chargement, cache, défaut,
  désactivation, création rapide si autorisé), réutilisé par le formulaire
  planning ; les couleurs de valeurs alimentent les badges/calendrier sans
  second système de design.
