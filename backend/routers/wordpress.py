import asyncio
import uuid
import html2text
import requests
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso, slugify
from core.config import (
    WORDPRESS_SITE, WORDPRESS_SITE_K, WORDPRESS_USER, WORDPRESS_APP_PASSWORD, WORDPRESS_APP_PASSWORD_K,
    GA4_PROPERTY_ID, GA4_PROPERTY_ID_K, GA4_SERVICE_ACCOUNT_PATH, ROLES_KAMI_STREET,
)
from models.document import WooProductUpdate
from models.blog import WordPressBlogImportIn
from services.wordpress import (
    wp_basic_auth_headers, wp_site_url,
    fetch_wp_content_stats, fetch_ga4_traffic, fetch_jetpack_traffic,
    fetch_wp_posts_for_import,
    woo_auth_params, woo_headers, woo_base
)

router = APIRouter(prefix="/wordpress", tags=["wordpress"])

# Catégories du blog interne (voir AdminBlog.jsx) — les catégories WordPress
# n'y correspondent pas forcément, donc on route par mot-clé plutôt que par
# nom exact, avec "actualites" en repli.
_CATEGORY_KEYWORDS = {
    "formations": ["formation", "caces", "ssiap", "ecsr", "vente", "conseiller"],
    "conseils": ["conseil", "guide", "astuce"],
    "kami": ["kami", "mobilité", "scooter", "vélo", "electrique"],
    "seo": [],
}


def _map_category(wp_categories: list) -> str:
    names = " ".join(wp_categories).lower()
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        if any(k in names for k in keywords):
            return cat
    return "actualites"


def _html_to_markdown(html: str) -> str:
    converter = html2text.HTML2Text()
    converter.body_width = 0  # ne pas forcer de retour à la ligne arbitraire
    converter.ignore_images = False
    return converter.handle(html or "").strip()


@router.get("/blog/import-preview")
async def wordpress_blog_import_preview(user: dict = Depends(require_role("admin", "employe"))):
    """Liste les articles publiés sur tdl-formation.fr (avec leurs métas Rank Math
    si exposées) et indique lesquels sont déjà importés dans le blog interne."""
    if not WORDPRESS_SITE or not WORDPRESS_USER or not WORDPRESS_APP_PASSWORD:
        raise HTTPException(status_code=500, detail="Variables WORDPRESS_SITE / WORDPRESS_USER / WORDPRESS_APP_PASSWORD manquantes")
    site_url = wp_site_url(WORDPRESS_SITE)
    headers = wp_basic_auth_headers(WORDPRESS_USER, WORDPRESS_APP_PASSWORD)
    try:
        posts = await asyncio.to_thread(fetch_wp_posts_for_import, site_url, headers)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur WordPress: {e}")

    existing_wp_ids = {
        d["wp_source_id"]
        async for d in db.blog_posts.find({"wp_source_id": {"$exists": True}}, {"wp_source_id": 1})
    }
    for p in posts:
        p["already_imported"] = p["wp_id"] in existing_wp_ids
    return {"posts": posts, "rank_math_available": any(p.get("rank_math_title") for p in posts)}


