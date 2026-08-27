import io
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import openpyxl

from core.database import db
from core.security import require_role
from core.config import ROLES_LEADS
from core.utils import now_iso
from models.backlink import BacklinkUpdate, BacklinkRequestIn
from services.email import send_email
from services.email_template import render_branded_email

router = APIRouter(prefix="/backlinks", tags=["backlinks"])

STATUS_LABELS = {
    "a_contacter": "À contacter",
    "demande_envoyee": "Demande envoyée",
    "relance_envoyee": "Relancé",
    "accepte": "Accepté",
    "refuse": "Refusé",
    "publie": "Backlink publié",
}

# Statuts du fichier Excel d'origine -> statut interne. Toute autre valeur
# rencontrée tombe dans "a_contacter" par défaut.
_XLSX_STATUS_MAP = {
    "à contacter": "a_contacter",
    "a contacter": "a_contacter",
    "contacté": "demande_envoyee",
    "contacte": "demande_envoyee",
}


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    doc["status_label"] = STATUS_LABELS.get(doc.get("status"), doc.get("status"))
    return doc


@router.get("")
async def list_backlinks(
    status: Optional[str] = None,
    category: Optional[str] = None,
    link_type: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    query = {}
    if status:
        query["status"] = status
    if category:
        query["category"] = category
    if link_type:
        query["link_type"] = link_type
    if search:
        query["$or"] = [
            {"site_name": {"$regex": search, "$options": "i"}},
            {"url": {"$regex": search, "$options": "i"}},
            {"category": {"$regex": search, "$options": "i"}},
            {"niche": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.backlinks.find(query).sort("priority_rank", 1).to_list(2000)
    categories = sorted([c for c in await db.backlinks.distinct("category") if c])
    link_types = sorted([t for t in await db.backlinks.distinct("link_type") if t])
    return {
        "items": [_serialize(d) for d in docs],
        "total": len(docs),
        "status_options": STATUS_LABELS,
        "category_options": categories,
        "link_type_options": link_types,
    }


@router.post("/import-excel")
async def import_backlinks_excel(
    file: UploadFile = File(...),
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    """Importe/actualise la liste de backlinks depuis un export Excel (colonnes :
    Nom du site, URL, Catégorie, Thématique / Niche, Type de lien à demander,
    Priorité, Statut). Déduplique par URL : une ligne déjà présente est mise à
    jour (catégorie, niche, type, priorité) sans écraser le statut/email/notes
    déjà renseignés dans le dashboard."""
    data = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Fichier Excel invalide")

    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))

    header_idx = None
    for i, row in enumerate(rows):
        if row and row[0] and "nom du site" in str(row[0]).strip().lower():
            header_idx = i
            break
    if header_idx is None:
        raise HTTPException(status_code=400, detail="En-têtes de colonnes introuvables (attendu : 'Nom du site' en première colonne)")

    priority_rank = {"haute": 0, "moyenne": 1, "basse": 2}
    imported = 0
    updated = 0
    for row in rows[header_idx + 1:]:
        if not row or not row[1]:  # pas d'URL -> ligne vide/ignorée
            continue
        site_name, url, category, niche, link_type, priority, xlsx_status = (list(row) + [None] * 7)[:7]
        url = str(url).strip()
        existing = await db.backlinks.find_one({"url": url})
        priority_val = (priority or "Moyenne").strip()
        fields = {
            "site_name": (site_name or url).strip(),
            "url": url,
            "category": (category or "").strip(),
            "niche": (niche or "").strip(),
            "link_type": (link_type or "").strip(),
            "priority": priority_val,
            "priority_rank": priority_rank.get(priority_val.lower(), 1),
            "updated_at": now_iso(),
        }
        if existing:
            await db.backlinks.update_one({"id": existing["id"]}, {"$set": fields})
            updated += 1
        else:
            fields.update({
                "id": str(uuid.uuid4()),
                "status": _XLSX_STATUS_MAP.get(str(xlsx_status or "").strip().lower(), "a_contacter"),
                "contact_email": None,
                "notes": "",
                "request_count": 0,
                "last_request": None,
                "created_at": now_iso(),
            })
            await db.backlinks.insert_one(fields)
            imported += 1

    return {"ok": True, "imported": imported, "updated": updated}


@router.patch("/{backlink_id}")
async def update_backlink(
    backlink_id: str,
    payload: BacklinkUpdate,
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    doc = await db.backlinks.find_one({"id": backlink_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Backlink introuvable")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not updates:
        return _serialize(doc)
    updates["updated_at"] = now_iso()
    await db.backlinks.update_one({"id": backlink_id}, {"$set": updates})
    doc = await db.backlinks.find_one({"id": backlink_id})
    return _serialize(doc)


@router.delete("/{backlink_id}")
async def delete_backlink(backlink_id: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    result = await db.backlinks.delete_one({"id": backlink_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Backlink introuvable")
    return {"ok": True}


@router.post("/{backlink_id}/request")
async def send_backlink_request(
    backlink_id: str,
    payload: BacklinkRequestIn,
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    doc = await db.backlinks.find_one({"id": backlink_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Backlink introuvable")
    if not payload.to_email.strip():
        raise HTTPException(status_code=400, detail="Adresse email destinataire requise")

    subject = payload.subject or f"Demande de partenariat backlink — TDL Formation × {doc['site_name']}"
    html_body = render_branded_email(payload.message, None, None)
    log = await send_email(
        payload.to_email.strip(), subject, html_body,
        extra={"sent_by": user["id"], "backlink_request": True, "backlink_id": backlink_id},
    )
    if log["status"] not in ("sent", "mocked"):
        raise HTTPException(status_code=502, detail=f"Échec de l'envoi : {log['status']}")

    was_sent_before = bool(doc.get("last_request"))
    request_record = {
        "to_email": payload.to_email.strip(),
        "price": payload.price,
        "keywords": payload.keywords,
        "message": payload.message,
        "sent_at": now_iso(),
        "sent_by": user["id"],
    }
    await db.backlinks.update_one(
        {"id": backlink_id},
        {
            "$set": {
                "contact_email": payload.to_email.strip(),
                "status": "relance_envoyee" if was_sent_before else "demande_envoyee",
                "last_request": request_record,
                "updated_at": now_iso(),
            },
            "$inc": {"request_count": 1},
        },
    )
    doc = await db.backlinks.find_one({"id": backlink_id})
    return _serialize(doc)
