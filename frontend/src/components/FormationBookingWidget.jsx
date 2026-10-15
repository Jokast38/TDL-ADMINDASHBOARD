import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Minus, Plus, CaretRight, Check } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import PrivacyConsentCheckbox from "@/components/PrivacyConsentCheckbox";
import { useUpcomingSessions, sessionLabel } from "@/components/UpcomingSessions";
import { trackLead, trackSchedule, newEventId, getFbCookies } from "@/lib/metaPixel";

const GOLD = "#d4af37";

const PHONE_RE = /^(0[1-9]\d{8}|\+33[1-9]\d{8})$/;
const isValidPhone = (v) => PHONE_RE.test((v || "").replace(/[\s.\-]/g, ""));

const CENTERS = [
  { id: "epinay", label: "Épinay-sur-Seine (93)", match: "Épinay" },
  { id: "creil", label: "Creil (60)", match: "Creil" },
];

const FINANCEMENTS = ["Personnel", "CPF", "France Travail", "Employeur"];

// Les 8 onglets attendus par le cahier des charges (maquette) — certains se
// partagent une seule catégorie backend (VTC_TAXI), distingués ici par un
// mot-clé dans le titre de la formation plutôt que par un champ dédié, pour
// ne pas avoir à modifier le modèle Formation.
const TABS = [
  { key: "VTC", label: "VTC", category: "VTC_TAXI", match: /vtc/i },
  { key: "TAXI", label: "Taxi", category: "VTC_TAXI", match: /taxi/i },
  { key: "CACES", label: "CACES", category: "CACES" },
  { key: "SSIAP", label: "SSIAP", category: "SSIAP" },
  { key: "ECSR", label: "ECSR", category: "ECSR" },
  { key: "PERMIS", label: "Points", category: "PERMIS" },
  { key: "AUTO_ECOLE", label: "Auto-école", category: "AUTO_ECOLE" },
  { key: "VENTE", label: "Vente", category: "VENTE" },
];

function formationsForTab(formations, tab) {
  const inCategory = formations.filter((f) => f.category === tab.category);
  if (!tab.match) return inCategory;
  const matched = inCategory.filter((f) => tab.match.test(f.title || ""));
  return matched.length > 0 ? matched : inCategory;
}

function tabForFormation(formations, formationId) {
  const f = formations.find((x) => x.id === formationId);
  if (!f) return null;
  return TABS.find((t) => t.category === f.category && (!t.match || t.match.test(f.title || ""))) || TABS.find((t) => t.category === f.category);
}

/** Widget de réservation multi-formations ("Réservez votre formation en
 * ligne") — reproduit la maquette (onglets par formation, centre, session,
 * financement, participants) branché sur les vraies formations/sessions du
 * backend plutôt que des données statiques. Soumet via /callback-requests
 * (même endpoint que les autres formulaires de contact publics) : c'est une
 * demande de rappel qualifiée, pas une inscription ferme avec paiement —
 * l'équipe confirme la place et accompagne le dossier ANTS ensuite. */
