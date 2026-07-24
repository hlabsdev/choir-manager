Contexte : lis CLAUDE.md et chm-backend/README.md. Point de retour v1.0.0-mvp.2
publié sur GitHub — on peut ouvrir un chantier lourd. Session BACKEND
uniquement : passer d'un User = un Membre = une chorale à un User membre de
plusieurs chorales. Aucun composant Angular dans cette session.

AVERTISSEMENT À GARDER EN TÊTE TOUT DU LONG
Le cas mono-chorale continuera de marcher même si la résolution multi-tenant est
fausse. La base de test ne contient que des users mono-chorale. Donc "les tests
existants passent" ne prouve RIEN sur ce chantier. La preuve vient uniquement des
tests multi-appartenance neufs. Ne conclus jamais "ça marche" sur la seule base
de la suite existante restée verte.

LE PROBLÈME DE FOND (relis-le avant de proposer quoi que ce soit)
Le RBAC repose sur user.groups, recalculé par membres/signals.py. Les groupes
Django sont GLOBAUX à l'utilisateur, sans notion de tenant. Dès qu'un User a des
membres dans plusieurs chorales, le signal calcule l'union des mandats actifs
toutes chorales confondues : trésorier dans A ⇒ groupe tresorier sur le User ⇒
IsTresorier passe AUSSI dans B. Escalade de privilèges cross-tenant sur les
finances. Les permissions ne peuvent donc plus vivre sur le User ; elles doivent
se résoudre par tenant actif.

Note : le jalon 2 a déjà introduit core/tenancy.py (est_operateur, chorale_de,
requete_est_operateur). chorale_de(user) suppose aujourd'hui une chorale unique
— il fait partie de ce qui doit évoluer. Réutilise ce module comme point d'ancrage
plutôt que d'en créer un parallèle.

PHASE 1 — PLAN (ne code rien, présente et attends validation)
Recense et présente :
1. Tous les usages de l'accesseur OneToOne user.membre / request.user.membre —
   ils vont tous casser. Propose un helper unique get_membre(user, chorale) et
   dis comment chorale_de() de core/tenancy.py évolue.
2. Tous les points lisant user.groups pour décider d'un droit : permissions,
   vues, serializers, admin, sérialisation JWT, ET core/tenancy.py.
3. Le module notifications : le modèle Notification porte-t-il une FK chorale
   exploitable ? Sinon c'est une migration à intégrer ici (les notifications
   devront être scopées au tenant actif, pas seulement au destinataire).
4. Ta stratégie de migration de données : les 23 membres RPL réels + la démo CVN
   doivent survivre sans perte, chacun rattaché à sa chorale. Réversible si
   possible. IMPÉRATIF : fais un pg_dump AVANT la migration et dis-moi où il est.
5. TRANCHE EXPLICITEMENT le cas Django admin. L'admin utilise user.groups pour
   ses propres permissions. Si on vide user.groups, l'admin des opérateurs peut
   casser. Le jalon 2 a déjà réservé l'admin sensible aux opérateurs — appuie-toi
   dessus. Propose UNE solution nette : les groupes ne sont plus source de vérité
   pour l'API métier ; l'accès admin dépend de est_operateur, pas des groupes.
   NE PROPOSE PAS de garder user.groups actif "pour ne rien casser" en parallèle
   de la résolution scopée. Deux sources de vérité qui divergent = failles
   silencieuses. Je refuserai cette option d'emblée.

PHASE 2 — IMPLÉMENTATION (après validation du plan)

Modèle
- Membre.user : OneToOneField → ForeignKey, related_name explicite (ex.
  "membres"). UniqueConstraint(user, chorale) : un seul Membre par user et par
  chorale.
- soft_delete() d'un Membre ne doit PLUS faire user.is_active = False — le user
  peut être actif ailleurs. C'est devenu faux, corrige-le.
- Suspension d'une chorale : bloque CE tenant, jamais le compte entier.

Résolution des permissions (le cœur — c'est ici que le chantier réussit ou échoue)
- core/permissions.py : chaque classe passe de "ce User a-t-il le groupe X" à
  "le Membre de ce User dans request.chorale a-t-il un mandat actif conférant X".
  Les Group peuvent rester le vocabulaire ; la résolution devient scopée.
- Neutralise COMPLÈTEMENT l'écriture dans user.groups par membres/signals.py. Si
  elle subsiste, c'est une porte dérobée : un droit obtenu dans A resterait
  lisible depuis B.
- Retire groups du payload JWT (devenu faux) ou remplace-le par les seuls rôles
  du tenant actif.
- Perf : la résolution des mandats ne doit pas produire N requêtes SQL par
  vérification de permission. Prévois le select_related / la mise en cache par
  requête.

Tenant actif & JWT
- Le JWT porte le tenant actif (chorale_id) ET la liste des chorales du user
  (id + nom, pour le futur sélecteur front).
- IMPÉRATIF : le middleware REVÉRIFIE côté serveur que ce User a un Membre actif
  non supprimé dans cette chorale, et que la chorale est active. Un claim signé
  n'est pas forgeable, mais l'appartenance a pu être révoquée depuis l'émission.
  Ne jamais faire confiance au claim seul.
- membre_id devient le membre du tenant actif, recalculé à chaque switch.
- POST /api/auth/switch-chorale/ : vérifie l'appartenance, renvoie un nouveau
  couple access/refresh. Changer de chorale = réémettre un token, pas un toggle.
- Connexion : une seule chorale → active d'office ; plusieurs → défaut
  déterministe. Dis-moi lequel tu retiens (dernière utilisée vs plus ancienne).

Notifications
- Scoper /api/notifications/ au tenant actif EN PLUS du destinataire.
- Emails : indiquer de quelle chorale ils proviennent (un destinataire peut en
  recevoir de plusieurs). notifications/services.py reste le point d'entrée unique.

Onboarding d'un utilisateur déjà inscrit
- Le code d'invitation reste le point d'entrée, avec une branche : si le code est
  ouvert par une personne déjà connectée, ou si l'email saisi correspond à un
  compte existant, on ne crée PAS un second compte — on propose de rejoindre avec
  le compte existant, et le Membre n'est créé qu'après ACCEPTATION EXPLICITE de
  la personne.
- Non négociable : c'est toujours la personne qui accepte, jamais un bureau qui
  rattache un compte existant sans son accord. Une initiative bureau prend la
  forme d'une invitation nominative EN ATTENTE, acceptée ou refusée.
- Backend uniquement : endpoints + logique. L'UI viendra au jalon front.

TESTS OBLIGATOIRES (la seule preuve réelle du chantier — validation par mutation)
- LE test central : un User membre de A et B, mandat trésorier dans B ; tenant
  actif = A ⇒ 403 sur les finances de A ET aucune donnée de B visible. Valide-le
  par mutation (rends la résolution non scopée → il doit devenir rouge).
- Switch : nouveau token = bons droits ; ancien token n'ouvre pas le nouveau
  tenant.
- Un Membre soft-deleted dans A conserve l'accès à B.
- Chorale suspendue : ce tenant bloqué, compte intact.
- Claim chorale_id vers une chorale dont le user n'est pas/plus membre → rejeté
  par le middleware.
- Notifications : user membre de A et B ne voit que celles du tenant actif.
- Concurrence unique_actif sur un Poste : toujours verte après la refonte
  (c'est le mandat qui porte désormais la permission — ne la casse pas).
- Toute la suite d'isolation existante reste verte.

Contraintes : PostgreSQL. Aucun composant Angular. Plan avant code, diff avant
commit. Ne commit pas — je relis, en particulier le test central et la
neutralisation de user.groups.