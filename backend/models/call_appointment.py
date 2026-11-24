from typing import Optional
from pydantic import BaseModel


class NouveauContactIn(BaseModel):
    """Personne qui n'est pas encore dans le CRM (demande du 2026-11-24) :
    le prospect est créé (ou retrouvé par email / téléphone) au moment du
    rendez-vous ou du rappel."""
    prenom: str
    nom: Optional[str] = ""
    telephone: Optional[str] = ""
    email: Optional[str] = ""
    interest: Optional[str] = ""


class CallAppointmentIn(BaseModel):
    # Prospect existant, OU nouveau_contact pour une personne pas encore dans
    # le CRM (rendez-vous saisi à la main, demande du 2026-11-24).
    lead_id: Optional[str] = None
    nouveau_contact: Optional[NouveauContactIn] = None
    scheduled_at: str  # ISO 8601, ex. "2026-10-05T14:30:00"
    # Agent assigné à l'appel — par défaut celui qui crée le RDV (voir
    # routers/call_center.py), un admin/responsable peut l'attribuer à un autre.
    commercial_id: Optional[str] = None
    notes: Optional[str] = None
    # "appel" (défaut, historique) ou "physique" (rendez-vous en présentiel —
    # affiché aussi sur l'Agenda général, voir routers/modules.py::get_agenda).
    kind: Optional[str] = "appel"
    location: Optional[str] = None
    # Choix dynamique de la formation concernée — optionnel, un rendez-vous
    # (appel ou physique) n'est pas forcément déjà rattaché à une formation
    # précise, mais le renseigner aide à filtrer/afficher sur l'Agenda.
    formation_id: Optional[str] = None
    formation_titre: Optional[str] = None


class CallAppointmentUpdate(BaseModel):
    scheduled_at: Optional[str] = None
    commercial_id: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None  # planifie | fait | annule
    kind: Optional[str] = None
    location: Optional[str] = None
    formation_id: Optional[str] = None
    formation_titre: Optional[str] = None


class RdvResultatIn(BaseModel):
    """Résultat d'un RDV saisi par la personne assignée : "effectue" (le RDV
    a eu lieu) ou "absent" (le lead ne s'est pas présenté)."""
    resultat: str
    commentaire: Optional[str] = None


class RdvNoteIn(BaseModel):
    """Note prise sur un rendez-vous (onglet Rendez-vous, 2026-11-12)."""
    text: str


class RappelIn(BaseModel):
    """Rappel téléphonique planifié depuis le CRM (bouton à côté de
    « Rendez-vous », demande du 2026-11-24)."""
    lead_id: Optional[str] = None
    nouveau_contact: Optional[NouveauContactIn] = None
    scheduled_at: str
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    formation_titre: Optional[str] = None


class RappelTentativeIn(BaseModel):
    """Une tentative de rappel : résultat (voir RAPPEL_RESULTATS), note et,
    pour « à rappeler », la date du prochain rappel."""
    resultat: str
    note: Optional[str] = None
    prochain_rappel: Optional[str] = None


class RappelUpdate(BaseModel):
    assigned_to: Optional[str] = None
    scheduled_at: Optional[str] = None


class RdvQualificationIn(BaseModel):
    """Qualification du prospect depuis l'onglet Rendez-vous (2026-11-12)."""
    qualification: str
