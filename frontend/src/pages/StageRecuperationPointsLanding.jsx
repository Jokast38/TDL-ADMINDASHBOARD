import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { toast } from "sonner";
import { useReveal } from "@/hooks/useReveal";
import { setPageMeta } from "@/lib/seo";
import { trackSchedule, trackLead, trackInitiateCheckout, trackPurchase, newEventId, getFbCookies } from "@/lib/metaPixel";
import { generateUpcomingSessions } from "@/lib/upcomingSessions";
import Kit from "@/components/StageLandingPage";
import GoogleReviewsCarousel from "@/components/GoogleReviewsCarousel";
import { api } from "@/lib/api";
import "@/styles/stage-recuperation-points.css";
import heroTrainingImage from "@/assets/hero-training.jpeg";
import logoTdlImage from "@/assets/logo-tdl.png";
import StripeCheckout from "@/components/StripeCheckout";
import {
  Check, CreditCard, Star, UsersThree, Envelope, Briefcase, Hourglass, CalendarBlank,
  Car, Warning, MapPin, Handshake, CurrencyEur, Phone,
} from "@phosphor-icons/react";
import ChatWidget from "@/components/ChatWidget";
import ContactBubble from "@/components/ContactBubble";

const EpinayLocalMap = lazy(() => import("@/components/EpinayLocalMap"));


const { TopBar, StageNav, Hero, StepsSection, FaqGrid, BookingForm } = Kit;

const FIT_FOR_YOU = [
  { icon: Car, text: "Vous avez perdu des points sur votre permis." },
  { icon: Warning, text: "Votre solde de points devient faible." },
  { icon: Envelope, text: "Vous avez reçu un courrier concernant votre permis (48N, 48M, etc.)." },
  { icon: Briefcase, text: "Vous avez besoin de votre permis pour travailler." },
  { icon: Hourglass, text: "Vous souhaitez récupérer rapidement jusqu'à 4 points." },
  { icon: CalendarBlank, text: "Vous recherchez une session disponible rapidement en Île-de-France." },
];

const STEPS_CUSTOM = [
  { title: "Réservez votre place", desc: "Choisissez la session qui vous convient et finalisez votre inscription en quelques minutes." },
  { title: "Recevez votre confirmation", desc: "Vous recevez rapidement toutes les informations utiles concernant votre stage." },
  { title: "Participez au stage", desc: "Présentez-vous au centre d'Épinay-sur-Seine aux dates prévues et suivez votre formation." },
  { title: "Récupérez jusqu'à 4 points", desc: "Une fois le stage terminé, les démarches administratives sont effectuées conformément à la réglementation." },
];

const GALLERY_IMAGES = [
  { src: heroTrainingImage, alt: "Formation au centre TDL Formation" },
  { src: "/tdl-image/banniere-stade-de-recuperation-de-points-Moyenne.jpeg", alt: "Stage de récupération de points" },
  { src: "/tdl-image/reussite-examen-1er-coup-tdl-1024x700-1.webp", alt: "Réussite à l'examen du premier coup" },
  { src: "/tdl-image/about-1.jpg", alt: "Ambiance du centre de formation TDL" },
  { src: "/tdl-image/about-2.jpg", alt: "Salle de formation TDL Formation" },
];

const BENEFITS_6 = [
  { icon: CurrencyEur, title: "Prix direct, sans intermédiaire", desc: "Profitez d'un tarif attractif en réservant directement auprès de notre centre, sans passer par des plateformes qui ajoutent leurs commissions." },
  { icon: CreditCard, title: "Paiement en plusieurs fois", desc: "Réservez votre stage et étalez votre paiement selon les modalités proposées." },
  { icon: MapPin, title: "Facile d'accès", desc: "Situé à Épinay-sur-Seine, notre centre est facilement accessible depuis les départements 92, 93 et 95, en transports en commun comme en voiture." },
  { icon: CalendarBlank, title: "Sessions régulières", desc: "Des dates disponibles tout au long de l'année pour s'adapter à votre planning." },
  { icon: Handshake, title: "Une équipe qui vous accompagne", desc: "Notre équipe vous guide avant votre inscription et répond à toutes vos questions." },
  { icon: Star, title: "Une réputation reconnue", desc: "Des centaines de conducteurs nous ont déjà fait confiance, comme en témoignent nos avis Google." },
];

const VILLES = ["Épinay-sur-Seine (93)", "Creil (60)"];

const SESSIONS = generateUpcomingSessions();
const NEXT_SESSION_LABEL = SESSIONS[0]?.items[0] || "Dates à venir — être informé";

