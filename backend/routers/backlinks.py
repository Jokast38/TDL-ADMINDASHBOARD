import asyncio
import csv
import io
import logging
import uuid
from typing import Optional
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import httpx
import openpyxl

from core.database import db
from core.security import require_role
from core.config import ROLES_LEADS
from core.utils import now_iso
from models.backlink import BacklinkUpdate, BacklinkRequestIn
from services.email import send_email
from services.email_template import render_branded_email
from services.backlink_email_finder import find_email

router = APIRouter(prefix="/backlinks", tags=["backlinks"])
log = logging.getLogger(__name__)

# État de la recherche d'emails par lot — en mémoire (process unique, comme
# le reste des boucles de fond de ce projet, voir server.py). Le bouton
# "Chercher les emails manquants" lance une tâche de fond (des centaines de
# sites externes à visiter, largement plus long qu'un aller-retour HTTP) et
# le front vient interroger /find-emails/status pour suivre la progression.
_email_search_state = {"running": False, "total": 0, "done": 0, "found": 0}

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


def _match_col(headers: list, *keywords: str) -> Optional[str]:
    for h in headers:
        hl = (h or "").strip().lower()
        if any(k in hl for k in keywords):
            return h
    return None


@router.post("/import-csv")
async def import_backlinks_csv(
    file: UploadFile = File(...),
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    """Importe une liste de backlinks à demander depuis un CSV de prospection
    (ex : export "Concurrent / Lien du backlink / Domaine / Titre de la page /
    Ce que fait le site / Pourquoi c'est utile") — format différent de
    l'Excel "Nom du site / URL / Catégorie..." ci-dessus (colonnes détectées
    par mot-clé, pas par position, pour s'adapter aux variantes d'export).
    Chaque ligne décrit une page qui fait déjà un lien vers un concurrent :
    l'idée est de demander le même lien vers TDL."""
    data = await file.read()
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Encodage du fichier illisible (attendu : UTF-8)")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    if not headers:
        raise HTTPException(status_code=400, detail="CSV vide ou en-têtes introuvables")

    competitor_col = _match_col(headers, "concurrent")
    url_col = _match_col(headers, "lien du backlink", "lien ", "url")
    domain_col = _match_col(headers, "domaine", "domain")
    title_col = _match_col(headers, "titre")
    desc_col = _match_col(headers, "ce que fait le site", "description")
    reason_col = _match_col(headers, "pourquoi", "utile", "interet", "intérêt")

    if not url_col and not domain_col:
        raise HTTPException(
            status_code=400,
            detail="Colonnes non reconnues — attendu au moins une colonne 'Lien du backlink' ou 'Domaine'",
        )

    priority_rank = {"haute": 0, "moyenne": 1, "basse": 2}
    imported = updated = skipped = 0
    for row in reader:
        url = (row.get(url_col) or "").strip() if url_col else ""
        domain = (row.get(domain_col) or "").strip() if domain_col else ""
        if not url and not domain:
            skipped += 1
            continue
        if not domain and url:
            domain = urlparse(url).netloc or url
        if not url and domain:
            url = f"https://{domain}"

        notes_parts = []
        if title_col and (row.get(title_col) or "").strip():
            notes_parts.append(row[title_col].strip())
        if desc_col and (row.get(desc_col) or "").strip():
            notes_parts.append(row[desc_col].strip())
        if reason_col and (row.get(reason_col) or "").strip():
            notes_parts.append(row[reason_col].strip())
        notes = "\n".join(notes_parts)
        competitor = (row.get(competitor_col) or "").strip() if competitor_col else ""

        existing = await db.backlinks.find_one({"url": url})
        fields = {
            "site_name": domain, "url": url,
            "competitor": competitor, "notes": notes,
            "updated_at": now_iso(),
        }
        if existing:
            # Ne touche pas au statut/email de contact/historique de demande
            # déjà en place — seul le descriptif (notes, concurrent d'origine)
            # est actualisé à chaque réimport.
            await db.backlinks.update_one({"id": existing["id"]}, {"$set": fields})
            updated += 1
        else:
            fields.update({
                "id": str(uuid.uuid4()), "category": "", "niche": "", "link_type": "",
                "priority": "Moyenne", "priority_rank": priority_rank["moyenne"],
                "status": "a_contacter", "contact_email": None,
                "request_count": 0, "last_request": None, "created_at": now_iso(),
            })
            await db.backlinks.insert_one(fields)
            imported += 1

    return {"ok": True, "imported": imported, "updated": updated, "skipped": skipped}


async def _run_email_search():
    """Tâche de fond : cherche un email pour chaque backlink qui n'en a pas,
    en visitant son site. Ne touche que `contact_email` — jamais le statut
    ni le compteur de demandes. Best-effort : une erreur sur un site ne
    bloque jamais les suivants."""
    docs = await db.backlinks.find(
        {"$or": [{"contact_email": None}, {"contact_email": ""}]},
        {"_id": 0, "id": 1, "site_name": 1},
    ).to_list(5000)
    _email_search_state.update({"total": len(docs), "done": 0, "found": 0})
    try:
        async with httpx.AsyncClient() as client:
            semaphore = asyncio.Semaphore(5)

            async def handle(doc):
                async with semaphore:
                    try:
                        email = await find_email(client, doc["site_name"])
                    except Exception as e:
                        log.warning(f"Recherche email backlink {doc['site_name']} : {e}")
                        email = None
                    if email:
                        await db.backlinks.update_one(
                            {"id": doc["id"]},
                            {"$set": {"contact_email": email, "updated_at": now_iso()}},
                        )
                        _email_search_state["found"] += 1
                    _email_search_state["done"] += 1

            await asyncio.gather(*(handle(d) for d in docs))
    finally:
        _email_search_state["running"] = False


@router.post("/find-emails")
async def start_email_search(user: dict = Depends(require_role(*ROLES_LEADS))):
    """Lance en tâche de fond la recherche d'email pour tous les backlinks
    qui n'en ont pas encore (voir services/backlink_email_finder.py) — les
    demandes elles-mêmes restent un envoi manuel via /{backlink_id}/request,
    ceci ne fait que préremplir le champ contact_email."""
    if _email_search_state["running"]:
        raise HTTPException(status_code=409, detail="Une recherche est déjà en cours")
    to_search = await db.backlinks.count_documents({"$or": [{"contact_email": None}, {"contact_email": ""}]})
    if not to_search:
        return {"started": False, "reason": "Tous les backlinks ont déjà un email"}
    # Verrou posé ici, avant de lancer la tâche — pas dans _run_email_search,
    # qui ne s'exécute pas immédiatement (create_task se contente de la
    # planifier) : un second clic pouvait sinon passer ce garde-fou avant que
    # la première tâche n'ait eu la main pour se marquer "en cours" (observé
    # en test : deux lancements de suite acceptés tous les deux).
    _email_search_state["running"] = True
    asyncio.create_task(_run_email_search())
    return {"started": True, "total": to_search}


@router.get("/find-emails/status")
async def email_search_status(user: dict = Depends(require_role(*ROLES_LEADS))):
    return dict(_email_search_state)


@router.post("/{backlink_id}/find-email")
async def find_email_for_one(backlink_id: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    """Recherche ponctuelle pour un seul site (bouton par ligne) — synchrone,
    contrairement à la recherche par lot ci-dessus : un seul site se visite
    en quelques secondes."""
    doc = await db.backlinks.find_one({"id": backlink_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Backlink introuvable")
    async with httpx.AsyncClient() as client:
        email = await find_email(client, doc["site_name"])
    if not email:
        raise HTTPException(status_code=404, detail="Aucun email trouvé sur ce site")
    await db.backlinks.update_one({"id": backlink_id}, {"$set": {"contact_email": email, "updated_at": now_iso()}})
    doc = await db.backlinks.find_one({"id": backlink_id})
    return _serialize(doc)


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
