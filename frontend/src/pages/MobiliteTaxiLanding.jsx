import { useEffect, useRef, useState } from "react";
import { setPageMeta } from "@/lib/seo";
import PrivacyConsentCheckbox from "@/components/PrivacyConsentCheckbox";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import GoogleReviewsCarousel from "@/components/GoogleReviewsCarousel";
import SiteFooter from "@/components/SiteFooter";
import { useReveal } from "@/hooks/useReveal";
import { trackLead, trackViewContent } from "@/lib/metaPixel";
import Kit from "@/components/StageLandingPage";
import {
  CaretRight, CalendarBlank, Certificate, Taxi, ChatCircleText, MapPin,
} from "@phosphor-icons/react";
import ChatWidget from "@/components/ChatWidget";
import ContactBubble from "@/components/ContactBubble";

const { TopBar, StageNav, FeatureStrip, StepsSection, TrustBar, FaqGrid, GOLD } = Kit;

const FEATURES = [
  { icon: MapPin, label: "Passage 60 ↔ 93" },
  { icon: CalendarBlank, label: "8 jours · 50h" },
  { icon: Taxi, label: "97 % de réussite" },
  { icon: Certificate, label: "Centre agréé Qualiopi" },
];

const MODULES = [
  { n: "01", title: "Connaissance du territoire", desc: "Étude géographique du département visé : grands axes, communes, zones d'activité, gares et sites touristiques." },
  { n: "02", title: "Réglementation locale", desc: "Arrêtés préfectoraux et obligations spécifiques à la zone de stationnement visée." },
  { n: "03", title: "Itinéraires & navigation", desc: "Apprentissage des trajets optimaux et gestion de la circulation locale." },
  { n: "04", title: "Préparation à l'examen", desc: "Entraînement intensif : QCM de géographie et mises en situation pratiques." },
];

const STEPS = [
  { title: "Vérifier votre éligibilité", desc: "Carte professionnelle taxi valide dans un autre département." },
  { title: "Suivre la formation", desc: "8 jours intensifs, du lundi au samedi, 9h-17h." },
  { title: "Passer l'examen", desc: "QCM de géographie et mise en situation, taux de réussite 97 %." },
  { title: "Exercer dans le nouveau département", desc: "Démarches administratives accompagnées jusqu'au bout." },
];

const FAQ = [
  { q: "Qu'est-ce que la formation Mobilité Taxi Banlieue ?", a: "C'est un dispositif permettant à un chauffeur de taxi titulaire d'une carte professionnelle dans un département de la banlieue parisienne (60, 93...) d'obtenir l'autorisation d'exercer dans un autre département." },
  { q: "Quelles sont les épreuves de l'examen ?", a: "L'examen porte sur la géographie du département visé (communes, grands axes, sites), la réglementation locale et des mises en situation pratiques." },
  { q: "Combien de temps dure la formation ?", a: "La formation est intensive : 50 heures réparties sur 8 jours, du lundi au samedi de 9h à 17h." },
  { q: "La formation est-elle finançable par le CPF ?", a: "Selon votre situation, plusieurs solutions de financement peuvent être étudiées : CPF, financement personnel ou paiement en plusieurs fois." },
  { q: "Puis-je exercer dans plusieurs départements après la formation ?", a: "L'autorisation obtenue concerne le département préparé lors de la formation. Votre conseiller peut vous accompagner pour toute nouvelle démarche." },
  { q: "Combien de participants par session ?", a: "Les sessions sont limitées à 15 participants pour garantir un accompagnement de qualité." },
];

const FORMATIONS = ["Mobilité Taxi Banlieue (60-93)"];
const FINANCEMENTS = ["CPF", "France Travail", "Employeur", "Personnel"];

const PHONE_RE = /^(0[1-9]\d{8}|\+33[1-9]\d{8})$/;
const isValidPhone = (v) => PHONE_RE.test((v || "").replace(/[\s.\-]/g, ""));