@router.post("/blog/import")
async def wordpress_blog_import(
    payload: WordPressBlogImportIn = WordPressBlogImportIn(),
    user: dict = Depends(require_role("admin", "employe")),
):
    wp_ids = payload.wp_ids
    status = payload.status
    """Importe les articles WordPress sélectionnés (ou tous les nouveaux si
    wp_ids est vide) dans le blog interne, en conservant le SEO Rank Math
    quand il est exposé par l'API REST. Idempotent : un article déjà importé
    (même wp_source_id) est ignoré, pas dupliqué."""
    if not WORDPRESS_SITE or not WORDPRESS_USER or not WORDPRESS_APP_PASSWORD:
        raise HTTPException(status_code=500, detail="Variables WORDPRESS_SITE / WORDPRESS_USER / WORDPRESS_APP_PASSWORD manquantes")
    site_url = wp_site_url(WORDPRESS_SITE)
    headers = wp_basic_auth_headers(WORDPRESS_USER, WORDPRESS_APP_PASSWORD)
    try:
        posts = await asyncio.to_thread(fetch_wp_posts_for_import, site_url, headers)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur WordPress: {e}")

    if wp_ids:
        posts = [p for p in posts if p["wp_id"] in wp_ids]

    results = []
    for p in posts:
        if await db.blog_posts.find_one({"wp_source_id": p["wp_id"]}):
            results.append({"wp_id": p["wp_id"], "title": p["title"], "status": "skipped_already_imported"})
            continue

        base_slug = slugify(p["title"])
        slug = base_slug
        i = 2
        while await db.blog_posts.find_one({"slug": slug}):
            slug = f"{base_slug}-{i}"
            i += 1

        excerpt_md = _html_to_markdown(p["excerpt_html"])[:300]
        doc = {
            "id": str(uuid.uuid4()),
            "slug": slug,
            "title": p["title"],
            "excerpt": excerpt_md or p["title"],
            "content": _html_to_markdown(p["content_html"]),
            "category": _map_category(p["categories"]),
            "cover_image": p.get("cover_image"),
            "tags": p.get("categories", []),
            "seo_title": (p.get("rank_math_title") or p["title"])[:60],
            "seo_description": (p.get("rank_math_description") or excerpt_md)[:160],
            "status": status,
            "author_id": user["id"],
            "author_name": user.get("name", "TDL"),
            "views": 0,
            "wp_source_id": p["wp_id"],
            "wp_source_link": p.get("wp_link"),
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "published_at": now_iso() if status == "published" else None,
        }
        await db.blog_posts.insert_one(doc)
        results.append({"wp_id": p["wp_id"], "title": p["title"], "status": "imported", "slug": slug})

    return {"results": results}


@router.get("/stats")
async def wordpress_stats_tdl(user: dict = Depends(require_role("admin", "employe"))):
    if not WORDPRESS_SITE or not WORDPRESS_USER or not WORDPRESS_APP_PASSWORD:
        raise HTTPException(status_code=500, detail="Variables WORDPRESS_SITE / WORDPRESS_USER / WORDPRESS_APP_PASSWORD manquantes")
    site_url = wp_site_url(WORDPRESS_SITE)
    headers = wp_basic_auth_headers(WORDPRESS_USER, WORDPRESS_APP_PASSWORD)
    try:
        content_stats = await asyncio.to_thread(fetch_wp_content_stats, site_url, headers)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur WP TDL: {e}")
    traffic = None
    traffic_error = None
    if GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_PATH:
        try:
            traffic = await asyncio.to_thread(fetch_ga4_traffic, GA4_PROPERTY_ID)
        except HTTPException as e:
            traffic_error = e.detail
        except Exception as e:
            traffic_error = str(e)
    return {"success": True, "site": site_url, "site_label": "TDL Formation", **content_stats, "traffic": traffic, "traffic_error": traffic_error}


@router.get("/stats/kami")
async def wordpress_stats_kami(user: dict = Depends(require_role("admin", "employe"))):
    if not WORDPRESS_SITE_K or not WORDPRESS_USER or not WORDPRESS_APP_PASSWORD_K:
        raise HTTPException(status_code=500, detail="Variables WORDPRESS_SITE_K / WORDPRESS_USER / WORDPRESS_APP_PASSWORD_K manquantes")
    site_url = wp_site_url(WORDPRESS_SITE_K)
    headers = wp_basic_auth_headers(WORDPRESS_USER, WORDPRESS_APP_PASSWORD_K)
    content_stats = {}
    try:
        content_stats = await asyncio.to_thread(fetch_wp_content_stats, site_url, headers)
    except HTTPException as e:
        if e.status_code in (401, 403):
            raise
        content_stats = {"error": str(e.detail), "content": {}}
    except Exception as e:
        content_stats = {"error": str(e), "content": {}}

    jetpack_error = "ℹ️ Jetpack désactivé temporairement - configurez un compte admin ou ignorez"

    ga4 = None
    ga4_error = None
    if GA4_PROPERTY_ID_K and GA4_SERVICE_ACCOUNT_PATH:
        try:
            ga4 = await asyncio.to_thread(fetch_ga4_traffic, GA4_PROPERTY_ID_K)
        except HTTPException as e:
            ga4_error = e.detail
        except Exception as e:
            ga4_error = str(e)

    if "authenticated_as" not in content_stats:
        content_stats["authenticated_as"] = {"name": WORDPRESS_USER, "roles": ["unknown"]}
    if "content" not in content_stats:
        content_stats["content"] = {"total_published_posts": 0, "total_pages": 0, "total_media": 0}
    if "recent_posts" not in content_stats:
        content_stats["recent_posts"] = []

    return {
        "success": True, "site": site_url, "site_label": "KAMI STREET",
        **content_stats, "jetpack": None, "jetpack_error": jetpack_error,
        "traffic": ga4, "traffic_error": ga4_error,
    }


