# ============================================================================
# ChoirManager — Commandes courantes (WSL / Docker Compose)
# ============================================================================
# `make aide` liste les cibles disponibles.

SHELL := /bin/bash
COMPOSE      := docker compose
COMPOSE_DEV  := docker compose -f compose.yaml -f compose.dev.yaml
COMPOSE_API  := docker compose -f compose.yaml -f compose.api-direct.yaml
HORODATAGE   := $(shell date +%Y%m%d-%H%M%S)

.DEFAULT_GOAL := aide
.PHONY: aide env config build up up-api up-frontend up-backend dev down logs ps \
        migrate makemigrations check check-deploy shell dbshell \
        superuser provision seed \
        test test-backend test-frontend collect front-build \
        sauvegarde restauration audit-image nettoyage-jetable

# ---------------------------------------------------------------------------
# Aide
# ---------------------------------------------------------------------------
aide:
	@grep -E '^[a-zA-Z-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

env: ## Crée .env à partir du modèle (ne l'écrase jamais)
	@test -f .env || (cp .env.example .env && echo "→ .env créé : remplacer les 'change-me' avant `make up`")
	@test -f .env && echo "→ .env présent"

# ---------------------------------------------------------------------------
# Cycle de vie
# ---------------------------------------------------------------------------
config: ## Valide et affiche la configuration Compose résolue
	$(COMPOSE) config

build: ## Construit les images backend et frontend
	$(COMPOSE) build --pull

up: ## Démarre la pile production-like (db → migrate → backend → frontend)
	$(COMPOSE) up -d
	@echo "→ Frontend : http://127.0.0.1:8080"

up-api: ## Comme `up`, mais publie aussi l'API sur 127.0.0.1:8000 (reste en Gunicorn/DEBUG=False)
	$(COMPOSE_API) up -d
	@echo "→ Frontend : http://127.0.0.1:8080   API directe : http://127.0.0.1:8000"

up-frontend: ## Reconstruit et redéploie le SEUL frontend (pile déjà démarrée)
	@$(COMPOSE) ps --status running --services | grep -qx backend \
	  || (echo "→ backend arrêté : lancer 'make up' d'abord (--no-deps ne démarre pas les dépendances)"; exit 1)
	$(COMPOSE) up -d --build --no-deps frontend
	@echo "→ Frontend redéployé : http://127.0.0.1:8080"

up-backend: ## Reconstruit et redéploie le SEUL backend, sans rejouer les migrations
	@$(COMPOSE) ps --status running --services | grep -qx db \
	  || (echo "→ base arrêtée : lancer 'make up' d'abord"; exit 1)
	$(COMPOSE) up -d --build --no-deps backend
	@echo "→ Backend redéployé (migrations NON rejouées : 'make migrate' si le schéma a changé)"

dev: ## Démarre la pile avec les surcharges de développement (runserver, DEBUG=True)
	$(COMPOSE_DEV) up -d
	@echo "→ Frontend : http://127.0.0.1:8080   API : http://127.0.0.1:8000"

down: ## Arrête la pile en CONSERVANT les données (jamais -v)
	$(COMPOSE) down

logs: ## Suit les logs de tous les services
	$(COMPOSE) logs -f

ps: ## État des services
	$(COMPOSE) ps

# ---------------------------------------------------------------------------
# Django
# ---------------------------------------------------------------------------
migrate: ## Applique les migrations (service one-shot)
	$(COMPOSE) run --rm migrate

makemigrations: ## Vérifie qu'aucune migration ne manque
	$(COMPOSE) run --rm backend python manage.py makemigrations --check --dry-run

check: ## manage.py check
	$(COMPOSE) run --rm backend python manage.py check

check-deploy: ## Contrôles de sécurité avant préproduction (§11)
	$(COMPOSE) run --rm backend python manage.py check --deploy

shell: ## Shell Django
	$(COMPOSE) run --rm backend python manage.py shell

dbshell: ## psql sur la base applicative
	$(COMPOSE) exec db psql -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"

