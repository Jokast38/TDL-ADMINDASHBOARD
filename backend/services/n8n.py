import asyncio
import logging
import requests

from core.database import db

logger = logging.getLogger(__name__)


async def trigger_n8n(event: str, payload: dict):
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    url_map = {
        "inscription": s.get("n8n_webhook_inscription"),
        "dossier": s.get("n8n_webhook_dossier"),
        "payment": s.get("n8n_webhook_payment"),
    }
    url = url_map.get(event)
    if not url:
        return
    try:
        await asyncio.to_thread(requests.post, url, json={"event": event, **payload}, timeout=8)
    except Exception as e:
        logger.warning(f"n8n webhook {event} failed: {e}")
