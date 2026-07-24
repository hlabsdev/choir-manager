# Notes de version — ChoirManager `v1.0.0-mvp.1`

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
