# Listes de sélection par tenant — architecture

> Socle `core.Liste` / `core.ValeurListe`, livré sur `feat/listes-tenant`.
> Carte des listes et classification : [LISTES_SELECTION_CARTOGRAPHIE.md](LISTES_SELECTION_CARTOGRAPHIE.md).

## 1. Objectif et décisions

Rendre éditables **sans déploiement** les choix qui relèvent de la vie d'une
chorale, sans transformer les choix métier fermés en listes libres.

| Décision | Choix | Raison |
| --- | --- | --- |
| Modèles existants (`Pupitre`, `Poste`, `CategorieMouvement`, `Theme`, `Campagne`, `Tarif`) | **conservés** | 10 chorales réelles avec données ; les migrer vers un socle générique serait une migration FK à haut risque sans gain. |
| Champ métier (`Evenement.type_evenement`, `Pupitre.categorie`…) | **code stable (`CharField`)** | contrat d'API inchangé, aucune migration de données lourde, renommage de libellé sûr. La liste est la source des choix et des métadonnées. |
| A3/A5/A7/A8 | **listes tenant semées** avec les valeurs actuelles | le terrain peut compléter/modifier sans attendre un lot. |
| `StatutApprentissage`, `Poste.TypePoste`, `Portee` média | **fermés** | sémantique de calcul/affichage stable, aucun gain fonctionnel à les ouvrir. |

## 2. Modèle

```
Chorale
 └── Liste            code (stable), nom, description, modifiable
      └── ValeurListe code (stable), libelle, ordre, actif, par_defaut,
                      couleur, icone, parent
```

- `Liste` : `unique(chorale, code)`.
- `ValeurListe` : `unique(liste, code)` ; rattachée au tenant via `liste`
  (pas de FK `chorale` dupliquée — le `chorale` exposé en lecture vient de
  `liste.chorale`, pour l'audit).
- Un seul `par_defaut` par liste (l'API retire l'ancien, une écriture à la fois
  pour que chaque bascule soit auditée).
- On **désactive** (`actif=False`) ; on ne supprime pas une valeur référencée
  (API 409, `core/listes.py::usages_valeur`). Les données historiques restent
  lisibles et affichables.

## 3. API

| Méthode | Route | Accès |
| --- | --- | --- |
| GET | `/api/core/listes/` | membre du tenant |
| POST/PATCH/DELETE | `/api/core/listes/{id}/` | bureau / MDC, tenant actif |
| GET | `/api/core/listes-valeurs/?liste=<id>` | membre du tenant |
| POST/PATCH/DELETE | `/api/core/listes-valeurs/{id}/` | bureau / MDC, tenant actif |

- Scoping : `ChoraleFilterMixin` (`chorale` direct pour `Liste`,
  `liste__chorale` pour `ValeurListe`). Aucune liste d'un autre tenant, même id
  deviné.
- `code` immuable après création (liste et valeur).
- Écriture refusée hors tenant actif, **même pour l'opérateur** : celui-ci gère
  les défauts de provisionnement par le code (`core/listes.py`) et l'admin.
- Conflit de suppression : `409` avec message invitant à désactiver.

## 4. Semis et migration

- `core/listes.py::seed_listes(chorale)` : idempotent, **ne réécrit jamais** un
  libellé/couleur/ordre modifié par le tenant.
- Migration `core/0009` (schéma) + `core/0010` (semis des chorales existantes).
- `provisionner_chorale()` appelle `seed_listes` → toute nouvelle chorale est
  immédiatement utilisable.
- `manage.py seed_listes [--chorale NOM|PREFIXE]` pour rattraper/relancer.
- Migration `membres/0016` : `Pupitre.actif` (désactivation sans perte
  d'historique).
- Migration `finances/0007` : `PaiementCotisation.mode_paiement`.

## 5. Frontend

- `shared/services/listes.service.ts` : un appel `GET /core/listes/` renvoie
  listes + valeurs ; cache par session ; **purgé au changement de tenant**
  (`TenantContextService.purgerEtatApplicatif`).
- `shared/components/select-liste/` : sélecteur unique (chargement, valeurs
  actives, désactivation, vide optionnel).
- `/structure/listes` (bureau/MDC) : édition des valeurs (libellé, ordre,
  actif, défaut, couleur), ajout, suppression protégée.
- Planning : les types d'événement viennent de la liste (le type structurel
  « répétition » reste fermé) ; badges/chips prennent la couleur de la valeur.
- Structure : catégories de pupitre depuis la liste + bascule `Pupitre.actif`.
- Répertoire : styles de chant depuis la liste.
- Cotisations : types de campagne et modes de paiement depuis les listes ; le
  mode est envoyé dans `mode_paiement` (plus recopié dans `notes`).

## 6. Intégration pilote (A1 + A2)

- **A1 — types de rendez-vous** : `Evenement.type_evenement` et
  `Serie.type_evenement` validés contre la liste `type_evenement` active ;
  repli sur les choix historiques si la liste n'est pas semée (jamais de
  blocage brutal). Les types `culte`, `veillée`, `formation` sont semés.
- **A2 — pupitres** : `Pupitre` reste un modèle tenant ; `actif` permet de le
  retirer des nouvelles affectations sans casser les membres déjà rattachés ;
  les catégories viennent de `categorie_pupitre`.

## 7. Sécurité multi-tenant

- Lecture/écriture bornées par `ChoraleFilterMixin` (deux surfaces : liste et
  détail).
- Chaque valeur est rattachée à une liste, elle-même rattachée à une chorale :
  aucune valeur orpheline possible.
- Un `code` de valeur ne peut pas être changé (les données métier le portent).
- L'audit (app `core`) journalise automatiquement les écritures, avec la
  chorale (directe pour `Liste`, via `liste.chorale` pour `ValeurListe`).

## 8. Points ouverts

- Import/export CSV des listes (non demandé).
- Cache Redis partagé (aujourd'hui cache mémoire du service Angular ; le
  backend relit la base à chaque requête — volume négligeable).
- Migration éventuelle vers des FK `ValeurListe` pour de **nouveaux** champs :
  possible sans risque, à faire au cas par cas.
- Les listes « fermées » (§1) pourront être rouvertes si un besoin terrain
  apparaît (ex. `Portee` média), avec un test de non-régression du calcul.

## 9. Déploiement

```bash
# sur la branche, une fois validée
git checkout main && git merge --ff-only feat/listes-tenant
git tag -a v2.3.0 -m "Choeur 2.3.0 — listes de sélection par tenant"
git push origin main v2.3.0
# sur le serveur
cd /root/choir-manager && make prod-deploie TAG=v2.3.0
```

La migration `core/0010` sème les chorales existantes au déploiement.