export default function FormationBookingWidget({ formationId: initialFormationId, defaultTabKey, source = "booking_widget", className = "" }) {
  const [formations, setFormations] = useState([]);
  const [activeTab, setActiveTab] = useState(() => TABS.find((t) => t.key === defaultTabKey) || TABS[0]);
  const [selectedFormationId, setSelectedFormationId] = useState(initialFormationId || "");
  const [center, setCenter] = useState(CENTERS[0].id);
  const [permisAnnee, setPermisAnnee] = useState("");
  const [financement, setFinancement] = useState(FINANCEMENTS[0]);
  const [participants, setParticipants] = useState(1);
  const [showPrice, setShowPrice] = useState(false);
  const [form, setForm] = useState({ prenom: "", nom: "", email: "", telephone: "" });
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api.get("/formations", { params: { active_only: true } }).then(({ data }) => {
      const list = data || [];
      setFormations(list);
      if (initialFormationId) {
        const tab = tabForFormation(list, initialFormationId);
        if (tab) setActiveTab(tab);
      }
    }).catch(() => setFormations([]));
  }, [initialFormationId]);

  const optionsForTab = useMemo(() => formationsForTab(formations, activeTab), [formations, activeTab]);

  useEffect(() => {
    if (optionsForTab.length === 0) { setSelectedFormationId(""); return; }
    if (!optionsForTab.some((f) => f.id === selectedFormationId)) {
      setSelectedFormationId(optionsForTab[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsForTab]);

  const selectedFormation = formations.find((f) => f.id === selectedFormationId) || null;
  const { sessions } = useUpcomingSessions(selectedFormationId);
  const centerLabel = CENTERS.find((c) => c.id === center)?.match || "";
  const sessionsForCenter = sessions.filter((s) => !centerLabel || (s.lieu_ville || "").includes(centerLabel));
  const [selectedSessionId, setSelectedSessionId] = useState("");
  useEffect(() => {
    setSelectedSessionId(sessionsForCenter[0]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFormationId, center, sessions.length]);
  const selectedSession = sessionsForCenter.find((s) => s.id === selectedSessionId) || null;

  const showPermisField = activeTab.key === "VTC" || activeTab.key === "TAXI";
  const priceLabel = selectedFormation?.price
    ? `${(selectedFormation.price * participants).toLocaleString("fr-FR")} € TTC`
    : "Sur devis";

  const submit = async (e) => {
    e.preventDefault();
    if (!form.prenom.trim() || !form.nom.trim() || !form.telephone.trim()) {
      toast.error("Merci de renseigner vos coordonnées");
      return;
    }
    if (!isValidPhone(form.telephone)) {
      toast.error("Merci de vérifier votre numéro de téléphone (10 chiffres, ex : 06 12 34 56 78)");
      return;
    }
    if (!consent) {
      toast.error("Merci d'accepter l'utilisation de vos données");
      return;
    }
    setSending(true);
    try {
      const eventId = newEventId();
      trackLead({ content_name: source, value: selectedFormation?.price, currency: "EUR" }, eventId);
      trackSchedule({ content_name: selectedFormation?.title || activeTab.label });
      await api.post("/callback-requests", {
        prenom: form.prenom.trim(), nom: form.nom.trim(),
        telephone: form.telephone.trim(), email: form.email.trim(),
        interest: activeTab.category,
        session: selectedFormation
          ? `${selectedFormation.title}${selectedSession ? " — " + sessionLabel(selectedSession) : ""}`
          : activeTab.label,
        center: CENTERS.find((c) => c.id === center)?.label || "",
        message: [
          permisAnnee && `Permis B obtenu en ${permisAnnee}`,
          `Financement envisagé : ${financement}`,
          `Participants : ${participants}`,
        ].filter(Boolean).join(" · "),
        source,
        page_url: window.location.href,
        event_id: eventId,
        ...getFbCookies(),
      });
      setSent(true);
    } catch (err) {
      toast.error("Erreur lors de l'envoi, merci de réessayer.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={`py-16 lg:py-20 ${className}`} id="reservation">
      <div className="max-w-3xl mx-auto px-6 lg:px-8 text-center mb-10">
        <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">Réservez votre formation en ligne</h2>
        <p className="text-gray-500">
          Choisissez votre formation, votre centre et votre session : un conseiller confirme votre place et vous accompagne pour le dossier ANTS.
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-6 lg:px-8">
        <div className="bg-white rounded-xl border-t-4 shadow-lg" style={{ borderTopColor: GOLD }}>
          <div className="p-6 sm:p-8">
            {sent ? (
              <div className="text-center py-10" data-testid="booking-widget-sent">
                <Check size={32} className="mx-auto mb-3" style={{ color: GOLD }} weight="bold" />
                <p className="font-bold mb-1">Demande envoyée !</p>
                <p className="text-sm text-gray-500">Un conseiller TDL Formation vous recontacte sous 24h ouvrées pour confirmer votre place.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5" data-testid="booking-widget-form">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 block">Formation <span className="text-red-500">*</span></label>
                  <div className="flex flex-wrap gap-2">
                    {TABS.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveTab(t)}
                        className={`px-3.5 py-2 rounded-md text-xs font-bold uppercase tracking-wide border transition-colors ${
                          activeTab.key === t.key ? "bg-black text-white border-black" : "border-gray-200 text-gray-600 hover:border-gray-400"
                        }`}
                        data-testid={`booking-tab-${t.key}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 block">Centre <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      {CENTERS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCenter(c.id)}
                          className={`flex-1 px-3 py-2.5 rounded-md text-xs font-bold border transition-colors ${
                            center === c.id ? "text-black border-transparent" : "border-gray-200 text-gray-600 hover:border-gray-400"
                          }`}
                          style={center === c.id ? { backgroundColor: GOLD } : {}}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 block">Type de formation <span className="text-red-500">*</span></label>
                    <select
                      value={selectedFormationId}
                      onChange={(e) => setSelectedFormationId(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm bg-white"
                      data-testid="booking-formation-select"
                    >
                      {optionsForTab.length === 0 && <option value="">Aucune formation disponible</option>}
                      {optionsForTab.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 block">Session souhaitée <span className="text-red-500">*</span></label>
                  <select
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm bg-white"
                    data-testid="booking-session-select"
                  >
                    {sessionsForCenter.length === 0 && <option value="">Sur demande — un conseiller vous propose une date</option>}
                    {sessionsForCenter.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}
                  </select>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  {showPermisField && (
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 block">Permis B obtenu en</label>
                      <input
                        value={permisAnnee}
                        onChange={(e) => setPermisAnnee(e.target.value)}
                        placeholder="Ex. 2019"
                        className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
                      />
                    </div>
                  )}
                  <div className={showPermisField ? "" : "sm:col-span-2 grid sm:grid-cols-2 gap-5"}>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 block">Financement</label>
                      <select value={financement} onChange={(e) => setFinancement(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm bg-white">
                        {FINANCEMENTS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    {!showPermisField && (
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 block">Participants (max 10)</label>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setParticipants((p) => Math.max(1, p - 1))} className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center"><Minus size={14} /></button>
                          <span className="flex-1 text-center font-bold">{participants}</span>
                          <button type="button" onClick={() => setParticipants((p) => Math.min(10, p + 1))} className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center"><Plus size={14} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {showPermisField && (
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 block">Participants (max 10)</label>
                    <div className="flex items-center gap-2 max-w-[160px]">
                      <button type="button" onClick={() => setParticipants((p) => Math.max(1, p - 1))} className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center"><Minus size={14} /></button>
                      <span className="flex-1 text-center font-bold">{participants}</span>
                      <button type="button" onClick={() => setParticipants((p) => Math.min(10, p + 1))} className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center"><Plus size={14} /></button>
                    </div>
                  </div>
                )}

                <div className="text-center">
                  <Button type="button" variant="outline" onClick={() => setShowPrice((v) => !v)} data-testid="booking-show-price">
                    {showPrice ? priceLabel : "Voir le tarif"}
                  </Button>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                  <input value={form.prenom} onChange={(e) => setForm((f) => ({ ...f, prenom: e.target.value }))} placeholder="Prénom" className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm" />
                  <input value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} placeholder="Nom" className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm" />
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="E-mail" className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm" />
                  <div>
                    <input type="tel" value={form.telephone} onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))} placeholder="Téléphone" className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm" />
                    {form.telephone.trim() && !isValidPhone(form.telephone) && (
                      <p className="text-xs text-red-500 mt-1">Format invalide (ex : 06 12 34 56 78)</p>
                    )}
                  </div>
                </div>

                <PrivacyConsentCheckbox checked={consent} onChange={setConsent} testId="booking-widget-consent" />

                <Button type="submit" disabled={sending || !consent} style={{ backgroundColor: GOLD }} className="w-full text-black font-bold uppercase text-xs tracking-wide py-6">
                  {sending ? "Envoi..." : "Envoyer ma demande d'inscription"} <CaretRight size={12} className="ml-1" weight="bold" />
                </Button>
                <p className="text-center text-xs text-gray-400">
                  Sans engagement · Réponse sous 24h ouvrées · Ou appelez le <a href="tel:0180907244" className="font-bold underline">01 80 90 72 44</a>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// Noms d'onglet réutilisables si une page veut présélectionner un onglet
// sans connaître un formationId précis (ex: bouton "Réserver" sur une carte
// catégorie plutôt que sur une formation).
export { TABS as BOOKING_WIDGET_TABS };
