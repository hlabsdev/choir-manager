Vous aviez raison. Mon premier diagnostic était techniquement incorrect parce que les dossiers des sous-modules n’étaient pas synchronisés avec le superprojet.

## État réellement audité

- Superprojet : `6d266a7`, tag `v1.1.0-rc.3`
- Backend attendu : `83831bd`
- Frontend attendu : `bc92cad`
- Backend présent dans le dossier : `77869d6`, 17 commits en retard
- Frontend présent dans le dossier : `9abe5ad`, 11 commits en retard

J’ai donc relu les fichiers directement dans les commits `83831bd` et `bc92cad`, sans déplacer vos checkouts ni toucher à vos modifications documentaires.

## Rectification de mon précédent diagnostic

Ces éléments existent désormais et ne doivent plus être présentés comme manquants :

- PostgreSQL 17 et Docker Compose ;
- Gunicorn, Nginx et configuration same-origin ;
- healthchecks frontend, backend et base ;
- configuration Django fermée hors développement ;
- CI backend PostgreSQL, frontend, builds Docker et `check --deploy` ;
- blacklist SimpleJWT et rotation des refresh tokens ;
- révocation de toutes les sessions lors d’un changement de mot de passe ;
- gestion multi-chorale frontend et backend ;
- SMTP opérationnel, Reply-To par chorale, timeout et erreurs journalisées ;
- procédure documentée de sauvegarde/restauration ;
- `db.sqlite3` retiré de l’état courant et correctement ignoré.

La baseline enregistrée par `v1.1.0-rc.3` est de 276 tests backend et 87 frontend.

## Diagnostic corrigé

### P0 — Confidentialité et isolation des comptes

1. **Le détail complet d’un membre reste accessible à tout utilisateur authentifié du tenant.**

Dans `backend@83831bd:membres/views.py`, `list` et `retrieve` utilisent seulement `IsAuthenticated`. Le sérialiseur détaillé renvoie notamment :

- email ;
- téléphone ;
- photo ;
- notes internes ;
- métadonnées de suppression ;
- mandats et rôles.

Le frontend masque bien `/membres` aux choristes, mais la sécurité serveur ne suit pas cette intention. C’est précisément le type de protection que le frontend ne doit jamais être seul à porter.

2. **Un Bureau peut modifier des informations globales d’un compte multi-chorale.**

`MembreDetailSerializer.update()` modifie directement `user.email`, `first_name` et `last_name`. Dans le modèle 1:N actuel, ces champs appartiennent au compte global, pas à l’adhésion d’une chorale.

Conséquence : le Bureau de la chorale A peut modifier l’email de récupération d’une personne également membre des chorales B et C. L’ajout d’un reset par email rendrait cette faiblesse beaucoup plus dangereuse.

3. **Les médias sont publics dès que leur URL est connue.**

Le Nginx de production sert directement :

```nginx
location ^~ /media/ {
    alias /usr/share/nginx/media/;
}
```

Cela contourne totalement les permissions Django. Sont concernés :

- justificatifs financiers ;
- pièces jointes d’annonces ;
- partitions ;
- photos des membres ;
- logos.

Les chemins ne sont pas protégés par tenant et les fichiers ne disposent d’aucune validation applicative systématique de taille, de type réel ou de contenu.

4. **Des données personnelles réelles restent inscrites dans le code Git.**

`membres/management/commands/import_members.py` déclare explicitement une liste de personnes réelles avec noms et téléphones, puis leur attribue le même mot de passe initial `Chorale2024!`.

Même si SQLite a été retiré, ces données restent dans le commit courant et probablement dans l’historique distant. Il faut traiter ce point comme de l’hygiène de données, voire comme un incident si le dépôt a été exposé au-delà des personnes autorisées.

### P1 — Authentification

5. **Le mot de passe oublié autonome manque toujours.**

Il existe désormais deux flux solides, mais aucun n’est un self-service de récupération :

- utilisateur connecté : changement avec ancien mot de passe et révocation des sessions ;
- Bureau : génération d’un mot de passe temporaire pour un compte mono-chorale.

