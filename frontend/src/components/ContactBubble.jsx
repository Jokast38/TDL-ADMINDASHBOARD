import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PrivacyConsentCheckbox from "@/components/PrivacyConsentCheckbox";
import { trackLead } from "@/lib/metaPixel";
import { EnvelopeSimple, X, Phone, Check } from "@phosphor-icons/react";

const PHONE_RE = /^(0[1-9]\d{8}|\+33[1-9]\d{8})$/;
const isValidPhone = (v) => PHONE_RE.test((v || "").replace(/[\s.\-]/g, ""));

// Mêmes codes que backend/services/staff_notify.py::CATEGORY_LABELS — envoyés
// tels quels comme `interest` (voir routers/callback.py, qui les utilise
// directement comme catégorie de routage vers le bon commercial/chargé
// d'admission assigné), sans quoi la demande reste non attribuée.
const INTEREST_OPTIONS = [
  { value: "VTC_TAXI", label: "VTC / Taxi" },
  { value: "CACES", label: "CACES" },
  { value: "PERMIS", label: "Récupération de points" },
  { value: "AUTO_ECOLE", label: "Auto-école" },
  { value: "SSIAP", label: "SSIAP" },
  { value: "ECSR", label: "ECSR" },
  { value: "VENTE", label: "Conseiller de Vente" },
];

// Bulle de contact flottante, indépendante de la page — remplace le lien
// "Contact" retiré de la navbar. Disponible partout où le widget est monté,
// contrairement à une simple ancre #contact qui n'existe que sur l'accueil.
export default function ContactBubble() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [form, setForm] = useState({ prenom: "", nom: "", telephone: "", message: "", interet: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!privacyConsent) {
      return toast.error("Merci d'accepter l'utilisation de vos données pour continuer");
    }
    if (!form.prenom.trim() || !form.nom.trim() || !form.telephone.trim()) {
      return toast.error("Merci de renseigner votre nom, prénom et téléphone");
    }
    if (!isValidPhone(form.telephone)) {
      return toast.error("Merci de vérifier votre numéro de téléphone (ex : 06 12 34 56 78)");
    }
    if (!form.interet) {
      return toast.error("Merci de préciser la formation qui vous intéresse");
    }
    setSending(true);
    try {
      await api.post("/callback-requests", {
        prenom: form.prenom, nom: form.nom, telephone: form.telephone, message: form.message,
        interest: form.interet, source: "contact_bubble",
      });
      setSent(true);
      trackLead({ content_name: "contact_bubble" });
    } catch {
      toast.error("Erreur lors de l'envoi, merci de réessayer ou de nous appeler directement.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Bulle flottante, juste à gauche de la bulle de chat */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-[76px] z-50 w-14 h-14 rounded-full bg-[#d4af37] hover:brightness-95 text-black shadow-xl flex items-center justify-center transition-transform hover:scale-105"
        aria-label={open ? "Fermer le contact" : "Nous contacter"}
        data-testid="contact-bubble-toggle"
      >
        {open ? <X size={24} /> : <EnvelopeSimple size={24} weight="fill" />}
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-[76px] z-50 w-[92vw] max-w-sm bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-fade-in-up"
          data-testid="contact-bubble-panel"
        >
          <div className="bg-[#0a0a0a] text-white px-4 py-3">
            <p className="font-display font-bold text-sm">Nous contacter</p>
            <p className="text-[11px] text-gray-300">Un conseiller vous recontacte sous 24h ouvrées</p>
          </div>

          <div className="p-4">
            {sent ? (
              <div className="text-center py-4" data-testid="contact-bubble-sent">
                <Check size={28} className="mx-auto mb-2" style={{ color: "#d4af37" }} />
                <p className="font-bold text-sm mb-1">Demande envoyée !</p>
                <p className="text-xs text-gray-500">Un conseiller TDL Formation vous recontacte sous 24h ouvrées.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-2.5" data-testid="contact-bubble-form">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={form.prenom}
                    onChange={(e) => set("prenom", e.target.value)}
                    placeholder="Prénom"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  <input
                    value={form.nom}
                    onChange={(e) => set("nom", e.target.value)}
                    placeholder="Nom"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <input
                  value={form.telephone}
                  onChange={(e) => set("telephone", e.target.value)}
                  placeholder="Téléphone"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
                <select
                  value={form.interet}
                  onChange={(e) => set("interet", e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 bg-white"
                  data-testid="contact-bubble-interest"
                >
                  <option value="">Quelle formation vous intéresse ?</option>
                  {INTEREST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <textarea
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="Votre message (facultatif)"
                  rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
                <PrivacyConsentCheckbox checked={privacyConsent} onChange={setPrivacyConsent} testId="contact-bubble-privacy-consent" />
                <Button
                  type="submit"
                  disabled={sending || !privacyConsent}
                  style={{ backgroundColor: "#d4af37" }}
                  className="w-full text-black font-bold uppercase text-xs tracking-wide"
                >
                  {sending ? "Envoi..." : "Envoyer"}
                </Button>
                <a
                  href="tel:+33180907249"
                  className="flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-[#d4af37] pt-1"
                >
                  <Phone size={13} /> Ou appelez le 01 80 90 72 49
                </a>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
