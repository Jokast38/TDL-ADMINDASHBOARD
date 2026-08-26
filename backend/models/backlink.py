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
    price: float
    keywords: List[str] = []
    message: str
    subject: Optional[str] = None
