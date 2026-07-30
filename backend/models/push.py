from typing import Any, Dict
from pydantic import BaseModel


class PushSubscribeIn(BaseModel):
    subscription: Dict[str, Any]  # objet PushSubscription tel que renvoyé par pushManager.subscribe()


class PushUnsubscribeIn(BaseModel):
    endpoint: str
