import { useEffect, useRef, useState } from "react";
import { setPageMeta } from "@/lib/seo";
import PrivacyConsentCheckbox from "@/components/PrivacyConsentCheckbox";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import GoogleReviewsCarousel from "@/components/GoogleReviewsCarousel";
import SiteFooter from "@/components/SiteFooter";
import { useReveal } from "@/hooks/useReveal";
import { trackLead, trackViewContent, trackSchedule, newEventId, getFbCookies } from "@/lib/metaPixel";
import Kit from "@/components/StageLandingPage";
import {
  CaretRight, ShieldCheck, CalendarBlank, Certificate, Car, ChatCircleText,
} from "@phosphor-icons/react";
import ChatWidget from "@/components/ChatWidget";
import ContactBubble from "@/components/ContactBubble";

const { TopBar, StageNav, FeatureStrip, StepsSection, TrustBar, FaqGrid, GOLD } = Kit;

const FEATURES = [
  { icon: ShieldCheck, label: "Accompagnement administratif" },
  { icon: CalendarBlank, label: "Théorie & pratique" },
  { icon: Car, label: "Centre à taille humaine" },
  { icon: Certificate, label: "Épinay-sur-Seine (93) & Creil (60)" },
];

const MODULES = [
  { n: "01", title: "Réglementation T3P", desc: "Cadre du transport public particulier de personnes, statut du chauffeur VTC, obligations et responsabilités." },
  { n: "02", title: "Gestion & développement", desc: "Gestion de l'activité, relation avec les plateformes, développement commercial et facturation." },
  { n: "03", title: "Sécurité routière", desc: "Prévention des risques, conduite responsable et sécurité du passager." },
  { n: "04", title: "Anglais professionnel", desc: "Communication appliquée à l'accueil et à la prise en charge d'une clientèle internationale." },
  { n: "05", title: "Français & relation client", desc: "Expression écrite et orale, posture professionnelle et gestion des situations délicates." },
  { n: "06", title: "Préparation pratique", desc: "Conduite, parcours, prise en charge client, équipements du véhicule et examen blanc." },
];

const STEPS = [
  { title: "Constituer le dossier", desc: "Vérification des prérequis et accompagnement à l'inscription." },
  { title: "Préparer la théorie", desc: "Réglementation, gestion, sécurité, français et anglais." },
  { title: "Réussir l'admissibilité", desc: "Entraînements réguliers et examens blancs jusqu'à l'examen officiel." },
  { title: "Préparer la pratique", desc: "Conduite, parcours, accueil client et facturation." },
];

const FAQ = [
  { q: "Comment devenir chauffeur VTC ?", a: "Vous devez remplir les conditions réglementaires (permis B, casier judiciaire vierge, visite médicale...), réussir l'examen VTC organisé par un organisme agréé, puis obtenir votre carte professionnelle VTC. TDL Formation vous prépare aux épreuves théoriques et pratiques." },
  { q: "La formation VTC est-elle finançable ?", a: "Plusieurs solutions peuvent être envisagées selon votre situation : CPF, France Travail, employeur ou financement personnel. La prise en charge dépend de votre éligibilité." },
  { q: "Combien de temps dure la formation VTC ?", a: "La durée varie selon votre profil et le format choisi (initiale ou passerelle Taxi vers VTC) — le calendrier détaillé vous est communiqué avec le programme de la session." },
  { q: "Quelle différence entre VTC et Taxi ?", a: "Le VTC réserve via une plateforme ou une réservation préalable, sans maraude ni station. TDL Formation propose aussi la formation Taxi et les passerelles entre les deux statuts." },
  { q: "Où se déroule la formation VTC dans le 93 et le 60 ?", a: "Nous formons sur deux centres : à Épinay-sur-Seine en Seine-Saint-Denis (93), facilement accessible depuis Paris et le nord francilien, et à Creil dans l'Oise (60)." },
  { q: "La formation est-elle accessible en situation de handicap ?", a: "Oui. Contactez notre référent handicap afin d'étudier vos besoins et les adaptations possibles avant l'entrée en formation." },
];

const FORMATIONS = ["Formation VTC initiale", "Formation continue VTC", "Passerelle Taxi vers VTC", "Formation VTC en ligne"];
const FINANCEMENTS = ["CPF", "France Travail", "Employeur", "Personnel"];

const PHONE_RE = /^(0[1-9]\d{8}|\+33[1-9]\d{8})$/;
const isValidPhone = (v) => PHONE_RE.test((v || "").replace(/[\s.\-]/g, ""));

