# fix_old_blog_links.py — réécrit, dans le contenu des articles de blog, les
# liens vers d'anciennes URLs WordPress (« redirections cassées » remontées
# par l'audit SEO : tdl-formation.fr/<ancien-slug>/ -> 308 -> 404) vers les
# pages actuelles du site.
#
# Les redirections 301 de frontend/vercel.json réparent déjà ces URLs, mais
# un lien interne qui passe par 2 redirections (non-www -> www -> nouvelle
# page) reste signalé en « redirect chain » : mieux vaut corriger le lien à
# la source.
#
# Usage (depuis backend/, avec le .env de la base cible) :
#   python fix_old_blog_links.py           # simulation : liste ce qui changerait
#   python fix_old_blog_links.py --apply   # écrit les modifications en base
import asyncio
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

SITE = "https://www.tdl-formation.fr"

# Doit rester aligné sur les redirects de frontend/vercel.json.
OLD_TO_NEW = {
    "caces-debouches-metiers-cariste": "/blog/debouches-caces-metiers-salaires-et-secteurs-qui-recrutent",
    "passerelle-vtc-taxi": "/formations/formation-passerelle-vtc-vers-taxi",
    "formation-caces-r489-chariots": "/formations/caces-r489-cat-3-chariot-elevateur",
    "financement-formation-taxi-cpf": "/blog/financement-formation-taxi-cpf-2026-demarches-et-montants",
    "renouvellement-carte-taxi": "/blog/renouvellement-carte-taxi-2026-formation-continue-obligatoire",
    "formation-caces-guide-complet": "/blog/formation-caces-2026-guide-complet-des-certifications",
    "prix-formation-caces-financement-cpf": "/blog/prix-formation-caces-2026-tarifs-et-financement-cpf",
    "formation-caces-r482-engins-chantier": "/formations/caces-r482-engins-de-chantier",
    "formation-caces-r486-nacelles": "/formations/caces-r486-cat-b-nacelle-elevatrice",
    "formation-taxi-initiale-programme": "/blog/formation-taxi-initiale-2026-programme-et-duree-complete",
    "formation-taxi-guide-complet": "/blog/formation-taxi-2026-guide-complet-pour-devenir-chauffeur",
    "licence-ads-taxi": "/blog/licence-ads-taxi-2026-obtention-location-et-couts",
}

# Lien absolu (avec ou sans www) ou relatif vers un ancien slug. Le
# lookbehind évite de matcher au milieu d'un chemin plus long
# (/blog/<slug>), le lookahead d'attraper un slug plus long qui commence
# pareil.
OLD_LINK_RE = re.compile(
    r"(?<![\w/.\-])(?:https?://(?:www\.)?tdl-formation\.fr)?/("
    + "|".join(re.escape(s) for s in OLD_TO_NEW)
    + r")/?(?![\w\-])"
)


def rewrite(content: str) -> tuple[str, int]:
    return OLD_LINK_RE.subn(lambda m: SITE + OLD_TO_NEW[m.group(1)], content)


async def main(apply: bool):
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    total = 0
    async for post in db.blog_posts.find({}, {"_id": 0, "id": 1, "slug": 1, "content": 1}):
        new_content, n = rewrite(post.get("content") or "")
        if not n:
            continue
        total += n
        print(f"{'MAJ ' if apply else 'à MAJ'} {post['slug']} : {n} lien(s)")
        if apply:
            await db.blog_posts.update_one({"id": post["id"]}, {"$set": {"content": new_content}})
    print(f"{total} lien(s) {'réécrit(s)' if apply else 'à réécrire (relancer avec --apply)'}.")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
