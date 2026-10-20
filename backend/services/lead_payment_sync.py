"""Point d'écriture ajouté par la Phase 1 d'unification des prospects : met
à jour `montant_encaisse` et `statut="paye"` sur le lead lié à un paiement
réussi. Appelé depuis routers/payments.py (webhook Stripe, sur les DEUX
chemins : custom_payments et inscriptions), sans changer la logique du
webhook lui-même (voir demande du 2026-10-20, point 5).

`montant_encaisse` est toujours RECALCULÉ depuis les sources (jamais
incrémenté) : idempotent même si le webhook Stripe livre le même événement
plusieurs fois (retry), qui est un comportement Stripe documenté."""
from core.database import db
from core.utils import now_iso
from services.lead_migration import normalize_email, normalize_phone_e164_fr


async def _find_lead_id(lead_id: str = None, email: str = None, phone: str = None) -> str | None:
    if lead_id:
        lead = await db.leads.find_one({"id": lead_id}, {"_id": 0, "id": 1})
        if lead:
            return lead["id"]
        # lead_id peut historiquement pointer vers un ancien meta_lead_import
        # déjà fusionné — legacy_ids.meta_lead_imports permet de retrouver le
        # lead final après migration (voir migrate_leads_unified.py).
        lead = await db.leads.find_one({"legacy_ids.meta_lead_imports": lead_id}, {"_id": 0, "id": 1})
        if lead:
            return lead["id"]
    email_norm = normalize_email(email)
    phone_norm = normalize_phone_e164_fr(phone)
    query_or = []
    if email_norm:
        query_or.append({"email": {"$regex": f"^{email_norm}$", "$options": "i"}})
    if phone_norm:
        query_or.append({"phone": phone_norm})
    if not query_or:
        return None
    lead = await db.leads.find_one({"$or": query_or}, {"_id": 0, "id": 1})
    return lead["id"] if lead else None


async def sync_lead_payment(lead_id: str = None, email: str = None, phone: str = None) -> None:
    """Best-effort : un paiement doit toujours réussir côté Stripe/inscription
    même si aucun lead ne correspond (ex: paiement direct sans prospect
    d'origine) — ne lève jamais d'exception."""
    try:
        resolved_id = await _find_lead_id(lead_id, email, phone)
        if not resolved_id:
            return
        custom_total = 0.0
        async for p in db.custom_payments.find({"status": "paid"}, {"price": 1, "lead_id": 1}):
            if p.get("lead_id") == resolved_id:
                custom_total += p.get("price") or 0
        lead = await db.leads.find_one({"id": resolved_id}, {"_id": 0, "email": 1, "phone": 1})
        insc_total = 0.0
        if lead:
            query_or = []
            if lead.get("email"):
                query_or.append({"student_email": lead["email"]})
            if lead.get("phone"):
                query_or.append({"student_phone": lead["phone"]})
            if query_or:
                async for i in db.inscriptions.find({"$or": query_or, "payment_status": {"$in": ["paid", "cpf_valide"]}}, {"amount_paid": 1, "price": 1}):
                    insc_total += i.get("amount_paid") or i.get("price") or 0
        await db.leads.update_one(
            {"id": resolved_id},
            {"$set": {"montant_encaisse": custom_total + insc_total, "statut": "paye", "updated_at": now_iso()}},
        )
    except Exception:
        pass
