"""Emails : en-têtes et version texte qui évitent les spams (2026-11-19)."""
import email
import os
import smtplib
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from services import email as email_service


def test_version_texte_lisible():
    html = '<html><head><style>p{}</style></head><body><p>Bonjour&nbsp;Karim,</p><p>Votre <b>accès</b> :<br>' \
           '<a href="https://tdl-formation.fr/login">Se connecter</a></p><ul><li>Un</li></ul></body></html>'
    assert email_service.html_to_text(html) == \
        "Bonjour Karim,\n\nVotre accès :\nSe connecter (https://tdl-formation.fr/login)\n\n- Un"


def test_date_message_id_et_partie_texte(monkeypatch):
    sent = {}

    class _Server:
        def __init__(self, *a, **k): pass
        def login(self, *a): pass
        def sendmail(self, frm, to, raw): sent["raw"] = raw
        def quit(self): pass

    monkeypatch.setattr(smtplib, "SMTP_SSL", _Server)
    email_service._smtp_send("h", 465, False, "u", "p", "TDL Formation <contact@tdl-formation.fr>",
                             "a@b.fr", "Sujet", "<p>Bonjour</p>")
    msg = email.message_from_string(sent["raw"])
    assert msg["Date"] and msg["Message-ID"].endswith("@tdl-formation.fr>")
    types = [p.get_content_type() for p in msg.walk()]
    assert "text/plain" in types and "text/html" in types
