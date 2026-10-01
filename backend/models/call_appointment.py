from typing import Optional
from pydantic import BaseModel


class CallAppointmentIn(BaseModel):
    lead_id: str
    scheduled_at: str  # ISO 8601, ex. "2026-10-05T14:30:00"
    # Agent assigné à l'appel — par défaut celui qui crée le RDV (voir
    # routers/call_center.py), un admin/responsable peut l'attribuer à un autre.
    commercial_id: Optional[str] = None
    notes: Optional[str] = None


class CallAppointmentUpdate(BaseModel):
    scheduled_at: Optional[str] = None
    commercial_id: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None  # planifie | fait | annule
