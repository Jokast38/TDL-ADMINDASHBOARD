from typing import Optional
from pydantic import BaseModel, EmailStr


class InscriptionIn(BaseModel):
    formation_id: str
    student_name: str
    student_email: EmailStr
    student_phone: Optional[str] = None
    notes: Optional[str] = ""
    # Attribution marketing — quelle landing page a généré cette inscription
    # (ex: "stage_recuperation_points") et son URL exacte au moment de l'envoi,
    # utilisées pour que l'événement Purchase envoyé au Meta Pixel/CAPI soit
    # rattaché à la bonne page plutôt qu'à /inscription par défaut.
    source: Optional[str] = None
    landing_url: Optional[str] = None
    session: Optional[str] = None
    center: Optional[str] = None


class InscriptionUpdate(BaseModel):
    student_name: Optional[str] = None
    student_phone: Optional[str] = None
    payment_status: Optional[str] = None
    notes: Optional[str] = None
    # Tag de suivi commercial manuel (voir CONTACT_STATUS_LABEL côté
    # frontend) : "en_cours", "a_contacter", "sans_reponse", "finalisee".
    # Distinct de `status` (active/annulee) et du statut du dossier.
    contact_status: Optional[str] = None


class DossierUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
