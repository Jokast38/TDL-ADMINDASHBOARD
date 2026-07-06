import os
from fastapi import APIRouter
from fastapi.responses import Response

from core.database import db
from core.utils import now_iso

router = APIRouter(tags=["health"])


@router.get("/")
async def root():
    return {"service": "TDL Formation API", "status": "ok"}


@router.get("/public/site-config")
async def public_site_config():
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    return {
        "google_analytics_id": s.get("google_analytics_id", ""),
        "plausible_domain": s.get("plausible_domain", ""),
    }


@router.get("/sitemap.xml")
async def sitemap():
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    base = (s.get("public_base_url") or os.environ.get("PUBLIC_BASE_URL") or "").rstrip("/")
    if not base:
        base = "https://tdl-formation.fr"
    urls = [
        {"loc": f"{base}/", "priority": "1.0", "changefreq": "weekly"},
        {"loc": f"{base}/inscription", "priority": "0.9", "changefreq": "monthly"},
        {"loc": f"{base}/blog", "priority": "0.8", "changefreq": "weekly"},
    ]
    posts = await db.blog_posts.find({"status": "published"}, {"_id": 0, "slug": 1, "updated_at": 1, "published_at": 1}).to_list(2000)
    for p in posts:
        lastmod = p.get("updated_at") or p.get("published_at") or now_iso()
        urls.append({
            "loc": f"{base}/blog/{p['slug']}",
            "lastmod": lastmod.split("T")[0] if isinstance(lastmod, str) else str(lastmod),
            "priority": "0.7", "changefreq": "monthly"
        })
    formations = await db.formations.find({"active": True}, {"_id": 0, "id": 1}).to_list(500)
    for f in formations:
        urls.append({"loc": f"{base}/inscription?formation={f['id']}", "priority": "0.6", "changefreq": "monthly"})
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        xml.append("  <url>")
        for k, v in u.items():
            xml.append(f"    <{k}>{v}</{k}>")
        xml.append("  </url>")
    xml.append("</urlset>")
    return Response(content="\n".join(xml), media_type="application/xml")


@router.get("/robots.txt")
async def robots():
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    base = (s.get("public_base_url") or "https://tdl-formation.fr").rstrip("/")
    body = f"""User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /login
Disallow: /espace-eleve

Sitemap: {base}/sitemap.xml
"""
    return Response(content=body, media_type="text/plain")
