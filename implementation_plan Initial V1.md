# ChoirManager — Plan d'Implémentation MVP

## Contexte

Plateforme professionnelle de gestion de chorale. Le brainstorming initial et les échanges avec Claude ont défini :
- Un modèle **Membre** séparé de **User** (OneToOne)
- Un système de **Mandat** lié à des **Postes** pour le RBAC
- Un signal `post_save` sur Mandat pour synchroniser les groupes Django
- Un **soft-delete** sur les modèles sensibles
- 4 modules MVP : Membres, Musique, Présences, Finances

Le modèle `membres_models.py` existant est déjà bien conçu et servira de base.

## User Review Required

> [!IMPORTANT]
> **Base de données** : Le MVP utilise **SQLite** comme demandé. La migration PostgreSQL est préparée (soft-delete compatible) mais reportée.

> [!IMPORTANT]
> **Tailwind CSS** : Vous avez spécifié Tailwind CSS pour Angular. Je vais utiliser **Tailwind CSS v3** avec la configuration Angular 17+. Confirmez cette version.

> [!WARNING]
> **Django 6+** : Django 6.0 n'est pas encore sorti (prévue 2026). Je vais utiliser **Django 5.1+** (dernière stable) sauf si vous avez une version spécifique installée. Confirmez.

---

## Arborescence Complète du Projet

```
c:\PROJETS\PERSO\CHOIR-MANAGER\
├── backend/                          # Projet Django
│   ├── manage.py
│   ├── requirements.txt
│   ├── choirmanager/                 # Configuration Django
│   │   ├── __init__.py
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   │
│   ├── core/                         # App Django: modèles partagés
│   │   ├── __init__.py
│   │   ├── models.py                 # DeletedModel mixin, TimeStampedModel
│   │   ├── permissions.py            # Permissions DRF réutilisables
│   │   ├── pagination.py             # Pagination standard
│   │   └── utils.py
│   │
│   ├── authentication/               # App Django: Auth + JWT
│   │   ├── __init__.py
│   │   ├── models.py
│   │   ├── serializers.py            # Login, Register, Token custom
│   │   ├── views.py
│   │   ├── urls.py
│   │   └── backends.py
│   │
│   ├── membres/                      # App Django: Membres & Structure
│   │   ├── __init__.py
│   │   ├── models.py                 # Pupitre, Poste, Membre, Mandat
│   │   ├── signals.py                # Synchro groupes Django
│   │   ├── serializers.py
│   │   ├── views.py                  # ViewSets DRF
│   │   ├── urls.py
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── filters.py
│   │   ├── tests/
│   │   │   ├── __init__.py
│   │   │   ├── test_models.py
│   │   │   ├── test_signals.py
│   │   │   └── test_api.py
│   │   └── migrations/
│   │       ├── 0001_initial.py
│   │       └── 0002_data_bootstrap.py  # Data migration: pupitres + postes + groupes
│   │
│   ├── musique/                      # App Django: Répertoire Musical
│   │   ├── __init__.py
│   │   ├── models.py                 # Chant, Partition, SeanceChant
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── filters.py
│   │   └── migrations/
│   │
│   ├── presences/                    # App Django: Répétitions & Présences
│   │   ├── __init__.py
│   │   ├── models.py                 # Repetition, Presence, PermissionRequest
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   ├── admin.py
│   │   ├── apps.py
│   │   └── migrations/
│   │
│   └── finances/                     # App Django: Cotisations & Caisse
│       ├── __init__.py
│       ├── models.py                 # Mouvement, Cotisation
│       ├── serializers.py
│       ├── views.py
│       ├── urls.py
│       ├── admin.py
│       ├── apps.py
│       └── migrations/
│
└── frontend/                         # Projet Angular 17+
    ├── angular.json
    ├── package.json
    ├── tailwind.config.js
    ├── tsconfig.json
    ├── src/
    │   ├── index.html
    │   ├── main.ts
    │   ├── styles.css                # Tailwind imports
    │   │
    │   └── app/
    │       ├── app.component.ts
    │       ├── app.config.ts
    │       ├── app.routes.ts
    │       │
    │       ├── core/                 # Services singleton, Guards, Interceptors
    │       │   ├── services/
    │       │   │   ├── auth.service.ts
    │       │   │   ├── api.service.ts
    │       │   │   └── notification.service.ts
    │       │   ├── guards/
    │       │   │   ├── auth.guard.ts
    │       │   │   └── role.guard.ts
    │       │   ├── interceptors/
    │       │   │   └── jwt.interceptor.ts
    │       │   └── models/
    │       │       ├── user.model.ts
    │       │       ├── membre.model.ts
    │       │       └── api-response.model.ts
    │       │
    │       ├── shared/               # Composants réutilisables
    │       │   ├── components/
    │       │   │   ├── sidebar/
    │       │   │   ├── header/
    │       │   │   ├── data-table/
    │       │   │   └── confirm-dialog/
    │       │   └── pipes/
    │       │
    │       ├── features/             # Modules fonctionnels (lazy-loaded)
    │       │   ├── auth/
    │       │   │   ├── login/
    │       │   │   └── register/
    │       │   ├── dashboard/
    │       │   ├── membres/
    │       │   │   ├── membre-list/
    │       │   │   ├── membre-detail/
    │       │   │   └── services/
    │       │   ├── musique/
    │       │   │   ├── repertoire/
    │       │   │   ├── chant-detail/
    │       │   │   └── services/
    │       │   ├── presences/
    │       │   │   ├── repetition-list/
    │       │   │   ├── pointage/
    │       │   │   └── services/
    │       │   └── finances/
    │       │       ├── journal/
    │       │       ├── cotisations/
    │       │       ├── etat-caisse/
    │       │       └── services/
    │       │
    │       └── layouts/
    │           ├── main-layout/
    │           └── auth-layout/
    │
    └── environments/
        ├── environment.ts
        └── environment.prod.ts
```

