from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


class EmployeeIn(BaseModel):
    email: EmailStr
    name: str
    role: str = "employe"
    phone: Optional[str] = None
    department: Optional[str] = None
    password: str = Field(min_length=6)
    assigned_categories: List[str] = []
    assigned_centers: List[str] = []
    assigned_training_assignments: List[dict] = []


class AccountStatusIn(BaseModel):
    account_status: str  # "actif" | "suspendu" | "archive"


class AssignedCategoriesIn(BaseModel):
    assigned_categories: List[str] = []


class AssignedCentersIn(BaseModel):
    assigned_centers: List[str] = []


class AssignedTrainingAssignmentsIn(BaseModel):
    assigned_training_assignments: List[dict] = []
