Question 2: Définis les rôles RBAC pour ChoirManager : quels rôles, quelles permissions par module, comment gérer les accès bureau vs membres vs maestro ?


Reponse 2:
---

**Décisions de conception à challenger immédiatement :**

**1. "Complet" ne veut pas dire "supprimer sans restriction"** — en pratique, la suppression d'un membre, d'un mouvement financier ou d'un chant appris doit être une action protégée supplémentaire, avec confirmation et éventuellement une soft-delete (`is_deleted=True` + `deleted_at`). Tu ne veux pas qu'un clic accidentel du bureau efface 3 ans d'historique. Implémente un flag `deleted_at` sur tous tes modèles sensibles avant de penser aux permissions.

**2. Le rôle "Bureau" est intentionnellement limité sur les Répétitions** — c'est une décision de séparation des responsabilités : le bureau gère l'administratif, le Maître de chœur gère le musical. Si tu leur donnes aussi le "Complet" sur les Répétitions, tu crées des conflits d'autorité dans la vraie vie. Résiste à la tentation de tout ouvrir.

**3. L'implémentation Django concrète** — ne réinvente pas la roue. Django a déjà un système de groupes et permissions. La stratégie la plus robuste pour un DRF + Angular :

- Utilise les `Groups` Django natifs pour mapper les rôles (`bureau`, `tresorier`, `maitre_choeur`, `membre_actif`, `membre_honoraire`).
- Ajoute un champ `roles = ManyToManyField(Group)` sur ton modèle `Membre` — un membre peut cumuler des rôles.
- Dans DRF, surcharge `get_permissions()` dans tes `ViewSet` pour combiner `IsAuthenticated` + des `BasePermission` personnalisées par rôle.
- Pour les permissions "Personnel" (SELF), surcharge `get_queryset()` pour filtrer `queryset.filter(membre=request.user.membre)` — c'est plus propre et plus sûr qu'une vérification à l'objet.
- Pour Angular, inclus les groupes de l'utilisateur dans le payload JWT (via `djangorestframework-simplejwt` + `TOKEN_OBTAIN_SERIALIZER` custom) pour piloter l'affichage côté front. Mais rappelle-toi : **la sécurité réelle vit côté Django**, Angular ne fait que masquer des éléments UI.

**4. Ce que cette matrice ne couvre pas encore** — et qui te rattrapera : la gestion des conflits de rôles (que se passe-t-il si le Trésorier démissionne ? qui désactive son accès financier ?), et les permissions temporaires (accorder un accès Maître de chœur suppléant pendant une absence). Ces cas méritent un champ `is_active` sur l'attribution de rôle, avec une date d'expiration optionnelle.

Prêt pour le modèle de données Django (`models.py`) du premier module ?