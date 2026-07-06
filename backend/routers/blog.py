import uuid
import json as _json
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso, slugify
from core.config import EMERGENT_LLM_KEY
from models.blog import BlogPostIn, BlogPostUpdate, BlogGenerateIn

router = APIRouter(prefix="/blog", tags=["blog"])

SEED_ARTICLES_TOPICS = [
    {"topic": "Le CACES R489 en 2026 : guide complet sur les catégories, prix et durée", "category": "conseils", "keywords": "CACES R489, chariot élévateur, formation CACES, prix CACES"},
    {"topic": "Récupération de points de permis : tout savoir sur le stage agréé de 2 jours", "category": "conseils", "keywords": "récupération points permis, stage permis, 4 points, agréé préfecture"},
    {"topic": "Permis B accéléré : durée, coût, et déroulement chez TDL Formation", "category": "formations", "keywords": "permis B accéléré, permis voiture, auto-école Paris, code"},
    {"topic": "SSIAP 1 : devenir agent de sécurité incendie en 2026", "category": "formations", "keywords": "SSIAP 1, sécurité incendie, formation SSIAP, examen SSIAP"},
    {"topic": "Devenir chauffeur VTC : examen, carte pro et démarches administratives", "category": "formations", "keywords": "VTC, chauffeur VTC, carte professionnelle, examen VTC"},
    {"topic": "CACES R486 nacelle : catégories A, B, C — laquelle choisir ?", "category": "conseils", "keywords": "CACES R486, nacelle élévatrice, catégorie A B C, PEMP"},
    {"topic": "Auto-école à Paris : pourquoi choisir TDL Formation", "category": "seo", "keywords": "auto-école Paris, permis Paris, TDL Formation, code de la route"},
    {"topic": "Scooter électrique vs vélo électrique pour la ville : que choisir ?", "category": "kami", "keywords": "scooter électrique, vélo électrique, mobilité urbaine, KAMI STREET"},
]


@router.post("/posts")
async def blog_create(payload: BlogPostIn, user: dict = Depends(require_role("admin", "employe"))):
    base_slug = payload.slug or slugify(payload.title)
    slug = base_slug
    i = 2
    while await db.blog_posts.find_one({"slug": slug}):
        slug = f"{base_slug}-{i}"; i += 1
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["slug"] = slug
    doc["author_id"] = user["id"]
    doc["author_name"] = user.get("name", "TDL")
    doc["views"] = 0
    doc["created_at"] = now_iso()
    doc["updated_at"] = now_iso()
    doc["published_at"] = now_iso() if payload.status == "published" else None
    await db.blog_posts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/posts")
async def blog_list_public(category: str = None, tag: str = None, limit: int = 50):
    q = {"status": "published"}
    if category: q["category"] = category
    if tag: q["tags"] = tag
    return await db.blog_posts.find(q, {"_id": 0, "content": 0}).sort("published_at", -1).to_list(limit)


