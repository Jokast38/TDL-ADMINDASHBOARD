"""Qualification des prospects par SMS (demande du 2026-11-17).

Une campagne SMS (services/sms_campaigns.py) peut suivre un « scénario » : le
1er SMS pose une question à choix (« répondez 1, 2 ou 3 »), le prospect
répond depuis son téléphone, la passerelle nous transmet la réponse
(webhook, routers/sms_campaigns.py) et on enchaîne la question suivante.

À la fin :
  - toujours intéressé → la fiche prospect est qualifiée (statut « à relancer »,
    chaleur « chaud », réponses dans les notes), une demande de rappel est
    créée (page Inscriptions, relancée toutes les 4 h tant qu'elle n'est pas
    traitée), l'équipe assignée reçoit email + push « à rappeler », et le
    prospect reçoit notre numéro et notre WhatsApp ;
  - plus intéressé → fiche classée « non intéressé », message de politesse ;
  - réponse libre incomprise deux fois (souvent une question) → transmise à
    l'équipe comme lead à rappeler, avec le texte reçu.

Les scénarios par défaut sont ci-dessous ; `settings.global.sms_scenarios`
peut les remplacer (même forme) sans redéploiement. Chaque campagne garde une
copie de son scénario : le modifier n'affecte pas les conversations en cours.
"""
import logging
import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from core.database import db
from core.utils import now_iso
from services import smsgate

logger = logging.getLogger(__name__)

CONTACT_PHONE = "01 80 90 72 49"
WHATSAPP_LINK = "wa.me/33698595591"
CONVERSATION_DAYS = 7
MAX_INCOMPRIS = 2

_CONTACT = f"Vous pouvez aussi nous joindre au {CONTACT_PHONE} ou sur WhatsApp : {WHATSAPP_LINK}"
_OUI = ["oui", "ok", "yes", "ouais", "ouai", "oue", "o", "daccord", "dac", "bien sur"]
_NON = ["non", "no", "nan", "n", "plus interesse", "pas interesse"]

# options : code → {label, keys (réponses acceptées), fin: "refus" pour clore}
DEFAULT_SCENARIOS = {
    "vtc": {
        "label": "Formation VTC",
        "category": "VTC_TAXI",
        "steps": [
            {
                "id": "financement",
                "question": "Bonjour {prenom}, vous vous étiez renseigné(e) sur la formation VTC. Pour vous orienter, "
                            "répondez 1 si vous avez un compte CPF et un compte CMA, 2 si vous avez seulement le CPF, "
                            "3 si vous n'avez ni l'un ni l'autre.",
                "options": {
                    "1": {"label": "CPF + compte CMA", "keys": ["1"]},
                    "2": {"label": "CPF seulement", "keys": ["2"]},
                    "3": {"label": "Ni CPF ni compte CMA", "keys": ["3"]},
                },
            },
            {
                "id": "interet",
                "question": "Merci ! Etes-vous toujours intéressé(e) par la formation VTC ? Répondez OUI ou NON.",
                "options": {
                    "oui": {"label": "Toujours intéressé", "keys": _OUI},
                    "non": {"label": "Plus intéressé", "keys": _NON, "fin": "refus"},
                },
            },
        ],
        "final": "Parfait, un conseiller vous rappelle très vite. " + _CONTACT,
        "refus": "Merci pour votre réponse, nous ne vous relancerons plus pour cette formation. Bonne journée !",
    },
    "caces": {
        "label": "Formation CACES",
        "category": "CACES",
        "steps": [
            {
                "id": "financement",
                "question": "Bonjour {prenom}, vous vous étiez renseigné(e) sur le CACES. Pour vous orienter, "
                            "répondez 1 si votre employeur finance, 2 si vous etes inscrit à France Travail, "
                            "3 si vous avez un compte CPF, 4 si vous payez vous-meme.",
                "options": {
                    "1": {"label": "Financement employeur/OPCO", "keys": ["1"]},
                    "2": {"label": "France Travail", "keys": ["2"]},
                    "3": {"label": "CPF", "keys": ["3"]},
                    "4": {"label": "Financement personnel", "keys": ["4"]},
                },
            },
            {
                "id": "interet",
                "question": "Merci ! Etes-vous toujours intéressé(e) par le CACES ? Répondez OUI ou NON.",
                "options": {
                    "oui": {"label": "Toujours intéressé", "keys": _OUI},
                    "non": {"label": "Plus intéressé", "keys": _NON, "fin": "refus"},
                },
            },
        ],
        "final": "Parfait, un conseiller vous rappelle très vite. " + _CONTACT,
        "refus": "Merci pour votre réponse, nous ne vous relancerons plus pour cette formation. Bonne journée !",
    },
}

