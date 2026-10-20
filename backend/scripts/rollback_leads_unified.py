"""Retour en arrière de migrate_leads_unified.py --apply : restaure les 5
collections (leads, meta_lead_imports, callback_requests, call_appointments,
custom_payments) depuis la sauvegarde JSON produite au moment de la
migration. N'efface la base qu'après confirmation explicite.

Usage :
    python scripts/rollback_leads_unified.py migration_backups/20261020_143000
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import db

COLLECTIONS = ["leads", "meta_lead_imports", "callback_requests", "call_appointments", "custom_payments"]


async def rollback(tag_path_prefix: str, confirm: bool):
    backup_dir = os.path.dirname(tag_path_prefix)
    tag = os.path.basename(tag_path_prefix)
    for name in COLLECTIONS:
        path = os.path.join(backup_dir, f"{tag}_{name}.json")
        if not os.path.exists(path):
            print(f"  ! Sauvegarde introuvable pour {name} ({path}) — ignoré")
            continue
        with open(path, encoding="utf-8") as f:
            docs = json.load(f)
        for d in docs:
            d.pop("_id", None)
        if not confirm:
            print(f"  {name} : {len(docs)} document(s) seraient restaurés (remplacement complet)")
            continue
        await db[name].delete_many({})
        if docs:
            await db[name].insert_many(docs)
        print(f"  {name} : {len(docs)} document(s) restaurés")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    tag_path_prefix = sys.argv[1]
    confirm = "--confirm" in sys.argv
    if not confirm:
        print("Mode aperçu (ajoutez --confirm pour restaurer réellement) :\n")
    asyncio.run(rollback(tag_path_prefix, confirm))
