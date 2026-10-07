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
import logging
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


# Au-delà de cet écart entre deux requêtes authentifiées, on considère que
# l'utilisateur s'est absenté (pause, réunion...) : le temps écoulé n'est PAS
# ajouté au compteur de temps de travail, et une nouvelle "tranche active"
# démarre au prochain ping — plutôt que de compter tout l'intervalle comme si
# la personne avait travaillé sans interruption.
_INTERACTION_GAP_LIMIT_SECONDS = 5 * 60


async def ping_session(user_id: str) -> None:
    """Heartbeat appelé depuis get_current_user à CHAQUE requête API
    authentifiée (throttlé en mémoire à 1 écriture Mongo/minute/utilisateur).
    Alimente à la fois :
    - `last_seen` (pour le point "en ligne maintenant", ONLINE_THRESHOLD_MS
      côté frontend) ;
    - `active_seconds` (temps de travail réel affiché page Activité) : on
      additionne l'écart depuis le dernier ping SEULEMENT s'il est ≤ 5 min,
      sinon ce temps est considéré comme une pause et n'est pas compté — une
      requête API authentifiée n'arrive que parce qu'une page a été ouverte/
      une action a été faite, ce qui est un signal d'activité fiable sans
      dépendre d'un heartbeat JS dédié côté frontend (moins fragile au
      décalage de déploiement front/back)."""
    now = time.monotonic()
    last = _last_ping_at.get(user_id)
    if last is not None and (now - last) < _PING_THROTTLE_SECONDS:
        return
    _last_ping_at[user_id] = now
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
        # `active_seconds` ne doit apparaître que dans $inc, jamais aussi dans
        # $setOnInsert — MongoDB refuse d'écrire deux fois le même chemin dans
        # la même commande ("would create a conflict") et rejette TOUTE la
        # requête avec une WriteError. $inc sur un champ absent part de 0 de
        # toute façon, donc $setOnInsert est inutile ici. Cette conflit a fait
        # échouer silencieusement (except Exception: pass) chaque appel depuis
        # la mise en place du suivi — personne n'a jamais eu de temps compté.
        await db.user_sessions.update_one(
            {"user_id": user_id, "date": today},
            {"$set": {"last_seen": ts, "last_interaction_at": ts},
             "$setOnInsert": {"first_seen": ts, "id": str(uuid.uuid4())},
             "$inc": {"ping_count": 1, "active_seconds": delta}},
            upsert=True,
        )
    except Exception as e:
        logging.getLogger(__name__).warning(f"ping_session: échec d'écriture pour {user_id}: {e}")


async def ping_interaction(user_id: str) -> None:
    """Appelé par le frontend sur une vraie interaction utilisateur (clic,
    frappe, scroll...), en complément de ping_session — signal plus précis
    quand il arrive, mais plus fragile (dépend du JS déployé), donc le calcul
    du temps de travail ne repose plus que sur ping_session. Partage la même
    logique d'accumulation/pause."""
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
            {"$set": {"last_interaction_at": ts}, "$setOnInsert": {"id": str(uuid.uuid4())},
             "$inc": {"active_seconds": delta}},
            upsert=True,
        )
    except Exception as e:
        logging.getLogger(__name__).warning(f"ping_interaction: échec d'écriture pour {user_id}: {e}")
