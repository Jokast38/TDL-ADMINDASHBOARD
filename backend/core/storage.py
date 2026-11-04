"""Stockage des fichiers : Supabase Storage (bucket privé, accès par la clé
service_role du backend uniquement). Les chemins enregistrés en base ne
changent pas.

Les fichiers déposés avant le 2026-11-04 sont chez Emergent : à la lecture,
un fichier absent de Supabase est cherché chez Emergent puis recopié dans
Supabase. Tant que la clé Emergent est désactivée, ces anciens fichiers
restent illisibles (voir scripts/migrate_storage.py).
"""
import asyncio
import logging
import re
import unicodedata
from typing import Optional
from urllib.parse import quote

import requests
from fastapi import HTTPException

from .config import (
    EMERGENT_LLM_KEY, STORAGE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET, SUPABASE_URL,
)

logger = logging.getLogger(__name__)
_storage_key: Optional[str] = None
_bucket_ready = False


def _supabase_headers(extra: Optional[dict] = None) -> dict:
    return {"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}", "apikey": SUPABASE_SERVICE_ROLE_KEY, **(extra or {})}


def supabase_key(path: str) -> str:
    """Supabase refuse les accents et certains caractères dans les clés, que
    les chemins peuvent contenir (nom d'origine d'une image du blog,
    extension tirée du nom du fichier envoyé). Même conversion à l'écriture
    et à la lecture : le chemin enregistré en base reste inchangé."""
    ascii_path = unicodedata.normalize("NFKD", path).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9/._-]", "_", ascii_path)


def _object_url(path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{quote(supabase_key(path), safe='/')}"


def _ensure_bucket() -> None:
    global _bucket_ready
    if _bucket_ready:
        return
    if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
        raise HTTPException(status_code=500, detail="Stockage indisponible (Supabase non configuré)")
    resp = requests.get(f"{SUPABASE_URL}/storage/v1/bucket/{SUPABASE_STORAGE_BUCKET}", headers=_supabase_headers(), timeout=30)
    if not resp.ok:
        resp = requests.post(
            f"{SUPABASE_URL}/storage/v1/bucket", headers=_supabase_headers(),
            json={"id": SUPABASE_STORAGE_BUCKET, "name": SUPABASE_STORAGE_BUCKET, "public": False}, timeout=30,
        )
        if not resp.ok and "already exists" not in resp.text:
            logger.error(f"Supabase bucket creation failed: {resp.status_code} {resp.text[:300]}")
            raise HTTPException(status_code=500, detail="Stockage indisponible")
    _bucket_ready = True


def _supabase_put(path: str, data: bytes, content_type: str) -> None:
    _ensure_bucket()
    # x-upsert : certains fichiers sont réécrits au même chemin (document signé,
    # signature, cachet...).
    resp = requests.post(
        _object_url(path), headers=_supabase_headers({"Content-Type": content_type, "x-upsert": "true"}),
        data=data, timeout=120,
    )
    if not resp.ok:
        logger.error(f"Supabase upload failed for {path}: {resp.status_code} {resp.text[:300]}")
        raise HTTPException(status_code=502, detail="Échec de l'enregistrement du fichier")


def _supabase_get(path: str) -> Optional[tuple]:
    _ensure_bucket()
    resp = requests.get(_object_url(path), headers=_supabase_headers(), timeout=60)
    if resp.ok:
        return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
    # Supabase répond 400 {"error": "not_found"} pour un objet absent.
    if resp.status_code in (400, 404):
        return None
    logger.error(f"Supabase download failed for {path}: {resp.status_code} {resp.text[:300]}")
    raise HTTPException(status_code=502, detail="Lecture du fichier impossible")


def init_storage() -> Optional[str]:
    """Clé de session du stockage Emergent, pour les anciens fichiers."""
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_LLM_KEY:
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logger.warning(f"Emergent storage init failed: {e}")
        return None


def _emergent_get(path: str) -> Optional[tuple]:
    key = init_storage()
    if not key:
        return None
    try:
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    except requests.RequestException as e:
        logger.warning(f"Emergent download failed for {path}: {e}")
        return None
    if not resp.ok:
        return None
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    await asyncio.to_thread(_supabase_put, path, data, content_type)
    return {"path": path, "size": len(data)}


async def get_object(path: str) -> tuple[bytes, str]:
    found = await asyncio.to_thread(_supabase_get, path)
    if found:
        return found
    legacy = await asyncio.to_thread(_emergent_get, path)
    if not legacy:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    try:
        await asyncio.to_thread(_supabase_put, path, legacy[0], legacy[1])
    except HTTPException:
        logger.warning(f"Copie vers Supabase impossible pour {path}")
    return legacy
