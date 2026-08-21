# Notes de version — ChoirManager

## `v1.8.0` — self-service du profil

Date de préparation : 21 août 2026

**Statut : version préparée sur `main`, tag non posé, non déployée.** La
production reste sur `v1.7.0` jusqu'à la création explicite du tag et au
déploiement qui suivra.

### Fonctionnalité principale

La section Identité de « Mon espace » permet désormais au titulaire du compte
de modifier lui-même :

- son prénom et son nom ;
- son numéro de téléphone ;
- sa préférence de partage de contact dans l'annuaire ;
- sa photo de profil, par ajout ou remplacement.

### Sécurité et cloisonnement

- la fiche ciblée reste exclusivement celle du compte connecté dans le tenant
  actif ;
- statut, pupitre, notes internes, rôles, mandats et autres champs réservés au
  Bureau restent exclus de cette surface ;
- les serializers, permissions et querysets backend existants demeurent la
  source réelle d'autorisation, indépendamment des contrôles visuels du front ;
- aucun changement backend n'a été nécessaire pour ce lot. Le pointeur reste
  sur le commit déjà validé `959a773`.

### Cohérence des sauvegardes

Les données globales du `User` sont enregistrées avant celles du `Membre`, par
des appels séquentiels. Un succès global n'est affiché qu'après la fin du
parcours : si la seconde étape échoue, l'interface indique précisément que la
première a déjà été persistée. L'upload de la photo intervient en dernier et
un échec d'upload ne masque pas la réussite des autres informations. Les
doubles soumissions sont ignorées pendant l'opération.

### Expérience utilisateur

- états explicites de chargement, absence de fiche, erreur, succès et réessai ;
- formulaire désactivé pendant la sauvegarde ;
- identité affichée actualisée immédiatement après la réponse serveur réussie ;
- photo protégée rechargée après un upload réussi ;
- fichier conservé pour permettre un nouvel essai si l'upload échoue.

### Portée des données

Le prénom et le nom appartiennent au compte global `User` et sont donc communs
à toutes les chorales de ce compte. Le téléphone, la photo et la préférence de
partage appartiennent au `Membre` du tenant actif. Cette séparation est le
comportement attendu du modèle multi-chorale.

### Validation

- frontend : **29/29 fichiers**, **196/196 tests réussis** ;
- build Angular de production : **réussi** ;
- backend : aucun changement dans ce lot, pointeur inchangé sur `959a773`.

Ces résultats ont été exécutés sur la combinaison publiée avant la préparation
de cette version. La suite backend complète n'a pas été présentée comme une
nouvelle exécution pour ce lot frontend.

### Exploitation et retour arrière

- aucune migration de base de données ;
- aucune nouvelle variable d'environnement ;
- aucun nouveau service Docker ;
- aucun changement du pointeur backend ;
- changement applicatif limité au frontend et au pointeur/documentation du
  superprojet.

Après création du tag, le déploiement suivra la procédure habituelle :

```bash
make prod-deploie TAG=v1.8.0
```

Un retour arrière du code vers `v1.7.0` reste possible avec :

```bash
make prod-retour-arriere TAG=v1.7.0
```

Aucune restauration de schéma n'est nécessaire pour ce lot, puisqu'il
n'introduit aucune migration. La sauvegarde automatique de pré-déploiement
reste néanmoins obligatoire selon la procédure existante.

---

## `v1.0.0-mvp.1` — premier point de référence consolidé

Date de référence : 24 juillet 2026

Cette version constitue le premier point de référence consolidé du MVP de
ChoirManager. Le dépôt racine fige ensemble les versions compatibles du backend,
du frontend, de la documentation utilisateur et des documents de conception.

## Composants figés

| Composant | Dépôt | Commit |
| --- | --- | --- |
| Backend Django REST | `hlabsdev/chm-backend` | `77869d6` |
| Frontend Angular | `hlabsdev/chm-frontend` | `9abe5ad` |
| Documentation et pilotage | dépôt superprojet | commit portant ce tag |

Les deux composants applicatifs sont référencés comme sous-modules Git. Le tag
du superprojet permet donc de restaurer exactement cet assemblage.

## Périmètre fonctionnel

- authentification JWT, renouvellement de session et changement de mot de passe ;
- isolation multi-tenant par chorale et suspension d'une chorale ;
- gestion des membres, pupitres, postes, mandats et invitations ;
- séances, présences, absences et pointage adapté au mobile ;
- répertoire, chants, partitions et thèmes ;
- finances, journal de caisse, tarifs et cotisations ;
- annonces, notifications intégrées et notifications email ciblées ;
- tableaux de bord adaptés aux rôles ;
- rapports financiers, présences, effectifs et répertoire, avec exports CSV/PDF ;
- demande publique d'adhésion d'une chorale avec modération opérateur ;
- guide utilisateur complet livré dans `docs/`.

## Qualité et limites connues

- le backend dispose d'environ 129 tests couvrant notamment l'isolation,
  les permissions, l'onboarding, les notifications et les rapports ;
- le frontend dispose de tests Vitest ciblant les éléments critiques ;
- SQLite et l'environnement de développement unique restent des choix de MVP ;
- l'export PDF exige GTK/Pango/Cairo au runtime ;
- les notifications push, SMS, calendriers externes, l'application native et le
  module Activités/Planning ne font pas partie de ce jalon.

## Restaurer cette version

```bash
git clone --branch v1.0.0-mvp.1 --recurse-submodules \
  https://github.com/hlabsdev/choir-manager.git
```

Pour un clone déjà présent :

```bash
git checkout v1.0.0-mvp.1
git submodule update --init --recursive
```
