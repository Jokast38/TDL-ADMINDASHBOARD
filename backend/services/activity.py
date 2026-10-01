"""Journal d'activité "qui a fait quoi, quand" (type CRM) + suivi du temps de
connexion. Deux collections :

- db.activity_log : un document par action notable (lead contacté, appel
  loggé, dossier traité, demande de rappel traitée...), append-only, jamais
  modifié — contrairement aux champs `processed_by`/`last_contacted_by`
  existants ailleurs dans le code qui ne gardent que le DERNIER passage.
- db.user_sessions : un document par (utilisateur, jour), avec first_seen/
  last_seen mis à jour à chaque requête authentifiée (voir core/security.py)
  — le temps de connexion du jour est estimé par (last_seen - first_seen).
  Pas une vraie mesure de présence active, mais suffisant pour du suivi RH
  sans instrumenter le frontend (heartbeat JS, etc.)."""
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from core.database import db
from core.utils import now_iso

# Throttle des écritures de ping de connexion : une requête authentifiée est
# déclenchée à CHAQUE appel API, donc sans ce throttle on écrirait en base à
# chaque clic. Un ping par utilisateur toutes les 60s suffit amplement pour
# estimer un temps de connexion journalier.
_PING_THROTTLE_SECONDS = 60
_last_ping_at: dict = {}


async def log_action(user: dict, action: str, target_type: Optional[str] = None,
                      target_id: Optional[str] = None, meta: Optional[dict] = None) -> None:
    """Enregistre une entrée d'activité. Ne lève jamais d'exception (un
    incident de logging ne doit jamais faire échouer l'action métier qui
    l'a déclenché)."""
    try:
        await db.activity_log.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"], "user_name": user.get("name", ""),
            "action": action, "target_type": target_type, "target_id": target_id,
            "meta": meta or {}, "at": now_iso(),
        })
    except Exception:
        pass


async def ping_session(user_id: str) -> None:
    """Heartbeat de connexion, appelé depuis get_current_user. Throttlé en
    mémoire pour ne toucher Mongo qu'une fois par minute par utilisateur."""
    now = time.monotonic()
    last = _last_ping_at.get(user_id)
    if last is not None and (now - last) < _PING_THROTTLE_SECONDS:
        return
    _last_ping_at[user_id] = now
    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        ts = now_iso()
        await db.user_sessions.update_one(
            {"user_id": user_id, "date": today},
            {"$set": {"last_seen": ts}, "$setOnInsert": {"first_seen": ts, "id": str(uuid.uuid4())},
             "$inc": {"ping_count": 1}},
            upsert=True,
        )
    except Exception:
        pass
