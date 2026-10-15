from typing import List, Optional
from pydantic import BaseModel


class BacklinkUpdate(BaseModel):
    contact_email: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None


class BacklinkRequestIn(BaseModel):
    to_email: str
    # Facultatif : certaines demandes sont de simples échanges de netlinking
    # gratuits, sans rémunération proposée (voir routers/backlinks.py).
    price: Optional[float] = None
    keywords: List[str] = []
    message: str
    subject: Optional[str] = None
