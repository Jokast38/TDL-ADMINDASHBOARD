"""Template email de marque TDL Formation (logo, couleurs, pied de page) —
même design que les emails de relance déjà envoyés depuis la page Leads.
Utilisé par le composeur d'email personnalisé (routers/custom_email.py) pour
qu'un email écrit en texte simple ressorte avec l'identité visuelle standard,
sans que l'utilisateur ait à connaître la moindre balise HTML."""
import html

TDL_SITE = "https://tdl-formation.fr"
TDL_PHONE = "01 80 90 72 49"
TDL_LOGO = "https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png"

_HEADER = f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.07);">
      <tr>
        <td align="center" style="background-color:#0a0a0a;padding:28px 24px;">
          <img src="{TDL_LOGO}" alt="TDL Formation" width="60" height="60" style="display:block;border-radius:8px;margin:0 auto 12px;" />
          <p style="margin:0;color:#d4af37;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;">TDL Formation</p>
          <p style="margin:6px 0 0 0;color:#ffffff;font-size:12px;">TOP DRIVE LEARNING</p>
        </td>
      </tr>
      <tr><td style="height:4px;background-color:#d4af37;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:36px 36px 8px 36px;">"""

_CONTACT_BAR = f"""
      <tr>
        <td style="padding:0 36px 32px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f8;border-radius:6px;border-left:3px solid #d4af37;">
            <tr><td style="padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#555555;">Vous préférez nous appeler directement ?</p>
              <p style="margin:4px 0 0 0;font-size:16px;font-weight:bold;color:#0a0a0a;">{TDL_PHONE}</p>
              <p style="margin:2px 0 0 0;font-size:11px;color:#999999;">Du lundi au vendredi, 9h – 18h</p>
            </td></tr>
          </table>
        </td>
      </tr>"""

_FOOTER = f"""
      <tr><td style="padding:0 36px;"><hr style="border:none;border-top:1px solid #eeeeee;" /></td></tr>
      <tr>
        <td style="padding:20px 36px 28px 36px;">
          <p style="margin:0;font-size:14px;color:#333333;">Cordialement,</p>
          <p style="margin:4px 0 0 0;font-size:14px;font-weight:bold;color:#0a0a0a;">L'équipe TDL Formation</p>
        </td>
      </tr>
      <tr>
        <td align="center" style="background-color:#0a0a0a;padding:20px 24px;">
          <p style="margin:0;font-size:11px;color:#888888;">TOP DRIVE LEARNING · 59 avenue Joffre, 93800 Épinay-sur-Seine</p>
          <p style="margin:6px 0 2px 0;font-size:11px;color:#888888;">{TDL_PHONE}</p>
          <p style="margin:0;font-size:11px;"><a href="{TDL_SITE}" style="color:#d4af37;text-decoration:none;">tdl-formation.fr</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>"""


def _cta_block(label: str, url: str) -> str:
    return f"""
      </td></tr>
      <tr>
        <td align="center" style="padding:8px 36px 36px 36px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:6px;background-color:#d4af37;">
              <a href="{html.escape(url)}" target="_blank"
                 style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:bold;color:#0a0a0a;text-decoration:none;border-radius:6px;letter-spacing:0.3px;">
                {html.escape(label)}
              </a>
            </td>
          </tr></table>
        </td>
      </tr>"""


def _plain_text_to_html(text: str) -> str:
    """Un utilisateur tape du texte simple (pas de balises) : chaque ligne
    vide sépare un paragraphe, les sauts de ligne simples deviennent <br>."""
    paragraphs = [p for p in text.strip().split("\n\n") if p.strip()]
    parts = []
    for p in paragraphs:
        escaped = html.escape(p.strip()).replace("\n", "<br>")
        parts.append(f'<p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">{escaped}</p>')
    return "".join(parts)


def render_branded_email(message: str, button_label: str = None, button_url: str = None) -> str:
    """Construit l'email complet (texte utilisateur + gabarit de marque)."""
    body_html = _plain_text_to_html(message)
    cta = _cta_block(button_label, button_url) if (button_label and button_url) else "\n      </td></tr>"
    return _HEADER + body_html + cta + _CONTACT_BAR + _FOOTER
