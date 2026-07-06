from fastapi import APIRouter, Depends

from core.database import db
from core.security import require_role

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(require_role("admin", "employe"))):
    total_inscriptions = await db.inscriptions.count_documents({})
    total_dossiers = await db.dossiers.count_documents({})
    in_progress = await db.dossiers.count_documents({"status": {"$in": ["nouveau", "en_verification", "complet"]}})
    completed = await db.dossiers.count_documents({"status": "termine"})
    total_orders = await db.orders.count_documents({})
    total_formations = await db.formations.count_documents({"active": True})

    pipe = [{"$group": {"_id": None, "sum": {"$sum": "$price"}}}]
    inscr_rev = await db.inscriptions.aggregate(pipe).to_list(1)
    orders_rev = await db.orders.aggregate([{"$group": {"_id": None, "sum": {"$sum": "$total"}}}]).to_list(1)
    revenue = (inscr_rev[0]["sum"] if inscr_rev else 0) + (orders_rev[0]["sum"] if orders_rev else 0)

    by_category = await db.inscriptions.aggregate([{"$group": {"_id": "$category", "count": {"$sum": 1}}}]).to_list(20)
    by_status = await db.dossiers.aggregate([{"$group": {"_id": "$status", "count": {"$sum": 1}}}]).to_list(20)
    recent_inscriptions = await db.inscriptions.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)

    return {
        "total_inscriptions": total_inscriptions,
        "total_dossiers": total_dossiers,
        "in_progress": in_progress,
        "completed": completed,
        "total_orders": total_orders,
        "total_formations": total_formations,
        "revenue": round(revenue, 2),
        "by_category": [{"category": x["_id"] or "Autre", "count": x["count"]} for x in by_category],
        "by_status": [{"status": x["_id"] or "Autre", "count": x["count"]} for x in by_status],
        "recent_inscriptions": recent_inscriptions,
    }


@router.get("/dashboard")
async def dashboard_redirect(user: dict = Depends(require_role("admin", "employe"))):
    return await dashboard_stats(user)
