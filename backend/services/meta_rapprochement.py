"""Rapprochement prospects Meta / inscriptions (demande du 2026-11-24) :
une personne venue par une publicité Meta qui s'inscrit ensuite sur place
(saisie par un agent) ou par un autre canal doit garder sa vraie origine,
Meta. On compare les inscriptions aux prospects Meta par email, puis par
téléphone (9 derniers chiffres, quel que soit le format saisi).

Correction appliquée sur une correspondance :
- inscription : origine_reelle="meta", meta_lead_id, meta_campagne,
  meta_lead_created_at (la colonne Origine de la page Inscriptions affiche
  alors « Pub Meta », avec « inscrit sur place » quand c'est le cas) ;
- prospect Meta : inscription_id et qualification « Inscrit » (jamais
  rétrogradé s'il est déjà payé).

Seuls les prospects Meta arrivés AVANT l'inscription (1 jour de marge)
comptent : un formulaire Meta rempli après coup ne change pas l'origine.
"""
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from core.database import db
from core.utils import now_iso

_META_LEADS = {"$or": [{"source": "meta"}, {"sources": "meta"}]}
_MARGE = timedelta(days=1)


def norm_email(v: Optional[str]) -> str:
    return (v or "").strip().lower()


def norm_phone(v: Optional[str]) -> str:
    digits = re.sub(r"\D", "", v or "")
    return digits[-9:] if len(digits) >= 9 else ""


def _dt(v: Optional[str]) -> Optional[datetime]:
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d.replace(tzinfo=None) if d.tzinfo is None else d.astimezone().replace(tzinfo=None)


async def _prospects_meta() -> List[dict]:
    proj = {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "created_at": 1, "created_time": 1,
            "campaign_name": 1, "campagne": 1, "statut": 1, "qualification": 1, "inscription_id": 1,
            "legacy_ids": 1, "meta_details": 1}
    leads = await db.leads.find(_META_LEADS, proj).to_list(50000)
    for l in leads:
        l["_collection"] = "leads"
    repris = {(l.get("legacy_ids") or {}).get("meta_lead_imports") for l in leads}
    legacy = [d for d in await db.meta_lead_imports.find({}, proj).to_list(50000) if d["id"] not in repris]
    for d in legacy:
        d["_collection"] = "meta_lead_imports"
    return leads + legacy


def _index(prospects: List[dict]):
    by_email: Dict[str, List[dict]] = {}
    by_phone: Dict[str, List[dict]] = {}
    for p in prospects:
        if norm_email(p.get("email")):
            by_email.setdefault(norm_email(p["email"]), []).append(p)
        if norm_phone(p.get("phone")):
            by_phone.setdefault(norm_phone(p["phone"]), []).append(p)
    return by_email, by_phone


def match(insc: dict, by_email: dict, by_phone: dict) -> Optional[dict]:
    """Prospect Meta le plus ancien correspondant à l'inscription, arrivé
    avant elle ; None sinon."""
    candidats = by_email.get(norm_email(insc.get("student_email")), []) + \
        by_phone.get(norm_phone(insc.get("student_phone")), [])
    insc_at = _dt(insc.get("created_at"))
    valides = []
    for p in candidats:
        p_at = _dt(p.get("created_time") or p.get("created_at"))
        if insc_at and p_at and p_at > insc_at + _MARGE:
            continue
        valides.append((p_at or datetime.min, p))
    if not valides:
        return None
    return sorted(valides, key=lambda x: x[0])[0][1]


def _par(insc: dict, p: dict) -> str:
    if norm_email(insc.get("student_email")) and norm_email(insc.get("student_email")) == norm_email(p.get("email")):
        return "email"
    return "téléphone"


def _origine_declaree(insc: dict) -> str:
    src = insc.get("source") or ""
    if src == "admin_walkin":
        return "Sur place (agent)"
    if src.startswith("excel_import"):
        return "Import Excel"
    if insc.get("from_meta_ads"):
        return "Pub Meta"
    return "Site internet"


async def analyser() -> dict:
    """Liste des inscriptions à corriger (simulation, rien n'est écrit)."""
    by_email, by_phone = _index(await _prospects_meta())
    inscriptions = await db.inscriptions.find(
        {}, {"_id": 0, "id": 1, "student_name": 1, "student_email": 1, "student_phone": 1, "source": 1,
             "from_meta_ads": 1, "origine_reelle": 1, "meta_lead_id": 1, "created_at": 1, "formation_title": 1,
             "created_by_name": 1},
    ).to_list(50000)
    a_corriger, deja = [], 0
    for insc in inscriptions:
        p = match(insc, by_email, by_phone)
        if not p:
            continue
        if insc.get("meta_lead_id"):
            deja += 1
            continue
        a_corriger.append({
            "inscription_id": insc["id"], "student_name": insc.get("student_name"),
            "formation_title": insc.get("formation_title"), "inscrit_le": insc.get("created_at"),
            "inscrit_par": insc.get("created_by_name"), "origine_declaree": _origine_declaree(insc),
            "sur_place": insc.get("source") == "admin_walkin",
            "meta_lead_id": p["id"], "meta_collection": p["_collection"], "meta_name": p.get("name"),
            "meta_campagne": p.get("campaign_name") or p.get("campagne") or (p.get("meta_details") or {}).get("form_name"),
            "meta_le": p.get("created_time") or p.get("created_at"), "par": _par(insc, p),
        })
    a_corriger.sort(key=lambda x: x.get("inscrit_le") or "", reverse=True)
    return {"a_corriger": a_corriger, "deja_rapproches": deja, "inscriptions": len(inscriptions),
            "sur_place": sum(1 for x in a_corriger if x["sur_place"])}


