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


# Un paiement est considéré "réalisé" (CA encaissé) seulement dans ces états —
# même liste que le garde-fou "déjà payé" de routers/payments.py — le reste
# (pending/processing/cpf_attente/None) compte comme "en cours".
_PAID_STATUSES = ("paid", "cpf_valide")


@router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(require_role("admin", "employe", "responsable_commercial"))):
    total_inscriptions = await db.inscriptions.count_documents({})
    total_dossiers = await db.dossiers.count_documents({})
    in_progress = await db.dossiers.count_documents({"status": {"$in": ["nouveau", "en_verification", "complet"]}})
    completed = await db.dossiers.count_documents({"status": "termine"})
    en_verification = await db.dossiers.count_documents({"status": "en_verification"})
    dossiers_complets = await db.dossiers.count_documents({"status": "complet"})
    dossiers_soumis_ants = await db.dossiers.count_documents({"status": "soumis_ants"})
    total_orders = await db.orders.count_documents({})
    total_formations = await db.formations.count_documents({"active": True})

    # CA TDL Formation (inscriptions) et CA KAMI STREET (commandes boutique)
    # gardés séparés — ce sont deux activités distinctes, les mélanger dans un
    # seul total masque la performance de chacune. Le CA TDL est en plus
    # scindé réalisé (déjà payé) / en cours (paiement non finalisé).
    inscr_docs = await db.inscriptions.find({}, {"_id": 0, "price": 1, "payment_status": 1}).to_list(50000)
    revenue_tdl_paid = sum(d.get("price", 0) or 0 for d in inscr_docs if d.get("payment_status") in _PAID_STATUSES)
    revenue_tdl_pending = sum(d.get("price", 0) or 0 for d in inscr_docs if d.get("payment_status") not in _PAID_STATUSES)
    orders_rev = await db.orders.aggregate([{"$group": {"_id": None, "sum": {"$sum": "$total"}}}]).to_list(1)
    revenue_kami = orders_rev[0]["sum"] if orders_rev else 0
    revenue = revenue_tdl_paid + revenue_kami  # conservé pour compat (ancien champ global, déjà consommé ailleurs)

    by_category = await db.inscriptions.aggregate([{"$group": {"_id": "$category", "count": {"$sum": 1}}}]).to_list(20)
    by_status = await db.dossiers.aggregate([{"$group": {"_id": "$status", "count": {"$sum": 1}}}]).to_list(20)
    recent_inscriptions = await db.inscriptions.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)

    # CA prévisionnel = nombre de personnes inscrites par formation × prix
    # ACTUEL du catalogue (pas le prix figé au moment de l'inscription, qui
    # peut être absent sur d'anciennes inscriptions ou périmé si le tarif a
    # changé depuis) — répond à "combien si toutes les inscriptions en cours
    # se concrétisent, au tarif catalogue d'aujourd'hui".
    by_formation = await db.inscriptions.aggregate([{"$group": {"_id": "$formation_id", "count": {"$sum": 1}}}]).to_list(500)
    formations_price = {
        f["id"]: f.get("price", 0)
        for f in await db.formations.find({}, {"_id": 0, "id": 1, "price": 1}).to_list(1000)
    }
    forecast_revenue_by_enrollment = sum(
        formations_price.get(f["_id"], 0) * f["count"] for f in by_formation if f["_id"]
    )

    return {
        "forecast_revenue_by_enrollment": round(forecast_revenue_by_enrollment, 2),
        "total_inscriptions": total_inscriptions,
        "total_dossiers": total_dossiers,
        "in_progress": in_progress,
        "completed": completed,
        "en_verification": en_verification,
        "dossiers_complets": dossiers_complets,
        "dossiers_soumis_ants": dossiers_soumis_ants,
        "total_orders": total_orders,
        "total_formations": total_formations,
        "revenue": round(revenue, 2),
        "revenue_tdl_paid": round(revenue_tdl_paid, 2),
        "revenue_tdl_pending": round(revenue_tdl_pending, 2),
        "revenue_kami": round(revenue_kami, 2),
        "by_category": [{"category": x["_id"] or "Autre", "count": x["count"]} for x in by_category],
        "by_status": [{"status": x["_id"] or "Autre", "count": x["count"]} for x in by_status],
        "recent_inscriptions": recent_inscriptions,
    }


