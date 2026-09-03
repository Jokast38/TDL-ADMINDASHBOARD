from typing import List, Optional, Dict, Any
from pydantic import BaseModel, EmailStr


class DocTemplateIn(BaseModel):
    nom: str
    type_doc: str
    description: Optional[str] = ""
    contenu_html: str
    variables: List[str] = []
    actif: bool = True


class DocTemplateUpdate(BaseModel):
    nom: Optional[str] = None
    type_doc: Optional[str] = None
    description: Optional[str] = None
    contenu_html: Optional[str] = None
    variables: Optional[List[str]] = None
    actif: Optional[bool] = None


class GeneratedDocIn(BaseModel):
    template_id: str
    context: Dict[str, Any] = {}
    # Rattache le document généré à un dossier existant (récupéré depuis la
    # base plutôt que saisi à la main) — sert aussi à nommer le fichier avec
    # le nom de l'apprenant concerné.
    dossier_id: Optional[str] = None
    nom_fichier: Optional[str] = None
    # Si renseigné, le PDF généré est aussi envoyé par email en pièce jointe
    # (en plus d'être enregistré dans la bibliothèque comme d'habitude).
    send_to_email: Optional[EmailStr] = None
    send_message: Optional[str] = None


class WooProductUpdate(BaseModel):
    name: Optional[str] = None
    regular_price: Optional[str] = None
    sale_price: Optional[str] = None
    stock_quantity: Optional[int] = None
    manage_stock: Optional[bool] = None
    stock_status: Optional[str] = None
    status: Optional[str] = None
    short_description: Optional[str] = None
