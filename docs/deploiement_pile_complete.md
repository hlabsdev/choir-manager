Déploiement de la pile complète (lots 1+2+3) sur le VPS. Ce n'est pas un lot de
code — c'est une mise en production. Procède par étapes vérifiables, jamais en
bloc. Chaque étape a un critère de succès observable avant de passer à la
suivante.

PRÉALABLE — sur ta machine, avant de toucher à l'hôte
La pile complète (trois lots réunis) build ET monte ET passe make smoke-medias
sous le nginx réel de la pile assemblée. Le Dockerfile cassé du lot 2 a prouvé
que "tests verts" ≠ "pile qui monte". Confirme les trois : build, up, smoke.
Si ça ne monte pas ici, ça ne montera pas sur l'hôte.

ÉTAPE 0 — Merge et tag (une fois le préalable vert)
- Merge feat/cloisonnement-annuaire dans main sur les trois dépôts, discipline
  habituelle (sous-modules poussés avant le pointeur superprojet).
- Tag v1.2.0-rc.1 sur le superprojet.
- Vérifie le tag sur GitHub (ls-remote + clone froid, contrôle du contenu).
Critère : le clone froid du tag build et monte.

ÉTAPE 1 — DNS
- Enregistrement A de choirmanager.sankof.tech vers le VPS. [DEJA FAIT MANULEMENT]
- Attendre la propagation (dig choirmanager.sankof.tech renvoie l'IP du VPS). Critère : dig renvoie la bonne IP.[DEJA PROPRE]  Ne pas continuer avant.

ÉTAPE 2 — Certificat TLS
- Ajouter choirmanager.sankof.tech au server_name du bloc port 80 de la passerelle mrs-gateway (pour que le challenge ACME passe), recharger nginx. [DEJA]
- Émettre le certificat via le webroot existant (certbot --webroot) Critère : le certificat existe dans /etc/letsencrypt/live/choirmanager.sankof.tech/. [DEJA]

ÉTAPE 3 — Les deux mesures bloquantes sur l'hôte réel
Ni l'une ni l'autre ne peut être devinée depuis le dépôt. À faire AVANT
d'activer quoi que ce soit de sensible.

a. DJANGO_NUM_PROXIES : lance la commande de contrôle fournie, qui révèle l'IP
   réellement vue par Django pour une requête entrante traversant
   mrs-gateway → nginx frontend → backend. Pose la valeur constatée, pas une
   valeur théorique. Vérifie ensuite avec deux IP clientes distinctes qu'elles
   ne partagent pas un compteur de throttle.
   Critère : deux clients d'IP réelles distinctes ont des compteurs distincts,
   ET un X-Forwarded-For forgé ne crée pas de compteur neuf.

b. client_max_body_size de mrs-gateway : mesure la limite réelle du saut
   externe. Si elle est sous 20 Mo, un upload de partition la heurtera avant
   d'atteindre le nginx frontend, avec un 413 obscur. Ajuste la passerelle ou
   abaisse le plafond applicatif en conséquence.
   Critère : un upload à la taille max applicative passe les deux sauts.

ÉTAPE 4 — Configuration de production
- .env de prod : DEBUG=False, nouvelle SECRET_KEY (différente du dev),
  ALLOWED_HOSTS=choirmanager.sankof.tech,
  CSRF_TRUSTED_ORIGINS=https://choirmanager.sankof.tech,
  COOKIE_SECURE=True, DATABASE_URL, REDIS_URL, EMAIL_*, l'app password Gmail
  (secret réel), DJANGO_NUM_PROXIES=<valeur mesurée à l'étape 3>.
- Vérifier SECURE_PROXY_SSL_HEADER : derrière DEUX sauts, X-Forwarded-Proto
  doit être retransmis par le nginx frontend au backend (pas régénéré en
  $scheme). Sinon Django se croit en HTTP, COOKIE_SECURE casse les cookies
  sans message clair.
- check --deploy vert (COOKIE_SECURE=True solde W012/W016 du jalon 1).
Critère : check --deploy sans avertissement bloquant.

ÉTAPE 5 — Bloc nginx de la passerelle
- Bloc HTTPS proxy vers choirmanager-frontend:8080 (pas :80).
- client_max_body_size cohérent avec l'étape 3b.
- La passerelle ignore /media/ — le contrôle d'accès vit dans le nginx frontend.
- compose.prod : le service frontend rejoint mrs-gateway ; db, backend, redis
  jamais.
Critère : https://choirmanager.sankof.tech charge la page de login en TLS
valide.

ÉTAPE 6 — Premier démarrage, base vide
- Pile montée, migrations jouées par le service migrate one-shot.
- make smoke-medias sous le nginx réel de production (pas seulement en local).
  C'est le dernier maillon que les tests Django ne prouvent pas.
Critère : smoke-medias vert sur l'hôte réel.

ÉTAPE 7 — Départ propre (le parcours d'onboarding jamais éprouvé en réel)
- provision_chorale pour ta chorale, depuis la liste de membres à jour que tu
  fourniras (CSV, pas de données en dur — cf. B4).
- C'est aussi le premier test réel de provision_chorale + invitations sur un
  environnement de production. Note tout ce qui coince : c'est un chemin que
  seul le dev a exercé jusqu'ici.
Critère : la chorale existe, le premier compte Bureau se connecte, une
invitation fonctionne de bout en bout.

ÉTAPE 8 — Sauvegardes (le plan du jalon 5, exécuté sur l'hôte réel)
- pg_dump quotidien + rclone sync des médias vers destination externe chiffrée.
- Restauration testée : restaurer dans une base neuve, vérifier le CONTENU
  (chorales, membres, mandats, médias présents), pas le code de sortie.
- Témoin de fraîcheur : savoir que la sauvegarde d'hier existe (le SMTP permet
  une alerte en cas d'échec).
Critère : une restauration complète réussie depuis la sauvegarde externe,
chronométrée.

ÉTAPE 9 — Ouverture à la chorale
Seulement une fois 0 à 8 verts.

APRÈS le déploiement, en parallèle du pilote, les lots NON bloquants :
identité/email vérifié, reset self-service, must_change_password, CSP, MFA,
CHECK_REVOKE_TOKEN, journal d'audit, observabilité, verrouillage des
dépendances, test 401 intermittent (chm-backend#1, à instruire avant plusieurs
chorales simultanées). Et le module Médias du répertoire (audio), première
demande du terrain, qui réutilise la mécanique TypeMedia du lot 3.

Ne fais pas les étapes en bloc. Une étape, son critère, puis la suivante.
Confirme chaque critère avant de continuer.
