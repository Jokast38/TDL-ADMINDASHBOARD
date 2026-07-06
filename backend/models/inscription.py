from typing import Optional
from pydantic import BaseModel, EmailStr


class InscriptionIn(BaseModel):
    formation_id: str
    student_name: str
    student_email: EmailStr
    student_phone: Optional[str] = None
    notes: Optional[str] = ""


class DossierUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
