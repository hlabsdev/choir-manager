# ChoirManager MVP — Task Tracker

## Phase 1 : Init projet Django + Configuration
- [x] `requirements.txt`
- [x] `manage.py`
- [x] `chm_config/settings.py`
- [x] `chm_config/urls.py`
- [x] `chm_config/wsgi.py` + `asgi.py`

## Phase 2 : Module `core`
- [x] `core/models.py` — Chorale, TimeStampedModel, ChoraleOwnedModel, SoftDeleteModel
- [x] `core/middleware.py` — ChoraleMiddleware
- [x] `core/permissions.py` — IsInGroup, IsBureau, IsTresorier, IsMaitreChoeur
- [x] `core/mixins.py` — ChoraleFilterMixin, SoftDeleteMixin
- [x] `core/pagination.py` — StandardPagination
- [x] `core/apps.py`

## Phase 3 : Module `authentication`
- [x] `authentication/serializers.py` — CustomTokenObtainPairSerializer, RegisterSerializer
- [x] `authentication/views.py` — Login, Register, Profile
- [x] `authentication/urls.py`
- [x] `authentication/apps.py`

## Phase 4 : Module `membres`
- [x] `membres/models.py` — Pupitre, Poste, Membre, Mandat
- [x] `membres/signals.py` — sync_groupes_membre
- [x] `membres/serializers.py`
- [x] `membres/views.py`
- [x] `membres/urls.py`
- [x] `membres/admin.py`
- [x] `membres/apps.py`
- [x] `membres/filters.py`

## Phase 5 : Module `musique`
- [x] `musique/models.py` — Chant, Partition, SeanceChant
- [x] `musique/serializers.py`
- [x] `musique/views.py`
- [x] `musique/urls.py`
- [x] `musique/admin.py`
- [x] `musique/apps.py`

## Phase 6 : Module `presences`
- [x] `presences/models.py` — Repetition, Presence, PermissionRequest
- [x] `presences/serializers.py`
- [x] `presences/views.py`
- [x] `presences/urls.py`
- [x] `presences/admin.py`
- [x] `presences/apps.py`

## Phase 7 : Module `finances`
- [x] `finances/models.py` — CategorieMouvement, Mouvement, CampagneCotisation, Cotisation, PaiementCotisation
- [x] `finances/serializers.py`
- [x] `finances/views.py`
- [x] `finances/urls.py`
- [x] `finances/admin.py`
- [x] `finances/apps.py`

## Phase 8 : Vérification
- [x] `makemigrations` — 6 migrations générées (core, membres, musique, presences, finances x2)
- [x] `migrate` — Toutes les migrations appliquées avec succès
- [x] `python manage.py check` — System check identified no issues ✅
- [x] Data bootstrap — Groupes, Chorale démo, Pupitres, Postes, Catégories financières
- [x] Superuser créé (admin / admin1234)
- [x] Serveur démarre sans erreur

## Prochaines étapes
- [x] Phase 9 : Init Angular 21 + Tailwind v4
- [x] Phase 10 : Frontend core — auth, interceptor, guards
- [/] Phase 11 : Frontend features — dashboard, membres, musique, presences, finances (Audit & Fix UI)
- [x] Fix Tailwind v4 pipeline (Angular 21 esbuild bypass)