const FAQ = [
  { q: "Combien de points puis-je récupérer ?", a: "Jusqu'à 4 points, conformément à la réglementation, dans la limite du plafond de votre permis." },
  { q: "Combien de temps dure le stage ?", a: "Le stage se déroule sur 2 jours consécutifs. Il n'y a pas d'examen final, votre présence pendant les deux journées complètes est obligatoire." },
  { q: "Puis-je payer en plusieurs fois ?", a: "Oui, nous proposons un paiement en plusieurs fois selon les modalités disponibles au moment de la réservation en ligne." },
  { q: "Où se déroule le stage ?", a: "Dans notre centre situé au 59 avenue Joffre, 93800 Épinay-sur-Seine, facilement accessible depuis les départements 92, 93 et 95. Un second centre est disponible à Creil (60)." },
  { q: "Quand les points sont-ils crédités ?", a: "Les démarches administratives sont réalisées conformément à la réglementation après votre participation complète au stage." },
  { q: "Que dois-je apporter le jour du stage ?", a: "Les documents nécessaires (pièce d'identité, permis de conduire...) vous seront communiqués dans votre confirmation d'inscription." },
  { q: "Puis-je annuler ou modifier ma réservation ?", a: "Contactez notre équipe dès que possible par téléphone ou via le formulaire de contact : nous étudions chaque situation au cas par cas pour trouver la meilleure solution." },
  { q: "Comment réserver ?", a: "Choisissez une session disponible dans le calendrier ci-dessus, puis remplissez le formulaire de réservation — c'est rapide et se fait entièrement en ligne." },
];

const PHONE_RE = /^(0[1-9]\d{8}|\+33[1-9]\d{8})$/;
const isValidPhone = (v) => PHONE_RE.test((v || "").replace(/[\s.\-]/g, ""));