@router.get("/kami/products")
async def woo_list_products(
    page: int = 1, per_page: int = 20,
    search: Optional[str] = None, category: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_KAMI_STREET))
):
    key, secret = woo_auth_params()
    if not key or not secret:
        raise HTTPException(status_code=500, detail="Variables WOOCOMMERCE_KEY_K / WOOCOMMERCE_SECRET_K manquantes dans .env")
    params = {"page": page, "per_page": per_page}
    if search: params["search"] = search
    if category: params["category"] = category
    try:
        r = await asyncio.to_thread(requests.get, f"{woo_base()}/products", headers=woo_headers(), params=params, timeout=15)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Impossible de joindre {WORDPRESS_SITE_K}: {e}")
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="WooCommerce: clés API invalides — vérifiez WOOCOMMERCE_KEY_K / WOOCOMMERCE_SECRET_K")
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="WooCommerce: REST API introuvable — activez les permaliens et vérifiez que WooCommerce est installé")
    if not r.ok:
        raise HTTPException(status_code=r.status_code, detail=f"WooCommerce error: {r.text[:300]}")
    products = r.json()
    normalized = []
    for p in products:
        image = p.get("images", [{}])[0].get("src", "") if p.get("images") else ""
        normalized.append({
            "id": p["id"], "name": p.get("name", ""), "slug": p.get("slug", ""),
            "status": p.get("status", "draft"), "price": p.get("price", "0"),
            "regular_price": p.get("regular_price", "0"), "sale_price": p.get("sale_price", ""),
            "stock_quantity": p.get("stock_quantity"), "stock_status": p.get("stock_status", "instock"),
            "manage_stock": p.get("manage_stock", False),
            "description": p.get("short_description", "") or p.get("description", ""),
            "categories": [c.get("name", "") for c in p.get("categories", [])],
            "image": image, "permalink": p.get("permalink", ""),
            "date_modified": p.get("date_modified", ""), "source": "wordpress",
        })
    return {
        "products": normalized,
        "total": int(r.headers.get("X-WP-Total", 0)),
        "total_pages": int(r.headers.get("X-WP-TotalPages", 1)),
        "page": page,
    }


@router.get("/kami/products/{product_id}")
async def woo_get_product(product_id: int, user: dict = Depends(require_role(*ROLES_KAMI_STREET))):
    key, secret = woo_auth_params()
    if not key or not secret:
        raise HTTPException(status_code=500, detail="Variables WOOCOMMERCE_KEY_K / WOOCOMMERCE_SECRET_K manquantes")
    r = await asyncio.to_thread(requests.get, f"{woo_base()}/products/{product_id}", headers=woo_headers(), timeout=15)
    if not r.ok:
        raise HTTPException(status_code=r.status_code, detail=f"WooCommerce: {r.text[:300]}")
    p = r.json()
    image = p.get("images", [{}])[0].get("src", "") if p.get("images") else ""
    return {
        "id": p["id"], "name": p.get("name", ""), "slug": p.get("slug", ""),
        "status": p.get("status", "draft"), "price": p.get("price", "0"),
        "regular_price": p.get("regular_price", "0"), "sale_price": p.get("sale_price", ""),
        "stock_quantity": p.get("stock_quantity"), "stock_status": p.get("stock_status", "instock"),
        "manage_stock": p.get("manage_stock", False),
        "description": p.get("short_description", "") or p.get("description", ""),
        "full_description": p.get("description", ""),
        "categories": [c.get("name", "") for c in p.get("categories", [])],
        "category_ids": [c.get("id") for c in p.get("categories", [])],
        "images": [img.get("src", "") for img in p.get("images", [])],
        "image": image, "permalink": p.get("permalink", ""),
        "date_modified": p.get("date_modified", ""), "source": "wordpress",
    }