export default function VtcFormationLanding() {
  const [form, setForm] = useState({ prenom: "", nom: "", email: "", telephone: "", formation: FORMATIONS[0], financement: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const formRef = useRef(null);
  const revealRef = useReveal();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    setPageMeta({
      title: "Formation VTC 93 et 60 — Épinay-sur-Seine & Creil | TDL Formation",
      description: "Formation VTC initiale et continue dans le 93 (Épinay-sur-Seine) et le 60 (Creil) : préparation à l'examen, accompagnement administratif, financement. Qualiopi.",
      path: "/formation-vtc",
    });
  }, []);

  const scrollToForm = () => {
    trackViewContent({ content_name: "formation_vtc" });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!privacyConsent) {
      return toast.error("Merci d'accepter l'utilisation de vos données pour continuer");
    }
    if (!form.prenom.trim() || !form.nom.trim() || !form.telephone.trim()) {
      return toast.error("Merci de remplir tous les champs obligatoires");
    }
    if (!isValidPhone(form.telephone)) {
      return toast.error("Merci de vérifier votre numéro de téléphone (10 chiffres, ex : 06 12 34 56 78)");
    }
    setSending(true);
    try {
      const message = [form.financement && `Financement envisagé : ${form.financement}`, form.message].filter(Boolean).join("\n");
      const eventId = newEventId();
      await api.post("/callback-requests", {
        prenom: form.prenom, nom: form.nom, telephone: form.telephone, email: form.email,
        session: form.formation, message, center: "Épinay-sur-Seine (93)", source: "meta_formation_vtc",
        page_url: window.location.href, event_id: eventId, ...getFbCookies(),
      });
      setSent(true);
      trackLead({ content_name: "formation_vtc", session: form.formation }, eventId);
    } catch {
      toast.error("Erreur lors de l'envoi, merci de réessayer ou de nous appeler directement.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="vtc-landing-page" ref={revealRef}>
      <TopBar />
      <StageNav ctaLabel="Demander un devis" ctaHref="#contact" />

      {/* Hero */}
      <section className="bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
              Formation initiale · Seine-Saint-Denis (93) & Oise (60)
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight leading-[0.95] uppercase">
              Formation <span style={{ color: GOLD }}>VTC</span><br />dans le 93 et le 60
            </h1>
            <p className="text-gray-500 max-w-md mt-5">
              Préparez votre examen VTC avec un accompagnement complet, de la théorie à la pratique, à Épinay-sur-Seine (93) ou à Creil (60).
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Button onClick={scrollToForm} style={{ backgroundColor: GOLD }} className="text-black font-bold uppercase text-xs tracking-wide">
                Recevoir le programme <CaretRight size={12} className="ml-1" weight="bold" />
              </Button>
              <a href="#programme">
                <Button variant="outline" className="font-bold uppercase text-xs tracking-wide">Voir le programme</Button>
              </a>
            </div>
          </div>
          <div className="relative">
            <div className="relative aspect-[4/3] overflow-hidden bg-black" style={{ clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%, 0 32%)" }}>
              <img src="/tdl-image/formation-conduite-taxi-vtc-tdl-Grande.jpeg" alt="Formation VTC" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
            </div>
          </div>
        </div>
      </section>

      <FeatureStrip items={FEATURES} />

      {/* Programme */}
      <section id="programme" className="py-16 lg:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Contenu pédagogique</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-10 max-w-xl">
            Un programme pensé pour l'examen et le métier.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {MODULES.map((m) => (
              <div key={m.n} className="bg-white border border-gray-200 rounded-md p-6" data-reveal>
                <span className="font-display text-3xl font-extrabold text-gray-300">{m.n}</span>
                <h3 className="font-bold text-sm mt-2 mb-1">{m.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <StepsSection title="De l'inscription à la carte professionnelle." steps={STEPS} />

      <GoogleReviewsCarousel />

      {/* Contact / devis */}
      <section id="contact" ref={formRef} className="py-16 lg:py-20 bg-white scroll-mt-20">
        <div className="max-w-lg mx-auto px-6">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Votre projet</p>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">Prêt à passer à l'action ?</h2>
            <p className="text-gray-500 text-sm">Recevez le programme et les prochaines dates. Un conseiller vous recontacte pour étudier votre projet et votre financement.</p>
          </div>

          {sent ? (
            <div className="text-center bg-gray-50 border border-gray-200 rounded-md p-8" data-testid="vtc-form-sent">
              <ChatCircleText size={32} className="mx-auto mb-3" style={{ color: GOLD }} weight="fill" />
              <p className="font-bold mb-1">Demande envoyée !</p>
              <p className="text-sm text-gray-500">Un conseiller TDL Formation vous recontacte sous 24h ouvrées.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3" data-testid="vtc-form">
              <div className="grid grid-cols-2 gap-3">
                <input value={form.prenom} onChange={(e) => set("prenom", e.target.value)} placeholder="Prénom" className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm" />
                <input value={form.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Nom" className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm" />
              </div>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="E-mail" className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm" />
              <input value={form.telephone} onChange={(e) => set("telephone", e.target.value)} placeholder="Téléphone" className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.formation} onChange={(e) => { set("formation", e.target.value); trackSchedule({ content_name: e.target.value }); }} className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm bg-white">
                  {FORMATIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={form.financement} onChange={(e) => set("financement", e.target.value)} className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm bg-white">
                  <option value="">Financement envisagé</option>
                  {FINANCEMENTS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <textarea value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="Parlez-nous brièvement de votre projet (facultatif)" rows={3} className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm" />
              <PrivacyConsentCheckbox checked={privacyConsent} onChange={setPrivacyConsent} testId="vtc-privacy-consent" />
              <Button type="submit" disabled={sending || !privacyConsent} style={{ backgroundColor: GOLD }} className="w-full text-black font-bold uppercase text-xs tracking-wide py-6">
                {sending ? "Envoi..." : "Recevoir le programme"} <CaretRight size={12} className="ml-1" weight="bold" />
              </Button>
            </form>
          )}
        </div>
      </section>

      <TrustBar rating={4.9} totalReviews={705} />
      <FaqGrid items={FAQ} />

      <SiteFooter />
      <ChatWidget />
      <ContactBubble />
    </div>
  );
}
