from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


class EmployeeIn(BaseModel):
    email: EmailStr
    name: str
    # Nom et prénom saisis séparément (formateurs, voir Formateurs.jsx) pour
    # toujours savoir les distinguer — `name` reste le "Prénom Nom" complet
    # affiché partout ailleurs (documents, emails...).
    nom: Optional[str] = None
    prenom: Optional[str] = None
    role: str = "employe"
    phone: Optional[str] = None
    department: Optional[str] = None
    # Optionnel pour un formateur : un mot de passe simple est alors généré
    # automatiquement côté serveur et envoyé par email (voir create_employee)
    # — l'agent n'a pas besoin d'en inventer un.
    password: Optional[str] = Field(default=None, min_length=6)
    assigned_categories: List[str] = []
    assigned_centers: List[str] = []
    assigned_training_assignments: List[dict] = []
    # Intitulé affiché sur les documents générés (attestations...) pour les
    # formateurs, ex: "Formateur BAFM", "Moniteur auto-école" — distinct du
    # `role` (enum technique) qui reste "animateur".
    titre: Optional[str] = None
    # Restriction fine des pages du dashboard visibles/accessibles, en plus
    # du rôle — liste de chemins (ex: "/admin/leads"). Vide = pas de
    # restriction, l'employé voit tout ce que son rôle autorise normalement
    # (comportement historique, inchangé pour qui n'a jamais cette liste
    # renseignée). Voir PUT /employees/{uid}/pages pour la modifier après
    # création.
    allowed_pages: List[str] = []
    # Matricule saisi manuellement par l'agent à la création du compte (pas
    # de génération automatique — reprend souvent un identifiant déjà
    # existant côté RH/Digiforma). Affiché à la place du nom sur la feuille
    # d'émargement (voir routers/emargements.py), notamment pour les
    # formateurs/psychologues.
    matricule: Optional[str] = None


class EmployeeTitreIn(BaseModel):
    titre: Optional[str] = None
    # Types de formations du formateur, dont dépendent les titres proposés —
    # None = ne pas y toucher.
    assigned_categories: Optional[List[str]] = None


class MatriculeIn(BaseModel):
    matricule: Optional[str] = None


class MesInfosFormateurIn(BaseModel):
    """Saisie par le formateur lui-même (espace formateur, « Mon dossier »)."""
    prenom: Optional[str] = None
    nom: Optional[str] = None
    matricule: Optional[str] = None


class IdentiteIn(BaseModel):
    nom: str = Field(min_length=1)
    prenom: str = Field(min_length=1)


class QuotaIn(BaseModel):
    # Jours par an qu'un formateur peut choisir lui-même (voir
    # core/placement_rules.py) — None = pas de limite.
    quota_jours_annuel: Optional[int] = Field(default=None, ge=0)


class RoleIn(BaseModel):
    role: str


class AllowedPagesIn(BaseModel):
    allowed_pages: List[str] = []


class AccountStatusIn(BaseModel):
    account_status: str  # "actif" | "suspendu" | "archive"


class AssignedCategoriesIn(BaseModel):
    assigned_categories: List[str] = []


class AssignedCentersIn(BaseModel):
    assigned_centers: List[str] = []


class AssignedTrainingAssignmentsIn(BaseModel):
    assigned_training_assignments: List[dict] = []


class AgrementBafmIn(BaseModel):
    # Numéro d'agrément BAFM de l'animateur, affiché sur l'attestation de
    # stage de récupération de points (voir services/pdf.py) — géré par
    # l'animateur lui-même depuis son espace, comme sa signature.
    agrement_bafm_numero: Optional[str] = None


class DossierAdjustmentIn(BaseModel):
    # Ajustement manuel (positif ou négatif) du nombre de dossiers traités,
    # ajouté au décompte automatique (voir GET /employees/activity) — sert à
    # créditer un travail effectué avant la mise en place du traçage
    # automatique (`processed_by`), qu'il est impossible de reconstituer avec
    # certitude après coup.
    manual_dossier_adjustment: int = 0
    note: Optional[str] = None


class ConventionSignIn(BaseModel):
    # Signature manuscrite capturée dans l'espace formateur pour signer la
    # convention de collaboration (voir POST /me/convention/sign) — utilisée
    # aussi comme signature par défaut de l'utilisateur si il n'en a pas
    # déjà une (voir POST /me/signature).
    signature_data_url: str
