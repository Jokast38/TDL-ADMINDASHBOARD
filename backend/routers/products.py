import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso
from core.config import ROLES_KAMI_STREET
from models.product import ProductIn, OrderIn
from services.n8n import trigger_n8n
from services.email import send_email
from services.push import send_push_to_users

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
    staff = await db.users.find(
        {"active": True, "role": {"$in": list(ROLES_KAMI_STREET)}}, {"_id": 0, "id": 1, "email": 1}
    ).to_list(50)
    for s in staff:
        if s.get("email"):
            await send_email(
                s["email"], f"🛒 Nouvelle commande KAMI STREET — {product['name']}",
                f"<p><b>{payload.customer_name}</b> ({payload.customer_email}) a commandé "
                f"<b>{product['name']}</b> (x{payload.quantity}) pour {order['total']}€.</p>",
            )
    if staff:
        await send_push_to_users([s["id"] for s in staff], "Nouvelle commande", f"{product['name']} — {order['total']}€", "/admin/orders")
    order.pop("_id", None)
    return order


@router.get("/orders")
async def list_orders(user: dict = Depends(require_role(*ROLES_KAMI_STREET))):
    return await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


ORDER_STATUS_LABEL = {
    "nouveau": "Nouvelle", "en_preparation": "En préparation", "expediee": "Expédiée",
    "livree": "Livrée", "annulee": "Annulée",
}


@router.put("/orders/{oid}")
async def update_order(oid: str, status: str, user: dict = Depends(require_role(*ROLES_KAMI_STREET))):
    existing = await db.orders.find_one({"id": oid}, {"_id": 0})
    await db.orders.update_one({"id": oid}, {"$set": {"status": status, "updated_at": now_iso()}})
    updated = await db.orders.find_one({"id": oid}, {"_id": 0})
    if existing and existing.get("status") != status and updated.get("customer_email"):
        label = ORDER_STATUS_LABEL.get(status, status)
        await send_email(
            updated["customer_email"], f"Votre commande KAMI STREET — {label}",
            f"<p>Bonjour {updated.get('customer_name', '')},</p>"
            f"<p>Votre commande de <b>{updated.get('product_name', '')}</b> est maintenant : <b>{label}</b>.</p>"
            f"<p>KAMI STREET</p>",
        )
    return updated