---

## Proposed Changes

### 1. Core — Modèles partagés & Mixins

#### [NEW] [models.py](file:///c:/PROJETS/PERSO/CHOIR-MANAGER/backend/core/models.py)

Classes abstraites réutilisées dans tous les modules :

```python
class TimeStampedModel(models.Model):
    """Mixin : created_at / updated_at automatiques."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        abstract = True

class SoftDeleteQuerySet(models.QuerySet):
    def alive(self):
        return self.filter(is_deleted=False)
    def dead(self):
        return self.filter(is_deleted=True)

class SoftDeleteModel(TimeStampedModel):
    """Mixin : soft-delete avec is_deleted + deleted_at."""
    is_deleted  = models.BooleanField(default=False)
    deleted_at  = models.DateTimeField(null=True, blank=True)
    objects     = SoftDeleteQuerySet.as_manager()

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at", "updated_at"])

    def restore(self):
        self.is_deleted = False
        self.deleted_at = None
        self.save(update_fields=["is_deleted", "deleted_at", "updated_at"])

    class Meta:
        abstract = True
```

#### [NEW] [permissions.py](file:///c:/PROJETS/PERSO/CHOIR-MANAGER/backend/core/permissions.py)

Permissions DRF basées sur les groupes Django :

```python
class IsInGroup(BasePermission):
    """Vérifie l'appartenance à un ou plusieurs groupes Django."""
    required_groups = []

class IsBureau(IsInGroup):
    required_groups = ["bureau"]

class IsTresorier(IsInGroup):
    required_groups = ["tresorier"]

class IsMaitreChoeur(IsInGroup):
    required_groups = ["maitre_choeur"]
```

---

### 2. Authentication — JWT & Inscription

#### [NEW] [serializers.py](file:///c:/PROJETS/PERSO/CHOIR-MANAGER/backend/authentication/serializers.py)

- `CustomTokenObtainPairSerializer` : injecte les groupes/rôles et l'ID membre dans le payload JWT
- `RegisterSerializer` : crée User + Membre en une transaction atomique
- `UserProfileSerializer` : lecture du profil connecté

#### [NEW] [views.py](file:///c:/PROJETS/PERSO/CHOIR-MANAGER/backend/authentication/views.py)

- `CustomTokenObtainPairView` / `TokenRefreshView`
- `RegisterView` (POST)
- `ProfileView` (GET/PATCH)

---

### 3. Membres — Module Principal (basé sur le code existant)

#### [NEW] [models.py](file:///c:/PROJETS/PERSO/CHOIR-MANAGER/backend/membres/models.py)

Reprise du `membres_models.py` existant avec les améliorations suivantes :
- **Héritage de `SoftDeleteModel`** au lieu du `deleted_at` ad-hoc sur Membre
- **Séparation du signal** dans `signals.py`
- **Ajout de `apps.py`** pour connecter le signal via `ready()`

