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
from typing import Any, Dict, Optional

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
from routers.leads import _category_for_interest
from services.lead_migration import map_legacy_status


async def _get_lead_or_meta(lead_id: str):
    """Un `lead_id` de cet onglet peut désormais vivre dans l'une ou l'autre
    collection selon qu'il a été importé avant ou après la Phase 1
    d'unification (2026-10-20) — voir _statut_to_qualification. Renvoie
    (nom_collection, document) ou (None, None)."""
    doc = await db.meta_lead_imports.find_one({"id": lead_id})
    if doc:
        return "meta_lead_imports", doc
    doc = await db.leads.find_one({"id": lead_id})
    if doc:
        return "leads", doc
    return None, None

router = APIRouter(prefix="/meta-lead-import", tags=["meta-lead-import"])

# Déduction de la ville depuis le nom du formulaire/de la campagne Meta (qui
# mentionne généralement la ville) — même logique que l'ancien calcul client
# (Marketing.jsx:metaVille), reprise ici côté serveur depuis que l'import
# écrit directement dans db.leads (Phase 1 d'unification des prospects,
# 2026-10-20) : les nouveaux imports Meta doivent atterrir directement dans
# Prospects avec ville/catégorie déjà déduites, pas seulement dans l'ancienne
# collection db.meta_lead_imports qui devient legacy.
# Correspondance inverse approximative statut (unifié, db.leads) ->
# qualification (vocabulaire historique affiché dans cet onglet) — stop-gap
# le temps de la refonte de la page Prospects (voir demande du 2026-10-21) :
# les nouveaux imports Meta écrivent directement dans db.leads (statut
# unifié) depuis la Phase 1, mais cet onglet encore utilisé quotidiennement
# par les employés doit continuer à les afficher avec le même vocabulaire.
def _statut_to_qualification(lead: dict) -> str:
    statut = lead.get("statut")
    motif = lead.get("motif_cloture")
    if statut == "non_interesse":
        if motif in ("plus_interesse", "non_qualifie"):
            return motif
        return "non_qualifie"
    return {
        "a_contacter": "a_contacter", "a_relancer": "a_relancer", "rendez_vous": "a_relancer",
        "inscrit": "inscrit", "paye": "inscrit", "injoignable": "pas_de_reponse",
    }.get(statut, "a_contacter")


def _meta_ville(form_name: str, campaign_name: str) -> Optional[str]:
    text = f"{form_name or ''} {campaign_name or ''}".upper()
    if "EPINAY" in text or "ÉPINAY" in text:
        return "Épinay-sur-Seine"
    if "CREIL" in text:
        return "Creil"
    return None