export default function MobiliteTaxiLanding() {
  const [form, setForm] = useState({ prenom: "", nom: "", email: "", telephone: "", formation: FORMATIONS[0], financement: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const formRef = useRef(null);
  const revealRef = useReveal();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    setPageMeta({
      title: "Formation Mobilité Taxi Banlieue (60-93) — 390 € | TDL Formation",
      description: "Passez d'un département à l'autre (60, 93...) avec la formation Mobilité Taxi Banlieue : 8 jours, 97 % de réussite, centre agréé Qualiopi à Épinay-sur-Seine et Creil.",
      path: "/mobilite-taxi",
    });
  }, []);

  const scrollToForm = () => {
    trackViewContent({ content_name: "mobilite_taxi_banlieue" });
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
      await api.post("/callback-requests", {
        prenom: form.prenom, nom: form.nom, telephone: form.telephone, email: form.email,
        session: form.formation, message, center: "Épinay-sur-Seine (93)", source: "meta_mobilite_taxi",
      });
      setSent(true);
      trackLead({ content_name: "mobilite_taxi_banlieue", value: 390, currency: "EUR", session: form.formation });
    } catch {
      toast.error("Erreur lors de l'envoi, merci de réessayer ou de nous appeler directement.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="mobilite-taxi-landing-page" ref={revealRef}>
      <TopBar />
      <StageNav ctaLabel="Réserver ma place" ctaHref="#contact" />

      {/* Hero */}
      <section className="bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
              Formation mobilité · 60 ↔ 93
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight leading-[0.95] uppercase">
              Mobilité <span style={{ color: GOLD }}>Taxi Banlieue</span><br />changez de département
            </h1>
            <p className="text-gray-500 max-w-md mt-5">
              Vous détenez une carte professionnelle taxi valide dans un département et souhaitez exercer dans un autre (60, 93...) ? Notre formation intensive de 8 jours vous prépare à l'examen avec un taux de réussite de 97 %.
            </p>
            <p className="font-display text-3xl font-extrabold mt-5">390 € <span className="text-sm font-normal text-gray-400">TTC</span></p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Button onClick={scrollToForm} style={{ backgroundColor: GOLD }} className="text-black font-bold uppercase text-xs tracking-wide">
                Réserver ma place <CaretRight size={12} className="ml-1" weight="bold" />
              </Button>
              <a href="#programme">
                <Button variant="outline" className="font-bold uppercase text-xs tracking-wide">Voir le programme</Button>
              </a>
            </div>
          </div>
          <div className="relative">
            <div className="relative aspect-[4/3] overflow-hidden bg-black" style={{ clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%, 0 32%)" }}>
              <img src="https://tdl-formation.fr/wp-content/uploads/2026/06/IMG_8432.jpg" alt="Formation Mobilité Taxi Banlieue" className="w-full h-full object-cover" />
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
            4 modules pour maîtriser votre nouveau territoire.
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

      <StepsSection title="De l'inscription à votre nouveau département." steps={STEPS} />

      <GoogleReviewsCarousel />

      {/* Contact / réservation */}
      <section id="contact" ref={formRef} className="py-16 lg:py-20 bg-white scroll-mt-20">
        <div className="max-w-lg mx-auto px-6">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Votre projet</p>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">Prêt à changer de département ?</h2>
            <p className="text-gray-500 text-sm">390 € TTC · Un conseiller vous recontacte pour étudier votre projet et votre financement.</p>
          </div>

          {sent ? (
            <div className="text-center bg-gray-50 border border-gray-200 rounded-md p-8" data-testid="mobilite-taxi-form-sent">
              <ChatCircleText size={32} className="mx-auto mb-3" style={{ color: GOLD }} weight="fill" />
              <p className="font-bold mb-1">Demande envoyée !</p>
              <p className="text-sm text-gray-500">Un conseiller TDL Formation vous recontacte sous 24h ouvrées.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3" data-testid="mobilite-taxi-form">
              <div className="grid grid-cols-2 gap-3">
                <input value={form.prenom} onChange={(e) => set("prenom", e.target.value)} placeholder="Prénom" className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm" />
                <input value={form.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Nom" className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm" />
              </div>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="E-mail" className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm" />
              <input value={form.telephone} onChange={(e) => set("telephone", e.target.value)} placeholder="Téléphone" className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm" />
              <select value={form.financement} onChange={(e) => set("financement", e.target.value)} className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm bg-white">
                <option value="">Financement envisagé</option>
                {FINANCEMENTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <textarea value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="Département visé, précisions sur votre projet (facultatif)" rows={3} className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm" />
              <PrivacyConsentCheckbox checked={privacyConsent} onChange={setPrivacyConsent} testId="mobilite-taxi-privacy-consent" />
              <Button type="submit" disabled={sending || !privacyConsent} style={{ backgroundColor: GOLD }} className="w-full text-black font-bold uppercase text-xs tracking-wide py-6">
                {sending ? "Envoi..." : "Réserver ma place"} <CaretRight size={12} className="ml-1" weight="bold" />
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
