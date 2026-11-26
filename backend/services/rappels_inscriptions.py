"""Lien entre les demandes de rappel et les inscriptions (demande du
2026-11-26) : une personne inscrite après sa demande de rappel ne doit plus
apparaître « à rappeler ».

- À chaque nouvelle inscription, les demandes de rappel encore ouvertes de la
  même personne (même téléphone ou même email), faites avant l'inscription,
  sont closes avec une tentative « Inscrit ».
- Pour les demandes déjà ouvertes, la page Rappels affiche l'inscription
  trouvée et propose de les clore (voir routers/call_center.py).
"""
from typing import Optional

from core.database import db
from core.utils import now_iso
from services.sms import normalize_phone_fr

FERMES = ("traite", "rdv_pris", "clos")


def _tel(raw) -> Optional[str]:
    try:
        return normalize_phone_fr(raw or "") if raw else None
    except Exception:
        return None


def _email(raw) -> Optional[str]:
    raw = (raw or "").strip().lower()
    return raw or None


def _ouvert(r: dict) -> bool:
    statut = r.get("statut")
    if statut in FERMES:
        return False
    return not (r.get("handled") and statut in (None, "", "traite"))


def _meme_personne(r: dict, insc: dict) -> bool:
    tel_r, tel_i = _tel(r.get("telephone")), _tel(insc.get("student_phone"))
    mail_r, mail_i = _email(r.get("email")), _email(insc.get("student_email"))
    return bool((tel_r and tel_r == tel_i) or (mail_r and mail_r == mail_i))


def tentative_inscrit(insc: dict, by_id: Optional[str], by_name: str) -> dict:
    formation = insc.get("formation_title") or ""
    return {"at": now_iso(), "by_id": by_id, "by_name": by_name, "resultat": "inscrit",
            "label": "Inscrit", "note": f"Inscrit à {formation}".strip() if formation else "Inscrit",
            "inscription_id": insc.get("id")}


async def clore_rappel_inscrit(r: dict, insc: dict, by_id: Optional[str], by_name: str) -> None:
    t = tentative_inscrit(insc, by_id, by_name)
    await db.callback_requests.update_one({"id": r["id"]}, {
        "$set": {"statut": "traite", "handled": True, "handled_by": by_id, "handled_by_name": by_name,
                 "handled_at": t["at"], "inscription_id": insc.get("id"), "updated_at": now_iso(),
                 "last_attempt_at": t["at"], "last_attempt_by_name": by_name},
        "$push": {"tentatives": t},
    })


async def cloturer_rappels_inscrit(insc: dict, user: Optional[dict] = None) -> int:
    """Appelée à la création d'une inscription. Ne lève jamais : une erreur
    ici ne doit pas bloquer l'inscription."""
    try:
        if not (_tel(insc.get("student_phone")) or _email(insc.get("student_email"))):
            return 0
        cree = insc.get("created_at") or now_iso()
        ouverts = [r for r in await db.callback_requests.find({"handled": {"$ne": True}}, {"_id": 0}).to_list(5000)
                   if _ouvert(r) and (r.get("created_at") or "") <= cree and _meme_personne(r, insc)]
        by_id = (user or {}).get("id")
        by_name = (user or {}).get("name") or "Inscription en ligne"
        for r in ouverts:
            await clore_rappel_inscrit(r, insc, by_id, by_name)
        return len(ouverts)
    except Exception:
        return 0


async def inscriptions_liees(rappels: list) -> dict:
    """{id du rappel: inscription faite après la demande} pour les rappels
    ouverts — l'inscription la plus ancienne après la demande."""
    ouverts = [r for r in rappels if _ouvert(r)]
    if not ouverts:
        return {}
    debut = min((r.get("created_at") or "") for r in ouverts)[:10]
    inscs = await db.inscriptions.find(
        {"created_at": {"$gte": debut}},
        {"_id": 0, "id": 1, "student_name": 1, "student_phone": 1, "student_email": 1, "formation_title": 1,
         "created_at": 1, "created_by_name": 1, "status": 1},
    ).to_list(20000)
    par_tel, par_mail = {}, {}
    for i in sorted(inscs, key=lambda x: x.get("created_at") or ""):
        if (t := _tel(i.get("student_phone"))):
            par_tel.setdefault(t, []).append(i)
        if (m := _email(i.get("student_email"))):
            par_mail.setdefault(m, []).append(i)
    out = {}
    for r in ouverts:
        cands = par_tel.get(_tel(r.get("telephone")) or "", []) + par_mail.get(_email(r.get("email")) or "", [])
        apres = sorted((i for i in cands if (i.get("created_at") or "") >= (r.get("created_at") or "")),
                       key=lambda x: x.get("created_at") or "")
        if apres:
            out[r["id"]] = apres[0]
    return out