QUALIFICATION_LABELS = {
    "a_contacter": "À contacter",
    "non_qualifie": "Prospect non qualifié",
    "interesse": "Intéressé",
    "pas_de_reponse": "Pas de réponse",
    "a_relancer": "À relancer",
    # Cas récupération de points : un seul stage autorisé par an, donc un
    # prospect qui vient d'en faire un ne peut être réinscrit avant un an.
    "a_relancer_1_an": "À relancer dans 1 an",
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
    depuis lequel on a exporté).

    Écrit directement dans db.leads (Prospects) depuis la Phase 1
    d'unification du 2026-10-20 — auparavant écrivait dans la collection à
    part db.meta_lead_imports, désormais legacy (toujours lisible via GET
    ci-dessous pour les anciens imports, mais plus alimentée). Ville et
    catégorie de formation sont déduites du nom du formulaire/de la
    campagne, comme le faisait l'ancien calcul client (voir _meta_ville/
    _category_for_interest) — même dynamique, juste calculée à l'import
    plutôt qu'à l'affichage."""
    if not meta_account.strip():
        raise HTTPException(status_code=400, detail="Le compte Meta est requis")
    data = await file.read()
    try:
        rows = _parse_csv(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV illisible : {e}")

    imported, updated, skipped_already_enrolled, skipped_no_contact = 0, 0, 0, 0
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

        ville = _meta_ville(row["form_name"], row["campaign_name"])
        category = _category_for_interest(row["form_name"]) or _category_for_interest(row["campaign_name"])
        meta_details = {
            "meta_lead_id": row["meta_lead_id"], "created_time": row["created_time"],
            "adset_name": row["adset_name"], "ad_name": row["ad_name"],
            "form_name": row["form_name"], "platform": row["platform"], "answers": row["answers"],
        }

        # Déjà un prospect connu (Prospects/db.leads, même email ou
        # téléphone) ? Un seul endroit où le gérer — on enrichit sa fiche
        # (compte/campagne Meta, ville/catégorie si absentes) au lieu de le
        # réimporter à côté.
        existing = await db.leads.find_one(contact_filter, {"_id": 0})
        if existing:
            update_fields = {
                "meta_account": meta_account.strip(), "campaign_name": row["campaign_name"],
                "meta_details": meta_details, "updated_at": now_iso(),
            }
            if ville and not existing.get("ville"):
                update_fields["ville"] = ville
            if category and not existing.get("category"):
                update_fields["category"] = category
            if "meta" not in (existing.get("sources") or []):
                update_fields["sources"] = list({*(existing.get("sources") or []), "meta"})
            await db.leads.update_one({"id": existing["id"]}, {"$set": update_fields})
            updated += 1
        else:
            lead = {
                "id": str(uuid.uuid4()), "name": row["name"] or row["email"] or row["phone"] or "Lead Meta",
                "email": row["email"] or None, "phone": row["phone"] or None,
                "interest": row["form_name"], "notes": "", "tags": [], "contacted": False,
                "source": "meta", "sources": ["meta"], "category": category, "ville": ville,
                "meta_account": meta_account.strip(), "campagne": row["campaign_name"], "campaign_name": row["campaign_name"],
                "meta_details": meta_details, "from_meta_ads": True,
                "statut": "a_contacter", "chaleur": "froid", "motif_cloture": None, "relancer_le": None,
                "is_test": False, "created_at": now_iso(), "updated_at": now_iso(),
            }
            await db.leads.insert_one(lead)
            imported += 1

    return {
        "imported": imported, "updated": updated,
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

    # Depuis la Phase 1 (2026-10-20), les NOUVEAUX imports Meta écrivent
    # directement dans db.leads plutôt que dans cette collection legacy —
    # sans ce bloc, l'onglet "Prospects Meta" (toujours utilisé au quotidien)
    # cesserait de montrer les imports les plus récents. On les rapatrie ici
    # avec les mêmes noms de champs que l'ancien format.
    leads_query: Dict[str, Any] = {"$or": [{"source": "meta"}, {"sources": "meta"}]}
    if meta_account:
        leads_query["$and"] = leads_query.get("$and", []) + [{"$or": [{"meta_account": meta_account}, {"compte_meta": meta_account}]}]
    if campaign_name:
        leads_query["$and"] = leads_query.get("$and", []) + [{"$or": [{"campaign_name": campaign_name}, {"campagne": campaign_name}]}]
    if search:
        leads_query["$and"] = leads_query.get("$and", []) + [{"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]}]
    from_leads = await db.leads.find(leads_query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    for lead in from_leads:
        lead_qualification = _statut_to_qualification(lead)
        if qualification and lead_qualification != qualification:
            continue
        docs.append({
            **lead,
            "qualification": lead_qualification,
            "meta_account": lead.get("meta_account") or lead.get("compte_meta"),
            "campaign_name": lead.get("campaign_name") or lead.get("campagne"),
            "created_time": lead.get("created_at"),
            "relance_count": lead.get("relance_count") or 0,
            "_from_leads": True,
        })
    docs.sort(key=lambda d: d.get("created_time") or "", reverse=True)

    for d in docs:
        # Même logique que routers/leads.py::list_leads — un lead déjà
        # qualifié avant la mise en place du compteur a forcément été traité
        # au moins une fois, "0 relance" ne doit s'afficher que pour "à
        # contacter" (jamais touché).
        if not d.get("relance_count") and d.get("qualification") not in (None, "", "a_contacter"):
            d["relance_count"] = 1

    # Statut de paiement — d'abord via `inscription_id` (lien posé par
    # POST /{lead_id}/enroll), et à défaut par email, pour aussi retrouver
    # une inscription/un paiement créé par un AUTRE canal que le bouton
    # "Inscrire" de ce tableau (ex: la personne s'est finalement inscrite
    # elle-même sur le site public) — sinon "a-t-il payé ?" resterait
    # invisible ici alors que l'argent est bien rentré.
    insc_ids = [d["inscription_id"] for d in docs if d.get("inscription_id")]
    emails = [d["email"] for d in docs if d.get("email") and not d.get("inscription_id")]
    inscriptions = await db.inscriptions.find(
        {"$or": [{"id": {"$in": insc_ids}}, {"student_email": {"$in": emails}}]} if (insc_ids or emails) else {"id": "__none__"},
        {"_id": 0, "id": 1, "student_email": 1, "payment_status": 1, "price": 1, "amount_paid": 1, "paid_at": 1, "formation_title": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(2000)
    by_id = {i["id"]: i for i in inscriptions}
    by_email: Dict[str, dict] = {}
    for i in inscriptions:
        by_email.setdefault(i["student_email"], i)  # le plus récent d'abord (tri ci-dessus)

    # Un lien de paiement envoyé depuis CE tableau (bouton "Envoyer un lien de
    # paiement", voir SendPaymentLinkDialog.jsx -> POST /custom-payments) n'est
    # PAS une inscription — son statut ("pending"/"paid") vit dans sa propre
    # collection, mise à jour en temps réel par le webhook Stripe (voir
    # routers/payments.py). Sans ce second lookup, un lien de paiement envoyé
    # puis payé restait invisible ici tant que personne ne l'inscrivait "en dur".
    lead_ids = [d["id"] for d in docs]
    custom_payments = await db.custom_payments.find(
        {"lead_id": {"$in": lead_ids}}, {"_id": 0, "lead_id": 1, "status": 1, "price": 1, "paid_at": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(2000)
    by_lead_id: Dict[str, dict] = {}
    for cp in custom_payments:
        by_lead_id.setdefault(cp["lead_id"], cp)  # le plus récent d'abord (tri ci-dessus)

    for d in docs:
        cp = by_lead_id.get(d["id"])
        insc = by_id.get(d.get("inscription_id")) or by_email.get(d.get("email"))
        if cp:
            d["payment_status"] = cp.get("status")
            d["paid"] = cp.get("status") == "paid"
            d["amount_paid"] = cp.get("price") if cp.get("status") == "paid" else None
            d["price"] = cp.get("price")
            d["paid_at"] = cp.get("paid_at")
            d["payment_link_sent_at"] = cp.get("created_at")
            continue
        d["payment_status"] = insc.get("payment_status") if insc else None
        d["paid"] = insc.get("payment_status") in ("paid", "cpf_valide") if insc else False
        d["amount_paid"] = insc.get("amount_paid") if insc else None
        d["price"] = insc.get("price") if insc else None
        d["paid_at"] = insc.get("paid_at") if insc else None
        if insc and not d.get("inscription_id"):
            d["inscription_id"] = insc["id"]
            d["inscription_formation_title"] = insc.get("formation_title")

    leads_meta_filter = {"$or": [{"source": "meta"}, {"sources": "meta"}]}
    accounts = sorted({
        *[a for a in await db.meta_lead_imports.distinct("meta_account") if a],
        *[a for a in await db.leads.distinct("meta_account", leads_meta_filter) if a],
        *[a for a in await db.leads.distinct("compte_meta", leads_meta_filter) if a],
    })
    campaigns = sorted({
        *[c for c in await db.meta_lead_imports.distinct("campaign_name") if c],
        *[c for c in await db.leads.distinct("campaign_name", leads_meta_filter) if c],
        *[c for c in await db.leads.distinct("campagne", leads_meta_filter) if c],
    })
    return {
        "items": docs, "total": len(docs),
        "qualification_options": QUALIFICATION_LABELS,
        "account_options": accounts,
        "campaign_options": campaigns,
    }


@router.patch("/{lead_id}")
async def update_meta_lead(lead_id: str, payload: MetaLeadUpdate, user: dict = Depends(require_role(*ROLES_LEADS))):
    collection_name, doc = await _get_lead_or_meta(lead_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Lead introuvable")
    collection = db[collection_name]
    if collection_name == "leads":
        # Vocabulaire affiché ("qualification") -> champs unifiés réels sur
        # le lead (statut/chaleur/motif_cloture) — voir services.
        # lead_migration.map_legacy_status, même correspondance que la
        # migration initiale.
        doc = {**doc, "qualification": _statut_to_qualification(doc)}
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
    # Horodatage de la note (même logique que routers/leads.py::update_lead) —
    # savoir quand une note a été écrite, et par qui, compte autant que son
    # contenu pour un bon suivi commercial.
    notes_changed = "notes" in updates and updates["notes"] != (doc.get("notes") or "")
    if notes_changed:
        updates["notes_updated_at"] = now_iso()
        updates["notes_updated_by"] = user["id"]
        updates["notes_updated_by_name"] = user.get("name", "")
    updates["updated_at"] = now_iso()
    # Nombre de fois où ce prospect a été recontacté/retraité — pas de journal
    # d'appels dédié pour les leads Meta (contrairement à db.commercial_calls
    # pour Prospects/Cosmosia), donc chaque changement de qualification ou
    # nouvelle note sert ici de proxy fiable à un suivi réel.
    inc = {}
    if qualification_changed or notes_changed:
        inc["relance_count"] = 1
    mongo_update = {"$set": updates}
    if inc:
        mongo_update["$inc"] = inc
    if notes_changed and updates["notes"]:
        # Historique des notes — voir routers/leads.py::update_lead pour la
        # même logique côté Prospects/Cosmosia.
        mongo_update["$push"] = {"notes_history": {
            "$each": [{"text": updates["notes"], "at": updates["notes_updated_at"], "by_name": user.get("name", "")}],
            "$slice": -20,
        }}
    if collection_name == "leads" and "qualification" in updates:
        # Traduit le vocabulaire affiché vers les champs unifiés réels —
        # sans ça, "qualification" s'écrirait sur le lead sans jamais être
        # relu (_statut_to_qualification ne regarde que statut/motif_cloture).
        mapped = map_legacy_status(updates.pop("qualification"))
        updates["statut"] = mapped["statut"]
        updates["chaleur"] = mapped["chaleur"]
        updates["motif_cloture"] = mapped["motif_cloture"]
    await collection.update_one({"id": lead_id}, mongo_update)
    if notes_changed:
        await log_action(user, "lead_note", "meta_lead", lead_id, {"name": doc.get("name"), "note": updates.get("notes")})
    if updates.get("qualification") == NO_RESPONSE_QUALIFICATION and doc.get("qualification") != NO_RESPONSE_QUALIFICATION:
        await send_no_response_followup(doc.get("name"), doc.get("email"))
    if qualification_changed:
        await log_action(user, "lead_qualifie", "meta_lead", lead_id, {
            "name": doc.get("name"), "qualification": payload.qualification,
        })
        if payload.qualification == "inscrit":
            await send_push_to_users(
                [user["id"]], "🎉 Lead converti !",
                f"{doc.get('name') or 'Un prospect'} vient d'être marqué Inscrit — bravo !", "/admin/marketing",
            )
    doc = await collection.find_one({"id": lead_id}, {"_id": 0})
    if collection_name == "leads" and doc:
        doc["qualification"] = _statut_to_qualification(doc)
    return doc


@router.delete("/{lead_id}")
async def delete_meta_lead(lead_id: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    collection_name, doc = await _get_lead_or_meta(lead_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Lead introuvable")
    await db[collection_name].delete_one({"id": lead_id})
    return {"ok": True}


@router.post("/{lead_id}/enroll")
async def enroll_meta_lead(lead_id: str, payload: MetaLeadEnrollIn, request: Request, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Le staff choisit la formation/session pour ce lead : inscription
    créée immédiatement (réutilise routers.inscriptions.create_inscription —
    même logique que le formulaire public : compte apprenant, dossier,
    carte Trello, email de confirmation générique). On envoie ensuite un
    second email, court, qui précise la session retenue (dates/lieu) —
    l'email générique de create_inscription ne les mentionne pas."""
    collection_name, doc = await _get_lead_or_meta(lead_id)
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
    # `from_meta_ads` n'est posé par create_inscription que si un cookie `fbc`
    # est transmis (cas du formulaire public avec tracking Pixel) — ici
    # l'inscription est créée côté serveur par un agent depuis un lead Meta
    # déjà confirmé (import Lead Ads), donc on force le marqueur pour que la
    # colonne "Origine" affiche bien "Pub Meta" et non "Site internet".
    if isinstance(inscription, dict) and inscription.get("id"):
        await db.inscriptions.update_one({"id": inscription["id"]}, {"$set": {"from_meta_ads": True}})

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

    inscription_id = inscription.get("id") if isinstance(inscription, dict) else None
    update_fields = {"inscription_id": inscription_id, "updated_at": now_iso()}
    if collection_name == "leads":
        update_fields["statut"] = "inscrit"
    else:
        update_fields["qualification"] = "inscrit"
    await db[collection_name].update_one({"id": lead_id}, {"$set": update_fields})
    doc = await db[collection_name].find_one({"id": lead_id}, {"_id": 0})
    if collection_name == "leads" and doc:
        doc["qualification"] = _statut_to_qualification(doc)
    return doc