Le backend indique explicitement qu’aucune réinitialisation par email n’existe. Le frontend ne contient ni lien depuis la connexion, ni page de demande, ni page de définition du nouveau mot de passe.

6. **L’identité email n’est pas assez robuste pour servir de récupération.**

- email facultatif ;
- aucune notion d’email vérifié ;
- aucune contrainte unique insensible à la casse en base ;
- validation d’unicité principalement applicative ;
- changement d’email sans confirmation ;
- changement d’email personnel sans réauthentification ;
- changement possible par un Bureau d’un tenant.

Le reset ne doit pas être ajouté avant de corriger cette fondation.

7. **Le login n’est pas protégé contre le credential stuffing.**

Les throttles actuels couvrent :

- demande de chorale ;
- vérification d’invitation ;
- inscription par invitation.

Le login n’a aucun throttle. De plus, le cache Django n’est pas explicitement partagé : un throttle DRF standard serait local à chaque worker Gunicorn et insuffisant comme protection principale.

8. **La déconnexion frontend ne révoque pas le refresh token.**

`logout()` efface seulement `localStorage`. Un refresh token copié avant la déconnexion reste valide jusqu’à expiration ou rotation.

Le changement de mot de passe, lui, révoque correctement toutes les sessions.

9. **Les mots de passe temporaires ne forcent pas leur remplacement.**

Le Bureau peut générer ou saisir un mot de passe provisoire, mais aucun indicateur `must_change_password` ne bloque l’accès métier avant son remplacement.

10. **Les access tokens restent valides jusqu’à 30 minutes après un changement de mot de passe.**

Le projet révoque correctement les refresh tokens, mais accepte explicitement cette fenêtre résiduelle. SimpleJWT propose `CHECK_REVOKE_TOKEN`, qui permet de lier la validité du JWT au hash du mot de passe. Il faudra le tester avec les flux multi-chorale avant activation.

11. **JWT dans `localStorage` sans Content Security Policy.**

Nginx pose plusieurs bons en-têtes, mais aucune CSP. Une XSS pourrait donc lire access et refresh tokens. La migration vers cookies `HttpOnly` est un chantier plus large ; une CSP stricte constitue au minimum une défense immédiate.

### P2 — Exploitation et gouvernance

12. **Aucun journal d’audit persistant transversal.**

Les erreurs email sont désormais journalisées, mais il n’existe pas de registre durable des événements sensibles :

- connexions échouées ;
- demandes et réussites de reset ;
- changement d’email ;
- réinitialisation par un Bureau ;
- modification de rôles ;
- export de rapports ;
- opérations financières sensibles ;
- accès opérateur.

13. **Les sauvegardes sont documentées, mais pas encore éprouvées.**

Le runbook est sérieux, mais le fil conducteur confirme que la restauration chronométrée, la rétention, le chiffrement et l’externalisation constituent encore le jalon 5.

14. **Observabilité encore minimale.**

Healthchecks et logs existent, mais pas encore :

- remontée centralisée des erreurs ;
- métriques et alertes ;
- identifiant de corrélation par requête ;
- politique de rétention des logs ;
- alerte sur échecs SMTP, base indisponible ou saturation disque.

15. **Conformité et cycle de vie des données non formalisés.**

Pas de politique de confidentialité visible, durée de conservation, export personnel, anonymisation, suppression d’un tenant ou traitement des sauvegardes après suppression.

16. **Chaîne de dépendances Python non verrouillée.**

`requirements.txt` utilise des plages de versions. Deux builds à des dates différentes peuvent installer des versions différentes. La CI ne lance pas encore d’audit automatique de vulnérabilités Python/npm.

## Plan corrigé

### Lot 0 — Préparation fiable

- Préserver les modifications documentaires actuelles.
- Synchroniser les sous-modules sur `83831bd` et `bc92cad`.
- Créer les branches d’implémentation dans chaque sous-module.
- Rejouer réellement les 276/87 tests avant toute modification.