@router.put("/kami/products/{product_id}")
async def woo_update_product(product_id: int, payload: WooProductUpdate, user: dict = Depends(require_role(*ROLES_KAMI_STREET))):
    key, secret = woo_auth_params()
    if not key or not secret:
        raise HTTPException(status_code=500, detail="Variables WOOCOMMERCE_KEY_K / WOOCOMMERCE_SECRET_K manquantes")
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")
    r = await asyncio.to_thread(requests.put, f"{woo_base()}/products/{product_id}", headers=woo_headers(), json=data, timeout=15)
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="WooCommerce: clés API invalides")
    if not r.ok:
        raise HTTPException(status_code=r.status_code, detail=f"WooCommerce update error: {r.text[:300]}")
    p = r.json()
    image = p.get("images", [{}])[0].get("src", "") if p.get("images") else ""
    return {
        "id": p["id"], "name": p.get("name", ""), "status": p.get("status", ""),
        "price": p.get("price", "0"), "regular_price": p.get("regular_price", "0"),
        "sale_price": p.get("sale_price", ""), "stock_quantity": p.get("stock_quantity"),
        "stock_status": p.get("stock_status", "instock"), "image": image,
        "permalink": p.get("permalink", ""), "source": "wordpress",
    }


@router.get("/kami/categories")
async def woo_list_categories(user: dict = Depends(require_role(*ROLES_KAMI_STREET))):
    key, secret = woo_auth_params()
    if not key or not secret:
        raise HTTPException(status_code=500, detail="Variables WOOCOMMERCE_KEY_K / WOOCOMMERCE_SECRET_K manquantes")
    r = await asyncio.to_thread(requests.get, f"{woo_base()}/products/categories", headers=woo_headers(), params={"per_page": 100}, timeout=15)
    if not r.ok:
        raise HTTPException(status_code=r.status_code, detail=f"WooCommerce categories: {r.text[:200]}")
    return [{"id": c["id"], "name": c.get("name", ""), "slug": c.get("slug", ""), "count": c.get("count", 0)} for c in r.json()]


@router.get("/kami/orders")
async def woo_list_orders(
    page: int = 1, per_page: int = 20, status: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_KAMI_STREET))
):
    key, secret = woo_auth_params()
    if not key or not secret:
        raise HTTPException(status_code=500, detail="Variables WOOCOMMERCE_KEY_K / WOOCOMMERCE_SECRET_K manquantes dans .env")
    params = {"page": page, "per_page": per_page, "orderby": "date", "order": "desc"}
    if status: params["status"] = status
    try:
        r = await asyncio.to_thread(requests.get, f"{woo_base()}/orders", headers=woo_headers(), params=params, timeout=15)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Impossible de joindre {WORDPRESS_SITE_K}: {e}")
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="WooCommerce: clés API invalides")
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="WooCommerce: REST API introuvable")
    if not r.ok:
        raise HTTPException(status_code=r.status_code, detail=f"WooCommerce error: {r.text[:300]}")

    def _normalize_order(o):
        billing = o.get("billing", {})
        shipping = o.get("shipping", {})
        line_items = [
            {"product_id": item.get("product_id"), "name": item.get("name"), "quantity": item.get("quantity"),
             "price": item.get("price"), "total": item.get("total"),
             "image": item.get("image", {}).get("src", "") if item.get("image") else ""}
            for item in o.get("line_items", [])
        ]
        return {
            "id": o.get("id"), "number": o.get("number", str(o.get("id"))),
            "status": o.get("status", "pending"), "date_created": o.get("date_created", ""),
            "date_modified": o.get("date_modified", ""), "total": o.get("total", "0"),
            "currency": o.get("currency", "EUR"), "payment_method": o.get("payment_method", ""),
            "payment_method_title": o.get("payment_method_title", ""), "customer_note": o.get("customer_note", ""),
            "customer": {
                "id": o.get("customer_id"), "email": billing.get("email", ""),
                "first_name": billing.get("first_name", ""), "last_name": billing.get("last_name", ""),
                "company": billing.get("company", ""), "address_1": billing.get("address_1", ""),
                "address_2": billing.get("address_2", ""), "city": billing.get("city", ""),
                "state": billing.get("state", ""), "postcode": billing.get("postcode", ""),
                "country": billing.get("country", ""), "phone": billing.get("phone", ""),
            },
            "shipping": {
                "first_name": shipping.get("first_name", ""), "last_name": shipping.get("last_name", ""),
                "address_1": shipping.get("address_1", ""), "address_2": shipping.get("address_2", ""),
                "city": shipping.get("city", ""), "state": shipping.get("state", ""),
                "postcode": shipping.get("postcode", ""), "country": shipping.get("country", ""),
            },
            "line_items": line_items, "shipping_total": o.get("shipping_total", "0"),
            "discount_total": o.get("discount_total", "0"), "total_tax": o.get("total_tax", "0"),
            "source": "wordpress",
        }

    return {
        "orders": [_normalize_order(o) for o in r.json()],
        "total": int(r.headers.get("X-WP-Total", 0)),
        "total_pages": int(r.headers.get("X-WP-TotalPages", 1)),
        "page": page,
    }


