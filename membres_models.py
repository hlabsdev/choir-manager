"""
ChoirManager — Module Membres & Structure
=========================================
Entités : Pupitre, Poste, Membre, Mandat
Signal  : synchronisation automatique des groupes Django (RBAC)
"""

from django.contrib.auth.models import Group, User
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone


# ---------------------------------------------------------------------------
# Pupitre — section vocale (Soprano, Alto, Ténor, Basse…)
# ---------------------------------------------------------------------------

class Pupitre(models.Model):
    class Categorie(models.TextChoices):
        SOPRANO = "soprano", "Soprano"
        MEZZO   = "mezzo",   "Mezzo-soprano"
        ALTO    = "alto",    "Alto"
        TENOR   = "tenor",   "Ténor"
        BARYTON = "baryton", "Baryton"
        BASSE   = "basse",   "Basse"
        AUTRE   = "autre",   "Autre"

    nom       = models.CharField(max_length=60, unique=True)
    categorie = models.CharField(max_length=20, choices=Categorie.choices)
    ordre     = models.PositiveSmallIntegerField(
                    default=0,
                    help_text="Ordre d'affichage dans les listes (0 = premier)"
                )

    class Meta:
        ordering            = ["ordre", "nom"]
        verbose_name        = "Pupitre"
        verbose_name_plural = "Pupitres"

    def __str__(self):
        return self.nom


# ---------------------------------------------------------------------------
# Poste — rôle organisationnel (distinct des groupes/permissions Django)
#
# Exemples : Président, Trésorier, Maître de chœur Principal,
#            Maître de chœur Suppléant, Chef de pupitre Soprano…
#
# Le champ `groupes` fait le pont entre les postes organisationnels
# et le système RBAC Django. Un signal (bas de fichier) synchronise
# automatiquement les groupes d'un membre quand un Mandat est sauvegardé.
# ---------------------------------------------------------------------------

class Poste(models.Model):
    class TypePoste(models.TextChoices):
        BUREAU    = "bureau",    "Bureau (élu)"
        DIRECTION = "direction", "Direction musicale"
        TECHNIQUE = "technique", "Technique / Organisation"
        AUTRE     = "autre",     "Autre"

    nom              = models.CharField(max_length=100, unique=True)
    description      = models.TextField(blank=True)
    type_poste       = models.CharField(max_length=20, choices=TypePoste.choices)
    groupes          = models.ManyToManyField(
                           Group,
                           blank=True,
                           related_name="postes",
                           help_text=(
                               "Groupes Django accordés automatiquement "
                               "lors d'un mandat actif sur ce poste."
                           ),
                       )
    pupitre_concerne = models.ForeignKey(
                           "Pupitre",
                           null=True, blank=True,
                           on_delete=models.SET_NULL,
                           related_name="postes_chef",
                           help_text="À renseigner uniquement pour un poste de chef de pupitre.",
                       )
    unique_actif     = models.BooleanField(
                           default=True,
                           help_text=(
                               "Si True, un seul titulaire actif à la fois. "
                               "Mettre False pour les postes de suppléant."
                           ),
                       )

    class Meta:
        ordering            = ["type_poste", "nom"]
        verbose_name        = "Poste"
        verbose_name_plural = "Postes"

    def __str__(self):
        return self.nom


# ---------------------------------------------------------------------------
# Membre — extension du User Django via OneToOneField
#
# Règle absolue : ne JAMAIS supprimer un Membre physiquement.
# Utiliser soft_delete() pour conserver l'historique des présences,
# des mandats et des mouvements financiers associés.
# ---------------------------------------------------------------------------

class MembreQuerySet(models.QuerySet):
    def actifs(self):
        return self.filter(statut=Membre.Statut.ACTIF, deleted_at__isnull=True)

    def non_supprimes(self):
        return self.filter(deleted_at__isnull=True)

    def par_pupitre(self, pupitre):
        return self.filter(pupitre=pupitre)


class Membre(models.Model):
    class Statut(models.TextChoices):
        ACTIF     = "actif",     "Actif"
        INACTIF   = "inactif",   "Inactif"
        HONORAIRE = "honoraire", "Honoraire"
        STAGIAIRE = "stagiaire", "Stagiaire"

    # Identité
    user          = models.OneToOneField(
                        User,
                        on_delete=models.PROTECT,
                        related_name="membre",
                    )
    numero_membre = models.CharField(
                        max_length=20, unique=True,
                        help_text="Identifiant lisible auto-généré. Ex : CHR-0042"
                    )
    date_adhesion = models.DateField()
    statut        = models.CharField(
                        max_length=20,
                        choices=Statut.choices,
                        default=Statut.ACTIF,
                    )

    # Vocal
    pupitre = models.ForeignKey(
                  Pupitre,
                  null=True, blank=True,
                  on_delete=models.SET_NULL,
                  related_name="membres",
              )

    # Contact
    telephone = models.CharField(max_length=25, blank=True)
    photo     = models.ImageField(
                    upload_to="membres/photos/",
                    blank=True, null=True,
                    help_text="Nécessite Pillow et un backend media configuré (ex: S3).",
                )

    # Interne
    notes      = models.TextField(
                     blank=True,
                     help_text="Notes internes — visibles Bureau et Admin uniquement.",
                 )
    deleted_at = models.DateTimeField(
                     null=True, blank=True,
                     help_text="Renseigné lors d'un soft-delete. NULL = compte actif.",
                 )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = MembreQuerySet.as_manager()

    class Meta:
        ordering            = ["user__last_name", "user__first_name"]
        verbose_name        = "Membre"
        verbose_name_plural = "Membres"

    def __str__(self):
        return f"{self.user.get_full_name()} ({self.numero_membre})"

    # --- Propriétés utilitaires ---

    @property
    def nom_complet(self) -> str:
        return self.user.get_full_name()

    @property
    def email(self) -> str:
        return self.user.email

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    # --- Actions métier ---

    def soft_delete(self) -> None:
        """
        Désactive le compte sans effacer l'historique.
        - Passe le statut à INACTIF
        - Désactive le User Django
        - Clôture tous les mandats actifs
        """
        self.deleted_at = timezone.now()
        self.statut     = self.Statut.INACTIF
        self.save(update_fields=["deleted_at", "statut", "updated_at"])

        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        # Clôturer les mandats (le signal va retirer les groupes)
        self.mandats.filter(is_active=True).update(
            is_active=False,
            date_fin=timezone.now().date(),
        )

    def mandats_actifs(self):
        return self.mandats.filter(is_active=True).select_related("poste")

    # --- Génération du numéro membre ---

    @classmethod
    def generer_numero(cls) -> str:
        """
        Génère le prochain numéro de membre sous la forme CHR-XXXX.

        ATTENTION : cette implémentation n'est pas thread-safe.
        En production avec trafic concurrent, utiliser une séquence
        PostgreSQL via django-sequences ou select_for_update().
        """
        last = cls.objects.order_by("-id").values("id").first()
        seq  = (last["id"] + 1) if last else 1
        return f"CHR-{seq:04d}"


