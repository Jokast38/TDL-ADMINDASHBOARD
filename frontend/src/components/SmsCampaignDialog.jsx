// Campagne SMS vers les prospects cochés dans la page Prospects, envoyée par la
// passerelle SMS personnelle (téléphone + SMS Gate, gratuit) — voir
// backend/services/sms_campaigns.py.
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChatText, WarningCircle, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

const GSM7 = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
);
const GSM7_EXT = new Set("^{}\\[~]|€\f");

function segments(text) {
  const chars = Array.from(text);
  const gsm = chars.every((c) => GSM7.has(c) || GSM7_EXT.has(c));
  const len = gsm ? chars.reduce((n, c) => n + (GSM7_EXT.has(c) ? 2 : 1), 0) : text.length;
  const [one, multi] = gsm ? [160, 153] : [70, 67];
  return { len, parts: len <= one ? 1 : Math.ceil(len / multi), gsm };
}

const EXCLUS = {
  sans_numero: "sans numéro",
  numero_invalide: "numéro invalide",
  stop: "ont répondu STOP",
  scraper: "importés par le scraper (sans consentement)",
  doublon: "numéros en double",
};
const STATUT_COLORS = { en_cours: "bg-amber-100 text-amber-800", en_pause: "bg-gray-100 text-gray-700",
  terminee: "bg-green-100 text-green-800", annulee: "bg-gray-100 text-gray-500" };

export default function SmsCampaignDialog({ leadIds, onDone }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("Bonjour {prenom}, ");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [campaigns, setCampaigns] = useState([]);

  const loadCampaigns = () => api.get("/sms-campaigns").then(({ data }) => setCampaigns(data)).catch(() => {});

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setConsent(false);
    api.post("/sms-campaigns/preview", { lead_ids: leadIds })
      .then(({ data }) => setPreview(data))
      .catch((e) => toast.error(e.response?.data?.detail || "Impossible de préparer la campagne"));
    loadCampaigns();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const example = useMemo(() => {
    if (!preview) return "";
    const txt = body.replaceAll("{prenom}", preview.exemple_prenom || "Karim").replace(/[ \t]{2,}/g, " ").trim();
    return (preview.prefix || "") + txt + (preview.stop_text ? `\n${preview.stop_text}` : "");
  }, [body, preview]);
  const seg = segments(example);

  const launch = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/sms-campaigns", { lead_ids: leadIds, body, label: label || undefined, consent_confirmed: consent });
      toast.success(`Campagne créée : ${data.total} SMS en file d'envoi`);
      loadCampaigns();
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la création");
    } finally {
      setSending(false);
    }
  };

  const action = async (id, act) => {
    try {
      await api.post(`/sms-campaigns/${id}/${act}`);
      loadCampaigns();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Action impossible");
    }
  };

  const excludedList = preview ? Object.entries(preview.excluded).filter(([, n]) => n > 0) : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid="sms-campaign-open">
          <ChatText size={14} className="mr-1" /> Campagne SMS
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Campagne SMS (passerelle gratuite)</DialogTitle></DialogHeader>

        {!preview ? (
          <p className="text-sm text-gray-500">Préparation…</p>
        ) : (
          <div className="space-y-4 mt-2">
            {!preview.configured && (
              <div className="flex gap-2 text-sm bg-red-50 border border-red-200 text-red-700 rounded-md p-3">
                <WarningCircle size={18} /> Passerelle SMS non configurée : Paramètres → SMS → Passerelle SMS.
              </div>
            )}

            <div className="text-sm bg-gray-50 border border-gray-200 rounded-md p-3 space-y-1">
              <p><b>{preview.eligible}</b> destinataire(s) sur {leadIds.length} prospect(s) sélectionné(s).</p>
              {excludedList.map(([k, n]) => <p key={k} className="text-gray-500">— {n} exclu(s) : {EXCLUS[k] || k}</p>)}
              <p className="text-gray-500">
                Envoi du lundi au samedi, 8h-20h, {preview.daily_cap} SMS max par jour.
                {!preview.window_open && <> Hors créneau maintenant ({preview.window_reason}) : départ au prochain créneau.</>}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Nom de la campagne (optionnel)</label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Session VTC janvier" />
            </div>

            <div>
              <label className="text-sm font-medium">Message — <code>{"{prenom}"}</code> est remplacé par le prénom</label>
              <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} data-testid="sms-campaign-body" />
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">Aperçu du SMS reçu :</p>
              <pre className="whitespace-pre-wrap text-sm bg-white border border-gray-200 rounded-md p-3 font-sans">{example}</pre>
              <p className={`text-xs mt-1 ${seg.parts > 2 ? "text-amber-700" : "text-gray-500"}`}>
                {seg.len} caractères · {seg.parts} SMS par destinataire
                {!seg.gsm && " · caractères spéciaux (emoji, certains accents) : 70 caractères par SMS"}
              </p>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} className="mt-0.5" data-testid="sms-campaign-consent" />
              <span>Je confirme que ces prospects ont accepté d'être contactés par SMS (obligation légale pour la prospection).</span>
            </label>

            <Button
              className="w-full bg-[#d4af37] text-black hover:bg-[#b8941f]"
              disabled={!consent || sending || !preview.eligible || !preview.configured || body.trim().length < 5}
              onClick={launch}
              data-testid="sms-campaign-send"
            >
              {sending ? "Création…" : `Lancer la campagne (${preview.eligible} SMS)`}
            </Button>

            {campaigns.length > 0 && (
              <div className="pt-4 border-t border-gray-200 space-y-2">
                <p className="text-sm font-semibold">Campagnes récentes</p>
                {campaigns.slice(0, 5).map((c) => (
                  <div key={c.id} className="text-xs border border-gray-200 rounded-md p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{c.label}</span>
                      <Badge className={STATUT_COLORS[c.status] || ""}>{c.statut_label}</Badge>
                    </div>
                    <p className="text-gray-500 mt-1">
                      {c.total} prévus · {c.stats.a_envoyer} à envoyer · {c.stats.pending} en cours ·{" "}
                      <CheckCircle size={11} className="inline" /> {c.stats.delivered} délivrés · {c.stats.sent} envoyés · {c.stats.failed} échecs
                    </p>
                    {(c.status === "en_cours" || c.status === "en_pause") && (
                      <div className="flex gap-2 mt-1">
                        {c.status === "en_cours"
                          ? <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => action(c.id, "pause")}>Pause</Button>
                          : <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => action(c.id, "reprendre")}>Reprendre</Button>}
                        <Button size="sm" variant="outline" className="h-6 text-xs text-red-600" onClick={() => action(c.id, "annuler")}>Annuler</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
