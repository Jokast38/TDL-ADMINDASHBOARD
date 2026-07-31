import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import GoogleReviewsCarousel from "@/components/GoogleReviewsCarousel";
import SiteFooter from "@/components/SiteFooter";
import { useReveal } from "@/hooks/useReveal";
import { setPageMeta } from "@/lib/seo";
import { trackSchedule, trackLead } from "@/lib/metaPixel";
import Kit, { DEFAULT_FEATURES, DEFAULT_STEPS } from "@/components/StageLandingPage";
import { generateUpcomingSessions } from "@/lib/upcomingSessions";

const { TopBar, StageNav, Hero, FeatureStrip, StepsSection, SessionBanner, TrustBar, FaqGrid, BookingForm } = Kit;

const VILLES = ["Épinay-sur-Seine (93)", "Creil (60)"];

const SESSIONS = generateUpcomingSessions();
const NEXT_SESSION_LABEL = SESSIONS[0]?.items[0] || "";

const FAQ = [
  { q: "Ai-je droit à ce stage ?", a: "Oui, ce stage volontaire de récupération de points est ouvert à tout titulaire d'un permis en cours de validité, une fois tous les 12 mois." },
  { q: "Combien de points puis-je récupérer ?", a: "Jusqu'à 4 points, dans la limite du plafond de votre permis (12 points, ou 6 en période probatoire)." },
  { q: "Comment se déroule le stage ?", a: "2 jours consécutifs (7h/jour), en salle, avec des formateurs agréés par la Préfecture, autour de la sensibilisation à la sécurité routière." },
  { q: "En combien de temps suis-je rappelé ?", a: "Notre équipe vous recontacte sous 24h ouvrées après votre demande pour finaliser votre inscription." },
];

const PHONE_RE = /^(0[1-9]\d{8}|\+33[1-9]\d{8})$/;
const isValidPhone = (v) => PHONE_RE.test((v || "").replace(/[\s.\-]/g, ""));

export default function StageRecuperationPointsLanding() {
  const [session, setSession] = useState("");
  const [center, setCenter] = useState("");
  const [form, setForm] = useState({ prenom: "", nom: "", telephone: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const formRef = useRef(null);
  const revealRef = useReveal();

  useEffect(() => {
    setPageMeta({
      title: "Stage récupération de points — 240€ | TDL Formation",
      description: "Récupérez jusqu'à 4 points sur votre permis en 2 jours. Stage agréé par la Préfecture, sessions à Épinay-sur-Seine (93) et Creil (60).",
      path: "/stage-recuperation-points",
    });
  }, []);

  const chooseSession = (label) => {
    setSession(label);
    trackSchedule({ content_name: label, value: 240, currency: "EUR" });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleFindSessions = (ville) => {
    setCenter(ville || "");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.privacyConsent) {
      return toast.error("Merci d'accepter l'utilisation de vos données pour continuer");
    }
    if (!form.prenom.trim() || !form.nom.trim() || !form.telephone.trim()) {
      return toast.error("Merci de remplir tous les champs");
    }
    if (!isValidPhone(form.telephone)) {
      return toast.error("Merci de vérifier votre numéro de téléphone (10 chiffres, ex : 06 12 34 56 78)");
    }
    setSending(true);
    try {
      await api.post("/callback-requests", { ...form, session, center, source: "meta_stage_recuperation_points_240" });
      setSent(true);
      trackLead({ content_name: "stage_recuperation_points_240", value: 240, currency: "EUR", session });
    } catch {
      toast.error("Erreur lors de l'envoi, merci de réessayer ou de nous appeler directement.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="stage-recup-points-page" ref={revealRef}>
      <TopBar />
      <StageNav ctaLabel="Réserver une session" ctaHref="#form" />

      <Hero
        titleLine1="Récupérez jusqu'à 4 points"
        titleLine2Gold="en seulement 2 jours"
        subheadline="Stage agréé de récupération de points."
        description="Vous avez perdu des points sur votre permis ? Notre stage agréé par la Préfecture vous permet de récupérer jusqu'à 4 points en 2 jours, sans examen."
        heroImage="/tdl-image/image-securite-routiere-rectangle-sans-fond-blanc.png"
        villes={VILLES}
        onFindSessions={handleFindSessions}
      />

      <FeatureStrip items={DEFAULT_FEATURES} />

      <StepsSection title="Une démarche simple, un résultat concret." steps={DEFAULT_STEPS} />

      <SessionBanner
        image="/tdl-image/about-2.jpg"
        dateLabel={session || NEXT_SESSION_LABEL}
        city="Épinay-sur-Seine (93)"
        seats="Places limitées"
        price={240}
        onReserve={() => chooseSession(session || NEXT_SESSION_LABEL)}
      />

      <section className="py-16 lg:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#d4af37" }}>Calendrier</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-10">Les prochaines sessions</h2>
          {SESSIONS.map(({ mois, items }) => (
            <div className="mb-8" key={mois}>
              <div className="flex items-baseline gap-4 mb-4">
                <h3 className="font-display text-lg font-bold">{mois}</h3>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {items.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => chooseSession(label)}
                    data-testid={`session-${label}`}
                    className={`text-left border rounded-md p-4 transition-colors ${
                      session === label ? "border-[#d4af37] bg-[#d4af37]/5" : "border-gray-200 hover:border-[#d4af37]"
                    }`}
                  >
                    <div className="font-semibold text-sm">{label}</div>
                    <div className="text-xs text-gray-400 uppercase tracking-wide mt-1">Choisir cette date</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <GoogleReviewsCarousel />

      <BookingForm
        formRef={formRef}
        form={form}
        setForm={setForm}
        session={session}
        sending={sending}
        sent={sent}
        onSubmit={submit}
        price={240}
      />

      <TrustBar rating={4.9} totalReviews={705} />
      <FaqGrid items={FAQ} />

      <SiteFooter />
    </div>
  );
}
