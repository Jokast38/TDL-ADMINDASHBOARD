from typing import List, Optional
from pydantic import BaseModel


class FormationModuleIn(BaseModel):
    nom: str
    category: str  # ex: VTC_TAXI, SSIAP, PERMIS... — voir Formation.category
    duree_heures: float = 0
    description: Optional[str] = ""


class FormationModuleUpdate(BaseModel):
    nom: Optional[str] = None
    category: Optional[str] = None
    duree_heures: Optional[float] = None
    description: Optional[str] = None


class TemplateModuleItem(BaseModel):
    module_id: str
    jour: int = 1  # jour relatif au démarrage de la session (1 = date_debut)
    heure_debut: str = "09:00"
    heure_fin: str = "17:00"
    animateur_id: Optional[str] = None


class SessionTemplateIn(BaseModel):
    nom: str
    category: str
    modules: List[TemplateModuleItem] = []


class SessionTemplateUpdate(BaseModel):
    nom: Optional[str] = None
    category: Optional[str] = None
    modules: Optional[List[TemplateModuleItem]] = None


class ApplyTemplateIn(BaseModel):
    template_id: str
    replace: bool = True  # remplace les modules existants du stage plutôt que d'y ajouter


class StageModuleItem(BaseModel):
    id: Optional[str] = None
    module_id: Optional[str] = None
    module_nom: str
    date: str
    heure_debut: str = "09:00"
    heure_fin: str = "17:00"
    animateur_id: Optional[str] = None


class StageModulesIn(BaseModel):
    modules: List[StageModuleItem]
