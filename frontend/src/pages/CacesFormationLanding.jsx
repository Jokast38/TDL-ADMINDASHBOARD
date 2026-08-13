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
  CaretRight, ShieldCheck, CalendarBlank, Certificate, Truck, ChatCircleText,
} from "@phosphor-icons/react";
import ChatWidget from "@/components/ChatWidget";
import ContactBubble from "@/components/ContactBubble";

const { TopBar, StageNav, FeatureStrip, StepsSection, TrustBar, FaqGrid, GOLD } = Kit;

const FEATURES = [
  { icon: ShieldCheck, label: "Toutes catégories CACES" },
  { icon: CalendarBlank, label: "Théorie & pratique" },
  { icon: Truck, label: "Chariots, nacelles, grues" },
  { icon: Certificate, label: "Épinay-sur-Seine (93)" },
];

const MODULES = [
  { n: "01", title: "Réglementation & sécurité", desc: "Cadre réglementaire des équipements de travail, responsabilités de l'opérateur et prévention des risques." },
  { n: "02", title: "Technologie de l'engin", desc: "Fonctionnement, organes de sécurité, vérifications avant/après utilisation selon la catégorie visée." },
  { n: "03", title: "Conduite en sécurité", desc: "Prise en main, manœuvres, gestes et postures, circulation sur site et zones à risque." },
  { n: "04", title: "Préparation à l'examen", desc: "Entraînement au test théorique (QCM) et aux épreuves pratiques du CACES." },
];

const STEPS = [
  { title: "Choisir sa catégorie", desc: "Chariots, nacelles élévatrices, grues... selon votre métier et votre projet professionnel." },
  { title: "Suivre la théorie", desc: "Réglementation, technologie de l'engin et prévention des risques." },
  { title: "S'entraîner à la pratique", desc: "Manœuvres encadrées sur engin, en conditions réelles." },
  { title: "Passer les tests CACES", desc: "Épreuves théorique et pratique avec un testeur certifié." },
];

const FAQ = [
  { q: "Qu'est-ce que le CACES ?", a: "Le CACES (Certificat d'Aptitude à la Conduite En Sécurité) atteste qu'un salarié a les connaissances et savoir-faire nécessaires pour conduire un équipement de travail en sécurité (chariot, nacelle, grue...)." },
  { q: "Quelles catégories de CACES proposez-vous ?", a: "Nous formons sur l'ensemble des catégories principales : chariots élévateurs, nacelles élévatrices de personnel (PEMP) et grues, à notre centre d'Épinay-sur-Seine (93)." },
  { q: "Le CACES est-il obligatoire pour conduire un chariot ou une nacelle ?", a: "L'employeur doit s'assurer que le salarié dispose d'une autorisation de conduite, généralement délivrée sur la base d'un CACES en cours de validité, en plus d'une aptitude médicale." },
  { q: "Quelle est la durée de validité d'un CACES ?", a: "La durée de validité dépend de la catégorie d'équipement (généralement 5 ans pour les chariots et les nacelles, 10 ans pour certaines grues) — un recyclage est nécessaire avant expiration." },
  { q: "Le CACES est-il finançable ?", a: "Plusieurs solutions peuvent être envisagées selon votre situation : employeur, OPCO, France Travail ou financement personnel." },
  { q: "Où se déroule la formation CACES ?", a: "Notre formation CACES se déroule exclusivement à notre centre d'Épinay-sur-Seine, en Seine-Saint-Denis (93)." },
];

const FORMATIONS = ["CACES Chariots élévateurs", "CACES Nacelles (PEMP)", "CACES Grues", "Recyclage CACES"];
const FINANCEMENTS = ["Employeur / OPCO", "France Travail", "Personnel", "À déterminer"];

const PHONE_RE = /^(0[1-9]\d{8}|\+33[1-9]\d{8})$/;
const isValidPhone = (v) => PHONE_RE.test((v || "").replace(/[\s.\-]/g, ""));

export default function CacesFormationLanding() {
  const [form, setForm] = useState({ prenom: "", nom: "", email: "", telephone: "", formation: FORMATIONS[0], financement: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const formRef = useRef(null);
  const revealRef = useReveal();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    setPageMeta({
      title: "Formation CACES 93 — Épinay-sur-Seine | TDL Formation",
      description: "Formation CACES (chariots, nacelles, grues) à Épinay-sur-Seine (93) : théorie, pratique, financement. Centre agréé Qualiopi.",
      path: "/formation-caces",
    });
  }, []);

  const scrollToForm = () => {
    trackViewContent({ content_name: "formation_caces" });
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
        session: form.formation, message, center: "Épinay-sur-Seine (93)", source: "meta_formation_caces",
        page_url: window.location.href, event_id: eventId, ...getFbCookies(),
      });
      setSent(true);
      trackLead({ content_name: "formation_caces", session: form.formation }, eventId);
    } catch {
      toast.error("Erreur lors de l'envoi, merci de réessayer ou de nous appeler directement.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="caces-landing-page" ref={revealRef}>
      <TopBar />
      <StageNav ctaLabel="Demander un devis" ctaHref="#contact" />

      {/* Hero */}
      <section className="bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
              Toutes catégories · Seine-Saint-Denis (93)
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight leading-[0.95] uppercase">
              Formation <span style={{ color: GOLD }}>CACES</span><br />à Épinay-sur-Seine
            </h1>
            <p className="text-gray-500 max-w-md mt-5">
              Chariots, nacelles, grues : préparez votre CACES avec un accompagnement complet, de la théorie à la pratique, à notre centre d'Épinay-sur-Seine (93).
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
              <img src="https://images.unsplash.com/photo-1541976590-713941681591?w=900" alt="Formation CACES" className="w-full h-full object-cover" loading="eager" />
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
            Un programme pensé pour l'examen et le terrain.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
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

      <StepsSection title="De l'inscription au certificat CACES." steps={STEPS} />

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
            <div className="text-center bg-gray-50 border border-gray-200 rounded-md p-8" data-testid="caces-form-sent">
              <ChatCircleText size={32} className="mx-auto mb-3" style={{ color: GOLD }} weight="fill" />
              <p className="font-bold mb-1">Demande envoyée !</p>
              <p className="text-sm text-gray-500">Un conseiller TDL Formation vous recontacte sous 24h ouvrées.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3" data-testid="caces-form">
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
              <PrivacyConsentCheckbox checked={privacyConsent} onChange={setPrivacyConsent} testId="caces-privacy-consent" />
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
