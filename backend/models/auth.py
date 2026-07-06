from pydantic import BaseModel, Field, EmailStr


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: str = "etudiant"
    phone: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str
