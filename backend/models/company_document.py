from typing import Optional
from pydantic import BaseModel


class CompanyDocumentUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