Modèles :
| Modèle | Description | Soft-Delete |
|--------|-------------|:-----------:|
| `Pupitre` | Section vocale (Soprano, Alto, Ténor, Basse…) | Non |
| `Poste` | Rôle organisationnel lié à des groupes Django | Non |
| `Membre` | Profil chorale (OneToOne avec User) | **Oui** |
| `Mandat` | Attribution temporelle d'un Poste à un Membre | Non |

#### [NEW] [signals.py](file:///c:/PROJETS/PERSO/CHOIR-MANAGER/backend/membres/signals.py)

Signal `post_save` sur `Mandat` pour la synchronisation des groupes Django (extrait du modèle existant).

#### [NEW] [serializers.py](file:///c:/PROJETS/PERSO/CHOIR-MANAGER/backend/membres/serializers.py)

- `PupitreSerializer`, `PosteSerializer`
- `MembreListSerializer` (léger, pour les listes)
- `MembreDetailSerializer` (complet, avec mandats imbriqués)
- `MandatSerializer` (avec validation `clean()` côté DRF)

#### [NEW] [views.py](file:///c:/PROJETS/PERSO/CHOIR-MANAGER/backend/membres/views.py)

- `PupitreViewSet` (lecture seule pour les membres)
- `PosteViewSet` (gestion bureau uniquement)
- `MembreViewSet` (CRUD avec soft-delete, filtres par pupitre/statut)
- `MandatViewSet` (gestion bureau, endpoint de clôture)

#### [NEW] [0002_data_bootstrap.py](file:///c:/PROJETS/PERSO/CHOIR-MANAGER/backend/membres/migrations/0002_data_bootstrap.py)

Data migration pour créer :
- 4 Pupitres standards (Soprano, Alto, Ténor, Basse)
- Groupes Django (membre_actif, membre_honoraire, bureau, tresorier, maitre_choeur, admin)
- Postes standards avec groupes associés

---

### 4. Musique — Répertoire Musical

#### [NEW] [models.py](file:///c:/PROJETS/PERSO/CHOIR-MANAGER/backend/musique/models.py)

```python
class Chant(SoftDeleteModel):
    titre       = CharField(max_length=200)
    compositeur = CharField(max_length=200, blank=True)
    style       = CharField(choices=StyleChoices)  # classique, moderne, traditionnel, gospel
    tonalite    = CharField(max_length=10, blank=True)
    tempo       = CharField(max_length=50, blank=True)
    notes       = TextField(blank=True)

class Partition(TimeStampedModel):
    chant       = ForeignKey(Chant)
    titre       = CharField(max_length=200)  # ex: "Partition Soprano"
    fichier     = FileField(upload_to="partitions/")
    type_voix   = ForeignKey(Pupitre, null=True, blank=True)

class SeanceChant(TimeStampedModel):
    """Liaison Séance ↔ Chant avec statut d'apprentissage."""
    repetition  = ForeignKey("presences.Repetition")
    chant       = ForeignKey(Chant)
    statut      = CharField(choices=["introduit", "en_travail", "maitrise"])
    notes       = TextField(blank=True)
```

---

### 5. Présences — Répétitions & Pointage

#### [NEW] [models.py](file:///c:/PROJETS/PERSO/CHOIR-MANAGER/backend/presences/models.py)

```python
class Repetition(TimeStampedModel):
    date        = DateField()
    heure_debut = TimeField()
    heure_fin   = TimeField(null=True, blank=True)
    lieu        = CharField(max_length=200, blank=True)
    resume      = TextField(blank=True)
    dirigee_par = ForeignKey(Membre, null=True, blank=True)

class Presence(TimeStampedModel):
    repetition  = ForeignKey(Repetition)
    membre      = ForeignKey(Membre)
    statut      = CharField(choices=["present", "absent", "permission", "retard"])
    motif       = TextField(blank=True)  # si absent/permission
    class Meta:
        unique_together = ["repetition", "membre"]

class PermissionRequest(TimeStampedModel):
    membre      = ForeignKey(Membre)
    repetition  = ForeignKey(Repetition, null=True, blank=True)
    date_debut  = DateField()
    date_fin    = DateField()
    motif       = TextField()
    statut      = CharField(choices=["en_attente", "approuvee", "refusee"])
    traitee_par = ForeignKey(Membre, null=True, blank=True, related_name="permissions_traitees")
```

---

### 6. Finances — Journal de Caisse