@router.get("/dashboard/revenue-timeseries")
async def revenue_timeseries(
    months: int = 6,
    user: dict = Depends(require_role("admin", "employe", "responsable_commercial")),
):
    """CA mensuel TDL Formation (réalisé = payé, et prévisionnel = nb d'inscrits
    du mois × prix catalogue actuel) et CA KAMI STREET (commandes), séparés —
    alimente le graphique de la page Activité."""
    months = min(max(months, 1), 24)
    month_keys = _last_n_months(months)

    inscriptions = await db.inscriptions.find(
        {}, {"_id": 0, "price": 1, "payment_status": 1, "created_at": 1, "formation_id": 1}
    ).to_list(50000)
    formations_price = {
        f["id"]: f.get("price", 0)
        for f in await db.formations.find({}, {"_id": 0, "id": 1, "price": 1}).to_list(1000)
    }
    orders = await db.orders.find({}, {"_id": 0, "total": 1, "created_at": 1}).to_list(50000)

    data = {m: {"month": m, "inscriptions_count": 0, "tdl_realise": 0.0, "tdl_previsionnel": 0.0, "kami": 0.0} for m in month_keys}
    for ins in inscriptions:
        dt = _parse_dt(ins.get("created_at"))
        if not dt:
            continue
        key = f"{dt.year}-{dt.month:02d}"
        if key not in data:
            continue
        data[key]["inscriptions_count"] += 1
        data[key]["tdl_previsionnel"] += formations_price.get(ins.get("formation_id"), ins.get("price", 0) or 0)
        if ins.get("payment_status") in _PAID_STATUSES:
            data[key]["tdl_realise"] += ins.get("price", 0) or 0

    for o in orders:
        dt = _parse_dt(o.get("created_at"))
        if not dt:
            continue
        key = f"{dt.year}-{dt.month:02d}"
        if key in data:
            data[key]["kami"] += o.get("total", 0) or 0

    return [
        {**data[m], "tdl_realise": round(data[m]["tdl_realise"], 2),
         "tdl_previsionnel": round(data[m]["tdl_previsionnel"], 2), "kami": round(data[m]["kami"], 2)}
        for m in month_keys
    ]


ORIGIN_LABELS = {
    "website": "Site internet", "meta_ads": "Pub Meta",
    "walkin": "Sur place (agent)", "imported": "Import Excel",
}


def _origin_for(ins: dict) -> str:
    """Même logique que getOrigin() côté frontend (Inscriptions.jsx) — gardée
    synchronisée pour que la répartition par origine corresponde à ce que
    montre déjà la colonne "Origine" de la page Inscriptions."""
    source = ins.get("source") or ""
    if source.startswith("excel_import"):
        return "imported"
    if source == "admin_walkin":
        return "walkin"
    if ins.get("from_meta_ads"):
        return "meta_ads"
    return "website"


@router.get("/dashboard/revenue-breakdown")
async def revenue_breakdown(
    months: int = 6,
    user: dict = Depends(require_role("admin", "employe", "responsable_commercial")),
):
    """CA (réalisé/prévisionnel) ventilé par formation et par origine du lead,
    sur la même fenêtre de mois que /dashboard/revenue-timeseries — pour ne
    pas se limiter à un seul chiffre global agrégé sur la page Activité."""
    months = min(max(months, 1), 24)
    month_keys = set(_last_n_months(months))

    inscriptions = await db.inscriptions.find(
        {}, {"_id": 0, "price": 1, "payment_status": 1, "created_at": 1,
             "formation_id": 1, "formation_title": 1, "source": 1, "from_meta_ads": 1}
    ).to_list(50000)
    formations_price = {
        f["id"]: f.get("price", 0)
        for f in await db.formations.find({}, {"_id": 0, "id": 1, "price": 1}).to_list(1000)
    }

    by_formation: dict = {}
    by_origin: dict = {}
    for ins in inscriptions:
        dt = _parse_dt(ins.get("created_at"))
        if not dt:
            continue
        key = f"{dt.year}-{dt.month:02d}"
        if key not in month_keys:
            continue
        price = ins.get("price", 0) or 0
        previsionnel = formations_price.get(ins.get("formation_id"), price)
        realise = price if ins.get("payment_status") in _PAID_STATUSES else 0

        title = ins.get("formation_title") or "Autre"
        f = by_formation.setdefault(title, {"formation": title, "count": 0, "realise": 0.0, "previsionnel": 0.0})
        f["count"] += 1
        f["previsionnel"] += previsionnel
        f["realise"] += realise

        origin = _origin_for(ins)
        o = by_origin.setdefault(origin, {"origin": origin, "label": ORIGIN_LABELS.get(origin, origin), "count": 0, "realise": 0.0, "previsionnel": 0.0})
        o["count"] += 1
        o["previsionnel"] += previsionnel
        o["realise"] += realise

    return {
        "by_formation": sorted(
            [{**f, "realise": round(f["realise"], 2), "previsionnel": round(f["previsionnel"], 2)} for f in by_formation.values()],
            key=lambda x: -x["realise"],
        ),
        "by_origin": sorted(
            [{**o, "realise": round(o["realise"], 2), "previsionnel": round(o["previsionnel"], 2)} for o in by_origin.values()],
            key=lambda x: -x["realise"],
        ),
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
