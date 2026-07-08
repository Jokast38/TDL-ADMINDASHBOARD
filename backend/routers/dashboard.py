from datetime import datetime, timezone
from fastapi import APIRouter, Depends

from core.database import db
from core.security import require_role

router = APIRouter(tags=["dashboard"])


def _parse_dt(raw):
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except Exception:
        return None


def _last_n_months(n: int):
    now = datetime.now(timezone.utc)
    months = []
    y, m = now.year, now.month
    for _ in range(n):
        months.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months.reverse()
    return [f"{y}-{m:02d}" for y, m in months]


@router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(require_role("admin", "employe", "responsable_commercial"))):
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
async def dashboard_redirect(user: dict = Depends(require_role("admin", "employe", "responsable_commercial"))):
    return await dashboard_stats(user)


@router.get("/dashboard/commercial-stats")
async def commercial_stats(user: dict = Depends(require_role("admin", "commercial", "responsable_commercial"))):
    """CA (commandes KAMI Street) et funnel des leads, pour le suivi de performance
    des rôles commerciaux (évolution mensuelle + taux de conversion)."""
    months = _last_n_months(6)
    revenue_by_month = {m: 0.0 for m in months}
    leads_by_month = {m: 0 for m in months}

    orders = await db.orders.find({}, {"_id": 0, "total": 1, "created_at": 1}).to_list(5000)
    for o in orders:
        dt = _parse_dt(o.get("created_at"))
        if not dt:
            continue
        key = f"{dt.year}-{dt.month:02d}"
        if key in revenue_by_month:
            revenue_by_month[key] += o.get("total", 0) or 0

    leads = await db.leads.find({}, {"_id": 0, "status": 1, "created_at": 1}).to_list(10000)
    leads_by_status: dict = {}
    for l in leads:
        status = l.get("status") or "nouveau"
        leads_by_status[status] = leads_by_status.get(status, 0) + 1
        dt = _parse_dt(l.get("created_at"))
        if dt:
            key = f"{dt.year}-{dt.month:02d}"
            if key in leads_by_month:
                leads_by_month[key] += 1

    total_leads = len(leads)
    converted = leads_by_status.get("interesse", 0)
    conversion_rate = round((converted / total_leads) * 100, 1) if total_leads else 0

    return {
        "revenue_by_month": [{"month": m, "revenue": round(revenue_by_month[m], 2)} for m in months],
        "leads_by_month": [{"month": m, "count": leads_by_month[m]} for m in months],
        "leads_by_status": [{"status": k, "count": v} for k, v in leads_by_status.items()],
        "total_leads": total_leads,
        "converted_leads": converted,
        "conversion_rate": conversion_rate,
        "total_orders_revenue": round(sum(revenue_by_month.values()), 2),
    }