@router.get("/posts/{slug}")
async def blog_get_public(slug: str):
    post = await db.blog_posts.find_one({"slug": slug, "status": "published"}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Article introuvable")
    await db.blog_posts.update_one({"slug": slug}, {"$inc": {"views": 1}})
    post["views"] = post.get("views", 0) + 1
    return post


@router.get("/admin/posts")
async def blog_list_admin(user: dict = Depends(require_role("admin", "employe"))):
    return await db.blog_posts.find({}, {"_id": 0, "content": 0}).sort("created_at", -1).to_list(500)


@router.get("/admin/posts/{post_id}")
async def blog_get_admin(post_id: str, user: dict = Depends(require_role("admin", "employe"))):
    post = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Article introuvable")
    return post


@router.put("/posts/{post_id}")
async def blog_update(post_id: str, payload: BlogPostUpdate, user: dict = Depends(require_role("admin", "employe"))):
    existing = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Article introuvable")
    update = payload.model_dump(exclude_unset=True)
    if "slug" in update and update["slug"] and update["slug"] != existing.get("slug"):
        if await db.blog_posts.find_one({"slug": update["slug"], "id": {"$ne": post_id}}):
            raise HTTPException(status_code=400, detail="Slug déjà utilisé")
    update["updated_at"] = now_iso()
    if update.get("status") == "published" and not existing.get("published_at"):
        update["published_at"] = now_iso()
    await db.blog_posts.update_one({"id": post_id}, {"$set": update})
    return await db.blog_posts.find_one({"id": post_id}, {"_id": 0})


@router.delete("/posts/{post_id}")
async def blog_delete(post_id: str, user: dict = Depends(require_role("admin"))):
    await db.blog_posts.delete_one({"id": post_id})
    return {"ok": True}


@router.post("/generate")
async def blog_generate(payload: BlogGenerateIn, user: dict = Depends(require_role("admin", "employe"))):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Intégration LLM indisponible: {e}")
    system = (
        "Tu es un rédacteur SEO senior pour TDL Formation (organisme de formation français : CACES, permis, "
        "auto-école, SSIAP, VTC/Taxi) et KAMI STREET (mobilité électrique). Tu écris des articles de blog "
        f"structurés (H2/H3, listes), optimisés SEO, en français, ton {payload.tone}. "
        "Tu réponds STRICTEMENT en JSON valide avec ce format exact :\n"
        '{"title": "...", "excerpt": "résumé 1-2 phrases", "seo_title": "...max 60 chars", '
        '"seo_description": "...max 160 chars", "tags": ["...","..."], "content": "markdown complet 600-900 mots avec H2/H3, liste, FAQ courte à la fin"}'
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY, session_id=f"blog-{uuid.uuid4()}", system_message=system
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    prompt = (
        f"Sujet : {payload.topic}\nCatégorie : {payload.category}\n"
        f"Mots-clés à intégrer : {payload.keywords or 'aucun en particulier'}\n"
        "Génère l'article en JSON strict (aucun texte hors JSON)."
    )
    try:
        response = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur IA: {e}")
    text = response if isinstance(response, str) else str(response)
    start = text.find("{"); end = text.rfind("}")
    parsed = {}
    if start != -1 and end != -1:
        try:
            parsed = _json.loads(text[start:end + 1])
        except Exception:
            parsed = {}
    return {
        "title": parsed.get("title") or payload.topic,
        "excerpt": parsed.get("excerpt", ""),
        "content": parsed.get("content", text),
        "tags": parsed.get("tags", []),
        "seo_title": parsed.get("seo_title", parsed.get("title", payload.topic))[:60],
        "seo_description": parsed.get("seo_description", "")[:160],
        "category": payload.category,
        "status": "draft",
    }


@router.post("/seed")
async def blog_seed(user: dict = Depends(require_role("admin"))):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Intégration LLM indisponible: {e}")
    results = []
    system = (
        "Tu es un rédacteur SEO senior pour TDL Formation (CACES, permis, auto-école, SSIAP, VTC) "
        "et KAMI STREET (mobilité électrique). Tu écris en français, ton professionnel et accessible. "
        "Tu réponds STRICTEMENT en JSON valide avec ce format exact :\n"
        '{"title": "...", "excerpt": "résumé 1-2 phrases", "seo_title": "...max 60 chars", '
        '"seo_description": "...max 160 chars", "tags": ["...","..."], "content": "markdown 700-1000 mots avec H2/H3, listes, FAQ courte"}'
    )
    for t in SEED_ARTICLES_TOPICS:
        slug_guess = slugify(t["topic"])[:60]
        exists = await db.blog_posts.find_one({"slug": {"$regex": f"^{slug_guess[:30]}"}})
        if exists:
            results.append({"topic": t["topic"], "status": "skipped", "slug": exists.get("slug")})
            continue
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY, session_id=f"seed-{uuid.uuid4()}", system_message=system
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")
            prompt = f"Sujet : {t['topic']}\nCatégorie : {t['category']}\nMots-clés : {t['keywords']}\nGénère l'article en JSON strict."
            response = await chat.send_message(UserMessage(text=prompt))
            text = response if isinstance(response, str) else str(response)
            start = text.find("{"); end = text.rfind("}")
            parsed = _json.loads(text[start:end + 1]) if start != -1 and end != -1 else {}
            title = parsed.get("title") or t["topic"]
            base_slug = slugify(title)
            slug = base_slug
            i = 2
            while await db.blog_posts.find_one({"slug": slug}):
                slug = f"{base_slug}-{i}"; i += 1
            doc = {
                "id": str(uuid.uuid4()), "title": title, "slug": slug,
                "excerpt": parsed.get("excerpt", "")[:300],
                "content": parsed.get("content", text),
                "category": t["category"], "tags": parsed.get("tags", []),
                "seo_title": parsed.get("seo_title", title)[:60],
                "seo_description": parsed.get("seo_description", "")[:160],
                "status": "published", "author_id": user["id"], "author_name": user.get("name", "TDL"),
                "views": 0, "cover_image": None,
                "created_at": now_iso(), "updated_at": now_iso(), "published_at": now_iso(),
            }
            await db.blog_posts.insert_one(doc)
            results.append({"topic": t["topic"], "status": "created", "slug": slug})
        except Exception as e:
            results.append({"topic": t["topic"], "status": "error", "error": str(e)[:200]})
    return {"total": len(SEED_ARTICLES_TOPICS), "results": results}
