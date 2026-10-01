from typing import Optional
from pydantic import BaseModel


class MetaLeadUpdate(BaseModel):
    qualification: Optional[str] = None
    notes: Optional[str] = None


class MetaLeadEnrollIn(BaseModel):
    formation_id: str
    stage_id: Optional[str] = None
