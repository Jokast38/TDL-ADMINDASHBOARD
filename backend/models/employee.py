from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class EmployeeIn(BaseModel):
    email: EmailStr
    name: str
    role: str = "employe"
    phone: Optional[str] = None
    department: Optional[str] = None
    password: str = Field(min_length=6)


class AccountStatusIn(BaseModel):
    account_status: str  # "actif" | "suspendu" | "archive"
