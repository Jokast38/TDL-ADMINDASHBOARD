import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useReveal } from "@/hooks/useReveal";
import { setPageMeta } from "@/lib/seo";
import { trackLead, trackInitiateCheckout, trackViewContent, newEventId, getFbCookies } from "@/lib/metaPixel";
import Kit from "@/components/StageLandingPage";
import GoogleReviewsCarousel from "@/components/GoogleReviewsCarousel";
import PrivacyConsentCheckbox from "@/components/PrivacyConsentCheckbox";
import { api } from "@/lib/api";
import "@/styles/stage-recuperation-points.css";
import heroTrainingImage from "@/assets/hero-training.jpeg";
import logoTdlImage from "@/assets/logo-tdl.png";
import {
  Check, CreditCard, Star, Envelope, Phone, MapPin, CalendarBlank, Fire, Lightning,
} from "@phosphor-icons/react";
import ChatWidget from "@/components/ChatWidget";
import ContactBubble from "@/components/ContactBubble";

const { TopBar, StageNav, StepsSection, FaqGrid } = Kit;

const GOLD = "#d4af37";

const FORMATION_ID = "e22bcca0-6656-4335-b6a6-8a06235a2770";
const STAGE_ID = "e5afe3bb-4e0e-4065-afa3-68a00fe80044";
const SOURCE = "flash_recup_points_sept2026";
const SESSION_LABEL = "21 & 22 septembre 2026";
const CENTER = "Épinay-sur-Seine (93)";
const PRICE = 120;
const ORIGINAL_PRICE = 240;

// L'offre expire à la veille de la session — au-delà, ces places n'existent
// plus au tarif flash de toute façon.
const OFFER_DEADLINE = new Date("2026-09-20T23:59:59+02:00").getTime();

const STEPS_CUSTOM = [
  { title: "Réservez votre place", desc: "Remplissez le formulaire et payez en ligne en toute sécurité — votre place est confirmée immédiatement." },
  { title: "Recevez votre confirmation", desc: "Vous recevez rapidement toutes les informations utiles concernant votre stage." },
  { title: "Participez au stage", desc: "Présentez-vous au centre d'Épinay-sur-Seine les 21 et 22 septembre 2026." },
  { title: "Récupérez jusqu'à 4 points", desc: "Une fois le stage terminé, les démarches administratives sont effectuées conformément à la réglementation." },
];

const FAQ = [
  { q: "Pourquoi ce tarif est-il si bas ?", a: "Il s'agit d'une offre exceptionnelle et limitée, réservée aux 15 premières places de la session du 21-22 septembre 2026, pour un tarif à 120€ au lieu de 240€." },
  { q: "Combien de temps cette offre est-elle valable ?", a: "Jusqu'à épuisement des 15 places réservées à cette offre, ou au plus tard la veille de la session." },
  { q: "Combien de points puis-je récupérer ?", a: "Jusqu'à 4 points, conformément à la réglementation, dans la limite du plafond de votre permis." },
  { q: "Où se déroule le stage ?", a: "Dans notre centre situé au 59 avenue Joffre, 93800 Épinay-sur-Seine." },
  { q: "Puis-je annuler ou modifier ma réservation ?", a: "Contactez notre équipe dès que possible par téléphone ou via le formulaire de contact : nous étudions chaque situation au cas par cas." },
];

const PHONE_RE = /^(0[1-9]\d{8}|\+33[1-9]\d{8})$/;
const isValidPhone = (v) => PHONE_RE.test((v || "").replace(/[\s.\-]/g, ""));