# ---------------------------------------------------------------------------
# Mandat — attribution temporelle d'un Poste à un Membre
#
# Un Mandat représente "Dupont a été Président du 01/01/2023 à aujourd'hui".
# C'est lui qui déclenche l'attribution/retrait des groupes Django via signal.
# ---------------------------------------------------------------------------

class Mandat(models.Model):
    membre     = models.ForeignKey(
                     Membre,
                     on_delete=models.PROTECT,
                     related_name="mandats",
                 )
    poste      = models.ForeignKey(
                     Poste,
                     on_delete=models.PROTECT,
                     related_name="mandats",
                 )
    date_debut = models.DateField()
    date_fin   = models.DateField(
                     null=True, blank=True,
                     help_text="Laisser vide si le mandat est toujours en cours.",
                 )
    is_active  = models.BooleanField(default=True)
    notes      = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering            = ["-date_debut"]
        verbose_name        = "Mandat"
        verbose_name_plural = "Mandats"
        constraints         = [
            # Contrainte DB : un membre ne peut occuper le même poste
            # qu'une seule fois simultanément.
            models.UniqueConstraint(
                fields=["membre", "poste"],
                condition=models.Q(is_active=True),
                name="unique_mandat_actif_par_membre_poste",
            ),
        ]

    def __str__(self):
        etat = "en cours" if self.is_active else f"terminé {self.date_fin}"
        return f"{self.membre.nom_complet} — {self.poste} ({etat})"

    def clean(self):
        """
        Validation métier : si le poste n'accepte qu'un titulaire actif,
        vérifier qu'aucun autre mandat actif n'existe pour ce poste.
        """
        if self.is_active and getattr(self, "poste_id", None):
            if self.poste.unique_actif:
                conflit = (
                    Mandat.objects
                    .filter(poste=self.poste, is_active=True)
                    .exclude(pk=self.pk)
                    .select_related("membre")
                    .first()
                )
                if conflit:
                    raise ValidationError(
                        f"Le poste « {self.poste} » est déjà occupé par "
                        f"{conflit.membre.nom_complet}. Clôturez ce mandat "
                        f"avant d'en créer un nouveau."
                    )

    def terminer(self, date_fin=None) -> None:
        """
        Clôture proprement le mandat.
        Le signal post_save synchronise ensuite les groupes Django.
        """
        self.is_active = False
        self.date_fin  = date_fin or timezone.now().date()
        self.save(update_fields=["is_active", "date_fin"])


# ---------------------------------------------------------------------------
# Signal — synchronisation automatique des groupes Django après tout Mandat
#
# Logique :
#   1. Récupérer tous les groupes Django liés aux mandats ACTIFS du membre.
#   2. Ajouter le groupe de base selon le statut du membre.
#   3. Écraser user.groups avec ce résultat.
#
# Cela garantit que les permissions reflètent toujours la réalité des mandats,
# sans qu'aucune vue ou serializer n'ait à s'en préoccuper.
# ---------------------------------------------------------------------------

_GROUPE_BASE_PAR_STATUT = {
    Membre.Statut.ACTIF:     "membre_actif",
    Membre.Statut.STAGIAIRE: "membre_actif",     # même accès que actif
    Membre.Statut.HONORAIRE: "membre_honoraire",
    Membre.Statut.INACTIF:   None,               # aucun groupe de base
}


@receiver(post_save, sender=Mandat)
def sync_groupes_membre(sender, instance: Mandat, **kwargs) -> None:
    """
    Recalcule et applique les groupes Django du membre concerné
    à chaque modification d'un Mandat.
    """
    membre = instance.membre
    user   = membre.user

    # 1. Groupes issus des mandats actifs (via la M2M Poste.groupes)
    groupes_mandats = list(
        Group.objects.filter(
            postes__mandats__membre=membre,
            postes__mandats__is_active=True,
        ).distinct()
    )

    # 2. Groupe de base selon le statut du membre
    nom_base = _GROUPE_BASE_PAR_STATUT.get(membre.statut)
    groupes_finaux = groupes_mandats[:]

    if nom_base:
        try:
            groupes_finaux.insert(0, Group.objects.get(name=nom_base))
        except Group.DoesNotExist:
            # Les groupes de base n'ont pas encore été créés (première migration).
            # Ne pas bloquer — ils seront ajoutés lors de la data migration.
            pass

    # 3. Appliquer (remplace tous les groupes existants)
    user.groups.set(groupes_finaux)
