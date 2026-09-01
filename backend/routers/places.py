import httpx
from fastapi import APIRouter, Depends, HTTPException

from core.security import get_current_user
from core.config import GOOGLE_PLACES_API_KEY

router = APIRouter(prefix="/places", tags=["places"])

AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json"
DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


@router.get("/autocomplete")
async def places_autocomplete(input: str, session_token: str = "", user: dict = Depends(get_current_user)):
    """Proxy vers Google Places Autocomplete — la clé API reste côté serveur
    (même clé que GET /reviews/google) plutôt que d'être exposée au
    navigateur. Utilisé par le champ Adresse des formulaires admin."""
    if not GOOGLE_PLACES_API_KEY:
        raise HTTPException(status_code=503, detail="Google Places non configuré (clé API manquante)")
    if not input or len(input.strip()) < 3:
        return {"predictions": []}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(AUTOCOMPLETE_URL, params={
                "input": input,
                "language": "fr",
                "components": "country:fr",
                "sessiontoken": session_token or "no-session",
                "key": GOOGLE_PLACES_API_KEY,
            })
        payload = resp.json()
        if payload.get("status") not in ("OK", "ZERO_RESULTS"):
            raise RuntimeError(payload.get("status") or "unknown_error")
        return {
            "predictions": [
                {"place_id": p["place_id"], "description": p["description"]}
                for p in payload.get("predictions", [])
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur Google Places: {e}")


@router.get("/details")
async def places_details(place_id: str, session_token: str = "", user: dict = Depends(get_current_user)):
    """Détails d'une adresse sélectionnée (adresse formatée + ville) — deuxième
    étape de l'autocomplétion, après /places/autocomplete."""
    if not GOOGLE_PLACES_API_KEY:
        raise HTTPException(status_code=503, detail="Google Places non configuré (clé API manquante)")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(DETAILS_URL, params={
                "place_id": place_id,
                "fields": "formatted_address,address_component",
                "language": "fr",
                "sessiontoken": session_token or "no-session",
                "key": GOOGLE_PLACES_API_KEY,
            })
        payload = resp.json()
        if payload.get("status") != "OK":
            raise RuntimeError(payload.get("status") or "unknown_error")
        result = payload["result"]
        components = result.get("address_components", [])
        ville = next(
            (c["long_name"] for c in components if "locality" in c.get("types", [])),
            next((c["long_name"] for c in components if "postal_town" in c.get("types", [])), ""),
        )
        return {"formatted_address": result.get("formatted_address", ""), "ville": ville}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur Google Places: {e}")
