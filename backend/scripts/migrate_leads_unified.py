"""Migration Phase 1 — unification des prospects dans db.leads (voir demande
du 2026-10-20). Importe db.meta_lead_imports et db.callback_requests dans
db.leads, fusionne les doublons (même téléphone normalisé), calcule le
nouveau `statut` (priorité aux faits : paiement > inscription active > RDV
futur > injoignable après N relances, sinon correspondance de l'ancien
statut), et migre les références lead_id de db.call_appointments et
db.custom_payments vers l'id final.

N'écrit RIEN en base sans --apply. Par défaut (dry-run), produit un rapport
complet sans aucune modification. Idempotent : relancer avec --apply après
un premier passage ne crée pas de doublons (détecte via legacy_ids les
documents déjà importés) et ne touche jamais aux anciennes collections
(aucune suppression, jamais).

Usage :
    python scripts/migrate_leads_unified.py                  # dry-run, rapport seulement
    python scripts/migrate_leads_unified.py --apply           # écrit réellement (sauvegarde d'abord)
    python scripts/migrate_leads_unified.py --report-file out.json
"""
import argparse
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import db
from services.lead_migration import (
    normalize_phone_e164_fr, normalize_email, is_test_record, pick_legacy_value,
    map_legacy_status, status_from_facts, relancer_le_from_days, merge_duplicate_docs,
)

BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "migration_backups")
_ORIGIN_PRIORITY = {"leads": 0, "meta_lead_imports": 1, "callback_requests": 2}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def _backup_collections(tag: str) -> str:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    for name in ["leads", "meta_lead_imports", "callback_requests", "call_appointments", "custom_payments"]:
        docs = await db[name].find({}).to_list(200000)
        for d in docs:
            d["_id"] = str(d["_id"])
        path = os.path.join(BACKUP_DIR, f"{tag}_{name}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(docs, f, ensure_ascii=False, default=str)
        print(f"  Sauvegarde {name} : {len(docs)} document(s) -> {path}")
    return BACKUP_DIR


async def _build_fact_indices():
    """Index par id legacy (lead OU meta_lead_import — custom_payments.lead_id
    et call_appointments.lead_id pointent indifféremment vers l'un ou
    l'autre, voir état des lieux) des faits qui priment sur l'ancien statut."""
    paid_ids = set()
    async for p in db.custom_payments.find({"status": "paid"}, {"lead_id": 1}):
        if p.get("lead_id"):
            paid_ids.add(p["lead_id"])

    future_appt_ids = set()
    now = now_iso()
    async for a in db.call_appointments.find({"scheduled_at": {"$gt": now}, "status": {"$nin": ["annule", "traite"]}}, {"lead_id": 1}):
        if a.get("lead_id"):
            future_appt_ids.add(a["lead_id"])

    active_insc_emails, active_insc_phones = set(), set()
    paid_insc_emails, paid_insc_phones = set(), set()
    async for i in db.inscriptions.find({}, {"status": 1, "payment_status": 1, "student_email": 1, "student_phone": 1}):
        email = normalize_email(i.get("student_email"))
        phone = normalize_phone_e164_fr(i.get("student_phone"))
        if i.get("status") == "active":
            if email: active_insc_emails.add(email)
            if phone: active_insc_phones.add(phone)
        if i.get("payment_status") in ("paid", "cpf_valide"):
            if email: paid_insc_emails.add(email)
            if phone: paid_insc_phones.add(phone)

    relance_counts = defaultdict(int)
    async for c in db.commercial_calls.aggregate([{"$group": {"_id": "$lead_id", "count": {"$sum": 1}}}]):
        relance_counts[c["_id"]] = c["count"]

    return {
        "paid_ids": paid_ids, "future_appt_ids": future_appt_ids,
        "active_insc_emails": active_insc_emails, "active_insc_phones": active_insc_phones,
        "paid_insc_emails": paid_insc_emails, "paid_insc_phones": paid_insc_phones,
        "relance_counts": relance_counts,
    }


def _compute_statut_fields(doc: dict, origin: str, facts: dict, report: dict) -> dict:
    doc_id = doc["id"]
    email = normalize_email(doc.get("email"))
    phone = normalize_phone_e164_fr(doc.get("phone") or doc.get("telephone"))

    has_paid = doc_id in facts["paid_ids"] or (email and email in facts["paid_insc_emails"]) or (phone and phone in facts["paid_insc_phones"])
    has_active_insc = (email and email in facts["active_insc_emails"]) or (phone and phone in facts["active_insc_phones"])
    has_future_appt = doc_id in facts["future_appt_ids"]
    relance_count = facts["relance_counts"].get(doc_id, 0) + (doc.get("relance_count") or 0)

    fact_result = status_from_facts(has_paid, has_active_insc, has_future_appt, relance_count)
    if fact_result:
        report["facts_determined"] += 1
        return {**fact_result, "relancer_le": None, "_via": "fact"}

    legacy_value, legacy_field, conflict, candidates = pick_legacy_value(doc)
    if conflict:
        report["conflicts"].append({"id": doc_id, "origin": origin, "candidates": candidates, "chosen_field": legacy_field, "chosen_value": legacy_value})
    mapped = map_legacy_status(legacy_value) if legacy_value else {"statut": "a_contacter", "chaleur": "froid", "motif_cloture": None, "relancer_le_jours": None}
    return {
        "statut": mapped["statut"], "chaleur": mapped["chaleur"], "motif_cloture": mapped["motif_cloture"],
        "relancer_le": relancer_le_from_days(mapped["relancer_le_jours"]), "_via": "legacy",
    }


async def run(apply: bool, report_file: str = None):
    report = {
        "started_at": now_iso(), "apply": apply,
        "counts_by_legacy_to_new": defaultdict(int),
        "facts_determined": 0,
        "auto_merged_duplicates": 0,
        "manual_review_same_email_diff_phone": [],
        "conflicts": [],
        "test_records_detected": 0,
        "appointments_migrated": 0, "appointments_orphaned": 0,
        "payments_migrated": 0, "payments_orphaned": 0,
        "new_leads_from_meta": 0, "new_leads_from_callback": 0,
        "skipped_already_migrated": 0,
        "total_leads_before": 0, "total_leads_after": 0,
    }

    backup_path = None
    if apply:
        print("Sauvegarde des collections avant écriture...")
        backup_path = await _backup_collections(datetime.now().strftime("%Y%m%d_%H%M%S"))

    facts = await _build_fact_indices()

    leads_docs = await db.leads.find({}).to_list(200000)
    meta_docs = await db.meta_lead_imports.find({}).to_list(200000)
    callback_docs = await db.callback_requests.find({}).to_list(200000)
    report["total_leads_before"] = len(leads_docs)

    # id -> id des documents déjà migrés (idempotence) : un lead qui porte déjà
    # legacy_ids.meta_lead_imports / callback_requests == doc.id a déjà été importé.
    already_imported_meta_ids = set()
    already_imported_callback_ids = set()
    for ld in leads_docs:
        legacy = ld.get("legacy_ids") or {}
        if legacy.get("meta_lead_imports"):
            already_imported_meta_ids.add(legacy["meta_lead_imports"])
        if legacy.get("callback_requests"):
            already_imported_callback_ids.add(legacy["callback_requests"])

    # ── Normalisation + enrichissement de chaque document source ───────────
    def prep(doc, origin):
        email = normalize_email(doc.get("email"))
        phone = normalize_phone_e164_fr(doc.get("phone") or doc.get("telephone"))
        name = doc.get("name") or f"{doc.get('prenom', '')} {doc.get('nom', '')}".strip()
        statut_fields = _compute_statut_fields(doc, origin, facts, report)
        legacy_value, _, _, _ = pick_legacy_value(doc) if origin != "meta_lead_imports" else (doc.get("qualification"), "qualification", False, [])
        report["counts_by_legacy_to_new"][f"{legacy_value or '(aucun)'} -> {statut_fields['statut']}"] += 1
        is_test = is_test_record(name, doc.get("email"))
        if is_test:
            report["test_records_detected"] += 1
        prepped = {
            "id": doc["id"], "_origin": origin,
            "name": name, "email": doc.get("email"), "phone": doc.get("phone") or doc.get("telephone"),
            "_email_norm": email, "_phone_norm": phone,
            "interest": doc.get("interest") or doc.get("form_name") or doc.get("session"),
            "notes": doc.get("notes") or doc.get("message"),
            "source": doc.get("source") or origin,
            "sources": [{"leads": doc.get("source") or "manuel", "meta_lead_imports": "meta", "callback_requests": "landing_rappel"}[origin]],
            "compte_meta": doc.get("meta_account"),
            "campagne": doc.get("campaign") or doc.get("campaign_name"),
            "category": doc.get("category") or doc.get("interest"),
            "created_at": doc.get("created_at"), "updated_at": doc.get("updated_at") or doc.get("created_at"),
            "is_test": is_test,
            "statut": statut_fields["statut"], "chaleur": statut_fields["chaleur"],
            "motif_cloture": statut_fields["motif_cloture"], "relancer_le": statut_fields["relancer_le"],
        }
        return prepped

    prepped_leads = [prep(d, "leads") for d in leads_docs]
    prepped_meta = [prep(d, "meta_lead_imports") for d in meta_docs if d["id"] not in already_imported_meta_ids]
    prepped_callback = [prep(d, "callback_requests") for d in callback_docs if d["id"] not in already_imported_callback_ids]
    report["skipped_already_migrated"] = (len(meta_docs) - len(prepped_meta)) + (len(callback_docs) - len(prepped_callback))

    all_docs = prepped_leads + prepped_meta + prepped_callback

    # ── Dédoublonnage par téléphone normalisé ───────────────────────────────
    by_phone = defaultdict(list)
    no_phone = []
    for d in all_docs:
        if d["_phone_norm"]:
            by_phone[d["_phone_norm"]].append(d)
        else:
            no_phone.append(d)

    final_groups = []  # chaque groupe = liste de docs à fusionner en 1 lead
    for phone, group in by_phone.items():
        final_groups.append(group)
        if len(group) > 1:
            report["auto_merged_duplicates"] += len(group) - 1
    for d in no_phone:
        final_groups.append([d])

    # Même email mais téléphone différent (dans des groupes distincts) :
    # signalé pour vérification manuelle, jamais fusionné automatiquement.
    by_email_across_groups = defaultdict(set)
    for gi, group in enumerate(final_groups):
        for d in group:
            if d["_email_norm"]:
                by_email_across_groups[d["_email_norm"]].add(gi)
    for email, group_indices in by_email_across_groups.items():
        if len(group_indices) <= 1:
            continue
        docs_involved = [d for gi in group_indices for d in final_groups[gi]]
        # Un vrai conflit "même email, téléphone différent" exige qu'au moins
        # deux documents impliqués aient CHACUN un téléphone normalisé réel
        # (et différent) — deux fiches sans téléphone du tout ne sont pas un
        # conflit, juste deux groupes à un seul document faute de téléphone.
        distinct_phones = {d["_phone_norm"] for d in docs_involved if d["_phone_norm"]}
        if len(distinct_phones) < 2:
            continue
        report["manual_review_same_email_diff_phone"].append({
            "email": email,
            "documents": [{"id": d["id"], "origin": d["_origin"], "phone": d["phone"], "name": d["name"]} for d in docs_involved],
        })

    # ── Fusion de chaque groupe en un document lead final ───────────────────
    final_leads = []
    for group in final_groups:
        sorted_group = sorted(group, key=lambda d: _ORIGIN_PRIORITY.get(d["_origin"], 9))
        merged = merge_duplicate_docs(sorted_group)
        merged.pop("_email_norm", None)
        merged.pop("_phone_norm", None)
        merged.pop("_origin", None)
        # Le statut final suit le document de plus haut rang parmi le
        # groupe (le plus avancé dans le parcours l'emporte), pas
        # simplement le plus récent, pour ne jamais faire régresser un
        # prospect déjà inscrit/payé à cause d'un doublon plus ancien.
        _STATUT_RANK = {"a_contacter": 0, "a_relancer": 1, "rendez_vous": 2, "non_interesse": 1, "injoignable": 1, "inscrit": 3, "paye": 4}
        best = max(group, key=lambda d: _STATUT_RANK.get(d["statut"], 0))
        merged["statut"] = best["statut"]
        merged["chaleur"] = best["chaleur"]
        merged["motif_cloture"] = best["motif_cloture"]
        merged["relancer_le"] = best["relancer_le"]
        merged["is_test"] = any(d["is_test"] for d in group)
        final_leads.append((group, merged))

    report["total_leads_after"] = len(final_leads)
    report["new_leads_from_meta"] = sum(1 for group, _ in final_leads if any(d["_origin"] == "meta_lead_imports" for d in group) and not any(d["_origin"] == "leads" for d in group))
    report["new_leads_from_callback"] = sum(1 for group, _ in final_leads if any(d["_origin"] == "callback_requests" for d in group) and not any(d["_origin"] in ("leads", "meta_lead_imports") for d in group))

    # ── Écriture (uniquement si --apply) ────────────────────────────────────
    legacy_to_final_lead_id = {}  # id legacy (lead ou meta) -> id lead final
    if apply:
        for group, merged in final_leads:
            existing_lead_doc = next((d for d in group if d["_origin"] == "leads"), None)
            final_id = existing_lead_doc["id"] if existing_lead_doc else str(uuid.uuid4())
            update_fields = {
                "statut": merged["statut"], "chaleur": merged["chaleur"], "motif_cloture": merged["motif_cloture"],
                "relancer_le": merged["relancer_le"], "is_test": merged["is_test"],
                "sources": merged.get("sources", []), "legacy_ids": merged.get("legacy_ids", {}),
                "compte_meta": merged.get("compte_meta"), "campagne": merged.get("campagne"),
                "updated_at": now_iso(),
            }
            if existing_lead_doc:
                await db.leads.update_one({"id": final_id}, {"$set": {k: v for k, v in update_fields.items() if v is not None or k in ("statut", "chaleur", "motif_cloture", "relancer_le")}})
            else:
                new_doc = {
                    "id": final_id, "name": merged.get("name") or "Prospect sans nom",
                    "email": merged.get("email"), "phone": merged.get("phone"),
                    "interest": merged.get("interest") or "", "notes": merged.get("notes") or "",
                    "tags": [], "contacted": False, "source": merged.get("source") or "manuel",
                    "category": merged.get("category"), "created_at": merged.get("created_at") or now_iso(),
                    **update_fields,
                }
                await db.leads.insert_one(new_doc)
            for d in group:
                if d["_origin"] in ("leads", "meta_lead_imports"):
                    legacy_to_final_lead_id[d["id"]] = final_id

        # Migration des références lead_id des rendez-vous et paiements
        # personnalisés vers l'id du lead final (jamais de suppression).
        async for appt in db.call_appointments.find({}, {"id": 1, "lead_id": 1}):
            new_id = legacy_to_final_lead_id.get(appt.get("lead_id"))
            if new_id and new_id != appt.get("lead_id"):
                await db.call_appointments.update_one({"id": appt["id"]}, {"$set": {"lead_id": new_id, "legacy_lead_id": appt.get("lead_id")}})
                report["appointments_migrated"] += 1
            elif not new_id:
                report["appointments_orphaned"] += 1
        async for pay in db.custom_payments.find({}, {"id": 1, "lead_id": 1}):
            if not pay.get("lead_id"):
                continue
            new_id = legacy_to_final_lead_id.get(pay["lead_id"])
            if new_id and new_id != pay.get("lead_id"):
                await db.custom_payments.update_one({"id": pay["id"]}, {"$set": {"lead_id": new_id, "legacy_lead_id": pay.get("lead_id")}})
                report["payments_migrated"] += 1
            elif not new_id:
                report["payments_orphaned"] += 1
    else:
        # En dry-run, on compte quand même les migrations/orphelins prévus,
        # sans rien écrire, pour que le rapport soit complet.
        tentative_map = {}
        for group, merged in final_leads:
            existing_lead_doc = next((d for d in group if d["_origin"] == "leads"), None)
            final_id = existing_lead_doc["id"] if existing_lead_doc else "(nouveau)"
            for d in group:
                if d["_origin"] in ("leads", "meta_lead_imports"):
                    tentative_map[d["id"]] = final_id
        async for appt in db.call_appointments.find({}, {"lead_id": 1}):
            if appt.get("lead_id") in tentative_map:
                report["appointments_migrated"] += 1
            else:
                report["appointments_orphaned"] += 1
        async for pay in db.custom_payments.find({}, {"lead_id": 1}):
            if not pay.get("lead_id"):
                continue
            if pay.get("lead_id") in tentative_map:
                report["payments_migrated"] += 1
            else:
                report["payments_orphaned"] += 1

    report["counts_by_legacy_to_new"] = dict(report["counts_by_legacy_to_new"])
    report["finished_at"] = now_iso()
    report["backup_path"] = backup_path

    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    if report_file:
        with open(report_file, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False, default=str)
        print(f"\nRapport écrit dans {report_file}")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="écrit réellement en base (sauvegarde d'abord) — sans ce flag, dry-run seul")
    parser.add_argument("--report-file", default=None, help="chemin où écrire le rapport JSON en plus de la sortie console")
    args = parser.parse_args()
    asyncio.run(run(apply=args.apply, report_file=args.report_file))
