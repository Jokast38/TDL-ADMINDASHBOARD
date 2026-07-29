from typing import List, Optional
from pydantic import BaseModel


class LimovaToggleIn(BaseModel):
    phone_enabled: Optional[bool] = None
    linkedin_enabled: Optional[bool] = None


class PhoneCampaignIn(BaseModel):
    name: str
    # Mêmes valeurs brutes "|"-jointes que le reste de l'app (voir Leads.jsx /
    # LeadBroadcastIn) pour cibler par catégorie d'intérêt sur toute la base.
    interest_in: Optional[str] = None
    lead_ids: Optional[List[str]] = None


class CallOutcomeIn(BaseModel):
    outcome: str  # "veut_etre_rappele" | "veut_sinscrire" | "pas_interesse" | "injoignable"
    notes: Optional[str] = None


class RegisterInboundNumberIn(BaseModel):
    user_phone_number: str  # numéro réel qui doit sonner en premier (format +33...)
    friendly_name: Optional[str] = None
    confirm_cost: bool = False  # doit être explicitement à True : achat facturé (3600 crédits Limova)


class LinkedinMessageIn(BaseModel):
    profile_url: str
    message: str
    connection_request: bool = False
