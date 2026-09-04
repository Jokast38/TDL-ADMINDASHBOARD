from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


class EmployeeIn(BaseModel):
    email: EmailStr
    name: str
    role: str = "employe"
    phone: Optional[str] = None
    department: Optional[str] = None
    password: str = Field(min_length=6)
    assigned_categories: List[str] = []
    assigned_centers: List[str] = []
    assigned_training_assignments: List[dict] = []
    # Intitulé affiché sur les documents générés (attestations...) pour les
    # formateurs, ex: "Formateur BAFM", "Moniteur auto-école" — distinct du
    # `role` (enum technique) qui reste "animateur".
    titre: Optional[str] = None


class EmployeeTitreIn(BaseModel):
    titre: Optional[str] = None


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


class ConventionSignIn(BaseModel):
    # Signature manuscrite capturée dans l'espace formateur pour signer la
    # convention de collaboration (voir POST /me/convention/sign) — utilisée
    # aussi comme signature par défaut de l'utilisateur si il n'en a pas
    # déjà une (voir POST /me/signature).
    signature_data_url: str
