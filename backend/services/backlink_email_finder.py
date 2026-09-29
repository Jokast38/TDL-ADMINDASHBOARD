"""Recherche l'email de contact d'un site de backlink — homepage puis
quelques pages "contact" usuelles, cherche un `mailto:` ou une adresse email
dans le HTML brut (pas de dépendance HTML-parsing supplémentaire).

Utilisé par routers/backlinks.py (bouton "Chercher les emails" par lot, et
bouton par ligne) pour préremplir `contact_email` avant l'envoi manuel de la
demande (voir send_backlink_request) — cette fonction ne contacte jamais le
site elle-même, elle ne fait que lire ses pages publiques.

Leçons du premier passage manuel (voir historique) : accepter le premier
email trouvé sur la page sans vérifier son domaine remonte trop souvent
l'email d'un tiers cité sur la page (agence web, partenaire, plateforme
d'hébergement) plutôt que celui du site visé — d'où la préférence stricte
pour un email du même domaine, et la liste de motifs à ignorer (gabarits,
plateformes génériques, adresses techniques)."""
import asyncio
import re
from typing import Optional

import httpx

CONTACT_PATHS = ["/", "/contact", "/contact-us", "/contactez-nous", "/nous-contacter", "/about", "/a-propos", "/mentions-legales"]
UA = "Mozilla/5.0 (compatible; TDLFormationOutreach/1.0; +https://www.tdl-formation.fr)"
TIMEOUT = 10
DELAY_BETWEEN_REQUESTS = 0.5

MAILTO_RE = re.compile(r'href=["\']mailto:([^"\'?]+)', re.IGNORECASE)
EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')

# Adresses "techniques"/génériques à ignorer (pas un vrai contact du site
# visé derrière) — plateformes d'hébergement/site-builder, gabarits laissés
# par un thème, services tiers embarqués (analytics, avis...).
_IGNORE_PATTERNS = [
    "wixpress.com", "sentry.io", "example.com", "domain.com", "yourdomain",
    "schema.org", "w3.org", "godaddy.com", "namecheap.com", "cloudflare.com",
    "noreply@", "no-reply@", "donotreply@", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
    "wordpress.org", "gravatar.com", "webflow.com", "squarespace.com", "shopify.com",
    "jimdo.com", "site123.com", "exemple.fr", "exemple.com",
]


def _clean(email: str) -> str:
    return email.strip().rstrip(".,;)\"'").lower()


def _is_valid(email: str) -> bool:
    email = _clean(email)
    if not EMAIL_RE.fullmatch(email):
        return False
    return not any(p in email for p in _IGNORE_PATTERNS)


def _site_root_domain(root: str) -> str:
    host = root.split("//", 1)[-1].split("/", 1)[0]
    return host[4:] if host.startswith("www.") else host


def _extract_email(html: str, target_domain: str) -> Optional[str]:
    candidates = []
    m = MAILTO_RE.search(html)
    if m and _is_valid(m.group(1)):
        candidates.append(_clean(m.group(1)))
    for m in EMAIL_RE.finditer(html):
        e = _clean(m.group(0))
        if _is_valid(e) and e not in candidates:
            candidates.append(e)
    if not candidates:
        return None
    # Préfère une adresse sur le même domaine (ou un sous-domaine/TLD très
    # proche) que le site visé — voir le module docstring.
    for e in candidates:
        ed = e.split("@", 1)[-1]
        if ed == target_domain or ed.endswith("." + target_domain) or target_domain.endswith("." + ed):
            return e
    return None  # aucune correspondance fiable : mieux vaut ne rien remonter qu'un email de tiers


def root_url(site_name: str) -> str:
    domain = (site_name or "").strip()
    return domain if domain.startswith("http") else f"https://{domain}"


async def find_email(client: httpx.AsyncClient, site_name: str) -> Optional[str]:
    """Cherche un email de contact pour un site — None si rien de fiable
    trouvé (jamais d'exception : les erreurs réseau sont avalées page par
    page, une page qui échoue ne doit pas empêcher d'essayer la suivante)."""
    root = root_url(site_name)
    target_domain = _site_root_domain(root)
    for path in CONTACT_PATHS:
        try:
            resp = await client.get(root + path, headers={"User-Agent": UA}, timeout=TIMEOUT, follow_redirects=True)
            if resp.status_code < 400 and resp.text:
                email = _extract_email(resp.text, target_domain)
                if email:
                    return email
        except Exception:
            pass
        await asyncio.sleep(DELAY_BETWEEN_REQUESTS)
    return None
