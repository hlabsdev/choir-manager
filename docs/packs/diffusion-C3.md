# C3 — Brouillon de diffusion : la page Abonnement et la fin du plan Pionnier

Ce document est le **brouillon versionné** d'une diffusion unique aux chorales
pilotes, tel qu'il a été validé en phase 1
(`docs/packs/rapports/C3-phase1.md` § 4.4). Il ne déclenche **rien** : la
création du brouillon en base et, surtout, l'envoi sont des **actes humains**
distincts et séparés.

> ⚠️ **L'envoi est un ACTE HUMAIN.** Aucune commande, aucune cible `make`, aucun
> cron de ce dépôt n'expédie cette diffusion. Le seul chemin d'envoi est le
> bouton de l'écran opérateur, derrière une confirmation explicite.

## Fiche du message

| Champ | Valeur |
|---|---|
| Objet (`sujet`) | `Nouveau sur Chœur : la page Abonnement, et ce que devient le plan Pionnier` |
| Canaux | **e-mail uniquement** (`email` : vrai ; `sms` et `whatsapp` : faux) |
| Cible | `tous` — toutes les chorales **actives non suspendues** : **11 au 13/11/2026** |
| `inclure_suspendues` | `false` (défaut) — une chorale suspendue ne reçoit rien |
| `inclure_demo` | `false` (défaut) — les chorales de démonstration sont exclues |
| Destinataires réels | le Bureau de chaque chorale (premier responsable à défaut) |
| Statut attendu | `brouillon` — n'existe **pas** dans la version en production |
| Longueur | ~1 600 caractères, texte brut (le gabarit de marque est appliqué par le service) |

## Corps du message

Repris **à l'identique** de `docs/packs/rapports/C3-phase1.md` § 4.4 — ne pas
le réécrire, ne pas l'« améliorer » : ce texte a été validé.

```text
Bonjour,

Depuis le 2 août 2026, Chœur accompagne votre chorale au quotidien : membres,
répertoire, répétitions et pointage, finances et cotisations. Vous faites partie
des chorales qui ont ouvert la voie, et nous vous en remercions.

Deux nouveautés que vous pouvez consulter dès maintenant.

1. UNE PAGE PUBLIQUE DÉDIÉE À L'ABONNEMENT

   La page https://choirmanager.sankof.tech/abonnement présente le plan
   Standard, gratuit et sans limite de durée, ainsi que le plan Pro, qui ouvre
   les envois SMS et WhatsApp, l'assiduité et les séries de planning illimitées.

   Elle est accessible sans connexion : vous pouvez la partager telle quelle à
   votre bureau, ou la consulter depuis le lien « Voir les offres » de l'écran
   Mon abonnement.

2. LE PLAN PIONNIER SE TERMINE LE 31 DÉCEMBRE 2026

   Votre chorale bénéficie aujourd'hui du plan Pionnier, l'offre de lancement qui
   vous a été réservée. Ce plan prend fin le 31 décembre 2026.

   Au 1er janvier 2027, votre chorale bascule automatiquement en plan Standard,
   sans démarche de votre part et sans interruption de service : vos données,
   vos membres et votre historique sont conservés. Le plan Standard reste
   gratuit, sans limite de durée. Le plan Pro est une option payante ; il n'est
   jamais activé sans votre accord.

   Vous n'avez donc rien à faire. Si vous souhaitez passer en Pro avant cette
   date, ou si vous voulez simplement en parler, répondez à ce message : nous
   vous répondons directement.

Bien à vous,
L'équipe Chœur
```

## Procédure — dans cet ordre

### (a) Déployer la version qui connaît le statut brouillon

Rien de ce qui suit n'existe dans la version en production (v2.8.0) : ni le
statut `brouillon`, ni l'écran `/operateur/diffusion`, ni la commande. Le
déploiement se fait **par tag** (cf. `docs/DEPLOIEMENT.md`, « Mise à jour
applicative — par TAG, jamais par branche ») :

```bash
cd /root/choir-manager && make prod-deploie TAG=<tag>
```

### (b) Créer le brouillon — au choix, deux voies équivalentes

