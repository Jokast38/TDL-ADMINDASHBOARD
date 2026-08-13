from typing import Optional
from pydantic import BaseModel


class CallbackRequestIn(BaseModel):
    prenom: str
    nom: str
    telephone: str
    email: Optional[str] = ""
    message: Optional[str] = ""
    session: Optional[str] = ""
    source: Optional[str] = "offre_fidelite"
    # Catégorie de formation concernée (CACES, PERMIS, AUTO_ECOLE, SSIAP,
    # VTC_TAXI, ECSR, VENTE) — si la landing page ne la précise pas
    # explicitement, elle est déduite de `source` (voir routers/callback.py).
    interest: Optional[str] = None
    center: Optional[str] = None
    # URL exacte de la landing page au moment de l'envoi — utilisée pour que
    # l'événement Lead envoyé côté serveur (Meta CAPI) soit rattaché à la
    # bonne page de campagne plutôt qu'au domaine générique.
    page_url: Optional[str] = None
    # Généré côté navigateur (voir lib/metaPixel.js newEventId) et réutilisé
    # tel quel pour l'évènement Lead pixel ET l'évènement Lead CAPI — permet
    # à Meta de dédupliquer les deux au lieu de compter le lead deux fois.
    event_id: Optional[str] = None


class CallbackRequestUpdate(BaseModel):
    handled: Optional[bool] = None
    notes: Optional[str] = None
