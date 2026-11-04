"""Recopie dans Supabase Storage les fichiers déposés chez Emergent avant le
2026-11-04 (voir core/storage.py). Parcourt tous les champs `*_path` de la
base ; un fichier déjà présent dans Supabase est ignoré, le script peut donc
être relancé.

Ne fonctionne que si EMERGENT_LLM_KEY est une clé active : au 2026-11-04,
Emergent la refuse ("key is not active") et les 161 fichiers concernés sont
illisibles.

Usage (depuis backend/) :
    python scripts/migrate_storage.py          # état : combien sont déjà dans Supabase
    python scripts/migrate_storage.py --copy   # recopie les fichiers manquants
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import db
from core.storage import _emergent_get, _supabase_get, _supabase_put, init_storage


def _paths(doc, out: set) -> None:
    if isinstance(doc, dict):
        for k, v in doc.items():
            if isinstance(v, str) and k.endswith("_path") and "/" in v:
                out.add(v)
            else:
                _paths(v, out)
    elif isinstance(doc, list):
        for v in doc:
            _paths(v, out)


async def main(copy: bool) -> None:
    paths = set()
    for name in await db.list_collection_names():
        async for doc in db[name].find({}, {"_id": 0}):
            _paths(doc, paths)

    if copy and not init_storage():
        print("Clé Emergent refusée : impossible de relire les anciens fichiers.")
        return
    deja, copies, illisibles = 0, 0, []
    for path in sorted(paths):
        if await asyncio.to_thread(_supabase_get, path):
            deja += 1
            continue
        if not copy:
            illisibles.append(path)
            continue
        legacy = await asyncio.to_thread(_emergent_get, path)
        if not legacy:
            illisibles.append(path)
            continue
        await asyncio.to_thread(_supabase_put, path, *legacy)
        copies += 1

    print(f"{len(paths)} fichier(s) référencé(s) : {deja} déjà dans Supabase, {copies} recopié(s), "
          f"{len(illisibles)} {'introuvable(s) chez Emergent' if copy else 'à recopier'}.")
    for path in illisibles[:20]:
        print("  ", path)


if __name__ == "__main__":
    asyncio.run(main("--copy" in sys.argv))
