from typing import Optional
from pydantic import BaseModel


class CallLogIn(BaseModel):
    lead_id: str
    outcome: str  # voir CALL_OUTCOMES dans routers/call_center.py
    objection_reason: Optional[str] = None
    note: Optional[str] = None


class CallScriptIn(BaseModel):
    title: str
    content: str
    category: Optional[str] = None


class CallScriptUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
