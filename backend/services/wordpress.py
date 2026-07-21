import base64
import os
import requests
from typing import Optional
from fastapi import HTTPException

from core.config import GA4_PROPERTY_ID, GA4_SERVICE_ACCOUNT_PATH, GA4_SERVICE_ACCOUNT_JSON, WORDPRESS_SITE_K


def wp_basic_auth_headers(user: str, password: str) -> dict:
    clean = password.replace(" ", "")
    token = base64.b64encode(f"{user}:{clean}".encode()).decode()
    return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}


def wp_site_url(site: str) -> str:
    site = site.strip().rstrip("/")
    if not site.startswith("http"):
        site = f"https://{site}"
    return site


def fetch_wp_content_stats(site_url: str, headers: dict) -> dict:
    base = f"{site_url}/wp-json/wp/v2"
    posts_r = requests.get(f"{base}/posts", headers=headers, params={"per_page": 5, "_fields": "id,title,date,link", "status": "publish"}, timeout=15)
    pages_r = requests.get(f"{base}/pages", headers=headers, params={"per_page": 1, "_fields": "id"}, timeout=15)
    media_r = requests.get(f"{base}/media", headers=headers, params={"per_page": 1, "_fields": "id"}, timeout=15)
    me_r = requests.get(f"{base}/users/me", headers=headers, timeout=15)

    if me_r.status_code == 401:
        raise HTTPException(status_code=401, detail="Auth WordPress échouée — vérifiez WORDPRESS_USER (login, pas email) et le mot de passe d'application")
    if me_r.status_code == 404:
        raise HTTPException(status_code=404, detail=f"REST API introuvable sur {site_url} — activez les permaliens")

    me = me_r.json() if me_r.ok else {}
    recent_posts = posts_r.json() if posts_r.ok else []

    return {
        "authenticated_as": {"name": me.get("name"), "roles": me.get("roles", [])},
        "content": {
            "total_published_posts": int(posts_r.headers.get("X-WP-Total", 0)) if posts_r.ok else 0,
            "total_pages": int(pages_r.headers.get("X-WP-Total", 0)) if pages_r.ok else 0,
            "total_media": int(media_r.headers.get("X-WP-Total", 0)) if media_r.ok else 0,
        },
        "recent_posts": [
            {
                "id": p.get("id"),
                "title": p.get("title", {}).get("rendered", "") if isinstance(p.get("title"), dict) else str(p.get("title", "")),
                "date": p.get("date"),
                "link": p.get("link"),
            }
            for p in recent_posts
        ],
    }


def fetch_jetpack_traffic(site_id: str, token: str = None, wp_user: str = None, app_password: str = None) -> dict:
    if token:
        headers = {"Authorization": f"Bearer {token}"}
    else:
        clean = (app_password or "").replace(" ", "")
        creds = base64.b64encode(f"{wp_user}:{clean}".encode()).decode()
        headers = {"Authorization": f"Basic {creds}"}

    base = f"https://public-api.wordpress.com/rest/v1.1/sites/{site_id}"
    summary_r = None
    try:
        summary_r = requests.get(f"{base}/stats", headers=headers, timeout=15)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur réseau Jetpack: {str(e)}")

    if summary_r.status_code == 401:
        raise HTTPException(status_code=401, detail=f"🔑 Jetpack: authentification échouée. Détail: {summary_r.text[:200]}")
    if summary_r.status_code == 403:
        raise HTTPException(status_code=403, detail=f"🚫 Jetpack: accès refusé. L'utilisateur '{wp_user}' n'a pas les droits suffisants.")
    if summary_r.status_code == 404:
        raise HTTPException(status_code=404, detail=f"❌ Jetpack: site introuvable ou stats désactivées sur {site_id}")
    if not summary_r.ok:
        raise HTTPException(status_code=summary_r.status_code, detail=f"⚠️ Jetpack: erreur ({summary_r.status_code}) - {summary_r.text[:200]}")

    traffic = {}
    d = summary_r.json()
    stats = d.get("stats", {})
    traffic["total_views"] = stats.get("views_today", 0)
    traffic["views_best_day"] = stats.get("views_best_day_total", 0)
    traffic["total_visitors"] = stats.get("visitors_today", 0)
    traffic["followers"] = stats.get("followers_blog", 0)

    try:
        visits_r = requests.get(f"{base}/stats/visits", headers=headers, params={"unit": "day", "quantity": 7}, timeout=15)
        if visits_r.ok:
            traffic["visits_7d"] = visits_r.json().get("data", [])
    except Exception:
        traffic["visits_7d"] = []

    try:
        top_posts_r = requests.get(f"{base}/stats/top-posts", headers=headers, params={"period": "month", "num": 5}, timeout=15)
        if top_posts_r.ok:
            traffic["top_posts"] = [
                {"title": p.get("title"), "views": p.get("views"), "link": p.get("href")}
                for p in top_posts_r.json().get("top-posts", [])[:5]
            ]
    except Exception:
        traffic["top_posts"] = []

    try:
        referrers_r = requests.get(f"{base}/stats/referrers", headers=headers, params={"period": "month", "num": 5}, timeout=15)
        if referrers_r.ok:
            traffic["referrers"] = [
                {"name": r.get("name"), "views": r.get("views")}
                for r in referrers_r.json().get("referrers", [])[:5]
            ]
    except Exception:
        traffic["referrers"] = []

    try:
        countries_r = requests.get(f"{base}/stats/country-views", headers=headers, params={"period": "month", "num": 5}, timeout=15)
        if countries_r.ok:
            traffic["countries"] = [
                {"name": c.get("country_full", c.get("country")), "views": c.get("views")}
                for c in countries_r.json().get("country-views", {}).get("othercountries", [])[:5]
            ]
    except Exception:
        traffic["countries"] = []

    return traffic


