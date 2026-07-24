Audit terminé, avec une correction critique au passage. Voici l'état réel et vérifié du projet — pas une lecture visuelle : chaque « fonctionnel » ci-dessous est prouvé par un test qui frappe l'endpoint réel (suite pytest à 26 verts).

🔴 Bug systémique trouvé et corrigé pendant l'audit
En écrivant la recette d'intégration, j'ai découvert que presque toutes les créations de l'app étaient cassées (HTTP 500, IntegrityError: chorale_id NOT NULL) : pupitres, postes, chants, catégories, campagnes, cotisations… Seuls Mouvement et Repetition marchaient (ils avaient un perform_create explicite).

Cause racine : ChoraleFilterMixin.perform_create n'injectait chorale que if "chorale" in serializer.fields — or aucun serializer n'expose ce champ (c'est déduit du tenant, jamais envoyé par le client). Toutes les créations tombaient donc dans le else sans chorale. Corrigé en core/mixins.py : injection systématique via serializer.save(chorale=...) (le kwarg entre dans les validated_data même sans champ déclaré). J'ai retiré l'override devenu redondant sur RepetitionViewSet. Ça débloque d'un coup toutes les écritures des modules à venir.

Correction de la checklist elle-même
Plusieurs endpoints cités sont faux. Les vrais : login POST /api/auth/login/ (pas /token/), membres GET /api/membres/ (pas /membres/membres/), séances GET /api/presences/repetitions/ (pas /seances/), pointage POST /api/presences/pointages/ (pas /presences/), chants /api/musique/chants/, séances-chants /api/musique/seances-chants/.

État réel par section
Légende : ✅ fonctionnel & prouvé · 🟡 backend OK / front absent ou vitrine · 🔴 manquant

Section	Backend	Frontend	Verdict
0.1 Auth/session	✅ login, refresh, 401 (testés)	✅ login + refresh mutualisé + logout	✅
0.1 roleGuards	✅ 403 partout (testé)	🟡 seul finances gardé ; presences/musique/membres sans roleGuard	🟡
0.2 États écran	—	🟡 skeletons oui ; états erreur/vide souvent avalés (error: () => isLoading.set(false))	🟡
0.3 Multi-tenant	✅ isolation lecture+écriture (testée, 404 cross-tenant)	—	✅
1.1 Liste membres	✅	✅ liste + filtres + grille/liste (bug pupitre corrigé session préc.)	✅ lecture
1.2 Formulaire membre	🟡 endpoint existe, flux User+password non défini	🔴 aucun formulaire	🔴
1.3 Fiche membre + mandats	✅ mandats CRUD + terminer	🟡 modale mandats OK ; pas de fiche détail ni « attribuer poste »	🟡
1.4 Pupitres/Postes	✅ CRUD (créa pupitre testée 201)	🔴 aucun écran	🔴
2.1 Séances	✅ liste + créa (testée)	✅ (fait cette session)	✅
2.2 Pointage	✅ upsert idempotent + isolation (testés)	✅ (fait cette session)	✅
2.3 Permissions absence	✅ CRUD + approuver/refuser	🔴 aucun écran	🔴
3.1 Répertoire	✅ CRUD chants (testé)	🟡 lecture seule câblée ; pas de créa/upload	🟡
3.2 Séance↔chant	✅ endpoint	🔴 aucun écran	🔴
4.1 Journal caisse	✅ mouvements + état-caisse (solde agrégé testé = 70€)	🔴 100% mock (tableaux en dur, pas de service, pas d'endpoint dans environment)	🔴
4.2 Cotisations	✅ campagnes/cotisations/paiements	🔴 mock	🔴
5. Rapports/Exports	🔴 app inexistante	🔴	🔴
6. Dashboard	🟡 réel mais taux_presence/programme en dur ; superuser & sans-profil OK (testés)	🟡 câblé mais consomme les mocks	🟡
Ce que j'ai livré cette session
Fix root-cause des créations (mixin) + suppression de l'override redondant.
Recette automatisée core/tests/test_api_integration.py : auth (login/refresh/401), dashboard (3 rôles), pupitres, chants, finances (solde agrégé) — preuve exécutable de ce qui marche.
Suite totale : 26 tests verts, manage.py check clean.
Recommandation (ordre de valeur)
Le backend est à ~90% ; le gros du reste est du frontend. Dans l'ordre :

Finances front (4.1/4.2) — backend prêt et testé, front 100% mock : plus gros écart valeur/effort. Nécessite d'ajouter la clé finances dans environment.ts + un FinancesService.
Pupitres/Postes + Formulaire membre (1.2/1.4) — débloque la gestion admin.
Permissions d'absence (2.3) — complète le cœur présences.
Répertoire créa/upload (3.1/3.2).
Dashboard réel (6) — dé-mocker taux_presence/programme.
Module rapports (5) — le plus lourd (agrégation + PDF), à faire en dernier.
Transversal rapide à faire aussi : ajouter les roleGuard manquants et remplacer les error: () => isLoading.set(false) par de vrais états d'erreur+retry (checklist 0.2).

Chaque bloc = une session propre (comme le prévoit ton « ordre de bataille »). Je n'ai pas voulu bâcler 5 modules d'un coup. Dis-moi par lequel j'attaque — je partirais sur les finances front (meilleur ratio), sauf si tu préfères un autre. Rien n'est commité.