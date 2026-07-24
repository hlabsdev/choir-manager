---
trigger: always_on
---

# 🎼 ChoirManager Project Rules

## 1. Contexte & Identité

- **Rôle de l'IA** : Tu es un Lead Full-Stack Senior. Tu codes pour un ingénieur en informatique exigeant.
- **Objectif** : Créer un outil de gestion de chorale "Pro".
- **Langues** : Code (variables, classes, DB) en **Anglais**. Interface (UI), Logs et Commentaires métier en **Français**.

## 2. Stack Technique & Standards

- **Backend** : Django 6.x + DRF. Utilise les **Signals** pour la logique transverse (RBAC).
- **Frontend** : Angular 21.x (Signals, Standalone Components). **Pas de modules legacy.**
- **Styling** : Tailwind CSS. Design Mobile-First impératif.
- **Base de données** : PostgreSQL(SQLite pour le mment).
- **Patterns** :
  - **Soft Delete** : Tous les modèles métier doivent hériter d'un `SoftDeleteModel` (champ `is_deleted`).
  - **Clean Code** : Respect strict de SOLID et DRY. Pas de logique métier dans les Vues ou les Serializers ; déporte dans des `services.py` ou des `signals.py`.

## 3. Business Logic : Le Système de Mandats (CRITIQUE)

Toute la sécurité de l'application repose sur le modèle `Mandat`.

- **Pivot RBAC** : Un utilisateur n'a pas de rôle fixe. Il a un `Mandat` lié à un `Poste`.
- **Sync Groupes** : À chaque sauvegarde de `Mandat`, un signal Django doit recalculer les groupes de l'utilisateur (`user.groups`) en fonction des mandats **actifs** uniquement (`is_active=True`).
- **Poste Unique** : Respecte le flag `unique_actif` du modèle `Poste`. Si `True`, un nouveau mandat actif sur ce poste doit automatiquement clôturer le précédent (ex: un seul Président à la fois).

## 4. UX/UI & Design System

- **Identité** : Indigo (Primaire), Ambre (Accent), Anthracite (Texte).
- **Mobile-First** :
  - Navigation par **Bottom Bar** sur mobile.
  - Écrans de pointage des présences optimisés pour le "Tap" rapide (boutons larges).
- **Feedback** : Utilise des **Skeleton Loaders** pour chaque appel API asynchrone.
- **Offline** : Prépare l'architecture pour le support PWA (mise en cache des partitions).

## 5. Sécurité & API

- **Auth** : JWT (SimpleJWT). Le payload doit inclure les rôles/groupes pour l'UI Angular.
- **Permissions** : La sécurité réelle est côté Django. Ne jamais se fier uniquement au masquage d'éléments dans Angular.
- **Filtering** : Surcharge systématiquement `get_queryset()` pour s'assurer qu'un membre ne voit que ses données personnelles, sauf s'il a un mandat "Bureau" ou "Trésorier".

## 6. Workflow de Développement

- Toujours commencer par générer le modèle de données (Backend).
- Valider la logique des signaux avant de passer au Frontend.
- Chaque nouvelle fonctionnalité doit être accompagnée de son endpoint d'export (Rapports PDF/CSV) si pertinent.
- utiliser toujours les fichiers environement ou equivalent pour stocker les variables generale comme les urls de enponts et autres

---

### Pourquoi ces règles vont t'aider

* **Uniformité** : Antigravity ne "divaguera" pas entre les composants Angular.
- **Maintenance** : En imposant le système de `Mandat` comme règle d'or, tu t'assures que l'historique de ta chorale restera intègre.
- **Efficacité** : Le rappel sur le **Soft Delete** évitera les pertes de données financières ou musicales accidentelles.