**Voie 1 — l'écran opérateur** `/operateur/diffusion` : composer le message,
choisir la cible « toutes les chorales » et le seul canal e-mail, puis
**enregistrer en brouillon**. Cette action n'envoie rien.

**Voie 2 — la commande**, qui n'enregistre QUE la cible « tous » et le canal
e-mail, et ne peut rien envoyer :

```bash
# 1. Le corps du message, extrait de la section « Corps du message » ci-dessus,
#    écrit en UTF-8 dans un fichier de l'hôte.
#    (La commande lit un chemin de SON système de fichiers : sous Docker, il
#    faut donc copier le fichier DANS le conteneur.)
cd /root/choir-manager
docker compose -f compose.yaml -f compose.prod.yaml cp \
  /tmp/annonce-pionnier.txt backend:/tmp/annonce-pionnier.txt

# 2. Créer le brouillon — AUCUN message n'est envoyé
docker compose -f compose.yaml -f compose.prod.yaml exec -T backend \
  python manage.py creer_diffusion_brouillon \
    --sujet "Nouveau sur Chœur : la page Abonnement, et ce que devient le plan Pionnier" \
    --message-fichier /tmp/annonce-pionnier.txt
```

La commande affiche l'identifiant, le statut `brouillon`, la cible, les canaux
et le nombre de chorales destinataires — à comparer aux **11** attendues.
`--dry-run` montre ce qui serait créé sans écrire une seule ligne.

### (c) Relire et prévisualiser dans l'interface

Ouvrir `/operateur/diffusion`, retrouver la ligne au statut **Brouillon**,
relire l'objet et le corps, et **prévisualiser** le rendu (le service applique
le gabarit de marque). C'est le dernier point où une faute se corrige sans
conséquence : un brouillon ne se modifie pas après coup, il se recrée.

### (d) ENVOYER depuis l'interface — décision humaine

L'envoi part du bouton de l'historique, sur la ligne du brouillon, derrière une
modale de confirmation qui rappelle le nombre de destinataires. C'est le seul
geste qui expédie quelque chose, et il est **irréversible** : une diffusion
envoyée ne repart pas (le service refuse tout statut autre que `brouillon`).

## ⚠️ La commande ne peut PAS être exécutée avant le déploiement

La version en production au 13/11/2026 (v2.8.0) ne connaît pas le statut
`brouillon` : la commande `creer_diffusion_brouillon` n'y existe pas, et son
exécution échouerait sur une commande inconnue. **L'ordre (a) → (b) n'est pas
une préférence, c'est une contrainte.**

De même, l'écran `/operateur/diffusion` de cette version ne propose que
l'envoi immédiat : s'en servir avant le déploiement expédierait le message sans
relecture ni brouillon.

## Faits vérifiés rappelés (ne pas s'en écarter)

- Le plan **Pionnier court jusqu'au 31 décembre 2026**
  (`abonnements/constants.py`, `DATE_FIN_PIONNIER`), et le backfill a posé
  cette échéance sur toutes les chorales existantes.
- La bascule en **Standard est automatique** au 1er janvier 2027, sans démarche
  de la chorale — le message ne doit ressembler ni à une facture ni à une
  relance.
- **15 jours de grâce** après l'échéance avant `lecture_seule`
  (`DUREE_GRACE_JOURS`), et **aucune interruption de service** : le message ne
  doit pas dire « votre accès se termine ».
- **Aucun montant n'est cité** : la décision P1 (prix publics) n'est pas
  tranchée ; les tarifs Pro vivent en base (`TarifPlan`) et la page retombe sur
  « Tarif sur demande ». Citer un prix dans un e-mail le figerait hors de sa
  source.
- **« 2 mois offerts » n'est pas repris** : c'est un texte **éditorial** de la
  page publique, pas un engagement chiffré. Le corps ci-dessus ne le mentionne
  pas, volontairement.
- Aucune date de facturation ni de prélèvement (il n'existe aucun paiement en
  ligne), aucun lien de désinscription (message d'exploitation à des clients
  identifiés, pas une campagne marketing).
