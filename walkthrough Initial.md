# ChoirManager — Walkthrough Backend MVP

## Résumé

Backend complet du MVP ChoirManager livré et vérifié. **42 fichiers** créés dans une architecture Django modulaire avec 6 applications.

---

## Ce qui a été construit

### Architecture Global

```
chm-backend/
├── chm_config/          # Configuration Django (settings, urls, wsgi, asgi)
├── core/                # Mixins, Chorale entity, permissions, middleware
├── authentication/      # JWT (SimpleJWT) avec payload enrichi
├── membres/             # Pupitres, Postes, Membres, Mandats + RBAC signal
├── musique/             # Chants, Partitions, SeanceChant (apprentissage)
├── presences/           # Répétitions, Pointage, Demandes de permission
└── finances/            # Journal de caisse, Campagnes, Cotisations, Paiements
```

### Modèles créés (18 modèles)

| Module | Modèles | Soft-Delete |
|--------|---------|:-----------:|
| **core** | `Chorale` | — |
| **membres** | `Pupitre`, `Poste`, `Membre`, `Mandat` | Membre ✅ |
| **musique** | `Chant`, `Partition`, `SeanceChant` | Chant ✅ |
| **presences** | `Repetition`, `Presence`, `PermissionRequest` | — |
| **finances** | `CategorieMouvement`, `Mouvement`, `CampagneCotisation`, `Cotisation`, `PaiementCotisation` | Mouvement ✅, Cotisation ✅ |

### Système RBAC

Le flux complet est fonctionnel :
1. **Poste** → définit des groupes Django (M2M)
2. **Mandat** → attribue un poste à un membre
3. **Signal `post_save`** → recalcule automatiquement `user.groups`
4. **Permissions DRF** → vérifient les groupes pour chaque endpoint
5. **JWT payload** → inclut les groupes pour le frontend Angular

### API REST (35+ endpoints)

| Préfixe | Endpoints | Accès |
|---------|-----------|-------|
| `/api/auth/` | login, register, refresh, profile | Public / Auth |
| `/api/membres/` | membres CRUD, pupitres, postes, mandats | Auth / Bureau |
| `/api/musique/` | chants, partitions, seances-chants | Auth / Maître |
| `/api/presences/` | repetitions (+ pointage groupé), pointages, permissions (+ approuver/refuser) | Auth / Maître |
| `/api/finances/` | categories, mouvements, campagnes (+ générer), cotisations, paiements, etat-caisse | Bureau / Trésorier |

### Données Bootstrap

La data migration `0002_data_bootstrap` a créé :
- **6 groupes Django** : `membre_actif`, `membre_honoraire`, `bureau`, `tresorier`, `maitre_choeur`, `chef_pupitre`
- **1 chorale** de démonstration (préfixe MCH)
- **4 pupitres** : Soprano, Alto, Ténor, Basse
- **8 postes** avec groupes associés
- **11 catégories** de mouvements financiers

---

## Vérification

| Test | Résultat |
|------|----------|
| `python manage.py check` | ✅ System check identified no issues |
| `makemigrations` | ✅ 6 migrations générées correctement |
| `migrate` | ✅ Toutes les migrations appliquées |
| Bootstrap data | ✅ Groupes, chorale, pupitres, postes, catégories créés |
| Serveur Django | ✅ Tourne sur port 8000 sans erreur |
| Admin Django | ✅ Accessible et fonctionnel |
| API DRF | ✅ Browsable API chargée |
| JWT Login | ✅ POST `/api/auth/login/` → 200 avec tokens |

---

## Accès développement

```bash
cd chm-backend
.\venv\Scripts\activate
python manage.py runserver 8000
```

- **Admin Django** : http://localhost:8000/admin/ (admin / admin1234)
- **API** : http://localhost:8000/api/

---

## Prochaines étapes

Le **frontend Angular 21 + Tailwind v4** reste à construire (Phases 9-11 du plan).
