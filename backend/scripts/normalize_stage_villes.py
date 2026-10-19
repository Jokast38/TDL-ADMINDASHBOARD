"""Normalise le champ `lieu_ville` des sessions (db.stages) — regroupe les
variantes de saisie d'une même ville ("Epinay-sur-Seine", "EPINAY SUR SEINE",
"Épinay-sur-Seine (93)"...) sous un libellé canonique unique.

Usage :
    python scripts/normalize_stage_villes.py            # aperçu seulement
    python scripts/normalize_stage_villes.py --apply     # écrit en base

N'écrit JAMAIS en base sans --apply. Affiche toujours un diff avant/après.
Même logique de normalisation que frontend/src/lib/normalizeLocation.js —
garder les deux synchronisées si l'une évolue.
"""
import argparse
import asyncio
import re
import unicodedata

from core.database import db

KNOWN_CITIES = [
    (re.compile(r"epinay"), "Épinay-sur-Seine"),
    (re.compile(r"creil"), "Creil"),
    (re.compile(r"\bparis\b"), "Paris"),
    (re.compile(r"en\s*ligne|distanciel|visio"), "En ligne"),
]


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def normalize_location(raw: str) -> str:
    if not raw or not raw.strip():
        return "Sans lieu"
    v = strip_accents(raw.strip().lower())
    v = re.sub(r"\(\s*\d+\s*\)", "", v)
    v = re.sub(r"[-_]", " ", v)
    v = re.sub(r"\s+", " ", v).strip()
    for pattern, label in KNOWN_CITIES:
        if pattern.search(v):
            return label
    return " ".join(w.capitalize() for w in v.split(" "))


async def main(apply: bool):
    stages = await db.stages.find({}, {"_id": 0, "id": 1, "lieu_ville": 1}).to_list(10000)
    by_raw = {}
    for s in stages:
        raw = s.get("lieu_ville") or ""
        by_raw.setdefault(raw, []).append(s["id"])

    print(f"{len(stages)} sessions, {len(by_raw)} valeurs distinctes de lieu_ville.\n")
    changes = 0
    for raw, ids in sorted(by_raw.items()):
        normalized = normalize_location(raw)
        if normalized != raw:
            print(f"  {raw!r:40} -> {normalized!r}   ({len(ids)} session(s))")
            changes += len(ids)

    if not changes:
        print("Rien à changer — toutes les villes sont déjà normalisées.")
        return

    print(f"\n{changes} session(s) à mettre à jour.")
    if not apply:
        print("Aperçu seulement — relancez avec --apply pour écrire en base.")
        return

    for raw, ids in by_raw.items():
        normalized = normalize_location(raw)
        if normalized != raw:
            await db.stages.update_many({"id": {"$in": ids}}, {"$set": {"lieu_ville": normalized}})
    print("Terminé.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="écrit réellement les changements en base")
    args = parser.parse_args()
    asyncio.run(main(args.apply))
