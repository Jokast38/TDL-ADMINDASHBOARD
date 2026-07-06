from typing import Optional
from pydantic import BaseModel, EmailStr


class ProductIn(BaseModel):
    name: str
    category: str
    description: Optional[str] = ""
    price: float
    stock: int = 0
    image_url: Optional[str] = None
    active: bool = True


class OrderIn(BaseModel):
    product_id: str
    customer_name: str
    customer_email: EmailStr
    customer_phone: Optional[str] = None
    quantity: int = 1
    address: Optional[str] = ""