superuser: ## Crée un compte superutilisateur
	$(COMPOSE) run --rm backend python manage.py createsuperuser

provision: ## Provisionne une chorale — make provision ARGS="--nom '...' --prefix XXX ..."
	$(COMPOSE) run --rm backend python manage.py provision_chorale $(ARGS)

seed: ## 2e chorale de démo — dev/QA UNIQUEMENT, jamais en production
	$(COMPOSE) run --rm backend python manage.py seed_demo_chorale

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
collect: ## Compte les tests backend collectés (baseline §9.1)
	$(COMPOSE) run --rm backend pytest --collect-only -q

test: test-backend test-frontend ## Suite complète backend + frontend

test-backend: ## pytest sous PostgreSQL
	$(COMPOSE) run --rm backend pytest -q

test-frontend: ## Vitest
	$(COMPOSE) run --rm --entrypoint sh frontend -c "echo 'Tests front : exécuter sur l'\''hôte via npm test (image de production sans devDependencies)'"

front-build: ## Build Angular de production (dans l'image)
	$(COMPOSE) build frontend

# ---------------------------------------------------------------------------
# Sauvegarde / restauration (§12)
# ---------------------------------------------------------------------------
sauvegarde: ## Dump PostgreSQL horodaté dans backups/
	@mkdir -p backups
	$(COMPOSE) exec -T db pg_dump -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}" -Fc \
	  > "backups/choirmanager-$(HORODATAGE).dump"
	@echo "→ backups/choirmanager-$(HORODATAGE).dump"

restauration: ## Restaure un dump — make restauration DUMP=backups/xxx.dump
	@test -n "$(DUMP)" || (echo "Préciser DUMP=backups/....dump" && false)
	$(COMPOSE) exec -T db pg_restore -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}" \
	  --clean --if-exists < "$(DUMP)"

# ---------------------------------------------------------------------------
# Vérifications d'image (§11)
# ---------------------------------------------------------------------------
audit-image: ## Vérifie l'absence de .env, SQLite, .git et venv dans les images (§11)
	@echo "→ choirmanager-backend:latest"
	@docker run --rm --entrypoint sh choirmanager-backend:latest -c '\
	  trouve=$$(find / -xdev \( -name "db.sqlite3" -o -name "db.sqlite3-journal" \
	      -o -name ".env" -o -name "*.key" \) 2>/dev/null \
	    | grep -v "^/etc/ssl/" | grep -v "^/usr/share/ca-certificates" | grep -v "/opt/venv/"); \
	  interdits=$$(find /app -maxdepth 2 \( -name ".git" -o -name "venv" -o -name ".venv" \) 2>/dev/null); \
	  if [ -n "$$trouve$$interdits" ]; then \
	    echo "ÉCHEC — artefacts interdits :"; echo "$$trouve"; echo "$$interdits"; exit 1; \
	  fi; \
	  echo "  OK — ni .env, ni SQLite, ni dépôt .git, ni venv (utilisateur : $$(id -un))."'
	@echo "→ choirmanager-frontend:latest"
	@docker run --rm --entrypoint sh choirmanager-frontend:latest -c '\
	  trouve=$$(find / -xdev \( -name "node_modules" -o -name ".env" -o -name "*.ts" \) 2>/dev/null); \
	  if [ -n "$$trouve" ]; then \
	    echo "ÉCHEC — artefacts interdits :"; echo "$$trouve"; exit 1; \
	  fi; \
	  echo "  OK — ni sources, ni node_modules, ni .env (utilisateur : $$(id -un))."'

nettoyage-jetable: ## DESTRUCTIF : supprime aussi les volumes. Environnement jetable seulement.
	@echo "Cette cible EFFACE la base et les médias (docker compose down -v)."
	@read -p "Taper 'jetable' pour confirmer : " reponse; \
	  test "$$reponse" = "jetable" || (echo "Annulé." && false)
	$(COMPOSE) down -v
