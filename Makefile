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
        prod-deploie prod-sauvegarde-pre-deploiement _prod-verifie-progression \
        _prod-check-deploy prod-retour-arriere prod-restauration \
        prod-up prod-down prod-build prod-migrate prod-logs prod-ps \
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

prod-deploie: ## PROD — déploie un TAG — make prod-deploie TAG=v1.2.0-rc.4
	@# TAG est OBLIGATOIRE, sans défaut. Un déploiement doit désigner un état
	@# figé et nommé : une branche bouge sous les pieds, et `main` au moment du
	@# `pull` n'est pas forcément ce qu'on croyait déployer. Sans repère exact,
	@# le retour arrière n'a pas de cible.
	@test -n "$(TAG)" || { \
	  echo "ERREUR — TAG est obligatoire."; \
	  echo "  make prod-deploie TAG=v1.2.0-rc.4"; \
	  echo "  Tags disponibles :"; \
	  git tag --sort=-v:refname | head -5 | sed 's/^/    /'; \
	  false; }
	@set -Eeuo pipefail; \
	echo "▸ 1/8 — Récupération des tags et validation"; \
	git fetch --tags --prune origin; \
	git rev-parse -q --verify "refs/tags/$(TAG)^{commit}" >/dev/null \
	  || { echo "ERREUR — le tag $(TAG) n'existe pas."; false; }; \
	echo "▸ 2/8 — Contrôle du sens de l'évolution"; \
	$(MAKE) --no-print-directory _prod-verifie-progression TAG="$(TAG)"; \
	echo "▸ 3/8 — Sauvegarde AVANT toute mutation"; \
	$(MAKE) --no-print-directory prod-sauvegarde-pre-deploiement TAG="$(TAG)"; \
	echo "▸ 4/8 — Checkout du tag $(TAG)"; \
	git checkout --detach "$(TAG)"; \
	echo "▸ 5/8 — Synchronisation des sous-modules"; \
	git submodule update --init --recursive; \
	git submodule status --recursive | sed 's/^/    /'; \
	echo "▸ 6/8 — Construction des images"; \
	$(COMPOSE_PROD) build; \
	echo "▸ 7/8 — Migrations puis redémarrage"; \
	$(COMPOSE_PROD) run --rm migrate; \
	$(COMPOSE_PROD) up -d --no-deps backend frontend; \
	$(COMPOSE_PROD) ps; \
	echo "▸ 8/8 — Contrôles de déploiement"; \
	$(MAKE) --no-print-directory _prod-check-deploy; \
	echo; \
	echo "✓ $(TAG) déployé. Repli : $$(cat .dernier-pre-deploiement 2>/dev/null)"; \
	echo "  Contrôle conseillé : make prod-smoke"; \
	echo "  Retour arrière     : make prod-retour-arriere TAG=<tag précédent>"

# La sauvegarde vient APRÈS les validations mais AVANT toute mutation : rien n'a
# encore bougé à ce stade, et on ne paie pas une sauvegarde pour un déploiement
# voué à échouer sur un tag inexistant.
#
# Distincte de `prod-sauvegarde` (périodique, chiffrée, hors site) : celle-ci
# reste sur l'hôte, immédiatement lisible, sans dépendre du stockage distant ni
# de rclone au moment précis où l'on en a besoin.
#
# POSTGRES_* est résolu DANS le conteneur (`sh -c` en quotes simples) et non sur
# l'hôte : Make ne lit pas `.env`, donc l'hôte n'a aucune raison d'avoir ces
# variables. Compose, lui, les injecte. `set -u` a révélé cette dépendance.
prod-sauvegarde-pre-deploiement:
	@set -Eeuo pipefail; \
	mkdir -p backups; \
	base="backups/pre-$(TAG)-$(HORODATAGE)"; \
	$(COMPOSE_PROD) exec -T db sh -c 'pg_dump -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -Fc' > "$$base.dump"; \
	$(COMPOSE_PROD) exec -T backend tar czf - -C /app/media . > "$$base-media.tgz"; \
	printf '%s\n' "$$base" > .dernier-pre-deploiement; \
	echo "    base   : $$base.dump ($$(du -h "$$base.dump" | cut -f1))"; \
	echo "    médias : $$base-media.tgz ($$(du -h "$$base-media.tgz" | cut -f1))"

