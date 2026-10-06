"""Import des leads exportés manuellement du Gestionnaire d'événements Meta
(Lead Ads) en CSV, et tableau de qualification dédié — distinct de
routers/meta_leads.py (webhook temps réel qui alimente, lui, directement
db.leads/Prospects). Ici l'import est un geste ponctuel de l'équipe, sur une
liste tenue à part (db.meta_lead_imports) pour ne pas mélanger deux sources
qui n'ont pas le même usage : qualifier puis inscrire manuellement un lead
publicitaire plutôt que le traiter comme un contact générique.

Dédoublonnage, dans cet ordre :
1. Déjà une inscription ACTIVE (même email ou téléphone) ? -> ignoré, c'est
   déjà un apprenant chez nous, pas un prospect à démarcher.
2. Déjà un lead connu dans Prospects (db.leads, même email ou téléphone —
   potentiellement arrivé via le webhook temps réel ou saisi à la main) ?
   -> ignoré, pour ne jamais gérer la même personne à deux endroits
   différents."""
import csv
import io
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request

from core.database import db
from core.security import require_role
from core.config import ROLES_LEADS, ROLES_DOSSIERS_MGMT
from core.utils import now_iso, format_date_long_fr
from models.meta_lead_import import MetaLeadUpdate, MetaLeadEnrollIn
from models.inscription import InscriptionIn
from routers.inscriptions import create_inscription
from services.email import send_email
from services.email_template import render_branded_email
from services.lead_followup import send_no_response_followup, NO_RESPONSE_QUALIFICATION
from services.activity import log_action
from services.push import send_push_to_users

router = APIRouter(prefix="/meta-lead-import", tags=["meta-lead-import"])

QUALIFICATION_LABELS = {
    "a_contacter": "À contacter",
    "non_qualifie": "Prospect non qualifié",
    "interesse": "Intéressé",
    "pas_de_reponse": "Pas de réponse",
    "injoignable": "Injoignable",
    "a_relancer": "À relancer",
    "plus_interesse": "Plus intéressé",
    "inscrit": "Inscrit",
}

# Colonnes "fixes" de l'export Meta (métadonnées pub, toujours présentes,
# jamais une question du formulaire) — tout le reste de l'en-tête CSV est
# soit une question personnalisée du formulaire, soit l'un des champs
# "standard" (nom/téléphone/email/statut) repérés ci-dessous par mot-clé
# dans leur nom de colonne, puisque Meta les nomme différemment selon le
# formulaire (ex: "nom_complet" vs "full_name").
_FIXED_META_COLUMNS = {
    "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name",
    "campaign_id", "campaign_name", "form_id", "form_name", "is_organic", "platform",
}


def _clean_phone(raw: str) -> str:
    # Le CSV Meta préfixe les numéros par "p:" (ex: "p:+33627853200") —
    # convention de leur export, pas un vrai préfixe du numéro.
    raw = (raw or "").strip()
    return raw[2:] if raw.lower().startswith("p:") else raw


def _match_col(headers: list, *keywords: str) -> Optional[str]:
    for h in headers:
        hl = h.lower()
        if any(k in hl for k in keywords):
            return h
    return None


def _parse_csv(data: bytes) -> list[dict]:
    text = data.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    name_col = _match_col(headers, "nom_complet", "full_name", "nom")
    email_col = _match_col(headers, "e-mail", "email", "courriel")
    phone_col = _match_col(headers, "phone", "telephone", "téléphone")
    status_col = _match_col(headers, "lead_status")
    question_cols = [
        h for h in headers
        if h not in _FIXED_META_COLUMNS and h not in {name_col, email_col, phone_col, status_col}
    ]

    rows = []
    for row in reader:
        rows.append({
            "meta_lead_id": (row.get("id") or "").strip(),
            "created_time": (row.get("created_time") or "").strip(),
            "campaign_name": (row.get("campaign_name") or "").strip(),
            "adset_name": (row.get("adset_name") or "").strip(),
            "ad_name": (row.get("ad_name") or "").strip(),
            "form_name": (row.get("form_name") or "").strip(),
            "platform": (row.get("platform") or "").strip(),
            "name": (row.get(name_col) or "").strip() if name_col else "",
            "email": (row.get(email_col) or "").strip().lower() if email_col else "",
            "phone": _clean_phone(row.get(phone_col)) if phone_col else "",
            "answers": {h: (row.get(h) or "").strip() for h in question_cols if (row.get(h) or "").strip()},
        })
    return rows


