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
    """Heartbeat de connexion, appelé depuis get_current_user à chaque requête
    API authentifiée. Throttlé en mémoire pour ne toucher Mongo qu'une fois
    par minute par utilisateur. Sert UNIQUEMENT au point "en ligne maintenant"
    (voir last_seen/ONLINE_THRESHOLD_MS côté frontend) — PAS au calcul du
    temps de travail (voir ping_interaction ci-dessous), car ce ping se
    déclenche aussi sur du simple polling en arrière-plan (ex: la cloche de
    notifications toutes les 60s) même quand l'utilisateur a quitté l'onglet,
    ce qui gonflait artificiellement le temps de connexion compté."""
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


# Au-delà de cet écart entre deux interactions réelles (clic, frappe...), on
# considère que l'utilisateur s'est absenté (pause, réunion...) : le temps
# écoulé n'est PAS ajouté au compteur, et une nouvelle "tranche active"
# démarre à la prochaine interaction — plutôt que de compter tout l'intervalle
# comme si la personne avait travaillé sans interruption.
_INTERACTION_GAP_LIMIT_SECONDS = 10 * 60


async def ping_interaction(user_id: str) -> None:
    """Appelé par le frontend sur une vraie interaction utilisateur (clic,
    frappe...), throttlé côté client — mesure le temps de travail réel plutôt
    que la simple présence d'un onglet ouvert qui continue d'appeler l'API en
    arrière-plan (voir ping_session). Accumule dans `active_seconds`, remis à
    zéro chaque jour (document par utilisateur/jour comme `user_sessions`)."""
    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        now_dt = datetime.now(timezone.utc)
        ts = now_iso()
        doc = await db.user_sessions.find_one({"user_id": user_id, "date": today}, {"_id": 0})
        delta = 0
        if doc and doc.get("last_interaction_at"):
            try:
                last_dt = datetime.fromisoformat(doc["last_interaction_at"].replace("Z", "+00:00"))
                gap = (now_dt - last_dt).total_seconds()
                if 0 < gap <= _INTERACTION_GAP_LIMIT_SECONDS:
                    delta = gap
            except Exception:
                delta = 0
        await db.user_sessions.update_one(
            {"user_id": user_id, "date": today},
            {"$set": {"last_interaction_at": ts}, "$setOnInsert": {"id": str(uuid.uuid4()), "active_seconds": 0},
             "$inc": {"active_seconds": delta}},
            upsert=True,
        )
    except Exception:
        pass
