from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class LeadIn(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    interest: Optional[str] = ""
    notes: Optional[str] = ""
    tags: List[str] = []


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    interest: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    contacted: Optional[bool] = None
    status: Optional[str] = None


class LeadImportJsonIn(BaseModel):
    leads: List[Dict[str, Any]]


class LeadRelanceIn(BaseModel):
    lead_ids: List[str]
    subject: str
    body: str
    mark_contacted: bool = True
    add_tag: Optional[str] = None


class LeadRelanceSingleIn(BaseModel):
    lead_id: str
    subject: str
    body: str
    mark_contacted: bool = True
    add_tag: Optional[str] = None


class LeadBroadcastIn(BaseModel):
    # Valeurs brutes d'intérêt (jointes par "|"), calculées côté frontend à partir
    # du regroupement canonique (voir canonicalizeInterest) — même format que le
    # paramètre interest_in de GET /leads, pour filtrer sur toute la base et pas
    # seulement une page chargée. None/vide = tous les leads.
    interest_in: Optional[str] = None
    subject: str
    body: str
    mark_contacted: bool = True
    add_tag: Optional[str] = None
