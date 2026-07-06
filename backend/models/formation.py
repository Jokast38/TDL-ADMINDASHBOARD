from typing import List, Optional
from pydantic import BaseModel


class FormationIn(BaseModel):
    title: str
    category: str
    description: Optional[str] = ""
    duration_hours: int = 0
    price: float = 0
    sessions_per_month: int = 0
    active: bool = True
    image_url: Optional[str] = None
    documents_requis: List[str] = []