STATUTS = {"en_attente": "En attente de réponse", "qualifie": "Qualifié — à rappeler",
           "a_rappeler": "Réponse libre — à rappeler", "pas_interesse": "Plus intéressé", "stop": "STOP"}
# Une fiche déjà inscrite/payée ne doit jamais être « déclassée » par un SMS.
_STATUTS_MODIFIABLES = (None, "", "a_contacter", "a_relancer", "injoignable", "non_interesse")


async def config() -> dict:
    """Interrupteur général + scénarios. Tant que l'équipe n'a rien enregistré
    (Paramètres → SMS → Réponses automatiques), les scénarios par défaut
    ci-dessus servent de modèle ; ensuite seule sa liste compte (on peut donc
    en supprimer)."""
    s = await db.settings.find_one({"id": "global"}, {"_id": 0, "sms_scenarios": 1, "sms_qualification_enabled": 1}) or {}
    saved = s.get("sms_scenarios")
    return {"enabled": s.get("sms_qualification_enabled") is not False,
            "scenarios": saved if isinstance(saved, dict) else DEFAULT_SCENARIOS}


async def scenarios(active_only: bool = False) -> dict:
    sc = (await config())["scenarios"]
    return {k: v for k, v in sc.items() if not active_only or v.get("actif", True)}


def build_options(options: list) -> dict:
    """Options saisies dans l'éditeur [{code, label, fin}] → forme interne,
    avec les synonymes usuels pour OUI / NON."""
    out = {}
    for o in options:
        code = normalize_answer(o.get("code", ""))
        if not code:
            continue
        keys = [code] + (_OUI if code == "oui" else _NON if code == "non" else [])
        out[code] = {"label": (o.get("label") or code).strip(), "keys": keys, **({"fin": "refus"} if o.get("fin") else {})}
    return out


def first_message_body(scenario: dict) -> str:
    return scenario["steps"][0]["question"]


