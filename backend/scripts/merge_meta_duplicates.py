"""Doublons de l'onglet Prospects Meta (demande du 2026-11-03) : un prospect
repris de db.meta_lead_imports lors de la Phase 1 (2026-10-20) existe aussi
dans db.leads, et les agents ont parfois continué à travailler sur l'ancienne
ligne. Règle voulue : garder la version modifiée par un agent.

L'ancienne ligne l'emporte seulement si un agent l'a modifiée APRÈS la
migration (avant, la migration avait déjà repris son contenu) et plus
récemment que la copie. Ses champs de suivi (qualification, notes, qui/quand,
relances) sont alors recopiés sur la fiche Prospects, qui reste la seule
version. Un statut posé d'après les faits (payé, inscrit) n'est jamais
rétrogradé. L'onglet n'affiche ensuite plus que la fiche Prospects (voir
routers/meta_lead_import.py) ; l'ancienne collection n'est pas modifiée.

Usage (depuis backend/) :
    python scripts/merge_meta_duplicates.py           # simulation, n'écrit rien
    python scripts/merge_meta_duplicates.py --apply   # sauvegarde puis écrit
"""
import asyncio
import json
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from motor.motor_asyncio import AsyncIOMotorClient

from services.lead_migration import map_legacy_status, statut_to_qualification

MIGRATION_CUTOFF = "2026-10-20T09:00:00+00:00"
FACT_STATUTS = ("paye", "inscrit")
_AGENT_TIMES = ("qualified_at", "notes_updated_at")
_FOLLOW_UP_FIELDS = (
    "notes", "notes_history", "notes_updated_at", "notes_updated_by", "notes_updated_by_name",
    "qualified_at", "qualified_by", "qualified_by_name",
)


def agent_time(doc: dict) -> str:
    return max((doc.get(k) or "" for k in _AGENT_TIMES), default="")


def legacy_wins(old: dict, copy: dict) -> bool:
    old_time = agent_time(old)
    return bool(old_time) and old_time > max(MIGRATION_CUTOFF, agent_time(copy))


def merged_fields(old: dict, copy: dict) -> dict:
    fields = {k: old[k] for k in _FOLLOW_UP_FIELDS if old.get(k) is not None}
    fields["relance_count"] = max(old.get("relance_count") or 0, copy.get("relance_count") or 0)
    if old.get("inscription_id") and not copy.get("inscription_id"):
        fields["inscription_id"] = old["inscription_id"]
    if old.get("qualification") and copy.get("statut") not in FACT_STATUTS:
        mapped = map_legacy_status(old["qualification"])
        fields.update({"statut": mapped["statut"], "chaleur": mapped["chaleur"], "motif_cloture": mapped["motif_cloture"]})
        if mapped["relancer_le_jours"]:
            base = datetime.fromisoformat((old.get("qualified_at") or old["updated_at"]).replace("Z", "+00:00"))
            fields["relancer_le"] = (base + timedelta(days=mapped["relancer_le_jours"])).isoformat()
    return fields


async def main(apply: bool) -> None:
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    legacy = {d["id"]: d async for d in db.meta_lead_imports.find({}, {"_id": 0})}
    copies = await db.leads.find({"legacy_ids.meta_lead_imports": {"$in": list(legacy)}}, {"_id": 0}).to_list(100000)

    report = Counter()
    changes = []
    for copy in copies:
        old = legacy[copy["legacy_ids"]["meta_lead_imports"]]
        if not legacy_wins(old, copy):
            report["copie Prospects gardée telle quelle"] += 1
            continue
        fields = merged_fields(old, copy)
        before = statut_to_qualification(copy)
        after = statut_to_qualification({**copy, **fields})
        report["ancienne ligne modifiée par un agent, reprise sur la fiche"] += 1
        if before != after:
            report[f"qualification {before} -> {after}"] += 1
        changes.append((copy, fields))

    for k, v in sorted(report.items()):
        print(f"  {k} : {v}")
    print(f"{len(copies)} doublon(s), {len(changes)} fiche(s) à mettre à jour.")
    if not apply:
        print("Simulation : rien n'a été écrit (ajoutez --apply).")
        return

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = os.path.join(BACKEND_DIR, "migration_backups", f"{stamp}_meta_duplicates_leads_before.json")
    with open(backup, "w", encoding="utf-8") as f:
        json.dump([c for c, _ in changes], f, ensure_ascii=False, indent=1, default=str)
    for copy, fields in changes:
        await db.leads.update_one({"id": copy["id"]}, {"$set": {**fields, "meta_duplicate_merged_at": datetime.now(timezone.utc).isoformat()}})
    print(f"Écrit en base. Sauvegarde des fiches avant modification : {backup}")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