# Refuse un tag dont les pointeurs de sous-module RECULENT — sauf FORCE=1.
#
# Vient d'un incident réel : un commit du 2 août faisait reculer les deux
# pointeurs vers l'état d'avant les lots de sécurité. Il n'a jamais été déployé,
# mais rien ne l'en aurait empêché. Le hook `verif-sous-modules` ne l'attrape
# pas : il vérifie que le pointeur correspond au HEAD du sous-module, jamais le
# SENS de l'évolution.
#
# Surchargeable, et non bloquant par principe : `prod-retour-arriere` recule
# volontairement, et c'est légitime.
_prod-verifie-progression:
	@set -Eeuo pipefail; \
	recul=0; \
	for sm in chm-backend chm-frontend; do \
	  actuel=$$(git rev-parse "HEAD:$$sm" 2>/dev/null || echo ""); \
	  vise=$$(git rev-parse "$(TAG)^{commit}:$$sm" 2>/dev/null || echo ""); \
	  if [ -z "$$actuel" ] || [ -z "$$vise" ]; then continue; fi; \
	  if [ "$$actuel" != "$$vise" ] && git -C "$$sm" merge-base --is-ancestor "$$vise" "$$actuel" 2>/dev/null; then \
	    echo "    ⚠ $$sm RECULE : $${actuel:0:7} → $${vise:0:7}"; \
	    recul=1; \
	  else \
	    echo "    $$sm : $${actuel:0:7} → $${vise:0:7}"; \
	  fi; \
	done; \
	if [ "$$recul" = "1" ] && [ "$(FORCE)" != "1" ]; then \
	  echo; \
	  echo "ERREUR — ce tag ferait RECULER au moins un sous-module."; \
	  echo "  Légitime pour un retour arrière, suspect pour un déploiement."; \
	  echo "  Si c'est voulu     : make prod-deploie TAG=$(TAG) FORCE=1"; \
	  echo "  Pour revenir       : make prod-retour-arriere TAG=$(TAG)"; \
	  false; \
	fi

# `check --deploy` avec une allowlist d'UNE entrée.
#
# `security.W008` (SECURE_SSL_REDIRECT=False) est attendu en PERMANENCE : le TLS
# est terminé par mrs-gateway, Django n'est jamais exposé directement, et le
# passer à True provoquerait une boucle de redirection. Un `--fail-level
# WARNING` nu échouerait donc à CHAQUE déploiement — et on prendrait l'habitude
# de l'ignorer, ce qui vaut moins qu'aucun contrôle.
#
# Tout le reste fait échouer, y compris W012/W016 que DJANGO_COOKIE_SECURE=True
# doit solder en production.
#
# ⚠️ La sentinelle `System check identified` n'est pas décorative : sans elle,
# une commande qui échoue AVANT d'atteindre Django (pile arrêtée, variable
# d'environnement manquante) produit un message d'erreur qui ne contient aucun
# code `(security.Wxxx)` — donc « aucun code inattendu », donc la cible passe.
# Un déploiement serait alors validé sans qu'aucun contrôle n'ait tourné.
# Constaté en testant cette cible, pas imaginé.
_prod-check-deploy:
	@set -Eeuo pipefail; \
	sortie=$$($(COMPOSE_PROD) exec -T backend python manage.py check --deploy 2>&1 || true); \
	printf '%s' "$$sortie" | grep -q 'System check identified' || { \
	  printf '%s\n' "$$sortie"; \
	  echo; \
	  echo "ERREUR — check --deploy n'a pas produit de rapport."; \
	  echo "  La commande n'a pas tourné (pile arrêtée, variable manquante...)."; \
	  echo "  Sans ce contrôle, un déploiement passerait SANS vérification."; \
	  false; }; \
	inattendus=$$(printf '%s' "$$sortie" | grep -oE '\([a-z_]+\.[EWC][0-9]+\)' | tr -d '()' | grep -vx 'security.W008' | sort -u || true); \
	if [ -n "$$inattendus" ]; then \
	  printf '%s\n' "$$sortie"; \
	  echo; \
	  echo "ERREUR — contrôles de déploiement non verts. Codes inattendus :"; \
	  printf '  %s\n' $$inattendus; \
	  false; \
	fi; \
	echo "    check --deploy : vert (security.W008 attendu, TLS en amont)"

