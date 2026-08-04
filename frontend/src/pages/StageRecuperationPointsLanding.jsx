import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useReveal } from "@/hooks/useReveal";
import { setPageMeta } from "@/lib/seo";
import { trackSchedule, trackLead } from "@/lib/metaPixel";
import { generateUpcomingSessions } from "@/lib/upcomingSessions";
import Kit, { DEFAULT_FEATURES, DEFAULT_STEPS } from "@/components/StageLandingPage";
import GoogleReviewsCarousel from "@/components/GoogleReviewsCarousel";
import { api } from "@/lib/api";
import "@/styles/stage-recuperation-points.css";
import heroTrainingImage from "@/assets/hero-training.jpeg";
import logoTdlImage from "@/assets/logo-tdl.png";
import StripeCheckout from "@/components/StripeCheckout";


const { TopBar, StageNav, Hero, FeatureStrip, StepsSection, SessionBanner, TrustBar, FaqGrid, BookingForm } = Kit;

const VILLES = ["Épinay-sur-Seine (93)", "Creil (60)"];

const SESSIONS = generateUpcomingSessions();
const NEXT_SESSION_LABEL = SESSIONS[0]?.items[0] || "Dates à venir — être informé";

const FAQ = [
  { q: "Combien de points puis-je récupérer ?", a: "Le stage permet de récupérer jusqu'à quatre points, dans la limite du plafond de votre permis et selon les conditions réglementaires." },
  { q: "Le stage comporte-t-il un examen ?", a: "Non. Il n'y a pas d'examen final. Votre présence pendant les deux journées complètes est obligatoire." },
  { q: "Quand mes points sont-ils crédités ?", a: "Les points prennent effet réglementairement dès le lendemain de la deuxième journée, puis apparaissent après traitement administratif." },
  { q: "Peut-on payer en plusieurs fois ?", a: "Oui, le paiement en plusieurs fois est disponible lors de la réservation en ligne, selon les modalités proposées." },
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
    trackLead({
      content_name: "stage_recuperation_points",
      value: 240,
      currency: "EUR",
      session,
      inscription_id: paymentData?.inscription_id
    });
  };

  const handleInscriptionCreated = (inscription) => {
    console.log("Inscription créée:", inscription);
  };

  useEffect(() => {
    setPageMeta({
      title: "Stage récupération de points — 240€ | TDL Formation",
      description: "Récupérez jusqu'à 4 points sur votre permis en 2 jours. Stage agréé, sessions à Épinay-sur-Seine et Creil.",
      path: "/stage-recuperation-points",
    });
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
      trackSchedule({ content_name: label, value: 240, currency: "EUR" });
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

    const handlePaymentSuccess = (paymentData) => {
      toast.success("Paiement réussi ! Votre place est réservée.");
      setSent(true);
      trackLead({
        content_name: "stage_recuperation_points",
        value: 240,
        currency: "EUR",
        session,
        inscription_id: paymentData.inscription_id
      });
    };

    const handleInscriptionCreated = (inscription) => {
      console.log("Inscription créée:", inscription);
    };

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

  const handleFindSessions = () => {
    if (!session) {
      toast.error("Veuillez sélectionner une date");
      return;
    }
    const selectedCenter = tempCenter || center;
    setSelectedVille(selectedCenter);

    // Scroll vers le formulaire avec un délai pour laisser le temps au DOM de se mettre à jour
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const chooseSession = (label) => {
    setSession(label);
    trackSchedule({ content_name: label, value: 240, currency: "EUR" });

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
      await api.post("/callback-requests", {
        prenom: form.prenom,
        nom: form.nom,
        telephone: form.telephone,
        session: session, // La session sélectionnée
        center: selectedVille || center,
        source: "stage_recuperation_points_240"
      });
      setSent(true);
      trackLead({ content_name: "stage_recuperation_points", value: 240, currency: "EUR", session });
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
        titleLine1="Stage de récupération"
        titleLine2Gold="de points à 240 €"
        subheadline="Stage agréé • Épinay-sur-Seine et Creil"
        description="Jusqu'à +4 points sur votre permis en 2 jours. Une formation sans examen, aux portes du 93, du 95 et du 92."
        heroImage={heroTrainingImage}
        villes={VILLES}
        availableDates={availableDates}
        onFindSessions={(ville, session) => {
          setSelectedVille(ville);
          formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />



      <FeatureStrip items={DEFAULT_FEATURES} />

      <StepsSection title="Une démarche simple, un résultat concret." steps={DEFAULT_STEPS} />

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
            <div className="local-map" role="img" aria-label="Carte stylisée situant TDL Épinay entre les départements 95, 93 et 92">
              <span className="dept dept-95">95</span>
              <span className="dept dept-93">93</span>
              <span className="dept dept-92">92</span>
              <span className="city city-enghien">Enghien-les-Bains</span>
              <span className="city city-deuil">Deuil-la-Barre</span>
              <span className="city city-argenteuil">Argenteuil</span>
              <span className="city city-villetaneuse">Villetaneuse</span>
              <span className="city city-saintdenis">Saint-Denis</span>
              <span className="city city-colombes">Colombes</span>
              <span className="city city-gennevilliers">Gennevilliers</span>
              <span className="city city-vlg">Villeneuve-la-Garenne</span>
              <div className="map-pin"><span /><strong>TDL ÉPINAY</strong></div>
            </div>

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

      <section className="py-16 lg:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#d4af37" }}>Calendrier</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-10">Les prochaines sessions</h2>

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

      <section className="payment-section">
        <div className="container payment-grid">
          <div>
            <span className="payment-icon">◇</span>
            <div>
              <strong>Paiement 100 % sécurisé</strong>
              <small>Vos informations sont protégées</small>
            </div>
          </div>
          <p>Carte bancaire <b>•</b> PayPal <b>•</b> Apple Pay <b>•</b> Google Pay</p>
          <div className="payment-logos" aria-label="Moyens de paiement">
            <span>CB</span>
            <span>PayPal</span>
            <span> Pay</span>
            <span>G Pay</span>
          </div>
        </div>
      </section>

      <section className="trust-section">
        <div className="container trust-grid">
          <div className="rating">
            <span className="quote">"</span>
            <div>
              <strong>Excellent — 4,9/5</strong>
              <span className="stars">★★★★★</span>
            </div>
          </div>
          <div className="trust-item">
            <span>✓</span>
            <div>
              <strong>Centre de confiance</strong>
              <small>Une équipe à votre écoute</small>
            </div>
          </div>
          <a className="trust-phone" href="tel:+33180907249">
            <span>☎</span>
            <div>
              <small>Besoin d'aide ?</small>
              <strong>01 80 90 72 49</strong>
            </div>
          </a>
        </div>
      </section>

      <GoogleReviewsCarousel />
      <BookingForm
        formRef={formRef}
        form={form}
        setForm={setForm}
        session={session}
        center={selectedVille || center}
        sending={sending}
        sent={sent}
        onSubmit={submit}
        price={240}
        priceLabel="tarif standard"
        onPaymentSuccess={handlePaymentSuccess}
        onInscriptionCreated={handleInscriptionCreated}
      />
      <FaqGrid items={FAQ} />

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
    </div>
  );
}