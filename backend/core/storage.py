import asyncio
import requests
import logging
from typing import Optional
from fastapi import HTTPException

from .config import STORAGE_URL, EMERGENT_LLM_KEY

logger = logging.getLogger(__name__)
_storage_key: Optional[str] = None


def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    try:
        resp = requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": EMERGENT_LLM_KEY},
            timeout=30
        )
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = await asyncio.to_thread(init_storage)
    if not key:
        raise HTTPException(status_code=500, detail="Stockage indisponible")
    resp = await asyncio.to_thread(
        requests.put,
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120
    )
    resp.raise_for_status()
    return resp.json()


async def get_object(path: str) -> tuple[bytes, str]:
    key = await asyncio.to_thread(init_storage)
    if not key:
        raise HTTPException(status_code=500, detail="Stockage indisponible")
    resp = await asyncio.to_thread(
        requests.get,
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
