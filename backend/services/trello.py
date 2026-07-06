import asyncio
import logging
import requests
import os
from typing import Optional

from core.database import db

logger = logging.getLogger(__name__)


class TrelloService:
    BASE = "https://api.trello.com/1"

    @staticmethod
    async def _creds():
        s = await db.settings.find_one({"id": "global"}, {"_id": 0})
        key = os.environ.get("TRELLO_API_KEY")
        token = os.environ.get("TRELLO_API_TOKEN")
        if s and s.get("trello_api_key"):
            key = s["trello_api_key"]
        if s and s.get("trello_api_token"):
            token = s["trello_api_token"]
        return key, token, (s.get("trello_board_id") if s else None)

    @staticmethod
    async def create_card(name: str, desc: str, list_name: str = "Nouveau") -> Optional[dict]:
        key, token, board_id = await TrelloService._creds()
        if not key or not token:
            return None
        try:
            if not board_id:
                r = await asyncio.to_thread(
                    requests.post, f"{TrelloService.BASE}/boards/",
                    params={"key": key, "token": token, "name": "TDL Dossiers", "defaultLists": "false"},
                    timeout=15
                )
                if r.status_code >= 300:
                    logger.warning(f"Trello board create failed: {r.text}")
                    return None
                board_id = r.json()["id"]
                for ln in ["Nouveau", "En vérification", "Complet", "Soumis ANTS", "Terminé"]:
                    await asyncio.to_thread(
                        requests.post, f"{TrelloService.BASE}/lists",
                        params={"key": key, "token": token, "name": ln, "idBoard": board_id},
                        timeout=15
                    )
                await db.settings.update_one(
                    {"id": "global"},
                    {"$set": {"trello_board_id": board_id}},
                    upsert=True
                )
            lists = (await asyncio.to_thread(
                requests.get, f"{TrelloService.BASE}/boards/{board_id}/lists",
                params={"key": key, "token": token},
                timeout=15
            )).json()
            target = next((l for l in lists if l["name"].lower() == list_name.lower()), lists[0] if lists else None)
            if not target:
                return None
            r = await asyncio.to_thread(
                requests.post, f"{TrelloService.BASE}/cards",
                params={"key": key, "token": token, "idList": target["id"], "name": name, "desc": desc},
                timeout=15
            )
            if r.status_code >= 300:
                logger.warning(f"Trello card create failed: {r.text}")
                return None
            return r.json()
        except Exception as e:
            logger.warning(f"Trello error: {e}")
            return None

    @staticmethod
    async def move_card(card_id: str, list_name: str) -> bool:
        key, token, board_id = await TrelloService._creds()
        if not key or not token or not board_id or not card_id:
            return False
        try:
            lists = (await asyncio.to_thread(
                requests.get, f"{TrelloService.BASE}/boards/{board_id}/lists",
                params={"key": key, "token": token},
                timeout=15
            )).json()
            target = next((l for l in lists if l["name"].lower() == list_name.lower()), None)
            if not target:
                return False
            r = await asyncio.to_thread(
                requests.put, f"{TrelloService.BASE}/cards/{card_id}",
                params={"key": key, "token": token, "idList": target["id"]},
                timeout=15
            )
            return r.status_code < 300
        except Exception as e:
            logger.warning(f"Trello move error: {e}")
            return False

    @staticmethod
    async def get_board_info() -> Optional[dict]:
        key, token, board_id = await TrelloService._creds()
        if not key or not token:
            return {"connected": False, "reason": "Clés Trello manquantes"}
        if not board_id:
            return {"connected": True, "board_id": None}
        try:
            r = await asyncio.to_thread(
                requests.get, f"{TrelloService.BASE}/boards/{board_id}",
                params={"key": key, "token": token},
                timeout=10
            )
            if r.status_code >= 300:
                return {"connected": True, "board_id": board_id, "error": r.text}
            data = r.json()
            return {"connected": True, "board_id": board_id, "name": data.get("name"), "url": data.get("url")}
        except Exception as e:
            return {"connected": False, "reason": str(e)}