def normalize_answer(text: str) -> str:
    t = unicodedata.normalize("NFKD", (text or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def match_option(step: dict, text: str) -> Optional[str]:
    """Code de l'option reconnue dans la réponse, sinon None. Accepte la
    réponse exacte (« 1 », « oui ») ou son premier mot (« 1 merci », « oui
    bien sûr ») — mais pas un chiffre noyé dans une phrase, trop ambigu."""
    answer = normalize_answer(text)
    if not answer:
        return None
    first = answer.split(" ")[0]
    for code, opt in step["options"].items():
        keys = [normalize_answer(k) for k in opt.get("keys", [code])]
        if answer in keys or first in keys or any(" " in k and answer.startswith(k) for k in keys):
            return code
    return None


# ── Démarrage (à l'envoi du 1er SMS de la campagne) ─────────────────────────

async def start_conversation(campaign: dict, recipient: dict) -> None:
    now = datetime.now(timezone.utc)
    await db.sms_conversations.insert_one({
        "id": str(uuid.uuid4()), "campaign_id": campaign["id"], "lead_id": recipient["lead_id"],
        "phone": recipient["phone"], "prenom": recipient.get("prenom", ""),
        "scenario_key": campaign.get("scenario_key"), "step": 0, "answers": [], "incompris": 0,
        "status": "en_attente", "created_at": now.isoformat(), "updated_at": now.isoformat(),
        "expires_at": (now + timedelta(days=CONVERSATION_DAYS)).isoformat(),
    })


# ── Réponses reçues ─────────────────────────────────────────────────────────

async def _reply(conv: dict, text: str) -> None:
    """SMS de réponse immédiat (le prospect vient de nous écrire : pas de
    créneau horaire à attendre). Une panne de passerelle n'empêche pas
    d'enregistrer la réponse ni d'alerter l'équipe."""
    cfg = await smsgate.gateway_config()
    msg_id = uuid.uuid4().hex
    log = {"id": msg_id, "gateway_id": msg_id, "provider": "smsgate", "category": "qualification",
           "campaign_id": conv.get("campaign_id"), "lead_id": conv.get("lead_id"), "to": conv["phone"],
           "content": text, "created_at": now_iso(), "updated_at": now_iso()}
    try:
        res = await smsgate.send(cfg, msg_id, conv["phone"], text)
        log.update(gateway_id=res.get("id") or msg_id, status="pending")
    except Exception as e:
        log.update(status="failed", error=str(e))
        logger.warning(f"Qualification SMS : réponse non envoyée à {conv['phone']} ({e})")
    await db.sms_logs.insert_one(log)


def _answers_text(answers: list) -> str:
    return " · ".join(a["label"] for a in answers)


async def _close(conv: dict, status: str, extra: Optional[dict] = None) -> None:
    await db.sms_conversations.update_one({"id": conv["id"]}, {"$set": {
        "status": status, "closed_at": now_iso(), "updated_at": now_iso(), **(extra or {})}})


async def _update_lead(conv: dict, scenario: dict, status: str, answers: list, free_text: str = "") -> Optional[dict]:
    lead = await db.leads.find_one({"id": conv["lead_id"]}, {"_id": 0}) if conv.get("lead_id") else None
    if not lead:
        return None
    resume = f"{scenario['label']} : {_answers_text(answers) or 'aucune réponse reconnue'}"
    if free_text:
        resume += f" — message : « {free_text[:300]} »"
    line = f"[{datetime.now(smsgate.PARIS):%d/%m/%Y %H:%M}] Qualification SMS — {resume}"
    update = {
        "sms_qualification": {"status": status, "scenario": conv.get("scenario_key"), "label": scenario["label"],
                              "answers": answers, "message": free_text or None, "at": now_iso()},
        "notes": ((lead.get("notes") or "").rstrip() + "\n" + line).strip(),
        "updated_at": now_iso(),
    }
    if lead.get("statut") in _STATUTS_MODIFIABLES:
        if status == "pas_interesse":
            update.update({"statut": "non_interesse", "motif_cloture": "plus_interesse"})
        else:
            update.update({"statut": "a_relancer", "chaleur": "chaud", "pipeline_status": "a_recontacter"})
    if scenario.get("category") and not lead.get("category"):
        update["category"] = scenario["category"]
    await db.leads.update_one({"id": lead["id"]}, {"$set": update})
    from routers.leads import _leads_cache_clear
    _leads_cache_clear()
    return {**lead, **update}


async def _hand_to_team(conv: dict, scenario: dict, lead: Optional[dict], answers: list, free_text: str = "") -> None:
    """Demande de rappel + alerte immédiate de l'équipe assignée."""
    from urllib.parse import quote
    from services.staff_notify import CALLBACK_NOTIFY_ROLES, notify_new_contact

    name = (lead or {}).get("name") or conv.get("prenom") or conv["phone"]
    prenom, _, nom = name.partition(" ")
    detail = _answers_text(answers)
    message = f"Qualifié par SMS ({scenario['label']}) : {detail}" if detail else f"Réponse SMS ({scenario['label']})"
    if free_text:
        message += f" — « {free_text[:300]} »"
    await db.callback_requests.insert_one({
        "id": str(uuid.uuid4()), "prenom": prenom, "nom": nom, "telephone": conv["phone"],
        "email": (lead or {}).get("email") or "", "message": message, "session": scenario["label"],
        "source": "sms_qualification", "interest": scenario.get("category"), "center": "",
        "from_meta_ads": False, "lead_id": conv.get("lead_id"), "handled": False, "notes": "", "created_at": now_iso(),
    })
    body = (f"<p>Prospect qualifié par SMS, <b>à rappeler</b> :</p>"
            f"<p>Nom : <b>{name}</b><br>Téléphone : <b>{conv['phone']}</b></p>"
            f"<p>{scenario['label']} — {detail or 'réponse libre'}</p>"
            + (f"<p>Son message : « {free_text[:300]} »</p>" if free_text else ""))
    await notify_new_contact(
        category=scenario.get("category"), roles=CALLBACK_NOTIFY_ROLES,
        email_subject=f"📞 À rappeler — {name} (qualifié par SMS)", email_body_html=body,
        push_title="📞 Lead qualifié par SMS — à rappeler",
        push_body=f"{name} — {detail or free_text[:80]}",
        push_url=f"/admin/leads?q={quote(conv['phone'])}",
        action_label="Voir le prospect", action_path=f"/admin/leads?q={quote(conv['phone'])}",
    )


async def handle_reply(phone: str, message: str) -> bool:
    """Réponse d'un prospect (hors STOP). True si elle appartenait à une conversation.
    Réponses automatiques désactivées → False : la réponse est seulement
    transmise à l'équipe (services/sms_campaigns.py), aucun SMS ne repart."""
    if not (await config())["enabled"]:
        return False
    now = now_iso()
    conv = None
    for c in await db.sms_conversations.find(
            {"phone": phone, "status": "en_attente"}, {"_id": 0}).sort("created_at", -1).to_list(5):
        if (c.get("expires_at") or "") > now:
            conv = c
            break
    if not conv:
        return False
    campaign = await db.sms_campaigns.find_one({"id": conv["campaign_id"]}, {"_id": 0, "scenario": 1}) or {}
    scenario = campaign.get("scenario") or (await scenarios()).get(conv.get("scenario_key"))
    if not scenario:
        return False
    step = scenario["steps"][conv["step"]]
    code = match_option(step, message)
    answers = list(conv.get("answers") or [])

    if code is None:
        incompris = conv.get("incompris", 0) + 1
        if incompris >= MAX_INCOMPRIS:
            # Deux réponses libres : souvent une vraie question — un humain prend le relais.
            lead = await _update_lead(conv, scenario, "a_rappeler", answers, message)
            await _close(conv, "a_rappeler", {"last_message": message[:500]})
            await _hand_to_team(conv, scenario, lead, answers, message)
            await _reply(conv, "Merci, un conseiller vous rappelle très vite. " + _CONTACT)
            return True
        await db.sms_conversations.update_one({"id": conv["id"]}, {"$set": {
            "incompris": incompris, "last_message": message[:500], "updated_at": now}})
        choix = ", ".join(c.upper() for c in step["options"])
        await _reply(conv, f"Désolé, nous n'avons pas compris. Répondez simplement par {choix}.")
        return True

    opt = step["options"][code]
    answers.append({"question": step["id"], "code": code, "label": opt["label"], "raw": message[:160]})
    if opt.get("fin") == "refus":
        await _update_lead(conv, scenario, "pas_interesse", answers)
        await _close(conv, "pas_interesse", {"answers": answers})
        await _reply(conv, scenario["refus"])
        return True
    if conv["step"] + 1 < len(scenario["steps"]):
        await db.sms_conversations.update_one({"id": conv["id"]}, {"$set": {
            "step": conv["step"] + 1, "answers": answers, "incompris": 0, "updated_at": now}})
        await _reply(conv, scenario["steps"][conv["step"] + 1]["question"].replace("{prenom}", conv.get("prenom") or ""))
        return True
    lead = await _update_lead(conv, scenario, "qualifie", answers)
    await _close(conv, "qualifie", {"answers": answers})
    await _hand_to_team(conv, scenario, lead, answers)
    await _reply(conv, scenario["final"])
    return True


async def close_on_stop(phone: str) -> None:
    for c in await db.sms_conversations.find({"phone": phone, "status": "en_attente"}, {"_id": 0, "id": 1}).to_list(20):
        await _close(c, "stop")


async def campaign_stats(campaign_id: str) -> dict:
    convs = await db.sms_conversations.find({"campaign_id": campaign_id}, {"_id": 0, "status": 1, "answers": 1, "incompris": 1}).to_list(100000)
    stats = {k: 0 for k in STATUTS}
    for c in convs:
        stats[c.get("status")] = stats.get(c.get("status"), 0) + 1
    stats["ont_repondu"] = sum(1 for c in convs if c.get("answers") or c.get("incompris") or c.get("status") != "en_attente")
    return stats