#### [NEW] [models.py](file:///c:/PROJETS/PERSO/CHOIR-MANAGER/backend/finances/models.py)

```python
class CategorieMouvement(TimeStampedModel):
    nom         = CharField(max_length=100, unique=True)
    type_mouvement = CharField(choices=["entree", "sortie"])

class Mouvement(SoftDeleteModel):
    date        = DateField()
    montant     = DecimalField(max_digits=12, decimal_places=2)
    sens        = CharField(choices=["debit", "credit"])
    categorie   = ForeignKey(CategorieMouvement)
    motif       = CharField(max_length=300)
    membre      = ForeignKey(Membre, null=True, blank=True)  # si cotisation
    enregistre_par = ForeignKey(Membre, related_name="mouvements_enregistres")
    piece_jointe = FileField(upload_to="finances/", blank=True)

class Cotisation(SoftDeleteModel):
    """Cotisation attendue par membre et par période."""
    membre      = ForeignKey(Membre)
    periode     = CharField(max_length=50)  # ex: "2025-Q1", "Janvier 2025"
    montant_du  = DecimalField(max_digits=10, decimal_places=2)
    montant_paye = DecimalField(max_digits=10, decimal_places=2, default=0)
    mouvement   = ForeignKey(Mouvement, null=True, blank=True)  # lien au paiement
    statut      = CharField(choices=["en_attente", "partiel", "paye", "exonere"])
```

---

### 7. Frontend Angular — Architecture

#### [NEW] Structure Angular 17+ Standalone

- **Signals** pour la gestion d'état réactive (pas de RxJS inutile)
- **Standalone Components** exclusivement
- **Lazy loading** par feature via `loadComponent` dans les routes
- **Tailwind CSS v3** pour le styling
- **JWT Interceptor** via `HttpInterceptorFn` (nouveau pattern Angular 17)
- **Guards** fonctionnels (pas class-based)

**Services clés :**
- `AuthService` : login/register/logout, stockage JWT, décodage payload (rôles)
- `ApiService` : wrapper HTTP générique avec gestion d'erreurs
- `MembresService`, `MusiqueService`, `PresencesService`, `FinancesService`

**Guards :**
- `authGuard` : vérifie le token JWT valide
- `roleGuard` : vérifie un groupe/rôle spécifique dans le JWT payload

---

## Ordre d'Exécution

| Phase | Action | Priorité |
|-------|--------|----------|
| 1 | Initialiser le projet Django + configuration (settings, URLs, CORS) | 🔴 |
| 2 | Créer le module `core` (mixins, permissions) | 🔴 |
| 3 | Créer le module `authentication` (JWT, inscription) | 🔴 |
| 4 | Créer le module `membres` (models + signals + serializers + views + data migration) | 🔴 |
| 5 | Créer le module `musique` | 🟡 |
| 6 | Créer le module `presences` | 🟡 |
| 7 | Créer le module `finances` | 🟡 |
| 8 | Initialiser le projet Angular 17 + Tailwind | 🔴 |
| 9 | Auth frontend (login, register, JWT interceptor, guards) | 🔴 |
| 10 | Dashboard + Layout principal | 🟡 |
| 11 | Features frontend (membres, musique, présences, finances) | 🟡 |

> [!NOTE]
> **Phase 1 actuelle** : Je vais commencer par générer toute la structure backend (phases 1-4) en priorité, puis enchaîner avec les modules restants.

---

## Open Questions

> [!IMPORTANT]
> 1. **Version Django** : Django 6.0 n'est pas encore stable. Dois-je utiliser Django 5.1 (dernière stable) ?
> 2. **Tailwind CSS** : Version 3 ou 4 ? Angular 17 supporte mieux Tailwind v3.
> 3. **Fichier media** : Pour les partitions et photos, un simple `MEDIA_ROOT` local suffit pour le MVP ?
> 4. **Préfixe matricule** : `CHR-XXXX` comme dans le modèle existant, ou un autre préfixe ?

---

## Verification Plan

### Automated Tests
- `python manage.py test membres` — tests unitaires models + signals + API
- `python manage.py check` — vérification de la configuration Django
- `python manage.py makemigrations --check` — vérification que les migrations sont à jour
- `ng build` — build Angular sans erreurs

### Manual Verification
- Créer un superuser et vérifier l'admin Django
- Tester le flux JWT complet (login → token → requête authentifiée)
- Vérifier que la création d'un Mandat synchronise bien les groupes Django
- Vérifier le soft-delete sur un Membre
