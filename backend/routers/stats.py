"""Statistiques agrégées pour la nouvelle section "Statistiques" de la page
Activité (admin) — deux tableaux repris du mapping fourni par l'utilisateur :
1. Inscriptions par agent et type de formation (db.inscriptions, champ
   `processed_by`), avec taux de finalisation et CA potentiel.
2. Prospects Meta par statut et par agent (db.meta_lead_imports, champ
   `qualified_by` — distinct de db.leads, voir routers/meta_lead_import.py)."""
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends

from core.database import db
from core.security import require_role
from core.config import ROLES_DOSSIERS_MGMT, canonicalize_lead_origin, ORIGIN_LABELS

router = APIRouter(prefix="/stats", tags=["stats"])

# Regroupement des catégories de formation (FormationIn.category) en 4
# colonnes, comme sur le mapping fourni — tout ce qui n'est ni VTC/Taxi, ni
# Permis, ni ECSR tombe dans "Autres" (Vente, SSIAP, Auto-école, CACES...).
_CATEGORY_GROUPS = {"VTC_TAXI": "vtc_taxi", "PERMIS": "permis", "ECSR": "ecsr"}


def _category_group(category: Optional[str]) -> str:
    return _CATEGORY_GROUPS.get(category, "autres")


@router.get("/agents-formations")
async def agents_formations_stats(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    inscriptions = await db.inscriptions.find(
        {}, {"_id": 0, "processed_by": 1, "category": 1, "price": 1, "contact_status": 1, "formation_title": 1}
    ).to_list(20000)

    staff_ids = {i["processed_by"] for i in inscriptions if i.get("processed_by")}
    staff = await db.users.find({"id": {"$in": list(staff_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    staff_names = {s["id"]: s["name"] for s in staff}

    by_agent: dict = {}
    by_formation: dict = {}

    for insc in inscriptions:
        agent_key = insc.get("processed_by") or "__non_affecte__"
        agent_name = staff_names.get(insc.get("processed_by"), "Non affecté")
        a = by_agent.setdefault(agent_key, {
            "agent": agent_name, "vtc_taxi": 0, "permis": 0, "ecsr": 0, "autres": 0,
            "total": 0, "finalisees": 0, "ca_potentiel": 0.0,
        })
        group = _category_group(insc.get("category"))
        a[group] += 1
        a["total"] += 1
        a["ca_potentiel"] += insc.get("price") or 0
        is_final = insc.get("contact_status") == "finalisee"
        if is_final:
            a["finalisees"] += 1

        title = insc.get("formation_title") or "Autre"
        f = by_formation.setdefault(title, {"formation": title, "inscriptions": 0, "finalisees": 0, "ca_potentiel": 0.0, "ca_finalise": 0.0})
        f["inscriptions"] += 1
        f["ca_potentiel"] += insc.get("price") or 0
        if is_final:
            f["finalisees"] += 1
            f["ca_finalise"] += insc.get("price") or 0

    agents = sorted(by_agent.values(), key=lambda a: -a["total"])
    for a in agents:
        a["taux_finalisation"] = round(100 * a["finalisees"] / a["total"], 1) if a["total"] else 0

    formations = sorted(by_formation.values(), key=lambda f: -f["inscriptions"])
    for f in formations:
        f["taux"] = round(100 * f["finalisees"] / f["inscriptions"], 1) if f["inscriptions"] else 0

    totals = {
        "total": sum(a["total"] for a in agents),
        "finalisees": sum(a["finalisees"] for a in agents),
        "ca_potentiel": sum(a["ca_potentiel"] for a in agents),
    }
    totals["taux_finalisation"] = round(100 * totals["finalisees"] / totals["total"], 1) if totals["total"] else 0

    return {"agents": agents, "formations": formations, "totals": totals}


# Mots-clés pour deviner la formation visée par un lead Meta à partir du nom
# de campagne/formulaire (Meta Lead Ads ne fournit pas de champ "formation"
# structuré) — sert uniquement à estimer un CA potentiel par statut,
# approximatif par nature (voir note "estimation" côté frontend).
_KEYWORD_CATEGORY = [
    (("vtc", "taxi"), "VTC_TAXI"), (("permis", "point"), "PERMIS"),
    (("caces",), "CACES"), (("ssiap",), "SSIAP"), (("ecsr",), "ECSR"), (("vente",), "VENTE"),
]


def _guess_category(text: str) -> Optional[str]:
    t = (text or "").lower()
    for keywords, cat in _KEYWORD_CATEGORY:
        if any(k in t for k in keywords):
            return cat
    return None


@router.get("/meta-leads")
async def meta_leads_stats(date_from: Optional[str] = None, date_to: Optional[str] = None, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    query: dict = {}
    if date_from or date_to:
        rng: dict = {}
        if date_from: rng["$gte"] = date_from
        if date_to: rng["$lte"] = f"{date_to}T23:59:59.999999"
        query["created_at"] = rng

    leads = await db.meta_lead_imports.find(
        query, {"_id": 0, "qualification": 1, "qualified_by_name": 1, "campaign_name": 1, "form_name": 1, "inscription_id": 1}
    ).to_list(20000)

    # Prix catalogue le plus bas par catégorie — sert de base à l'estimation
    # de CA potentiel quand le lead n'est pas (encore) inscrit.
    formations = await db.formations.find({"active": True}, {"_id": 0, "category": 1, "price": 1}).to_list(500)
    price_by_category: dict = {}
    for f in formations:
        cat = f.get("category")
        if cat and f.get("price"):
            price_by_category[cat] = min(price_by_category.get(cat, f["price"]), f["price"])

    insc_ids = [l["inscription_id"] for l in leads if l.get("inscription_id")]
    inscriptions = await db.inscriptions.find({"id": {"$in": insc_ids}}, {"_id": 0, "id": 1, "price": 1}).to_list(len(insc_ids)) if insc_ids else []
    price_by_insc = {i["id"]: i.get("price") or 0 for i in inscriptions}

    by_status: dict = {}
    by_person: dict = {}
    for l in leads:
        qual = l.get("qualification") or "a_contacter"
        if l.get("inscription_id") and l["inscription_id"] in price_by_insc:
            estimated_price = price_by_insc[l["inscription_id"]]
        else:
            cat = _guess_category(f"{l.get('campaign_name', '')} {l.get('form_name', '')}")
            estimated_price = price_by_category.get(cat, 0) if cat else 0

        s = by_status.setdefault(qual, {"nb": 0, "ca_potentiel": 0.0})
        s["nb"] += 1
        s["ca_potentiel"] += estimated_price

        person = l.get("qualified_by_name") or "Sans personne"
        p = by_person.setdefault(person, {"personne": person, "total": 0})
        p["total"] += 1
        p[qual] = p.get(qual, 0) + 1

    total = len(leads)
    return {
        "total": total,
        "by_status": [
            {"statut": k, "nb": v["nb"], "pct": round(100 * v["nb"] / total, 1) if total else 0, "ca_potentiel": round(v["ca_potentiel"], 2)}
            for k, v in sorted(by_status.items(), key=lambda x: -x[1]["nb"])
        ],
        "by_person": sorted(by_person.values(), key=lambda p: -p["total"]),
    }


@router.get("/leads-by-origin")
async def leads_by_origin_stats(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Répartition des prospects (db.leads) par origine regroupée — chiffres
    par origine demandés pour la section Statistiques de la page Activité."""
    leads = await db.leads.find({}, {"_id": 0, "source": 1, "contacted": 1, "qualification": 1}).to_list(100000)
    by_origin: dict = {}
    for l in leads:
        key = canonicalize_lead_origin(l.get("source"))
        o = by_origin.setdefault(key, {"origin": key, "label": ORIGIN_LABELS.get(key, key), "total": 0, "contactes": 0, "interesses": 0, "inscrits": 0})
        o["total"] += 1
        if l.get("contacted"):
            o["contactes"] += 1
        if l.get("qualification") == "interesse":
            o["interesses"] += 1
        if l.get("qualification") == "inscrit":
            o["inscrits"] += 1
    return sorted(by_origin.values(), key=lambda o: -o["total"])


def _iso_week_key(date_str: str) -> str:
    d = datetime.fromisoformat(date_str[:19].replace("Z", "")).date()
    year, week, _ = d.isocalendar()
    return f"{year}-S{week:02d}"


@router.get("/leads-timeseries")
async def leads_timeseries_stats(days: int = 60, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Nombre de nouveaux prospects par jour et par semaine, sur les `days`
    derniers jours — bilans demandés pour la section Statistiques."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    leads = await db.leads.find({"created_at": {"$gte": since}}, {"_id": 0, "created_at": 1}).to_list(100000)

    daily: dict = {}
    weekly: dict = {}
    for l in leads:
        created = l.get("created_at") or ""
        if not created:
            continue
        day_key = created[:10]
        daily[day_key] = daily.get(day_key, 0) + 1
        try:
            week_key = _iso_week_key(created)
        except Exception:
            continue
        weekly[week_key] = weekly.get(week_key, 0) + 1

    return {
        "daily": [{"date": k, "count": v} for k, v in sorted(daily.items())],
        "weekly": [{"week": k, "count": v} for k, v in sorted(weekly.items())],
    }