### Lot 1 — Correctifs de confidentialité urgents

- Séparer clairement les données `User` globales des données `Membre` par tenant.
- Interdire au Bureau de modifier email et identité globale d’un compte multi-chorale.
- Créer des sérialiseurs distincts :
  - annuaire minimal éventuel ;
  - profil personnel ;
  - détail staff ;
  - édition tenant.
- Ne jamais exposer les notes internes aux choristes.
- Mettre les médias privés derrière des endpoints autorisés.
- Utiliser idéalement `X-Accel-Redirect` avec une location Nginx `internal`.
- Appliquer des politiques différentes :
  - justificatifs : Bureau/Trésorier ;
  - partitions et annonces : membres du tenant ;
  - photos : selon la politique d’annuaire ;
  - logos : éventuellement publics.
- Ajouter validation de taille, extension et MIME réel.
- Externaliser le fichier d’import réel et supprimer tout mot de passe partagé.

### Lot 2 — Identité et email de récupération

Politique recommandée :

- l’email peut rester facultatif pour utiliser ChoirManager ;
- un email vérifié devient obligatoire uniquement pour le self-service de récupération ;
- normalisation et unicité insensible à la casse ;
- changement d’email réservé au titulaire du compte ;
- réauthentification avec mot de passe actuel ;
- confirmation de la nouvelle adresse ;
- notification de l’ancienne adresse ;
- le Bureau ne modifie plus l’email global.

Cela évite d’exclure les choristes sans email tout en sécurisant la récupération.

### Lot 3 — Mot de passe oublié complet

Backend :

- demande par identifiant ou email ;
- réponse générique, que le compte existe ou non ;
- compte actif et email vérifié ;
- token Django à usage unique et durée configurable ;
- URL construite depuis une origine frontend explicitement configurée ;
- limitation par IP et par compte via un stockage partagé ;
- nouveau mot de passe soumis aux validateurs Django ;
- révocation de toutes les sessions ;
- notification de sécurité ;
- aucune connexion automatique.

Frontend :

- lien « Mot de passe oublié ? » ;
- page de demande ;
- page de définition du nouveau mot de passe ;
- états lien invalide, expiré, déjà utilisé, succès et erreur réseau ;
- confirmation du mot de passe ;
- tests services, routes et composants.

Le reset sera global au compte, jamais attaché à une chorale particulière.

### Lot 4 — Durcissement de l’authentification

- Protection du login contre le credential stuffing.
- Endpoint de logout révoquant le refresh présenté.
- `must_change_password` pour tout secret temporaire.
- Tester puis activer `CHECK_REVOKE_TOKEN`.
- CSP stricte dans Nginx.
- MFA obligatoire pour l’opérateur et fortement recommandé pour Bureau/Trésorier.
- À terme : refresh token en cookie `HttpOnly`, access token en mémoire.

### Lot 5 — Jalon production

- Restauration PostgreSQL et médias réellement exécutée et chronométrée.
- Sauvegardes chiffrées hors machine avec rétention.
- Planification effective de `flushexpiredtokens`.
- Logs structurés, corrélation, centralisation et alertes.
- Audit de dépendances et verrouillage Python.
- Journal d’audit applicatif.
- Politique de confidentialité et règles de conservation/anonymisation.
- Smoke tests E2E sur la pile Docker.

## Recommandation

Je recommande d’implémenter d’abord les lots 1 à 4, puis d’intégrer le lot 5 au jalon de déploiement déjà ouvert. Le reset seul fonctionnerait techniquement, mais serait dangereux tant qu’un Bureau peut modifier l’email global d’un compte et que l’adresse n’est pas vérifiée.

Deux décisions sont nécessaires avant l’implémentation :

1. un choriste ordinaire doit-il disposer d’un annuaire minimal des autres membres, ou la liste doit-elle être entièrement réservée au staff ?
2. confirmez-vous la politique « email facultatif pour utiliser l’application, mais email vérifié obligatoire pour récupérer soi-même son compte » ?

Aucun fichier ni checkout n’a été modifié pendant cette reprise.