# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

ChoirManager (CHM) — a multi-tenant SaaS for managing choirs ("chorales"): members, sheet music/repertoire, rehearsal attendance, and finances. Django REST API backend + Angular 21 frontend, currently MVP stage (SQLite, single dev environment).

- **Code** (variables, classes, DB fields): English.
- **UI text, logs, business comments**: French. This is intentional and consistent throughout the codebase — don't "fix" it.

## Commands

### Backend (`chm-backend/`, Django 5 + DRF)
```
python manage.py runserver          # dev server (expects http://localhost:8000)
python manage.py makemigrations
python manage.py migrate
python manage.py test               # no test suite exists yet — add tests under <app>/tests.py
python manage.py check
```
A virtualenv exist in `chm-backend/venv` (But of course not commited to github so if not existing it means the current repo jus got pulled form git freshly, you can create it there before runing any command in that virtualenv); install `requirements.txt` first. `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` are read from env (see `chm_config/settings.py`), with insecure dev defaults.

### Frontend (`chm-frontend/`, Angular 21 + Tailwind v4 + Vitest)
```
npm run start        # tailwind build (once) + ng serve, http://localhost:4200
npm run start:dev     # tailwind --watch in background + ng serve
npm run build         # tailwind build + ng build
npm test              # ng test (Vitest)
```
Tailwind v4 is **not** wired through Angular's esbuild pipeline — it's compiled explicitly via the standalone Tailwind CLI (`tailwindcss -i src/styles.css -o src/tailwind.generated.css`) before every serve/build. If styles seem stale, rerun `npm run tailwind`.

## Architecture

### Backend: multi-tenant via `Chorale`, not via separate DBs

Every business model hangs off `core/models.py`'s abstract base chain:

```
TimeStampedModel (created_at/updated_at)
  Chorale                      — tenant root entity (name, prefix for matricules, logo, ...)
  ChoraleOwnedModel(TimeStampedModel)   — abstract, adds FK `chorale`
    SoftDeleteModel(ChoraleOwnedModel)  — abstract, adds is_deleted/deleted_at + soft_delete()/restore()
```

Tenant isolation is enforced in two layers that must both be kept in sync when adding a new model/viewset:
- `core/middleware.py` (`ChoraleMiddleware`) sets `request.chorale` from the logged-in user's `membre.chorale` on every request (superusers get `None` = unrestricted).
- `core/mixins.py` (`ChoraleFilterMixin`) — put on every ViewSet — filters `get_queryset()` by `request.chorale` and auto-injects `chorale` on create. `SoftDeleteMixin` (also per-ViewSet) turns `DELETE` into `soft_delete()` and excludes soft-deleted rows unless `?include_deleted=true` (superuser only).

Any new model that belongs to a chorale should inherit `SoftDeleteModel` (not just `ChoraleOwnedModel`) unless there's a specific reason it can't be soft-deleted — this is a project convention, not just a base-class choice.

### RBAC pivots on `Mandat`, not on a fixed user role

Apps: `core`, `authentication`, `membres`, `musique`, `presences`, `finances` (each with the usual `models/serializers/views/urls/admin/apps.py`; routes mounted at `/api/<app>/` in `chm_config/urls.py`).

A user's permissions are never assigned directly. Instead (`membres/models.py`, `membres/signals.py`):
- A `Membre` holds one or more `Mandat`s, each linking to a `Poste` (which owns a M2M to Django `Group`).
- `Poste.unique_actif=True` means only one active `Mandat` can exist for that poste at a time — assigning a new one must close out the previous (e.g. only one sitting Président).
- On every `Mandat` save, the `sync_groupes_membre` signal recomputes the user's Django groups from scratch: groups from all *active* mandats' postes, plus a base group derived from `Membre.statut` (actif/stagiaire → `membre_actif`, honoraire → `membre_honoraire`, inactif → none). This signal is the single source of truth for `user.groups` — never assign groups manually elsewhere.
- `core/permissions.py` (`IsBureau`, `IsTresorier`, `IsMaitreChoeur`, `IsChefPupitre`, `IsBureauOrMaitreChoeur`, `IsOwnerOrBureau`, etc.) checks against these Django groups. Superusers always pass.

Because of this, granting/testing a permission means creating/activating a `Mandat`, not editing `user.groups` or the permission class.

### Auth flow

JWT via `djangoframework-simplejwt`, obtained through a custom serializer (`authentication.serializers.CustomTokenObtainPairSerializer`) that embeds `groups`, `is_superuser`, and `chorale_nom` directly in the token payload — the Angular app decodes the JWT client-side (`AuthService`) rather than calling a `/me/` endpoint. If you add claims the frontend needs, add them there and to `DecodedToken` in `core/models/auth.model.ts`.

### Frontend structure

Standalone components + Signals only (no NgModules). Under `src/app/`:
- `core/auth/` — `AuthService` (signal-based state, JWT decode, login/logout), `auth.interceptor.ts` (attaches bearer token), `auth.guard.ts` (`authGuard`, `roleGuard(role)`).
- `features/<domain>/` — one folder per business domain (membres, musique, presences, finances, dashboard), each with its own `*.routes.ts` lazy-loaded from `app.routes.ts` via `loadChildren`, plus a `services/` subfolder calling the matching Django app's API.
- `layout/main-layout/` — shell wrapping authenticated routes (nav, bottom bar on mobile).
- API base URL and per-domain endpoint paths are centralized in `src/environments/environment.ts` — always read from there, never hardcode a backend URL in a component/service.
- Icons come from `lucide-angular`; new icons must be imported in `app.config.ts` and added to the `LucideIconProvider` map.

Route guards: `finances` is meant to be bureau-or-trésorier only, but `roleGuard('bureau')` only checks one role — see the TODO comment in `app.routes.ts` if you touch that guard.

## Design conventions (from `.agents/rules/choir-manager-rules.md`)

- Business logic belongs in `services.py`/`signals.py`, not in views or serializers.
- Mobile-first UI; rehearsal attendance ("pointage") screens need large tap targets; async calls should show skeleton loaders.
- Color identity: Indigo (primary), Amber (accent), Anthracite (text).
- Real security is enforced server-side (`get_queryset()` filtering); never rely on hiding elements in the Angular UI alone.