export default function StageRecuperationPointsLanding() {
  const [session, setSession] = useState("");
  const [center, setCenter] = useState(VILLES[0]);
  const [form, setForm] = useState({ prenom: "", nom: "", telephone: "", ville: "", session: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [selectedVille, setSelectedVille] = useState("");
  const [expandedMonths, setExpandedMonths] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);
  const [hoveredDate, setHoveredDate] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [tempCenter, setTempCenter] = useState("");

  const revealRef = useReveal();
  const formRef = useRef(null);
  const calendarRef = useRef(null);

  const handlePaymentSuccess = (paymentData) => {
    toast.success("Paiement réussi ! Votre place est réservée.");
    setSent(true);
    trackPurchase({
      content_name: "stage_recuperation_points",
      value: 179,
      currency: "EUR",
      session,
      inscription_id: paymentData?.inscription_id
    });
  };

  const handleInscriptionCreated = (inscription) => {
    console.log("Inscription créée:", inscription);
  };

  const handleDirectPayment = async () => {
    if (!session) {
      toast.error("Veuillez sélectionner une session");
      return;
    }

    if (!form.prenom?.trim() || !form.nom?.trim() || !form.telephone?.trim()) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    if (!form.privacyConsent) {
      toast.error("Merci d'accepter l'utilisation de vos données");
      return;
    }

    setSending(true);
    try {
      const formationId = "e22bcca0-6656-4335-b6a6-8a06235a2770";

      const inscriptionResponse = await api.post("/inscriptions", {
        formation_id: formationId,
        student_name: `${form.prenom.trim()} ${form.nom.trim()}`,
        student_phone: form.telephone.trim(),
        student_email: form.email?.trim() || `${form.prenom.toLowerCase()}${form.nom.toLowerCase()}@temp.fr`,
        price: 179,
        category: "PERMIS",
        session: session,
        center: selectedVille || center,
        source: "stage_recuperation_points",
        landing_url: window.location.href,
        payment_status: "pending",
        status: "active",
        formation_title: "Stage récupération de points"
      });

      const inscription = inscriptionResponse.data.inscription;
      trackInitiateCheckout({ content_name: "stage_recuperation_points", value: 179, currency: "EUR", session });

      const checkoutResponse = await api.post("/payments/checkout", {
        inscription_id: inscription.id,
        allow_klarna: false
      });

      const { url } = checkoutResponse.data;

      if (url) {
        window.location.href = url;
      } else {
        toast.error("Erreur lors de la redirection vers le paiement");
      }

    } catch (error) {
      console.error("Erreur:", error);
      let errorMessage = "Erreur lors du paiement";
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.data && Array.isArray(error.response.data)) {
        errorMessage = error.response.data.map(e => e.msg || e).join(', ');
      }
      toast.error(errorMessage);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    setPageMeta({
      title: "Stage Récupération de Points Épinay-sur-Seine (93) | TDL Formation",
      description: "Récupérez jusqu'à 4 points sur votre permis en 2 jours à Épinay-sur-Seine (93), aussi à Creil (60). Stage agréé — 179€, réservation en ligne.",
      path: "/stage-recuperation-points",
    });
    // Un paiement réussi redirige désormais vers /stage-recuperation-points/merci
    // (voir routers/payments.py _LANDING_THANK_YOU_PATHS) — seul un paiement
    // annulé revient sur cette page.
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("paiement");

    if (paymentStatus === "annule") {
      toast.info("Paiement annulé. Vous pouvez réessayer quand vous voulez.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Version alternative : chaque item de session peut avoir 1 ou 2 jours
  const availableDates = useMemo(() => {
    const dates = [];
    const monthMap = {
      'janvier': 0, 'février': 1, 'mars': 2, 'avril': 3,
      'mai': 4, 'juin': 5, 'juillet': 6, 'août': 7,
      'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11,
      'janv': 0, 'févr': 1, 'avr': 3, 'aoû': 7,
      'sep': 8, 'sept': 8, 'oct': 9, 'nov': 10, 'déc': 11
    };

    const currentDate = new Date();
    let currentYear = currentDate.getFullYear();

    SESSIONS.forEach(({ mois, items }) => {
      const moisLower = mois.toLowerCase();
      let monthIndex = monthMap[moisLower];

      if (monthIndex === undefined) {
        const shortMonth = moisLower.substring(0, 3);
        for (const [key, value] of Object.entries(monthMap)) {
          if (key.substring(0, 3) === shortMonth) {
            monthIndex = value;
            break;
          }
        }
      }

      if (monthIndex === undefined) return;

      // Déterminer l'année
      let year = currentYear;
      if (monthIndex < currentDate.getMonth()) {
        year = currentYear + 1;
      }

      items.forEach((item) => {
        // Extraire les jours : "10 & 11 août" -> [10, 11]
        const days = item.match(/\d+/g)?.map(Number) || [];

        days.forEach(day => {
          if (!isNaN(day)) {
            const dateObj = new Date(year, monthIndex, day);
            if (!isNaN(dateObj.getTime())) {
              dates.push({
                date: dateObj,
                label: item,
                day: day,
                month: monthIndex,
                year: year,
                displayDate: `${day} ${mois} ${year}`
              });
            }
          }
        });
      });
    });

    return dates.sort((a, b) => a.date - b.date);
  }, [SESSIONS]);

  // Ajoutez ce useEffect pour déboguer
  useEffect(() => {
    console.log('Available dates:', availableDates);
    console.log('Sessions data:', SESSIONS);
  }, [availableDates]);

  // Vérifier si une date est disponible
  const isDateAvailable = (day, month, year) => {
    return availableDates.some(d =>
      d.day === day && d.month === month && d.year === year
    );
  };

  // Obtenir le label de la session pour une date
  const getSessionLabel = (day, month, year) => {
    const found = availableDates.find(d =>
      d.day === day && d.month === month && d.year === year
    );
    return found ? found.label : null;
  };

  // Navigation du calendrier
  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Générer les jours du mois
  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    return new Date(year, month, 1).getDay();
  };

  // Sélectionner une date
  const handleDateSelect = (day, month, year) => {
    const label = getSessionLabel(day, month, year);
    if (label) {
      setSelectedDate({ day, month, year });
      setSession(label);
      setShowCalendar(false);
      trackSchedule({ content_name: label, value: 179, currency: "EUR" });
      toast.success(`Session sélectionnée : ${label}`);
    }
  };

  const toggleCalendar = () => {
    setShowCalendar(!showCalendar);
    if (!showCalendar) {
      const now = new Date();
      setCurrentMonth(now.getMonth());
      setCurrentYear(now.getFullYear());
    }
  };

  // Rendu du calendrier
  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
    const today = new Date();
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const dayNames = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-empty"></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const isAvailable = isDateAvailable(day, currentMonth, currentYear);
      const isSelected = selectedDate && selectedDate.day === day && selectedDate.month === currentMonth && selectedDate.year === currentYear;
      const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
      const isPast = new Date(currentYear, currentMonth, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

      days.push(
        <button
          key={day}
          onClick={() => isAvailable && !isPast && handleDateSelect(day, currentMonth, currentYear)}
          onMouseEnter={() => setHoveredDate({ day, month: currentMonth, year: currentYear })}
          onMouseLeave={() => setHoveredDate(null)}
          disabled={!isAvailable || isPast}
          className={`calendar-day ${isAvailable && !isPast ? 'available' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}`}
          title={isAvailable && !isPast ? getSessionLabel(day, currentMonth, currentYear) : ''}
        >
          {day}
          {isAvailable && !isPast && (
            <span className="availability-dot"></span>
          )}
        </button>
      );
    }

    // Compter les jours disponibles dans le mois actuel
    const availableDaysInMonth = availableDates.filter(d =>
      d.month === currentMonth && d.year === currentYear
    );

    return (
      <div className="calendar-dropdown" ref={calendarRef}>
        <div className="calendar-header">
          <button onClick={goToPreviousMonth} className="calendar-nav">←</button>
          <span className="calendar-title">{monthNames[currentMonth]} {currentYear}</span>
          <button onClick={goToNextMonth} className="calendar-nav">→</button>
        </div>
        <div className="calendar-weekdays">
          {dayNames.map(day => (
            <span key={day} className="calendar-weekday">{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {days}
        </div>
        {availableDaysInMonth.length > 0 && (
          <div className="calendar-available-count">
            {availableDaysInMonth.length} session{availableDaysInMonth.length > 1 ? 's' : ''} disponible{availableDaysInMonth.length > 1 ? 's' : ''} ce mois-ci
          </div>
        )}
        <div className="calendar-legend">
          <span className="legend-item">
            <span className="legend-dot available-dot"></span> Disponible
          </span>
          <span className="legend-item">
            <span className="legend-dot selected-dot"></span> Sélectionné
          </span>
          <span className="legend-item">
            <span className="legend-dot today-dot"></span> Aujourd'hui
          </span>
        </div>
        <button className="calendar-close" onClick={() => setShowCalendar(false)}>
          Fermer
        </button>
      </div>
    );
  };

  const chooseSession = (label) => {
    setSession(label);
    trackSchedule({ content_name: label, value: 179, currency: "EUR" });

    // Mettre à jour la date sélectionnée
    const found = availableDates.find(d => d.label === label);
    if (found) {
      setSelectedDate({ day: found.day, month: found.month, year: found.year });
    }

    // Scroll vers le formulaire
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };
  const toggleMonth = (mois) => {
    setExpandedMonths(prev => ({
      ...prev,
      [mois]: !prev[mois]
    }));
  };

  const submit = async (e) => {
    e.preventDefault();

    // Vérifier qu'une session est sélectionnée
    if (!session) {
      return toast.error("Veuillez sélectionner une date de session");
    }

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
      const eventId = newEventId();
      await api.post("/callback-requests", {
        prenom: form.prenom,
        nom: form.nom,
        telephone: form.telephone,
        session: session, // La session sélectionnée
        center: selectedVille || center,
        source: "stage_recuperation_points_179",
        page_url: window.location.href,
        event_id: eventId,
        ...getFbCookies(),
      });
      setSent(true);
      trackLead({ content_name: "stage_recuperation_points", value: 179, currency: "EUR", session }, eventId);
      toast.success("Votre demande a bien été enregistrée. Nous vous recontacterons sous 24h.");
      // Réinitialiser le formulaire après envoi
      setForm({ prenom: "", nom: "", telephone: "", privacyConsent: false });
    } catch (error) {
      console.error("Erreur d'envoi:", error);
      toast.error("Erreur lors de l'envoi, merci de réessayer ou de nous appeler directement.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="stage-recup-points-page" ref={revealRef}>
      <a className="skip-link" href="#main">Aller au contenu</a>

      <TopBar />
      <StageNav ctaLabel="Réserver une session" ctaHref="#form" />

      <Hero
        titleLine1="Récupérez jusqu'à"
        titleLine2Gold="4 points en 2 jours"
        subheadline="Stage agréé à Épinay-sur-Seine • Paiement en plusieurs fois • Réservation simple et rapide"
        description="Jusqu'à +4 points sur votre permis en 2 jours. Une formation sans examen, aux portes du 93, du 95 et du 92."
        heroImage={heroTrainingImage}
        villes={VILLES}
        availableDates={availableDates}
        onFindSessions={(ville, chosenSession) => {
          setSelectedVille(ville);
          setSession(chosenSession);
          trackSchedule({ content_name: chosenSession, value: 179, currency: "EUR" });
          setTimeout(() => {
            formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 100);
        }}
      />



      {/* //Badges de confiance sous le CTA du hero  */}
      <div className="max-w-xl mx-auto px-6 flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6 sm:gap-y-2 pb-8 text-[13px] font-bold text-gray-700 text-center">
        <span className="inline-flex items-center gap-1.5"><Check size={15} weight="bold" style={{ color: "#d4af37" }} /> Jusqu'à 4 points récupérés</span>
        <span className="inline-flex items-center gap-1.5"><CreditCard size={15} weight="bold" style={{ color: "#d4af37" }} /> Paiement en plusieurs fois</span>
        <span className="inline-flex items-center gap-1.5"><Star size={15} weight="fill" style={{ color: "#d4af37" }} /> Avis Google 4,9/5</span>
      </div>

      {/* SECTION 2 — Pourquoi des centaines de conducteurs nous font confiance */}
      <section className="trust-section">
        <div className="container">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-8">
            Pourquoi des centaines de conducteurs nous font confiance ?
          </h2>
          <div className="trust-grid">
            <div className="trust-item">
              <img
                src="/Logo-Qualiopi-150dpi-Avec-Marianne-1.jpg.jpeg"
                alt="Certifié Qualiopi"
                className="badge-logo"
                loading="lazy"
              />
              <div>
                <strong>Centre de formation certifié</strong>
                <small>Certification Qualiopi</small>
              </div>
            </div>
            <div className="trust-item">
              <span><Check size={22} weight="bold" /></span>
              <div>
                <strong>Des centaines de conducteurs</strong>
                <small>récupèrent leurs points dans notre centre</small>
              </div>
            </div>
            <div className="trust-item">
              <img
                src="/tdl-image/Préfet_de_la_Seine-Saint-Denis.svg.webp"
                alt="Préfecture de la Seine-Saint-Denis"
                className="badge-logo"
                loading="lazy"
              />
              <div>
                <strong>Centre agréé par la Préfecture</strong>
                <small>Stage officiel conforme à la réglementation</small>
              </div>
            </div>
            <a className="trust-phone" href="tel:+33180907249">
              <span><Phone size={22} weight="bold" /></span>
              <div>
                <small>Besoin d'aide ?</small>
                <strong>01 80 90 72 49</strong>
              </div>
            </a>
          </div>
        </div>
      </section>

      <GoogleReviewsCarousel />

      {/* SECTION 3 — Ce stage est fait pour vous si... */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-10">
            Ce stage est fait pour vous si…
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FIT_FOR_YOU.map((item) => (
              <div key={item.text} className="bg-gray-50 border border-gray-200 rounded-md p-5 flex items-start gap-3" data-reveal>
                <item.icon size={24} weight="bold" className="shrink-0" style={{ color: "#d4af37" }} />
                <p className="text-sm text-gray-700 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 max-w-2xl mx-auto text-center bg-gray-50 border border-[#d4af37]/30 rounded-md p-5">
            <p className="text-sm text-gray-600">
              Quelle que soit votre situation, notre équipe vous accompagne pour choisir la session adaptée à votre dossier.
            </p>
          </div>
          <div className="text-center mt-8">
            <a href="#form" style={{ backgroundColor: "#d4af37" }} className="inline-flex items-center text-black font-bold uppercase text-xs tracking-wide px-8 py-4 rounded-md">
              Réservez une session
            </a>
          </div>
        </div>
      </section>

      {/* SECTION 4 — Comment se déroule votre stage ? */}
      <StepsSection id="etapes" title="Votre stage en 4 étapes simples" steps={STEPS_CUSTOM} />

      <section className="py-4 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {GALLERY_IMAGES.map((img) => (
              <div key={img.src} className="aspect-square overflow-hidden rounded-md bg-black">
                <img src={img.src} alt={img.alt} loading="lazy" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
{/* 
          <div className="mt-10 max-w-2xl mx-auto text-center bg-white border border-gray-200 rounded-md p-5">
            <p className="text-sm text-gray-600 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1"><Check size={14} weight="bold" style={{ color: "#d4af37" }} /> Centre agréé (Qualiopi & Préfecture)</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><Check size={14} weight="bold" style={{ color: "#d4af37" }} /> Paiement en plusieurs fois</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><Check size={14} weight="bold" style={{ color: "#d4af37" }} /> Équipe disponible pour vous accompagner</span>
            </p>
          </div> */}
          <div className="text-center mt-8 pb-6">
            <a href="#form" style={{ backgroundColor: "#d4af37" }} className="inline-flex items-center text-black font-bold uppercase text-xs tracking-wide px-8 py-4 rounded-md">
              Réservez une session
            </a>
          </div>
        </div>
      </section>

      <section className="location-section" id="acces">
        <div className="container">
          <div className="section-heading location-heading">
            <div>
              <p className="eyebrow">Notre avantage local</p>
              <h2>Un centre.<br />Trois départements.</h2>
            </div>
            <p>Idéalement situé entre le <strong>93</strong>, le <strong>95</strong> et le <strong>92</strong>, le centre TDL d'Épinay-sur-Seine est facile d'accès depuis le nord et l'ouest parisien.</p>
          </div>

          <div className="location-grid">
            <Suspense fallback={<div className="local-map" style={{ background: "#111113" }} />}>
              <EpinayLocalMap className="local-map" />
            </Suspense>

            <aside className="access-card">
              <p className="eyebrow">Venir au centre</p>
              <h3>59 avenue Joffre<br />93800 Épinay-sur-Seine</h3>
              <ul>
                <li><span>RER</span><div><strong>RER C</strong><small>Gare d'Épinay-sur-Seine</small></div></li>
                <li><span>BUS</span><div><strong>Bus 154 et 239</strong><small>À proximité du centre</small></div></li>
                <li><span>Ⓟ</span><div><strong>Stationnement sur place</strong><small>Accès facilité en voiture</small></div></li>
                <li><span>♿</span><div><strong>Places adaptées et réservées</strong><small>Accueil accessible</small></div></li>
              </ul>
              <a className="button button-outline" href="https://www.google.com/maps/search/?api=1&query=59+avenue+Joffre+93800+Epinay-sur-Seine" target="_blank" rel="noopener">Ouvrir l'itinéraire <span>↗</span></a>
            </aside>
          </div>
        </div>
      </section>

      {/* SECTION 5 — Avantages */}
      <section id="avantages" className="py-16 lg:py-20 bg-gray-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-10">
            Pourquoi réserver directement avec nous ?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
            {BENEFITS_6.map((b) => (
              <div key={b.title} className="bg-white border border-gray-200 rounded-md p-5" data-reveal>
                <p className="font-bold text-sm mb-1 flex items-center gap-1.5"><b.icon size={18} weight="bold" style={{ color: "#d4af37" }} /> {b.title}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>

          <div className="payment-section" style={{ border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <div className="container payment-grid">
              <div>
                <span className="payment-icon">◇</span>
                <div>
                  <strong>Paiement 100 % sécurisé</strong>
                  <small>Vos informations sont protégées</small>
                </div>
              </div>
              <p>Carte bancaire <b>•</b> PayPal <b>•</b> Apple Pay <b>•</b> Google Pay <b>•</b> Klarna (paiement en plusieurs fois)</p>
              <div className="payment-logos" aria-label="Moyens de paiement">
                <img src="https://cdn.simpleicons.org/visa/1A1F71" alt="Visa" loading="lazy" />
                <img src="https://cdn.simpleicons.org/mastercard" alt="Mastercard" loading="lazy" />
                <img src="https://cdn.simpleicons.org/paypal/00457C" alt="PayPal" loading="lazy" />
                <img src="https://cdn.simpleicons.org/applepay/000000" alt="Apple Pay" loading="lazy" />
                <img src="https://cdn.simpleicons.org/googlepay/4285F4" alt="Google Pay" loading="lazy" />
                <img src="https://cdn.simpleicons.org/klarna/FFB3C7" alt="Klarna" loading="lazy" style={{ background: "#0a0a0a", borderRadius: 4, padding: "3px 5px" }} />
              </div>
              <p className="text-center" style={{ fontSize: 11, color: "#d4af37", fontWeight: 700, marginTop: 6 }}>
                Paiement en plusieurs fois disponible avec Klarna
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6 — Choisissez votre prochaine session */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#d4af37" }}>Calendrier</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">Réservez votre place pour la prochaine session</h2>
          <p className="text-gray-500 mb-6">Choisissez la date qui vous convient et réservez votre stage directement en ligne.</p>
          <p className="text-sm text-gray-500 italic mb-10">Les places sont limitées pour chaque session. Nous vous conseillons de réserver dès que possible.</p>

          {SESSIONS.map(({ mois, items }, index) => {
            const isExpanded = expandedMonths[mois] || false;
            const isFirstTwoMonths = index < 2;
            const shouldShowDropdown = !isFirstTwoMonths;

            return (
              <div className="mb-8" key={mois}>
                <div className="flex items-baseline gap-4 mb-4">
                  <h3 className="font-display text-lg font-bold">{mois}</h3>
                  <div className="flex-1 h-px bg-gray-200" />

                  {shouldShowDropdown && (
                    <button
                      onClick={() => toggleMonth(mois)}
                      className="text-sm font-medium text-[#d4af37] hover:text-[#b8962f] transition-colors flex items-center gap-1"
                    >
                      {isExpanded ? (
                        <>
                          <span>Réduire</span>
                          <svg className="w-4 h-4 transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </>
                      ) : (
                        <>
                          <span>Afficher les dates</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {(isFirstTwoMonths || isExpanded) && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {items.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => chooseSession(label)}
                        data-testid={`session-${label}`}
                        className={`text-left border rounded-md p-4 transition-colors ${session === label ? "border-[#d4af37] bg-[#d4af37]/5" : "border-gray-200 hover:border-[#d4af37]"
                          }`}
                      >
                        <div className="font-semibold text-sm">{label}</div>
                        <div className="text-xs text-gray-400 uppercase tracking-wide mt-1">Choisir cette date</div>
                      </button>
                    ))}
                  </div>
                )}

                {shouldShowDropdown && !isExpanded && (
                  <div className="text-sm text-gray-500 italic mt-2">
                    {items.length} session{items.length > 1 ? 's' : ''} disponible{items.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            );
          })}

          {SESSIONS.length > 2 && (
            <div className="text-center mt-8">
              <button
                onClick={() => {
                  const allExpanded = SESSIONS.slice(2).every((_, index) =>
                    expandedMonths[SESSIONS[index + 2]?.mois]
                  );
                  const newState = {};
                  SESSIONS.slice(2).forEach(({ mois }) => {
                    newState[mois] = !allExpanded;
                  });
                  setExpandedMonths(newState);
                }}
                className="text-sm font-medium text-[#d4af37] hover:text-[#b8962f] transition-colors"
              >
                {SESSIONS.slice(2).every((_, index) =>
                  expandedMonths[SESSIONS[index + 2]?.mois]
                ) ? 'Tout réduire' : 'Afficher tous les mois'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 7 — FAQ */}
      <FaqGrid id="faq" items={FAQ} />
      <div className="text-center py-8 bg-gray-50 border-t border-gray-200">
        <a href="tel:+33180907249" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-[#d4af37]">
          <Phone size={16} weight="bold" /> Une question ? Contactez-nous au 01 80 90 72 49
        </a>
      </div>

      {/* SECTION 8 — Dernier appel à l'action */}
      <section className="py-16 lg:py-20 bg-black text-white text-center">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Réservez votre stage et récupérez jusqu'à 4 points en seulement 2 jours.
          </h2>
          <p className="text-gray-400 mb-8">
            Choisissez votre prochaine session à Épinay-sur-Seine et réservez votre place en quelques minutes.
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold mb-10">
            <span className="inline-flex items-center gap-1.5"><Check size={15} weight="bold" style={{ color: "#d4af37" }} /> Jusqu'à 4 points récupérés</span>
            <span className="inline-flex items-center gap-1.5"><Check size={15} weight="bold" style={{ color: "#d4af37" }} /> Paiement en plusieurs fois</span>
            <span className="inline-flex items-center gap-1.5"><Check size={15} weight="bold" style={{ color: "#d4af37" }} /> À partir de 179 €</span>
            <span className="inline-flex items-center gap-1.5"><Check size={15} weight="bold" style={{ color: "#d4af37" }} /> Réservation rapide</span>
          </div>
          <a href="#form" style={{ backgroundColor: "#d4af37" }} className="inline-flex items-center text-black font-bold uppercase text-sm tracking-wide px-12 py-5 rounded-md">
            Réservez une session
          </a>

          <div className="mt-12 pt-8 border-t border-white/10 flex flex-wrap justify-center gap-x-10 gap-y-4 text-sm text-gray-300">
            <a href="tel:+33180907249" className="inline-flex items-center gap-1.5 hover:text-[#d4af37]"><Phone size={15} weight="bold" /> 01 80 90 72 49</a>
            <a href="mailto:contact@tdl-formation.fr" className="inline-flex items-center gap-1.5 hover:text-[#d4af37]"><Envelope size={15} weight="bold" /> contact@tdl-formation.fr</a>
            <span className="inline-flex items-center gap-1.5"><MapPin size={15} weight="bold" /> 59 avenue Joffre, 93800 Épinay-sur-Seine</span>
          </div>
          <p className="mt-6 text-xs text-gray-500 flex items-center justify-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={12} weight="fill" style={{ color: "#d4af37" }} />)}
            4,9/5 sur Google · Des centaines de conducteurs accompagnés
          </p>
        </div>
      </section>

      <BookingForm
        formRef={formRef}
        form={form}
        setForm={setForm}
        session={session}
        center={selectedVille || center}
        sending={sending}
        sent={sent}
        onSubmit={submit}
        onDirectPayment={handleDirectPayment}
        price={179}
        priceLabel="tarif standard"
        onPaymentSuccess={handlePaymentSuccess}
        onInscriptionCreated={handleInscriptionCreated}

      />

      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand">
            <img src={logoTdlImage} alt="TDL Formation" />
            <p>Formation, prévention routière et accompagnement des conducteurs.</p>
          </div>
          <div>
            <h3>Le stage</h3>
            <a href="#avantages">Les avantages</a>
            <a href="#etapes">Comment ça marche ?</a>
            <a href="#faq">Questions fréquentes</a>
          </div>
          <div>
            <h3>Notre centre</h3>
            <p>59 avenue Joffre<br />93800 Épinay-sur-Seine</p>
            <a href="#acces">Accès et stationnement</a>
          </div>
          <div>
            <h3>Nous contacter</h3>
            <a href="tel:+33180907249">01 80 90 72 49</a>
            <a href="mailto:contact@tdl-formation.fr">contact@tdl-formation.fr</a>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© 2026 TDL Formation</span>
          <span>Mentions légales • Politique de confidentialité</span>
        </div>
      </footer>

      <style jsx>{`
        .calendar-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 16px;
          z-index: 100;
          min-width: 280px;
          box-shadow: 0 12px 48px rgba(0,0,0,0.5);
          animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .calendar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .calendar-nav {
          background: rgba(255,255,255,0.05);
          border: none;
          color: #fff;
          font-size: 18px;
          cursor: pointer;
          padding: 2px 10px;
          border-radius: 6px;
          transition: background 0.2s;
        }

        .calendar-nav:hover {
          background: rgba(255,255,255,0.1);
        }

        .calendar-title {
          color: #fff;
          font-size: 14px;
          font-weight: 600;
        }

        .calendar-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
          margin-bottom: 4px;
        }

        .calendar-weekday {
          text-align: center;
          font-size: 10px;
          font-weight: 600;
          color: #888;
          padding: 4px 0;
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
        }

        .calendar-empty {
          padding: 4px;
        }

        .calendar-day {
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: default;
          transition: all 0.2s;
          position: relative;
          background: transparent;
          color: #666;
        }

        .calendar-day.available {
          cursor: pointer;
          color: #fff;
          background: transparent;
        }

        .calendar-day.available:hover {
          background: rgba(212, 175, 55, 0.2);
          transform: scale(1.05);
        }

        .calendar-day.selected {
          background: #d4af37;
          color: #000;
          font-weight: 600;
          transform: scale(1.05);
        }

        .calendar-day.selected:hover {
          background: #c49a2e;
        }

        .calendar-day.today {
          border: 2px solid #d4af37;
        }

        .calendar-day.past {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .calendar-day:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .availability-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background-color: #d4af37;
          position: absolute;
          bottom: 2px;
        }

        .calendar-day.selected .availability-dot {
          background-color: #000;
        }

        .calendar-available-count {
          text-align: center;
          font-size: 11px;
          color: #d4af37;
          margin-top: 8px;
          padding: 4px;
          background: rgba(212, 175, 55, 0.1);
          border-radius: 4px;
        }

        .calendar-legend {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin-top: 10px;
          flex-wrap: wrap;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: #888;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }

        .available-dot {
          background-color: #d4af37;
        }

        .selected-dot {
          background-color: #d4af37;
          border: 1px solid #d4af37;
        }

        .today-dot {
          background-color: transparent;
          border: 2px solid #d4af37;
          width: 10px;
          height: 10px;
        }

        .calendar-close {
          width: 100%;
          margin-top: 10px;
          padding: 6px;
          background: rgba(255,255,255,0.05);
          border: none;
          border-radius: 6px;
          font-size: 12px;
          color: #888;
          cursor: pointer;
          transition: background 0.2s;
        }

        .calendar-close:hover {
          background: rgba(255,255,255,0.1);
        }
      `}</style>
      <ChatWidget />
      <ContactBubble />
    </div>
  );
}