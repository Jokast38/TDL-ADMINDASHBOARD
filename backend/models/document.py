from typing import List, Optional, Dict, Any
from pydantic import BaseModel


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
    dossier_id: Optional[str] = None
    nom_fichier: Optional[str] = None


class WooProductUpdate(BaseModel):
    name: Optional[str] = None
    regular_price: Optional[str] = None
    sale_price: Optional[str] = None
    stock_quantity: Optional[int] = None
    manage_stock: Optional[bool] = None
    stock_status: Optional[str] = None
    status: Optional[str] = None
    short_description: Optional[str] = None