@router.get("/kami/orders/{order_id}")
async def woo_get_order(order_id: int, user: dict = Depends(require_role(*ROLES_KAMI_STREET))):
    key, secret = woo_auth_params()
    if not key or not secret:
        raise HTTPException(status_code=500, detail="Variables WOOCOMMERCE_KEY_K / WOOCOMMERCE_SECRET_K manquantes")
    r = await asyncio.to_thread(requests.get, f"{woo_base()}/orders/{order_id}", headers=woo_headers(), timeout=15)
    if not r.ok:
        raise HTTPException(status_code=r.status_code, detail=f"WooCommerce: {r.text[:300]}")
    o = r.json()
    billing = o.get("billing", {})
    shipping = o.get("shipping", {})
    return {
        "id": o.get("id"), "number": o.get("number", str(o.get("id"))),
        "status": o.get("status", "pending"), "date_created": o.get("date_created", ""),
        "total": o.get("total", "0"), "currency": o.get("currency", "EUR"),
        "payment_method": o.get("payment_method", ""), "payment_method_title": o.get("payment_method_title", ""),
        "customer": {
            "email": billing.get("email", ""), "first_name": billing.get("first_name", ""),
            "last_name": billing.get("last_name", ""), "phone": billing.get("phone", ""),
        },
        "shipping": {
            "address_1": shipping.get("address_1", ""), "city": shipping.get("city", ""),
            "postcode": shipping.get("postcode", ""),
        },
        "line_items": [
            {"product_id": item.get("product_id"), "name": item.get("name"),
             "quantity": item.get("quantity"), "price": item.get("price"), "total": item.get("total")}
            for item in o.get("line_items", [])
        ],
        "source": "wordpress",
    }


@router.put("/kami/orders/{order_id}/status")
async def woo_update_order_status(order_id: int, status: str, user: dict = Depends(require_role(*ROLES_KAMI_STREET))):
    valid_statuses = ["pending", "processing", "completed", "cancelled", "refunded", "failed", "on-hold"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Statut invalide. Valeurs acceptées: {', '.join(valid_statuses)}")
    key, secret = woo_auth_params()
    if not key or not secret:
        raise HTTPException(status_code=500, detail="Variables WOOCOMMERCE_KEY_K / WOOCOMMERCE_SECRET_K manquantes")
    try:
        r = await asyncio.to_thread(requests.put, f"{woo_base()}/orders/{order_id}", headers=woo_headers(), json={"status": status}, timeout=15)
        if r.status_code == 401:
            raise HTTPException(status_code=401, detail="WooCommerce: clés API invalides")
        if not r.ok:
            raise HTTPException(status_code=r.status_code, detail=f"WooCommerce update error: {r.text[:300]}")
        return {"success": True, "order_id": order_id, "new_status": status}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur lors de la mise à jour: {str(e)}")
