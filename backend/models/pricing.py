from typing import Optional
from pydantic import BaseModel


class PrixFormationVilleIn(BaseModel):
    formation_id: str
    # Ville déjà normalisée côté frontend (voir lib/normalizeLocation.js) —
    # pas de re-normalisation ici pour rester cohérent avec la même clé
    # partout (grille, filtres, affichage).
    ville: str
    prix: float


class PrixFormationVilleUpdate(BaseModel):
    prix: float
