# ChoirManager (CHM)

SaaS multi-tenant de gestion de chorales (« chorales ») : membres, répertoire /
partitions, présences aux répétitions, finances (caisse + cotisations), annonces
et rapports. API Django REST + frontend Angular 21. Stade MVP (SQLite, un seul
environnement de dev).

- **Backend** : `chm-backend/` — Django 5 + DRF, JWT, multi-tenant. Voir
  [chm-backend/README.md](chm-backend/README.md).
- **Frontend** : `chm-frontend/` — Angular 21 (standalone, signals, zoneless) +
  Tailwind v4. Voir [chm-frontend/README.md](chm-frontend/README.md).

> Ce dépôt est le **superprojet** ChoirManager. `chm-backend/` et
> `chm-frontend/` restent deux dépôts autonomes, référencés ici comme
> sous-modules Git afin de figer un assemblage compatible. Code en anglais ;
> UI, logs et commentaires métier en français (volontaire).

## Récupérer le projet complet

```bash
git clone --recurse-submodules https://github.com/hlabsdev/choir-manager.git
cd choir-manager
```

Si le dépôt a été cloné sans ses sous-modules :

```bash
git submodule update --init --recursive
```

La version de référence actuelle est `v1.0.0-mvp.1`. Voir
[RELEASE_NOTES.md](RELEASE_NOTES.md) pour son périmètre exact.

## Concepts clés

- **Tenant = `Chorale`** : toutes les données métier sont scopées à une chorale,
  isolées via un middleware (`request.chorale`) + un mixin de ViewSet. Pas de base
  séparée par tenant.
- **RBAC via `Mandat`** : un membre reçoit des postes (mandats) qui mappent vers
  des groupes Django ; les permissions en découlent. On n'assigne jamais un
  groupe à la main.
- **Onboarding modéré, jamais automatique** : une chorale rejoint la plateforme
  soit via `python manage.py provision_chorale` (opérateur), soit via un
  formulaire public (`/auth/demande-chorale`) qui crée une demande `en_attente`
  — approuvée ou rejetée par l'opérateur dans le Django admin, jamais
  provisionnée toute seule. Un choriste rejoint sa chorale via un code
  d'invitation généré par son Bureau (`/rejoindre/:code`), pas par inscription
  libre. Détails dans [chm-backend/README.md](chm-backend/README.md#onboarding).

## Lancer en local

```bash
# 1) Backend
cd chm-backend
python -m venv venv && source venv/Scripts/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver              # http://localhost:8000

# 2) Frontend (autre terminal)
cd chm-frontend
npm install
npm run start                           # http://localhost:4200
```

Pour des données de démonstration multi-tenant :
`python manage.py seed_demo_chorale` (dev/QA uniquement).

## Modules & état (MVP)

| Module | Backend | Frontend |
| --- | --- | --- |
| Auth / session / guards | ✅ | ✅ |
| Multi-tenant (isolation testée) | ✅ | ✅ |
| Membres — liste / formulaire / fiche / mandats | ✅ | ✅ |
| Pupitres & Postes — CRUD + organigramme | ✅ | ✅ (page `/structure`) |
| Présences — séances / pointage / permissions | ✅ | ✅ |
| Répertoire — chants / partitions / thèmes / séances | ✅ | ✅ |
| Finances — journal / cotisations / tarifs | ✅ | ✅ |
| Annonces (communications) | ✅ | ✅ |
| Notifications in-app + emails ciblés | ✅ | ✅ |
| Rapports — financier / présences / effectifs / répertoire (+ PDF & CSV) | ✅ | ✅ |
| Dashboard par rôle | ✅ | ✅ |

**MVP complet** : tous les points de la checklist de recette (0 à 6) sont
fonctionnels et vérifiés, plus le module Annonces ajouté en cours de route.

**Hors périmètre MVP** (rappel) : enregistrements audio, notifications push et
SMS, calendrier externe, app native, module Activités/Planning.

## Génération PDF (rapports)

Les exports PDF utilisent **WeasyPrint**, qui exige les libs système GTK/Pango/
Cairo au runtime (Linux : `apt install libpango…` ; Windows : GTK via MSYS2). Sans
elles, l'endpoint PDF renvoie un 503 explicite et le CSV reste disponible. Détails
dans [chm-backend/README.md](chm-backend/README.md).

## Tests

```bash
cd chm-backend  && pytest -q      # ~129 tests (isolation, RBAC, rapports, onboarding…)
cd chm-frontend && npm test       # Vitest (pipes, guards, annonces, rapports)
```
