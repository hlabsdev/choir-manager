QUESTION 3: Détaille le modèle de données du module Membres & Structure : entités, champs clés, relations. Inclus membres, bureau, maîtres de chœur, postes et pupitres.

REPONSE 3:
---

**Décisions de conception et points à challenger :**

**1. Membre ≠ User — la séparation est intentionnelle.** `User` gère l'authentification (mot de passe, sessions, is_active). `Membre` porte le profil chorale (pupitre, statut, historique). Cette séparation via `OneToOneField` est la bonne pratique Django — elle permet d'avoir un `User` sans `Membre` (un admin technique par exemple), et un `Membre` inactif dont le `User` est désactivé sans perdre ses données.

**2. Le `Mandat` est le pivot du système** — ni "Maître de chœur", ni "Président" ne sont des entités séparées. Ce sont des `Poste` instanciés via des `Mandat`. Cela donne nativement l'historique complet ("qui a été président de quand à quand ?"), gère les élections successives, et supporte les suppléants sans logique spéciale.

**3. `Poste.unique_actif` est le mécanisme clé pour les suppléants.** `Président` a `unique_actif=True` → une seule personne à la fois. `Maître de chœur Suppléant` a `unique_actif=False` → plusieurs mandats actifs simultanés autorisés. Sans ce flag, tu serais obligé d'écrire une logique de validation ad hoc partout.

**4. Le signal `post_save` sur `Mandat` est la colle RBAC.** Dès qu'un mandat est créé ou clôturé, `user.groups` est recalculé automatiquement. Aucune vue, serializer ou tâche Celery n'a à s'en préoccuper. C'est le bon endroit pour cette logique.

**5. Ce que le modèle n'inclut pas encore — et qui sera nécessaire :** une data migration (`0002_data_postes.py`) pour pré-remplir les `Pupitre` (Soprano, Alto, Ténor, Basse…) et les `Poste` standards (Président, Trésorier, Maître de chœur Principal…) avec leurs groupes Django déjà associés. Sans ça, la synchro RBAC ne fonctionne pas au premier démarrage.

**6. `generer_numero()` est fragile en contexte concurrent** — si deux membres s'inscrivent en même temps, tu peux avoir un doublon. La solution propre en PostgreSQL : une séquence native via `django-sequences` ou un `SERIAL` dédié. Pour une chorale (volume faible), ça ne sera probablement jamais un problème réel — mais c'est bien de le savoir.

Prêt pour le module **Répétitions** (Séance, Présence, PermissionRequest) ou tu veux d'abord la data migration de bootstrap ?