@router.get("/qualification-options")
async def qualification_options(user: dict = Depends(require_role(*ROLES_LEADS))):
    return QUALIFICATION_LABELS


@router.post("/import")
async def import_meta_leads_csv(
    file: UploadFile = File(...),
    meta_account: str = Form(...),
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    """Importe un export CSV du Gestionnaire d'événements Meta. `meta_account`
    identifie le compte publicitaire d'où vient l'export (saisi à la main —
    Meta ne met pas cette info dans le CSV lui-même, elle dépend du compte
    depuis lequel on a exporté)."""
    if not meta_account.strip():
        raise HTTPException(status_code=400, detail="Le compte Meta est requis")
    data = await file.read()
    try:
        rows = _parse_csv(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV illisible : {e}")

    imported, updated, skipped_duplicate_prospect, skipped_no_contact, skipped_already_enrolled = 0, 0, 0, 0, 0
    for row in rows:
        if not row["email"] and not row["phone"]:
            skipped_no_contact += 1
            continue

        contact_filter = {"$or": [
            *([{"email": row["email"]}] if row["email"] else []),
            *([{"phone": row["phone"]}] if row["phone"] else []),
        ]}

        # Déjà inscrit (inscription active, même email ou téléphone) ? On ne
        # le réimporte pas comme prospect à recontacter — c'est déjà un
        # apprenant chez nous, pas quelqu'un à qualifier/démarcher.
        inscription_filter = {"$or": [
            *([{"student_email": row["email"]}] if row["email"] else []),
            *([{"student_phone": row["phone"]}] if row["phone"] else []),
        ]}
        if await db.inscriptions.find_one({**inscription_filter, "status": "active"}):
            skipped_already_enrolled += 1
            continue

        # Déjà un prospect connu (Prospects/db.leads) ? On ne le réimporte
        # pas ici — une seule personne, un seul endroit où la gérer.
        if await db.leads.find_one(contact_filter):
            skipped_duplicate_prospect += 1
            continue

        existing = await db.meta_lead_imports.find_one(
            {"$or": [
                *([{"meta_lead_id": row["meta_lead_id"]}] if row["meta_lead_id"] else []),
                *contact_filter["$or"],
            ]}
        )
        fields = {
            "meta_lead_id": row["meta_lead_id"], "name": row["name"],
            "email": row["email"], "phone": row["phone"],
            "created_time": row["created_time"], "campaign_name": row["campaign_name"],
            "adset_name": row["adset_name"], "ad_name": row["ad_name"],
            "form_name": row["form_name"], "platform": row["platform"],
            "answers": row["answers"], "meta_account": meta_account.strip(),
            "updated_at": now_iso(),
        }
        if existing:
            # Garde la qualification/les notes déjà saisies — un réimport
            # (même export relancé, ou export qui chevauche le précédent)
            # ne doit jamais effacer le travail de qualification déjà fait.
            await db.meta_lead_imports.update_one({"id": existing["id"]}, {"$set": fields})
            updated += 1
        else:
            fields.update({
                "id": str(uuid.uuid4()), "qualification": "a_contacter",
                "notes": "", "inscription_id": None, "created_at": now_iso(),
            })
            await db.meta_lead_imports.insert_one(fields)
            imported += 1

    return {
        "imported": imported, "updated": updated,
        "skipped_duplicate_prospect": skipped_duplicate_prospect,
        "skipped_already_enrolled": skipped_already_enrolled,
        "skipped_no_contact": skipped_no_contact,
        "total_rows": len(rows),
    }


@router.get("")
async def list_meta_leads(
    qualification: Optional[str] = None,
    meta_account: Optional[str] = None,
    campaign_name: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    query = {}
    if qualification:
        query["qualification"] = qualification
    if meta_account:
        query["meta_account"] = meta_account
    if campaign_name:
        query["campaign_name"] = campaign_name
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.meta_lead_imports.find(query, {"_id": 0}).sort("created_time", -1).to_list(5000)
    accounts = sorted([a for a in await db.meta_lead_imports.distinct("meta_account") if a])
    campaigns = sorted([c for c in await db.meta_lead_imports.distinct("campaign_name") if c])
    return {
        "items": docs, "total": len(docs),
        "qualification_options": QUALIFICATION_LABELS,
        "account_options": accounts,
        "campaign_options": campaigns,
    }


@router.patch("/{lead_id}")
async def update_meta_lead(lead_id: str, payload: MetaLeadUpdate, user: dict = Depends(require_role(*ROLES_LEADS))):
    doc = await db.meta_lead_imports.find_one({"id": lead_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Lead introuvable")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not updates:
        return {**doc, "_id": None}
    if updates.get("qualification") and updates["qualification"] not in QUALIFICATION_LABELS:
        raise HTTPException(status_code=400, detail="Qualification inconnue")
    # Qui a traité ce lead en dernier — affiché en colonne "Traité par" côté
    # dashboard (Marketing.jsx), et tracé dans le journal d'activité pour
    # pouvoir reconstituer qui a fait avancer quoi.
    qualification_changed = "qualification" in updates and updates["qualification"] != doc.get("qualification")
    if qualification_changed:
        updates["qualified_by"] = user["id"]
        updates["qualified_by_name"] = user.get("name", "")
        updates["qualified_at"] = now_iso()
    updates["updated_at"] = now_iso()
    await db.meta_lead_imports.update_one({"id": lead_id}, {"$set": updates})
    if updates.get("qualification") == NO_RESPONSE_QUALIFICATION and doc.get("qualification") != NO_RESPONSE_QUALIFICATION:
        await send_no_response_followup(doc.get("name"), doc.get("email"))
    if qualification_changed:
        await log_action(user, "lead_qualifie", "meta_lead", lead_id, {
            "name": doc.get("name"), "qualification": updates["qualification"],
        })
        if updates["qualification"] == "inscrit":
            await send_push_to_users(
                [user["id"]], "🎉 Lead converti !",
                f"{doc.get('name') or 'Un prospect'} vient d'être marqué Inscrit — bravo !", "/admin/marketing",
            )
    doc = await db.meta_lead_imports.find_one({"id": lead_id}, {"_id": 0})
    return doc


@router.delete("/{lead_id}")
async def delete_meta_lead(lead_id: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    result = await db.meta_lead_imports.delete_one({"id": lead_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Lead introuvable")
    return {"ok": True}


@router.post("/{lead_id}/enroll")
async def enroll_meta_lead(lead_id: str, payload: MetaLeadEnrollIn, request: Request, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Le staff choisit la formation/session pour ce lead : inscription
    créée immédiatement (réutilise routers.inscriptions.create_inscription —
    même logique que le formulaire public : compte apprenant, dossier,
    carte Trello, email de confirmation générique). On envoie ensuite un
    second email, court, qui précise la session retenue (dates/lieu) —
    l'email générique de create_inscription ne les mentionne pas."""
    doc = await db.meta_lead_imports.find_one({"id": lead_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Lead introuvable")
    if not doc.get("email"):
        raise HTTPException(status_code=400, detail="Ce lead n'a pas d'email — inscription impossible")
    if doc.get("inscription_id"):
        raise HTTPException(status_code=409, detail="Ce lead est déjà inscrit")

    inscription_payload = InscriptionIn(
        formation_id=payload.formation_id,
        student_name=doc.get("name") or doc["email"].split("@")[0],
        student_email=doc["email"],
        student_phone=doc.get("phone") or None,
        stage_id=payload.stage_id,
        source="meta_lead_import",
        notes=f"Importé depuis Meta ({doc.get('meta_account', '')}) — campagne : {doc.get('campaign_name', '')}",
    )
    result = await create_inscription(inscription_payload, request)
    inscription = result["inscription"] if isinstance(result, dict) and "inscription" in result else result

    stage = await db.stages.find_one({"id": payload.stage_id}, {"_id": 0}) if payload.stage_id else None
    if stage:
        body = (
            f"<p>Bonjour {doc.get('name', '')},</p>"
            f"<p>Votre session est confirmée :</p>"
            f"<p><b>Du {format_date_long_fr(stage.get('date_debut', ''))} au {format_date_long_fr(stage.get('date_fin', ''))}</b>"
            f"{' — ' + stage['lieu_adresse'] if stage.get('lieu_adresse') else ''}"
            f"{' (' + stage['lieu_ville'] + ')' if stage.get('lieu_ville') else ''}</p>"
            "<p>TDL Formation</p>"
        )
        await send_email(doc["email"], "📅 Votre session est confirmée — TDL Formation", render_branded_email(body))

    await db.meta_lead_imports.update_one(
        {"id": lead_id},
        {"$set": {"qualification": "inscrit", "inscription_id": inscription.get("id") if isinstance(inscription, dict) else None, "updated_at": now_iso()}},
    )
    doc = await db.meta_lead_imports.find_one({"id": lead_id}, {"_id": 0})
    return doc
