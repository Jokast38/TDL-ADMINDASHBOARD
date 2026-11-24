"""Réponses aux questions du formulaire Meta (demande du 2026-11-24) :
reprend, pour les prospects Meta qui ne les ont plus sur leur fiche
(meta_details.answers), les réponses gardées dans leur import CSV d'origine
(db.meta_lead_imports) — par lien direct (legacy_ids.meta_lead_imports),
sinon par email, sinon par téléphone.

N'écrase jamais des réponses déjà présentes ; ne touche ni aux notes ni au
reste de la fiche. Par défaut : simulation. Usage :
    python scripts/backfill_meta_answers.py            # simulation
    python scripts/backfill_meta_answers.py --apply    # écriture
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _answers(doc: dict) -> dict:
    return doc.get("answers") or (doc.get("meta_details") or {}).get("answers") or {}


async def main(apply: bool) -> None:
    from core.database import db
    from core.utils import now_iso

    leads = await db.leads.find({"$or": [{"source": "meta"}, {"sources": "meta"}, {"from_meta_ads": True},
                                         {"source": "meta_lead_imports"}]}, {"_id": 0}).to_list(50000)
    missing = [l for l in leads if not _answers(l)]
    imports = [i for i in await db.meta_lead_imports.find({}, {"_id": 0}).to_list(50000) if _answers(i)]
    by_id = {i["id"]: i for i in imports}
    by_email = {(i.get("email") or "").strip().lower(): i for i in imports if i.get("email")}
    by_phone = {i.get("phone"): i for i in imports if i.get("phone")}

    found = 0
    for lead in missing:
        src = by_id.get((lead.get("legacy_ids") or {}).get("meta_lead_imports")) \
            or by_email.get((lead.get("email") or "").strip().lower()) or by_phone.get(lead.get("phone"))
        if not src:
            continue
        found += 1
        details = dict(lead.get("meta_details") or {})
        details["answers"] = _answers(src)
        for k in ("form_name", "ad_name", "adset_name", "platform", "created_time"):
            if not details.get(k) and src.get(k):
                details[k] = src[k]
        details["answers_restored_at"] = now_iso()
        if apply:
            await db.leads.update_one({"id": lead["id"]}, {"$set": {"meta_details": details}})
    print(f"Prospects Meta : {len(leads)} · sans réponses : {len(missing)} · retrouvées : {found}"
          + (" — enregistrées" if apply else " — simulation, rien n'est écrit (--apply pour enregistrer)"))


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
