# ============================================================================
# ChoirManager — Commandes courantes (WSL / Docker Compose)
# ============================================================================
# `make aide` liste les cibles disponibles.

SHELL := /bin/bash
COMPOSE      := docker compose
COMPOSE_DEV  := docker compose -f compose.yaml -f compose.dev.yaml
COMPOSE_API  := docker compose -f compose.yaml -f compose.api-direct.yaml
# Pile de PRODUCTION (VPS). Toujours les DEUX fichiers : compose.prod.yaml est
# un override, pas une pile autonome — l'utiliser seul démarrerait des services
# sans image ni variables.
COMPOSE_PROD := docker compose -f compose.yaml -f compose.prod.yaml
HORODATAGE   := $(shell date +%Y%m%d-%H%M%S)

.DEFAULT_GOAL := aide
.PHONY: aide hooks verif-sous-modules env config build up up-api up-frontend up-backend dev down logs ps \
        migrate makemigrations check check-deploy shell dbshell \
        superuser provision seed purge-tokens \
        test test-backend test-frontend collect front-build \
        sauvegarde restauration audit-image nettoyage-jetable \
        prod-deploie prod-up prod-down prod-build prod-migrate prod-logs prod-ps \
        prod-shell prod-smoke prod-sauvegarde prod-verif-sauvegarde prod-restauration-test

# ---------------------------------------------------------------------------
# Aide
# ---------------------------------------------------------------------------
aide:
	@grep -E '^[a-zA-Z-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

hooks: ## Installe les hooks Git versionnés (garde-fou des pointeurs de sous-module)
	git config core.hooksPath .githooks
	@echo "→ core.hooksPath = .githooks — le pre-commit vérifie les sous-modules."

verif-sous-modules: ## Vérifie que les pointeurs de sous-module reflètent la réalité
	@.githooks/pre-commit && echo "→ Pointeurs de sous-module cohérents."

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

purge-tokens: ## Purge les refresh tokens expirés (à planifier quotidiennement, cf. §5)
	$(COMPOSE) exec -T backend python manage.py flushexpiredtokens
	@echo "→ Tokens expirés purgés."

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

smoke-medias: ## Vérifie les médias privés À TRAVERS NGINX (pile démarrée requise)
	@echo "Les tests Django ne passent pas par Nginx : ils prouvent que Django émet"
	@echo "X-Accel-Redirect, pas que Nginx sert le fichier. Ce contrôle ferme l'écart."
	@bash scripts/smoke-medias.sh

# ---------------------------------------------------------------------------
# PRODUCTION (VPS Sankof)
# ---------------------------------------------------------------------------
# Ces cibles — et elles seules — pilotent la pile de production. Elles passent
# TOUTES par $(COMPOSE_PROD), donc par compose.yaml + compose.prod.yaml.
#
# Ne jamais employer les cibles de développement (`up`, `down`, `build`…) sur
# le serveur : elles omettent compose.prod.yaml, ce qui republie le port 8080
# du frontend en clair et remonte les volumes locaux à la place de
# /srv/chm/media. Le préfixe `prod-` est là pour rendre la confusion difficile.

prod-deploie: ## PROD — déploiement complet : récupère, construit, migre, redémarre
	@echo "▸ Récupération (superprojet + sous-modules)"
	git pull --ff-only
	git submodule update --init --recursive
	@echo "▸ Construction des images"
	$(COMPOSE_PROD) build
	@echo "▸ Migrations (service one-shot)"
	$(COMPOSE_PROD) run --rm migrate
	@echo "▸ Redémarrage"
	$(COMPOSE_PROD) up -d
	@echo "▸ État"
	@$(COMPOSE_PROD) ps
	@echo
	@echo "Déploiement terminé. Contrôle conseillé : make prod-smoke"

prod-up: ## PROD — démarre (ou met à jour) la pile
	$(COMPOSE_PROD) up -d

prod-down: ## PROD — arrête la pile en CONSERVANT les données (jamais -v)
	$(COMPOSE_PROD) down

prod-build: ## PROD — reconstruit les images
	$(COMPOSE_PROD) build

prod-migrate: ## PROD — applique les migrations (service one-shot)
	$(COMPOSE_PROD) run --rm migrate

prod-logs: ## PROD — suit les logs
	$(COMPOSE_PROD) logs -f --tail=100

prod-ps: ## PROD — état des services
	$(COMPOSE_PROD) ps

prod-shell: ## PROD — shell Django
	$(COMPOSE_PROD) exec backend python manage.py shell

prod-smoke: ## PROD — vérifie les médias privés À TRAVERS Nginx
	@echo "Les tests Django ne passent pas par Nginx. Ce contrôle interroge la"
	@echo "pile réelle : fichier servi, /media/ muet, refus sans session."
	@SMOKE_BASE_URL=$${SMOKE_BASE_URL:-http://127.0.0.1:8080} bash scripts/smoke-medias.sh

# --- Sauvegardes chiffrées (cf. ops/backup, unités systemd) -----------------
# Ces scripts tournent en root sur l'hôte, pas dans un conteneur : ils pilotent
# pg_dump, le chiffrement et l'envoi vers le stockage distant.

prod-sauvegarde: ## PROD — lance une sauvegarde chiffrée immédiate
	sudo bash ops/backup/backup.sh

prod-verif-sauvegarde: ## PROD — vérifie la fraîcheur de la dernière sauvegarde
	sudo bash ops/backup/check-freshness.sh

prod-restauration-test: ## PROD — restauration d'épreuve dans une base jetable
	@echo "Restaure la dernière sauvegarde dans une base NEUVE et vérifie le"
	@echo "CONTENU. Ne touche jamais la base vivante."
	sudo bash ops/backup/restore-test.sh