def fetch_ga4_traffic(property_id: str) -> dict:
    try:
        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        from google.analytics.data_v1beta.types import RunReportRequest, DateRange, Metric, Dimension
        from google.oauth2 import service_account
    except ImportError:
        raise HTTPException(status_code=500, detail="google-analytics-data non installé — pip install google-analytics-data")

    scopes = ["https://www.googleapis.com/auth/analytics.readonly"]
    if GA4_SERVICE_ACCOUNT_JSON:
        import json
        credentials = service_account.Credentials.from_service_account_info(
            json.loads(GA4_SERVICE_ACCOUNT_JSON), scopes=scopes
        )
    else:
        sa_path = GA4_SERVICE_ACCOUNT_PATH
        if not sa_path or not os.path.exists(sa_path):
            raise HTTPException(status_code=500, detail=f"Fichier compte de service GA4 introuvable : {sa_path}")
        credentials = service_account.Credentials.from_service_account_file(sa_path, scopes=scopes)
    client_ga = BetaAnalyticsDataClient(credentials=credentials)

    req = RunReportRequest(
        property=property_id,
        date_ranges=[DateRange(start_date="30daysAgo", end_date="today")],
        metrics=[
            Metric(name="sessions"), Metric(name="screenPageViews"),
            Metric(name="activeUsers"), Metric(name="bounceRate"),
            Metric(name="averageSessionDuration"),
        ],
    )
    resp = client_ga.run_report(req)
    row = resp.rows[0].metric_values if resp.rows else []

    def mv(i): return row[i].value if i < len(row) else "0"

    req_pages = RunReportRequest(
        property=property_id,
        date_ranges=[DateRange(start_date="30daysAgo", end_date="today")],
        dimensions=[Dimension(name="pagePath"), Dimension(name="pageTitle")],
        metrics=[Metric(name="screenPageViews")],
        limit=5,
    )
    resp_pages = client_ga.run_report(req_pages)
    top_pages = [
        {"path": r.dimension_values[0].value, "title": r.dimension_values[1].value, "views": int(r.metric_values[0].value)}
        for r in resp_pages.rows
    ]

    req_channels = RunReportRequest(
        property=property_id,
        date_ranges=[DateRange(start_date="30daysAgo", end_date="today")],
        dimensions=[Dimension(name="sessionDefaultChannelGroup")],
        metrics=[Metric(name="sessions")],
        limit=6,
    )
    resp_ch = client_ga.run_report(req_channels)
    channels = [
        {"channel": r.dimension_values[0].value, "sessions": int(r.metric_values[0].value)}
        for r in resp_ch.rows
    ]

    avg_dur_s = float(mv(4))
    minutes, seconds = divmod(int(avg_dur_s), 60)
    return {
        "period": "30 derniers jours",
        "sessions": int(mv(0)),
        "page_views": int(mv(1)),
        "active_users": int(mv(2)),
        "bounce_rate": round(float(mv(3)) * 100, 1),
        "avg_session": f"{minutes}m{seconds:02d}s",
        "top_pages": top_pages,
        "channels": channels,
    }


def woo_auth_params() -> tuple:
    key = os.getenv("WOOCOMMERCE_KEY_K", "")
    secret = os.getenv("WOOCOMMERCE_SECRET_K", "")
    return key, secret


def woo_headers() -> dict:
    key, secret = woo_auth_params()
    token = base64.b64encode(f"{key}:{secret}".encode()).decode()
    return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}


def woo_base() -> str:
    site_url = wp_site_url(WORDPRESS_SITE_K or "")
    return f"{site_url}/wp-json/wc/v3"


def fetch_wp_posts_for_import(site_url: str, headers: dict, per_page: int = 50) -> list:
    """Récupère les articles publiés sur WordPress (avec image mise en avant et
    catégories) pour import dans le blog interne. Si le plugin Rank Math a son
    option "REST API" activée (Rank Math > Réglages généraux > Autres), ses
    champs meta (rank_math_title/rank_math_description) sont aussi remontés ;
    sinon on retombe sur le titre/extrait WordPress classique."""
    base = f"{site_url}/wp-json/wp/v2"
    resp = requests.get(
        f"{base}/posts",
        headers=headers,
        params={"per_page": per_page, "status": "publish", "_embed": "wp:featuredmedia,wp:term"},
        timeout=30,
    )
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Auth WordPress échouée — vérifiez WORDPRESS_USER et le mot de passe d'application")
    resp.raise_for_status()
    posts = resp.json()

    results = []
    for p in posts:
        title = p.get("title", {}).get("rendered", "")
        excerpt_html = p.get("excerpt", {}).get("rendered", "")
        content_html = p.get("content", {}).get("rendered", "")

        cover_image = None
        embedded_media = (p.get("_embedded") or {}).get("wp:featuredmedia") or []
        if embedded_media and isinstance(embedded_media[0], dict):
            cover_image = embedded_media[0].get("source_url")

        categories = []
        for term_group in (p.get("_embedded") or {}).get("wp:term") or []:
            for term in term_group:
                if term.get("taxonomy") == "category" and term.get("name", "").lower() != "uncategorized":
                    categories.append(term.get("name"))

        results.append({
            "wp_id": p.get("id"),
            "wp_link": p.get("link"),
            "date": p.get("date"),
            "title": title,
            "excerpt_html": excerpt_html,
            "content_html": content_html,
            "cover_image": cover_image,
            "categories": categories,
            "rank_math_title": p.get("rank_math_title"),
            "rank_math_description": p.get("rank_math_description"),
        })
    return results
