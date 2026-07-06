import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso
from models.product import ProductIn, OrderIn
from services.n8n import trigger_n8n
from services.email import send_email

router = APIRouter(tags=["products"])


@router.get("/products")
async def list_products(category: Optional[str] = None):
    q = {}
    if category:
        q["category"] = category
    return await db.products.find(q, {"_id": 0}).to_list(500)


@router.post("/products")
async def create_product(payload: ProductIn, user: dict = Depends(require_role("admin", "employe"))):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/products/{pid}")
async def update_product(pid: str, payload: ProductIn, user: dict = Depends(require_role("admin", "employe"))):
    await db.products.update_one({"id": pid}, {"$set": payload.model_dump()})
    return await db.products.find_one({"id": pid}, {"_id": 0})


@router.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(require_role("admin"))):
    await db.products.delete_one({"id": pid})
    return {"ok": True}


@router.post("/orders")
async def create_order(payload: OrderIn):
    product = await db.products.find_one({"id": payload.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    order = {
        "id": str(uuid.uuid4()),
        "product_id": payload.product_id, "product_name": product["name"],
        "customer_name": payload.customer_name,
        "customer_email": payload.customer_email.lower(),
        "customer_phone": payload.customer_phone, "address": payload.address,
        "quantity": payload.quantity, "unit_price": product["price"],
        "total": product["price"] * payload.quantity,
        "status": "nouveau", "payment_status": "pending", "created_at": now_iso()
    }
    await db.orders.insert_one(order)
    await trigger_n8n("payment", {"type": "order", "order_id": order["id"], "total": order["total"]})
    await send_email(
        payload.customer_email,
        f"Commande KAMI STREET - {product['name']}",
        f"<p>Bonjour {payload.customer_name},</p><p>Votre commande de <b>{product['name']}</b> (x{payload.quantity}) pour {order['total']}€ a bien été reçue.</p>"
    )
    order.pop("_id", None)
    return order


@router.get("/orders")
async def list_orders(user: dict = Depends(require_role("admin", "employe"))):
    return await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.put("/orders/{oid}")
async def update_order(oid: str, status: str, user: dict = Depends(require_role("admin", "employe"))):
    await db.orders.update_one({"id": oid}, {"$set": {"status": status, "updated_at": now_iso()}})
    return await db.orders.find_one({"id": oid}, {"_id": 0})