prod-retour-arriere: ## PROD — revient à un TAG antérieur — make prod-retour-arriere TAG=v1.2.0-rc.3
	@test -n "$(TAG)" || { \
	  echo "ERREUR — TAG est obligatoire (le tag vers lequel revenir)."; \
	  echo "  make prod-retour-arriere TAG=v1.2.0-rc.3"; \
	  echo "  Tags disponibles :"; \
	  git tag --sort=-v:refname | head -5 | sed 's/^/    /'; \
	  false; }
	@set -Eeuo pipefail; \
	echo "▸ 1/5 — Récupération des tags et validation"; \
	git fetch --tags --prune origin; \
	git rev-parse -q --verify "refs/tags/$(TAG)^{commit}" >/dev/null \
	  || { echo "ERREUR — le tag $(TAG) n'existe pas."; false; }; \
	echo "▸ 2/5 — Checkout de $(TAG) et synchronisation des sous-modules"; \
	git checkout --detach "$(TAG)"; \
	git submodule update --init --recursive; \
	git submodule status --recursive | sed 's/^/    /'; \
	echo "▸ 3/5 — Reconstruction"; \
	$(COMPOSE_PROD) build; \
	echo "▸ 4/5 — Redémarrage SANS migrate"; \
	$(COMPOSE_PROD) up -d --no-deps backend frontend; \
	$(COMPOSE_PROD) ps; \
	echo "▸ 5/5 — Contrôles"; \
	$(MAKE) --no-print-directory _prod-check-deploy; \
	echo; \
	echo "✓ Revenu à $(TAG)."; \
	echo; \
	echo "⚠ LE SCHÉMA N'A PAS ÉTÉ TOUCHÉ. Les migrations Django ne sont pas"; \
	echo "  systématiquement réversibles : revenir au code ne défait pas une"; \
	echo "  migration déjà jouée. Si le déploiement fautif en a joué une, il"; \
	echo "  FAUT restaurer la sauvegarde prise juste avant lui :"; \
	echo "      make prod-restauration DUMP=<sauvegarde>.dump"; \
	echo "  Dernière sauvegarde de pré-déploiement :"; \
	echo "      $$(cat .dernier-pre-deploiement 2>/dev/null || echo '(aucune)')"

prod-restauration: ## PROD — restaure une sauvegarde — make prod-restauration DUMP=backups/xxx.dump
	@test -n "$(DUMP)" || { \
	  echo "ERREUR — préciser DUMP=backups/....dump"; \
	  ls -1t backups/*.dump 2>/dev/null | head -5 | sed 's/^/  /'; \
	  false; }
	@test -f "$(DUMP)" || { echo "ERREUR — fichier introuvable : $(DUMP)"; false; }
	@echo "Restaure $(DUMP) dans la base de PRODUCTION. Le contenu actuel sera ÉCRASÉ."
	@read -p "Taper 'restaurer' pour confirmer : " r; \
	  test "$$r" = "restaurer" || (echo "Annulé." && false)
	@$(COMPOSE_PROD) exec -T db sh -c 'pg_restore -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" --clean --if-exists' < "$(DUMP)"
	@echo "✓ Base restaurée. Redémarrer : make prod-up"

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
