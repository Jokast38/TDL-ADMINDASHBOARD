import asyncio
import json
import logging

from pywebpush import webpush, WebPushException

from core.database import db
from core.config import VAPID_PRIVATE_KEY, VAPID_CLAIM_EMAIL

logger = logging.getLogger(__name__)


def _send_one(subscription_info: dict, payload: dict) -> bool:
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_CLAIM_EMAIL},
        )
        return True
    except WebPushException as e:
        # 404/410 = l'abonnement n'existe plus côté navigateur (désinstallé,
        # cache vidé...) — on le signale pour nettoyage plutôt que de réessayer.
        status = getattr(e.response, "status_code", None)
        if status in (404, 410):
            return False
        logger.warning(f"Push envoi échoué : {e}")
        return True  # erreur transitoire : on garde l'abonnement


async def send_push_to_user(user_id: str, title: str, body: str, url: str = "/admin") -> int:
    """Envoie une notification push à tous les navigateurs abonnés pour cet
    utilisateur. Retourne le nombre d'envois réussis. Best-effort : ne lève
    jamais d'exception (une notif push ratée ne doit jamais casser le flux
    métier qui l'a déclenchée, ex: création d'un lead)."""
    if not VAPID_PRIVATE_KEY:
        return 0
    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    if not subs:
        return 0
    payload = {"title": title, "body": body, "url": url}
    sent = 0
    for sub in subs:
        try:
            ok = await asyncio.to_thread(_send_one, sub["subscription"], payload)
            if ok:
                sent += 1
            else:
                await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
        except Exception as e:
            logger.warning(f"Push error for user {user_id}: {e}")
    return sent


async def send_push_to_users(user_ids: list, title: str, body: str, url: str = "/admin") -> int:
    total = 0
    for uid in set(user_ids):
        total += await send_push_to_user(uid, title, body, url)
    return total
