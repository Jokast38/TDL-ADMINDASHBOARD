from typing import Optional
from pydantic import BaseModel


class MetaLeadUpdate(BaseModel):
    qualification: Optional[str] = None
    notes: Optional[str] = None


class MetaLeadEnrollIn(BaseModel):
    formation_id: str
    stage_id: Optional[str] = None


class LeadNoteEditIn(BaseModel):
    """Correction d'une note de l'historique, repérée par son horodatage
    `at` (demande du 2026-11-06)."""
    at: str
    text: str
