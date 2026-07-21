import httpx
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException

from core.database import db
from core.config import GOOGLE_PLACES_API_KEY, GOOGLE_PLACE_ID
from core.utils import now_iso

router = APIRouter(prefix="/reviews", tags=["reviews"])

CACHE_ID = "google_place_reviews"
CACHE_TTL = timedelta(hours=6)
PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


@router.get("/google")
async def get_google_reviews():
    """Avis Google Business de l'établissement, mis en cache pour limiter les appels
    à l'API Google Places (facturée à l'usage) — rafraîchi au plus toutes les 6h."""
    cached = await db.reviews_cache.find_one({"id": CACHE_ID}, {"_id": 0})
    if cached:
        fetched_at = datetime.fromisoformat(cached["fetched_at"])
        if datetime.now(timezone.utc) - fetched_at < CACHE_TTL:
            return cached["data"]

    if not GOOGLE_PLACES_API_KEY or not GOOGLE_PLACE_ID:
        if cached:
            return cached["data"]
        raise HTTPException(status_code=503, detail="Google Places non configuré (clé API ou Place ID manquant)")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(PLACES_DETAILS_URL, params={
                "place_id": GOOGLE_PLACE_ID,
                "fields": "name,rating,user_ratings_total,reviews,url",
                "language": "fr",
                "key": GOOGLE_PLACES_API_KEY,
            })
        payload = resp.json()
        if payload.get("status") != "OK":
            raise RuntimeError(payload.get("status") or "unknown_error")

        result = payload["result"]
        data = {
            "name": result.get("name"),
            "rating": result.get("rating"),
            "user_ratings_total": result.get("user_ratings_total"),
            "url": result.get("url"),
            "reviews": [
                {
                    "author_name": r.get("author_name"),
                    "profile_photo_url": r.get("profile_photo_url"),
                    "rating": r.get("rating"),
                    "relative_time_description": r.get("relative_time_description"),
                    "text": r.get("text"),
                    "time": r.get("time"),
                }
                for r in result.get("reviews", [])
            ],
        }
        await db.reviews_cache.update_one(
            {"id": CACHE_ID},
            {"$set": {"id": CACHE_ID, "data": data, "fetched_at": now_iso()}},
            upsert=True,
        )
        return data
    except Exception as e:
        if cached:
            return cached["data"]
        raise HTTPException(status_code=502, detail=f"Erreur Google Places: {e}")