function useCountdown(deadline) {
  const [remaining, setRemaining] = useState(deadline - Date.now());
  useEffect(() => {
    const id = setInterval(() => setRemaining(deadline - Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);
  const clamped = Math.max(0, remaining);
  const days = Math.floor(clamped / 86400000);
  const hours = Math.floor((clamped % 86400000) / 3600000);
  const minutes = Math.floor((clamped % 3600000) / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  return { days, hours, minutes, seconds, expired: clamped <= 0 };
}

function CountdownBlock({ value, label }) {
  return (
    <div className="flex flex-col items-center bg-black/90 rounded-md px-3 py-2 min-w-[58px]">
      <span className="font-display text-xl sm:text-2xl font-extrabold tabular-nums" style={{ color: GOLD }}>
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-gray-300">{label}</span>
    </div>
  );
}

export default function OffreFlashPointsLanding() {
  const [form, setForm] = useState({ prenom: "", nom: "", telephone: "", email: "", privacyConsent: false });
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const [soldOut, setSoldOut] = useState(false);
  const revealRef = useReveal();
  const formRef = useRef(null);
  const countdown = useCountdown(OFFER_DEADLINE);
  const offerClosed = countdown.expired || soldOut;

  const refreshStatus = () => {
    api.get("/flash-offer/status").then((r) => {
      setRemaining(r.data?.remaining ?? null);
      setSoldOut(!!r.data?.sold_out);
    }).catch(() => {});
  };

  useEffect(() => {
    setPageMeta({
      title: "Offre flash -50% — Stage Récupération de Points 21-22 septembre | TDL Formation",
      description: "15 places à 120€ au lieu de 240€ pour le stage de récupération de points du 21-22 septembre 2026 à Épinay-sur-Seine. Offre exceptionnelle et limitée.",
      path: "/offre-flash-points",
    });
    refreshStatus();
    const id = setInterval(refreshStatus, 20000);
    trackViewContent?.({ content_name: SOURCE, value: PRICE, currency: "EUR" });
    return () => clearInterval(id);
  }, []);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (offerClosed) return;
    if (!form.prenom.trim() || !form.nom.trim() || !form.telephone.trim() || !form.email.trim()) {
      return toast.error("Merci de remplir tous les champs");
    }
    if (!isValidPhone(form.telephone)) {
      return toast.error("Merci de vérifier votre numéro de téléphone (10 chiffres, ex : 06 12 34 56 78)");
    }
    if (!form.privacyConsent) {
      return toast.error("Merci d'accepter l'utilisation de vos données pour continuer");
    }

    setSending(true);
    try {
      const eventId = newEventId();
      const fbCookies = getFbCookies();
      trackLead({ content_name: SOURCE, value: PRICE, currency: "EUR", session: SESSION_LABEL }, eventId);

      const { data } = await api.post("/flash-offer/inscription", {
        formation_id: FORMATION_ID,
        stage_id: STAGE_ID,
        student_name: `${form.prenom.trim()} ${form.nom.trim()}`,
        student_phone: form.telephone.trim(),
        student_email: form.email.trim(),
        category: "PERMIS",
        session: SESSION_LABEL,
        center: CENTER,
        source: SOURCE,
        landing_url: window.location.href,
        event_id: eventId,
        ...fbCookies,
      });

      const inscription = data.inscription;
      trackInitiateCheckout({ content_name: SOURCE, value: PRICE, currency: "EUR", session: SESSION_LABEL });

      const checkoutResponse = await api.post("/payments/checkout", {
        inscription_id: inscription.id,
        allow_klarna: false,
      });
      const { url } = checkoutResponse.data;
      if (url) {
        window.location.href = url;
      } else {
        toast.error("Erreur lors de la redirection vers le paiement");
      }
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Erreur lors de la réservation, merci de réessayer.");
      refreshStatus();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="offre-flash-points-page" ref={revealRef}>
      <a className="skip-link" href="#main">Aller au contenu</a>

      <TopBar />
      <StageNav ctaLabel="Réserver ma place" ctaHref="#form" />

      {/* Bandeau urgence : compte à rebours + places restantes */}
      <section className="py-3" style={{ background: "linear-gradient(90deg,#0a0a0a,#1a1a1a)" }}>
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-white text-center">
          <span className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: GOLD }}>
            <Fire size={16} weight="fill" /> Offre flash -50% — {remaining != null ? `${remaining} place${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}` : "places limitées"}
          </span>
          {!offerClosed && (
            <div className="flex items-center gap-2">
              <CountdownBlock value={countdown.days} label="jours" />
              <CountdownBlock value={countdown.hours} label="h" />
              <CountdownBlock value={countdown.minutes} label="min" />
              <CountdownBlock value={countdown.seconds} label="sec" />
            </div>
          )}
        </div>
      </section>

      {/* Hero */}
      <section className="py-12 sm:py-16" style={{ background: "linear-gradient(180deg,#fff8e6 0%,#ffffff 100%)" }}>
        <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 rounded-full text-black" style={{ backgroundColor: GOLD }}>
            <Lightning size={14} weight="fill" /> Offre exceptionnelle et limitée
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Récupérez jusqu'à 4 points<br className="hidden sm:block" /> les 21 &amp; 22 septembre 2026
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto mb-6">
            Uniquement pour cette session, à Épinay-sur-Seine (93) : <b>15 places au tarif flash</b>, dans la limite
            des places disponibles. Une fois ces places parties, le tarif remonte à son prix normal.
          </p>
          <div className="flex items-center justify-center gap-3 mb-8">
            <span className="text-gray-400 line-through text-xl sm:text-2xl">{ORIGINAL_PRICE} €</span>
            <span className="font-display text-4xl sm:text-5xl font-extrabold" style={{ color: GOLD }}>{PRICE} €</span>
            <span className="text-xs font-bold uppercase bg-red-600 text-white px-2 py-1 rounded">-50%</span>
          </div>
          {offerClosed ? (
            <div className="max-w-md mx-auto bg-gray-100 border border-gray-300 rounded-md p-4 text-sm text-gray-600">
              Cette offre flash est terminée. Découvrez nos prochaines sessions sur notre{" "}
              <a href="/stage-recuperation-points" className="underline font-semibold">page stage récupération de points</a>.
            </div>
          ) : (
            <button
              onClick={scrollToForm}
              style={{ backgroundColor: GOLD }}
              className="inline-flex items-center text-black font-bold uppercase text-sm tracking-wide px-10 py-4 rounded-md hover:opacity-90 transition-opacity"
            >
              Je réserve ma place à 120€ <CalendarBlank size={16} className="ml-2" />
            </button>
          )}
        </div>
      </section>

      <div className="max-w-xl mx-auto px-6 flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6 sm:gap-y-2 pb-8 text-[13px] font-bold text-gray-700 text-center">
        <span className="inline-flex items-center gap-1.5"><Check size={15} weight="bold" style={{ color: GOLD }} /> Session du 21 &amp; 22 septembre 2026</span>
        <span className="inline-flex items-center gap-1.5"><CreditCard size={15} weight="bold" style={{ color: GOLD }} /> Paiement sécurisé en ligne</span>
        <span className="inline-flex items-center gap-1.5"><Star size={15} weight="fill" style={{ color: GOLD }} /> Avis Google 4,9/5</span>
      </div>

      <GoogleReviewsCarousel />

      <StepsSection id="etapes" title="Votre stage en 4 étapes simples" steps={STEPS_CUSTOM} />

      <section className="py-4 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="aspect-[3/1] overflow-hidden rounded-md bg-black">
            <img src={heroTrainingImage} alt="Formation au centre TDL Formation" loading="lazy" className="w-full h-full object-cover" />
          </div>
          <div className="text-center mt-8 pb-2">
            {!offerClosed && (
              <button onClick={scrollToForm} style={{ backgroundColor: GOLD }} className="inline-flex items-center text-black font-bold uppercase text-xs tracking-wide px-8 py-4 rounded-md">
                Réserver ma place
              </button>
            )}
          </div>
        </div>
      </section>

      <FaqGrid id="faq" items={FAQ} />

      {/* Formulaire de réservation + paiement */}
      <section id="form" ref={formRef} className="py-16 lg:py-20 bg-white scroll-mt-20">
        <div className="max-w-lg mx-auto px-6">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Réservation</p>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">Réservez votre session au tarif flash</h2>
            <p className="text-gray-500 text-sm">
              <span className="text-red-600 font-bold">{PRICE} €</span>
              <span className="text-gray-400 line-through ml-2">{ORIGINAL_PRICE} €</span>
              <span className="block mt-1 font-semibold text-black">✓ Session choisie : {SESSION_LABEL} — {CENTER}</span>
            </p>
          </div>

          {offerClosed ? (
            <div className="text-center bg-gray-50 border border-gray-200 rounded-md p-8">
              <p className="font-bold mb-1">Cette offre flash est terminée</p>
              <p className="text-sm text-gray-500">Consultez nos prochaines sessions au tarif standard.</p>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={submit} data-testid="flash-booking-form">
              <input
                value={form.prenom}
                onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                placeholder="Prénom *"
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm"
                required
              />
              <input
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                placeholder="Nom *"
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm"
                required
              />
              <input
                type="tel"
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                placeholder="Téléphone *"
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm"
                required
              />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Email *"
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm"
                required
              />
              <PrivacyConsentCheckbox
                checked={form.privacyConsent}
                onChange={(v) => setForm({ ...form, privacyConsent: v })}
              />
              <button
                type="submit"
                disabled={sending}
                style={{ backgroundColor: GOLD }}
                className="w-full text-black font-bold uppercase text-sm tracking-wide px-6 py-3.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {sending ? "Traitement en cours..." : `Confirmer et payer ${PRICE} €`}
              </button>
              <p className="text-[11px] text-gray-400 text-center">Paiement 100% sécurisé par carte bancaire via Stripe.</p>
            </form>
          )}
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand">
            <img src={logoTdlImage} alt="TDL Formation" />
            <p>Formation, prévention routière et accompagnement des conducteurs.</p>
          </div>
          <div>
            <h3>Notre centre</h3>
            <p>59 avenue Joffre<br />93800 Épinay-sur-Seine</p>
          </div>
          <div>
            <h3>Nous contacter</h3>
            <a href="tel:+33180907249">01 80 90 72 49</a>
            <a href="mailto:contact@tdl-formation.fr">contact@tdl-formation.fr</a>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© 2026 TDL Formation</span>
        </div>
      </footer>

      <ChatWidget />
      <ContactBubble />
    </div>
  );
}
