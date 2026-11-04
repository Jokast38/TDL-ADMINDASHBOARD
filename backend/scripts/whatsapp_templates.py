"""Soumission à Meta des modèles WhatsApp de core/whatsapp_templates.py, et
état de leur validation (demande du 2026-11-03). Un modèle doit être
approuvé par Meta avant le premier envoi ; tant qu'il ne l'est pas, les
envois échouent et sont journalisés dans db.whatsapp_logs.

Usage (depuis backend/) :
    python scripts/whatsapp_templates.py           # état du jeton, du numéro et des modèles
    python scripts/whatsapp_templates.py --submit  # soumet les modèles absents
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

import requests

from core.config import (
    GOOGLE_PLACE_ID, META_WHATSAPP_BUSINESS_ACCOUNT_ID, META_WHATSAPP_TOKEN, PUBLIC_FRONTEND_URL,
)
from core.whatsapp_templates import AVIS_GOOGLE, TEMPLATES, creation_payload

GRAPH_URL = "https://graph.facebook.com/v21.0"
REQUIRED_SCOPES = ("whatsapp_business_messaging", "whatsapp_business_management")


def _get(path, **params):
    r = requests.get(f"{GRAPH_URL}/{path}", params={"access_token": META_WHATSAPP_TOKEN, **params}, timeout=20)
    return r.status_code, r.json()


def main(submit: bool) -> int:
    if not (META_WHATSAPP_TOKEN and META_WHATSAPP_BUSINESS_ACCOUNT_ID):
        print("META_WHATSAPP_BUSINESS_ACCOUNT_ID ou le jeton (META_WHATSAPP_TOKEN / META_API_TOKEN) manque.")
        return 1
    _s, debug = _get("debug_token", input_token=META_WHATSAPP_TOKEN)
    scopes = (debug.get("data") or {}).get("scopes") or []
    missing = [sc for sc in REQUIRED_SCOPES if sc not in scopes]
    print(f"Droits du jeton : {', '.join(scopes) or 'aucun'}")
    if missing:
        print(f"Droits manquants : {', '.join(missing)} — à ajouter à l'utilisateur système dans Meta Business Suite.")
        return 1

    status, phones = _get(f"{META_WHATSAPP_BUSINESS_ACCOUNT_ID}/phone_numbers",
                          fields="id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,status")
    if status != 200:
        print(f"Numéros inaccessibles : {phones.get('error', {}).get('message')}")
        return 1
    for p in phones.get("data", []):
        print(f"Numéro {p.get('display_phone_number')} ({p.get('verified_name')}) — id {p['id']}, "
              f"statut {p.get('status')}, qualité {p.get('quality_rating')}, limite {p.get('messaging_limit_tier')}")

    _s, existing = _get(f"{META_WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates", fields="name,status,category", limit=200)
    known = {t["name"]: t for t in existing.get("data", [])}
    for name in TEMPLATES:
        t = known.get(name)
        print(f"  {name} : {t['status']} ({t['category']})" if t else f"  {name} : pas encore soumis")

    if not submit:
        return 0
    for name in TEMPLATES:
        if name in known:
            continue
        payload = creation_payload(name, PUBLIC_FRONTEND_URL, GOOGLE_PLACE_ID if name == AVIS_GOOGLE else None)
        r = requests.post(f"{GRAPH_URL}/{META_WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates",
                          headers={"Authorization": f"Bearer {META_WHATSAPP_TOKEN}"}, json=payload, timeout=20)
        data = r.json()
        if r.status_code < 300:
            print(f"Soumis : {name} — {data.get('status')} ({data.get('category')})")
        else:
            err = data.get("error", {})
            print(f"Refusé : {name} — {err.get('error_user_msg') or err.get('message')}")
    return 0


if __name__ == "__main__":
    sys.exit(main("--submit" in sys.argv))