async def _appliquer_un(insc_id: str, p_id: str, collection: str, campagne: Optional[str], meta_le: Optional[str],
                        user: Optional[dict] = None) -> dict:
    """Écrit la correction ; renvoie les champs posés sur l'inscription."""
    champs = {"origine_reelle": "meta", "meta_lead_id": p_id, "meta_lead_collection": collection,
              "meta_campagne": campagne, "meta_lead_created_at": meta_le, "origine_corrigee_at": now_iso()}
    await db.inscriptions.update_one({"id": insc_id}, {"$set": champs})
    prospect = await db[collection].find_one({"id": p_id}, {"_id": 0, "name": 1, "statut": 1, "qualification": 1, "inscription_id": 1})
    if not prospect:
        return champs
    upd = {"updated_at": now_iso()}
    if not prospect.get("inscription_id"):
        upd["inscription_id"] = insc_id
    passe_inscrit = False
    if collection == "leads":
        if prospect.get("statut") not in ("inscrit", "paye"):
            upd.update({"statut": "inscrit", "chaleur": None, "motif_cloture": None})
            passe_inscrit = True
    elif prospect.get("qualification") not in ("inscrit", "paye"):
        upd["qualification"] = "inscrit"
        passe_inscrit = True
    if passe_inscrit and user:
        # Qualification signée par l'agent qui a fait l'inscription : visible
        # dans « Traité par », le suivi du prospect et le classement.
        upd.update({"qualified_by": user["id"], "qualified_by_name": user.get("name", ""), "qualified_at": now_iso()})
    await db[collection].update_one({"id": p_id}, {"$set": upd})
    if passe_inscrit and user:
        from services.activity import log_action
        await log_action(user, "lead_qualifie", "meta_lead" if collection == "meta_lead_imports" else "lead", p_id, {
            "name": prospect.get("name"), "qualification": "inscrit", "auto": True, "inscription_id": insc_id})
    return champs


async def appliquer(user: Optional[dict] = None) -> dict:
    res = await analyser()
    for x in res["a_corriger"]:
        await _appliquer_un(x["inscription_id"], x["meta_lead_id"], x["meta_collection"], x["meta_campagne"], x["meta_le"], user)
    if res["a_corriger"]:
        from routers.leads import _leads_cache_clear
        _leads_cache_clear()
        if user:
            from services.activity import log_action
            await log_action(user, "origines_meta_corrigees", "inscription", None, {"corrigees": len(res["a_corriger"])})
    return {"corrigees": len(res["a_corriger"]), "sur_place": res["sur_place"], "deja_rapproches": res["deja_rapproches"]}


async def rapprocher_inscription(insc: dict, user: Optional[dict] = None) -> Optional[str]:
    """Appelé à chaque nouvelle inscription (dont « sur place » par un agent) :
    rattache tout de suite le prospect Meta correspondant, met l'origine
    « Pub Meta » sur l'inscription (aussi dans le dict reçu, donc dans la
    réponse) et passe le prospect en « Inscrit » au nom de l'agent. Ne lève
    jamais d'exception."""
    try:
        email, phone = norm_email(insc.get("student_email")), norm_phone(insc.get("student_phone"))
        if not email and not phone:
            return None
        ors = []
        if email:
            ors.append({"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}})
        if phone:
            ors.append({"phone": {"$regex": "".join(f"{c}\\D*" for c in phone) + "$"}})
        proj = {"_id": 0, "id": 1, "email": 1, "phone": 1, "created_at": 1, "created_time": 1, "campaign_name": 1,
                "campagne": 1, "meta_details": 1, "legacy_ids": 1}
        cands = []
        for l in await db.leads.find({"$and": [_META_LEADS, {"$or": ors}]}, proj).to_list(20):
            cands.append({**l, "_collection": "leads"})
        if not cands:
            for d in await db.meta_lead_imports.find({"$or": ors}, proj).to_list(20):
                cands.append({**d, "_collection": "meta_lead_imports"})
        p = match(insc, *_index(cands))
        if not p:
            return None
        champs = await _appliquer_un(insc["id"], p["id"], p["_collection"],
                                     p.get("campaign_name") or p.get("campagne") or (p.get("meta_details") or {}).get("form_name"),
                                     p.get("created_time") or p.get("created_at"), user)
        insc.update(champs)
        if p["_collection"] == "leads":
            from routers.leads import _leads_cache_clear
            _leads_cache_clear()
        return p["id"]
    except Exception:
        return None
