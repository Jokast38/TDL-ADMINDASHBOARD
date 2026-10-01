"""Import des leads exportés en CSV/Excel depuis Cosmosia (partenaire —
tunnel de vente GoFunnel). Pas d'API trouvée côté Cosmosia pour le moment :
import fichier manuel, à brancher plus tard sur une API si elle existe.

Les leads importés atterrissent directement dans db.leads (Prospects), comme
tous les autres leads du dashboard (dédoublonnage par email/téléphone déjà
géré par routers.leads._insert_leads_dedup) — pas de collection à part,
contrairement à Meta Lead Import, car Cosmosia alimente le même entonnoir
commercial que les autres sources et doit profiter du même scope par
catégorie/agent (voir routers/call_center.py)."""
import csv
import io
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from core.database import db
from core.security import require_role
from core.config import ROLES_LEADS
from core.utils import now_iso
from routers.leads import _insert_leads_dedup, _category_for_interest, _normalize_interest, _clean_phone

router = APIRouter(prefix="/cosmosia", tags=["cosmosia"])


def _match_col(headers: list, *keywords: str) -> Optional[str]:
    for h in headers:
        hl = (h or "").strip().lower()
        if any(k in hl for k in keywords):
            return h
    return None


def _parse_csv(data: bytes) -> list[dict]:
    text = data.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []

    name_col = _match_col(headers, "nom du contact") or _match_col(headers, "contact")
    phone_col = _match_col(headers, "téléphone", "telephone", "phone")
    email_col = _match_col(headers, "e-mail", "email", "courriel")
    pipeline_col = _match_col(headers, "pipeline")
    stage_col = _match_col(headers, "étape", "etape")
    source_col = _match_col(headers, "source")
    keywords_col = _match_col(headers, "mots-clés", "mots-cles", "tags")
    notes_col = _match_col(headers, "remarques", "notes", "commentaire")
    created_col = _match_col(headers, "créé le", "cree le", "created")

    leads = []
    for row in reader:
        email = ((row.get(email_col) or "").strip().lower() or None) if email_col else None
        phone = _clean_phone(row.get(phone_col)) if phone_col else None
        if not email and not phone:
            continue
        name = (row.get(name_col) or "").strip() if name_col else ""
        interest_raw = " ".join(
            (row.get(c) or "") for c in (keywords_col, pipeline_col, stage_col) if c
        ).strip()
        interest = _normalize_interest(interest_raw)
        campaign = (row.get(source_col) or "").strip() if source_col else ""
        notes_parts = [row.get(notes_col) or "" if notes_col else ""]
        if campaign:
            notes_parts.append(f"Source Cosmosia : {campaign}")
        notes = "\n".join(p for p in notes_parts if p).strip()
        leads.append({
            "id": str(uuid.uuid4()), "name": name or email or phone,
            "email": email, "phone": phone, "interest": interest, "notes": notes,
            "tags": ["a_appeler"] if phone and not email else [],
            "contacted": False, "status": "nouveau", "source": "cosmosia",
            "campaign": campaign or None, "qualification": "a_contacter",
            "cosmosia_created_at": (row.get(created_col) or "").strip() if created_col else "",
            "created_at": now_iso(), "updated_at": now_iso(),
        })
    return leads


def _parse_cosmosia_date(raw: str) -> str:
    """Convertit la date d'export Cosmosia (ex : "2026-10-01T11:53:33.593Z")
    en ISO exploitable par l'agenda d'appel — à défaut de vraie date de
    rendez-vous dans le CSV (absente de l'export), c'est la date de création
    de l'opportunité côté Cosmosia qui sert de date d'appel : le créneau
    apparaît sur l'agenda au jour où le prospect est entré dans leur pipeline,
    à charge pour l'équipe de rattraper le retard sur les créneaux anciens."""
    if not raw:
        return now_iso()
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return now_iso()


async def _already_in_meta_leads(email: Optional[str], phone: Optional[str]) -> bool:
    """Un contact déjà présent dans les leads Meta importés (db.meta_lead_imports,
    voir routers/meta_lead_import.py) ne doit pas être recréé comme Prospect
    distinct depuis Cosmosia — même logique inverse que le check Meta → Prospects,
    pour qu'une même personne touchée par deux canaux publicitaires ne se
    retrouve pas doublée entre les deux tableaux."""
    if not email and not phone:
        return False
    query = {"$or": [
        *([{"email": email}] if email else []),
        *([{"phone": phone}] if phone else []),
    ]}
    return bool(await db.meta_lead_imports.find_one(query, {"_id": 0, "id": 1}))


@router.post("/import")
async def import_cosmosia_csv(file: UploadFile = File(...), user: dict = Depends(require_role(*ROLES_LEADS))):
    data = await file.read()
    try:
        leads = _parse_csv(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV illisible : {e}")
    if not leads:
        raise HTTPException(status_code=400, detail="Aucun lead exploitable dans ce fichier (email ou téléphone requis)")

    to_insert = []
    skipped_duplicate_meta_lead = 0
    for lead in leads:
        if await _already_in_meta_leads(lead.get("email"), lead.get("phone")):
            skipped_duplicate_meta_lead += 1
            continue
        lead["category"] = _category_for_interest(lead.get("interest"))
        to_insert.append(lead)

    result = await _insert_leads_dedup(to_insert)
    result["skipped_duplicate_meta_lead"] = skipped_duplicate_meta_lead
    result["total_rows"] = len(leads)

    # Chaque nouveau lead crée un créneau d'agenda d'appel "disponible" (pas
    # encore attribué) — daté depuis le CSV, pas de commercial assigné : le
    # premier agent qui clique dessus se l'attribue (voir POST
    # /call-center/appointments/{id}/claim). Pas de doublon à la réimportation
    # du même export : seuls les leads réellement NOUVEAUX (inserted_leads,
    # pas les mises à jour) génèrent un créneau.
    appointments_created = 0
    for lead in result.pop("inserted_leads", []):
        await db.call_appointments.insert_one({
            "id": str(uuid.uuid4()), "lead_id": lead["id"],
            "lead_name": lead.get("name"), "lead_phone": lead.get("phone"), "lead_email": lead.get("email"),
            "lead_interest": lead.get("interest"),
            "commercial_id": None, "commercial_name": "",
            "scheduled_at": _parse_cosmosia_date(lead.get("cosmosia_created_at")),
            "notes": lead.get("notes") or "", "status": "disponible", "reminder_sent": False,
            "source": "cosmosia_import", "created_by": user["id"], "created_at": now_iso(), "updated_at": now_iso(),
        })
        appointments_created += 1
    result["appointments_created"] = appointments_created
    return result
