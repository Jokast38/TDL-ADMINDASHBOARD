import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Clock, MapPin, CaretDown, CaretRight, ShieldCheck, CalendarBlank, Plus, Certificate,
  Star, Phone, UsersThree, Armchair, PersonSimple, ChatCircleText, X, Check,
} from "@phosphor-icons/react";
import { trackSchedule } from "@/lib/metaPixel";
import PrivacyConsentCheckbox from "@/components/PrivacyConsentCheckbox";
import { toast } from "sonner";
import { api } from "@/lib/api";
import StripeCheckout from "@/components/StripeCheckout";

const GOLD = "#d4af37";
const NAVY = "#0a0a0a";

// ─── Barre utilitaire + nav ───────────────────────────────────────────────────
function TopBarContent() {
  return (
    <>
      <span className="inline-flex items-center gap-2 shrink-0">
        <Clock size={13} style={{ color: GOLD }} /> HORAIRES : Lun–Ven : 9h à 18h | Sam 10h–17h
      </span>
      <span className="inline-flex items-center gap-2 shrink-0">
        <MapPin size={13} style={{ color: GOLD }} /> NOS CENTRES : Épinay-sur-Seine (93) &amp; Creil (60)
      </span>
    </>
  );
}

function TopBar() {
  return (
    <div className="bg-black text-white text-xs h-9 overflow-hidden">
      <div className="marquee-track h-9 flex items-center gap-16 whitespace-nowrap w-max">
        <div className="flex items-center gap-16 shrink-0">
          <TopBarContent />
        </div>
        <div className="flex items-center gap-16 shrink-0" aria-hidden="true">
          <TopBarContent />
        </div>
      </div>
    </div>
  );
}

const NAV_LINKS = [
  { label: "Accueil", to: "/" },
  { label: "Formations VTC", to: "/formations" },
  { label: "Formations Taxi", to: "/formations" },
  { label: "Conseiller de Vente", to: "/formations" },
  { label: "ECSR", to: "/formations" },
  { label: "SSIAP", to: "/formations" },
  { label: "Blog", to: "/blog" },
];

function StageNav({ ctaLabel = "Réserver une session", ctaHref = "#form" }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
          <span className="font-display font-bold text-sm tracking-tight hidden lg:inline">TDL Formation</span>
        </Link>
        <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {NAV_LINKS.map((l) => (
            <Link key={l.label} to={l.to} className="hover:text-[#d4af37] whitespace-nowrap">{l.label}</Link>
          ))}
        </nav>
        <a href={ctaHref} className="hidden sm:block shrink-0">
          <Button size="sm" style={{ backgroundColor: GOLD }} className="text-black hover:brightness-95 font-bold uppercase text-xs tracking-wide">
            {ctaLabel} <CaretRight size={12} className="ml-1" weight="bold" />
          </Button>
        </a>
        <button className="lg:hidden p-2" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
          {mobileOpen ? <X size={20} /> : <CaretDown size={20} />}
        </button>
      </div>
      {mobileOpen && (
        <div className="lg:hidden border-t border-gray-200 px-6 py-4 flex flex-col gap-3 text-sm">
          {NAV_LINKS.map((l) => (
            <Link key={l.label} to={l.to} onClick={() => setMobileOpen(false)}>{l.label}</Link>
          ))}
          <a href={ctaHref} onClick={() => setMobileOpen(false)}>
            <Button size="sm" style={{ backgroundColor: GOLD }} className="text-black w-full font-bold">{ctaLabel}</Button>
          </a>
        </div>
      )}
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero({
  titleLine1,
  titleLine2Gold,
  subheadline,
  description,
  heroImage,
  badgeNumber,
  villes,
  onFindSessions,
  availableDates = [],
}) {
  const [ville, setVille] = useState("");
  const [session, setSession] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);

  const toggleCalendar = () => {
    setShowCalendar(!showCalendar);
    if (!showCalendar) {
      const now = new Date();
      setCurrentMonth(now.getMonth());
      setCurrentYear(now.getFullYear());
    }
  };

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

  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    return new Date(year, month, 1).getDay();
  };

  const isDateAvailable = (day, month, year) => {
    return availableDates.some(d =>
      d.day === day && d.month === month && d.year === year
    );
  };

  const getSessionLabel = (day, month, year) => {
    const found = availableDates.find(d =>
      d.day === day && d.month === month && d.year === year
    );
    return found ? found.label : null;
  };

  const handleDateSelect = (day, month, year) => {
    const label = getSessionLabel(day, month, year);
    if (label) {
      setSelectedDate({ day, month, year });
      setSession(label);
      setShowCalendar(false);
      trackSchedule({ content_name: label, value: 240, currency: "EUR" });
    }
  };

  const handleFindSessions = () => {
    if (!session) {
      return;
    }
    onFindSessions?.(ville, session);
  };

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
          disabled={!isAvailable || isPast}
          className={`calendar-day ${isAvailable && !isPast ? 'available' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}`}
          title={isAvailable && !isPast ? getSessionLabel(day, currentMonth, currentYear) || '' : ''}
        >
          {day}
          {isAvailable && !isPast && (
            <span className="availability-dot"></span>
          )}
        </button>
      );
    }

    const availableDaysInMonth = availableDates.filter(d =>
      d.month === currentMonth && d.year === currentYear
    );

    return (
      <div className="calendar-dropdown">
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

  return (
    <section className="bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight leading-[0.95] uppercase">
            {titleLine1}<br /><span style={{ color: GOLD }}>{titleLine2Gold}</span>
          </h1>
          <p className="font-display text-xl sm:text-2xl font-bold mt-5 leading-snug">{subheadline}</p>
          <span className="block h-1 w-16 mt-5 mb-5" style={{ backgroundColor: NAVY }} />
          <p className="text-gray-500 max-w-md">{description}</p>

          <div className="mt-8 bg-black rounded-lg p-5 max-w-md" data-testid="find-session-widget">
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
              Trouver une session
            </p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="relative">
                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={ville}
                  onChange={(e) => setVille(e.target.value)}
                  className="w-full bg-[#1a1a1a] text-white text-sm rounded-md pl-8 pr-3 py-2.5 border border-white/10 appearance-none"
                >
                  <option value="">Choisissez votre ville</option>
                  {villes.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="relative">
                <CalendarBlank size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="w-full bg-[#1a1a1a] text-white text-sm rounded-md pl-8 pr-3 py-2.5 border border-white/10 cursor-pointer"
                  type="text"
                  readOnly
                  value={session || "Choisir une date"}
                  onClick={toggleCalendar}
                  placeholder="Choisir une date"
                />
                {showCalendar && renderCalendar()}
              </div>
            </div>
            {session && (
              <div className="mb-3 px-2 py-1.5 bg-[#d4af37]/10 rounded-md border border-[#d4af37]/20">
                <span className="text-xs text-[#d4af37]">
                  ✓ {session}
                </span>
              </div>
            )}
            <Button
              onClick={handleFindSessions}
              style={{ backgroundColor: GOLD }}
              className="w-full text-black font-bold uppercase text-xs tracking-wide"
              data-testid="find-session-submit"
            >
              Réservez une session <CaretRight size={12} className="ml-1" weight="bold" />
            </Button>
          </div>
        </div>

        <div className="relative">
          <div
            className="relative aspect-[4/3] overflow-hidden bg-black"
            style={{ clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%, 0 32%)" }}
          >
            <img src={heroImage} alt="" className="w-full h-full object-cover" style={{ objectPosition: "20% center" }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
          </div>
          {badgeNumber && (
            <div
              className="absolute -bottom-6 -left-2 sm:left-6 font-display text-7xl sm:text-8xl font-extrabold text-white/95"
              style={{ WebkitTextStroke: "2px black" }}
            >
              +{badgeNumber}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .calendar-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          left: 0;
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
    </section>
  );
}

// ─── Bandeau de features (noir) ───────────────────────────────────────────────
function FeatureStrip({ items }) {
  return (
    <div className="bg-black text-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
        {items.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-2.5 text-sm font-semibold">
            <it.icon size={20} style={{ color: GOLD }} weight="fill" /> {it.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Étapes ───────────────────────────────────────────────────────────────────
function StepsSection({ title, steps, id }) {
  return (
    <section id={id} className="py-16 lg:py-20 bg-gray-50 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight mb-10 max-w-sm">{title}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((s, i) => (
            <div key={i} className="relative" data-reveal>
              <p className="font-display text-4xl font-extrabold text-black">{String(i + 1).padStart(2, "0")}</p>
              <span className="block h-[3px] w-10 mt-1 mb-3" style={{ backgroundColor: GOLD }} />
              <h3 className="font-bold text-sm mb-1">{s.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              {i < steps.length - 1 && (
                <CaretRight size={18} weight="bold" className="hidden lg:block absolute top-2 -right-6 text-gray-300" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Bandeau prochaine session ────────────────────────────────────────────────
function SessionBanner({ image, dateLabel, city, seats, price, priceLabel, originalPrice, discounted, onReserve }) {
  return (
    <div className="bg-black text-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex flex-col md:flex-row items-stretch gap-6">
        <img src={image} alt="" className="w-full md:w-56 h-32 object-cover rounded-md shrink-0" />
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: GOLD }}>Prochaine session</p>
          <p className="font-display text-2xl sm:text-3xl font-extrabold">{dateLabel}</p>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-300">
            <span className="inline-flex items-center gap-1.5"><MapPin size={14} style={{ color: GOLD }} /> {city}</span>
            <span className="inline-flex items-center gap-1.5"><UsersThree size={14} style={{ color: GOLD }} /> {seats}</span>
          </div>
        </div>
        <div className="flex flex-col items-start md:items-end justify-center gap-2 shrink-0">
          <div className="text-right">
            <p className={`font-display text-4xl font-extrabold ${discounted ? "text-red-500" : ""}`}>{price} €</p>
            {discounted && originalPrice && <p className="text-xs text-gray-400 line-through">{originalPrice} €</p>}
            {priceLabel && <p className="text-xs text-gray-400">{priceLabel}</p>}
          </div>
          <Button onClick={onReserve} style={{ backgroundColor: GOLD }} className="text-black font-bold uppercase text-xs tracking-wide" data-testid="reserve-session-btn">
            Réserver cette session <CaretRight size={12} className="ml-1" weight="bold" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Barre de confiance ───────────────────────────────────────────────────────
function TrustBar({ rating, totalReviews }) {
  return (
    <div className="bg-black text-white border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm">
        <span className="inline-flex items-center gap-3">
          <span className="text-2xl leading-none" style={{ color: GOLD }}>&ldquo;</span>
          <span>
            <span className="font-semibold">Excellent — {rating}/5 sur {totalReviews.toLocaleString("fr-FR")} avis</span>
            <span className="block" style={{ color: GOLD }}>
              {"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))}
            </span>
          </span>
        </span>
        <span className="h-8 w-px bg-white/15 hidden md:block" />
        <span className="inline-flex items-center gap-2"><ShieldCheck size={18} style={{ color: GOLD }} weight="fill" /> Centre agréé par la Préfecture de Bobigny</span>
        <span className="h-8 w-px bg-white/15 hidden md:block" />
        <span className="inline-flex items-center gap-2"><Certificate size={18} style={{ color: GOLD }} weight="fill" /> Certifié Qualiopi</span>
        <span className="h-8 w-px bg-white/15 hidden md:block" />
        <span className="inline-flex items-center gap-2">
          <Phone size={18} style={{ color: GOLD }} weight="fill" />
          <span>Besoin d'aide ?<br /><a href="tel:+33180907249" className="font-bold hover:underline">01 80 90 72 49</a></span>
        </span>
      </div>
    </div>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
function FaqGrid({ items, id }) {
  const [open, setOpen] = useState(null);
  return (
    <section id={id} className="py-16 lg:py-20 bg-gray-50 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mb-8">Questions fréquentes</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((f, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-md" data-reveal>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                data-testid={`stage-faq-${i}`}
              >
                <span className="font-semibold text-sm">{f.q}</span>
                <Plus size={16} className={`shrink-0 transition-transform ${open === i ? "rotate-45" : ""}`} style={{ color: GOLD }} weight="bold" />
              </button>
              {open === i && <p className="px-5 pb-4 text-sm text-gray-500 leading-relaxed">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Formulaire de réservation ────────────────────────────────────────────────
function BookingForm({
  formRef,
  form,
  setForm,
  session,
  center,
  sending,
  sent,
  onSubmit,
  onDirectPayment,
  price,
  priceLabel,
  originalPrice,
  discounted,
  onPaymentSuccess,
  onInscriptionCreated
}) {
  const [showPayment, setShowPayment] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [inscriptionId, setInscriptionId] = useState(null);
  const [creatingInscription, setCreatingInscription] = useState(false);

  useEffect(() => {
    if (session && session !== form.session) {
      setForm(prev => ({ ...prev, session: session }));
    }
  }, [session, setForm, form.session]);

  const openRecap = () => {
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

    setShowRecap(true);
  };

  const createInscription = async () => {
    setCreatingInscription(true);
    try {
      const formationId = "e22bcca0-6656-4335-b6a6-8a06235a2770";

      const response = await api.post("/inscriptions", {
        formation_id: formationId,
        student_name: `${form.prenom.trim()} ${form.nom.trim()}`,
        student_phone: form.telephone.trim(),
        student_email: form.email?.trim() || `${form.prenom.toLowerCase()}${form.nom.toLowerCase()}@temp.fr`,
        price: price,
        category: "PERMIS",
        session: session,
        center: center || "Non spécifié",
        source: "stage_recuperation_points",
        landing_url: window.location.href,
        payment_status: "pending",
        status: "active",
        formation_title: "Stage récupération de points"
      });

      const inscription = response.data.inscription;
      setInscriptionId(inscription.id);
      
      try {
        const checkoutResponse = await api.post("/payments/checkout", {
          inscription_id: inscription.id,
          allow_klarna: true
        });

        const { url } = checkoutResponse.data;
        
        if (url) {
          window.location.href = url;
        } else {
          toast.error("Erreur lors de la redirection vers le paiement");
          setShowPayment(true);
        }
        
      } catch (paymentError) {
        console.error("Erreur création session de paiement:", paymentError);
        toast.error("Impossible de créer la session de paiement. Veuillez réessayer.");
        setShowPayment(true);
      }
      
      onInscriptionCreated?.(inscription);
      
    } catch (error) {
      console.error("Erreur création inscription:", error);
      
      let errorMessage = "Erreur lors de la création de l'inscription";
      if (error.response?.data) {
        if (Array.isArray(error.response.data)) {
          errorMessage = error.response.data.map(e => e.msg || e).join(', ');
        } else if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.detail) {
          errorMessage = typeof error.response.data.detail === 'string' 
            ? error.response.data.detail 
            : JSON.stringify(error.response.data.detail);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast.error(errorMessage);
    } finally {
      setCreatingInscription(false);
    }
  };

  return (
    <section id="form" ref={formRef} className="py-16 lg:py-20 bg-white scroll-mt-20">
      <div className="max-w-lg mx-auto px-6">
        <div className="text-center mb-8">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Réservation</p>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">Réservez votre session</h2>
          <p className="text-gray-500 text-sm">
            <span className={discounted ? "text-red-600 font-bold" : ""}>{price} €</span>
            {discounted && originalPrice && <span className="text-gray-400 line-through ml-2">{originalPrice} €</span>}
            {priceLabel && <span className="text-gray-400"> · {priceLabel}</span>}
            {session && <span className="block mt-1 font-semibold text-black">✓ Session choisie : {session}</span>}
          </p>
        </div>

        {sent ? (
          <div className="text-center bg-gray-50 border border-gray-200 rounded-md p-8" data-testid="booking-sent">
            <Check size={32} className="mx-auto mb-3" style={{ color: GOLD }} />
            <p className="font-bold mb-1">✅ Inscription confirmée !</p>
            <p className="text-sm text-gray-500">
              {inscriptionId ? "Votre paiement a été validé et votre place est réservée." : "Un conseiller TDL Formation vous recontactera sous 24h."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {!showRecap && (
              <form className="space-y-3" data-testid="booking-form">
                <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-2.5 text-sm flex items-center justify-between">
                  <span className="text-gray-500">Session sélectionnée :</span>
                  <span className="font-semibold">{session || "Aucune session sélectionnée"}</span>
                  <input type="hidden" name="session" value={session || ''} />
                </div>

                <input
                  value={form.prenom || ''}
                  onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                  placeholder="Prénom *"
                  className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm"
                  data-testid="booking-prenom"
                  required
                />
                <input
                  value={form.nom || ''}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  placeholder="Nom *"
                  className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm"
                  data-testid="booking-nom"
                  required
                />
                <input
                  value={form.telephone || ''}
                  onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                  placeholder="Téléphone *"
                  className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm"
                  data-testid="booking-telephone"
                  required
                />
                <input
                  value={form.email || ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Email (optionnel)"
                  className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm"
                  data-testid="booking-email"
                />
                <PrivacyConsentCheckbox
                  checked={!!form.privacyConsent}
                  onChange={(v) => setForm({ ...form, privacyConsent: v })}
                  testId="booking-privacy-consent"
                />

                {!session ? (
                  <Button
                    type="button"
                    disabled={true}
                    className="w-full text-white font-bold uppercase text-xs tracking-wide py-6 bg-gray-400 cursor-not-allowed"
                  >
                    Veuillez d'abord sélectionner une session
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={openRecap}
                    disabled={!form.privacyConsent}
                    style={{ backgroundColor: GOLD }}
                    className="w-full text-black font-bold uppercase text-xs tracking-wide py-6"
                    data-testid="booking-open-recap"
                  >
                    Vérifier et procéder au paiement
                  </Button>
                )}
              </form>
            )}

            {showRecap && !showPayment && (
              <div className="border border-gray-200 rounded-md overflow-hidden" data-testid="booking-recap">
                <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: GOLD }}>Récapitulatif</p>
                  <h3 className="font-display font-bold text-lg">Vérifiez vos informations</h3>
                </div>

                <div className="px-5 py-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">Formation</span>
                    <span className="font-semibold text-right">Stage récupération de points</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">Session</span>
                    <span className="font-semibold text-right">{session}</span>
                  </div>
                  {center && (
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Centre</span>
                      <span className="font-semibold text-right">{center}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">Stagiaire</span>
                    <span className="font-semibold text-right">{form.prenom} {form.nom}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">Téléphone</span>
                    <span className="font-semibold text-right">{form.telephone}</span>
                  </div>
                  {form.email && (
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Email</span>
                      <span className="font-semibold text-right break-all">{form.email}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 pt-3 border-t border-gray-100">
                    <span className="text-gray-500">Montant</span>
                    <span className="font-bold text-lg">{price} €</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Paiement en 1 fois ou en plusieurs fois avec Klarna, au choix sur la page de paiement sécurisée.
                  </p>
                </div>

                <div className="px-5 py-4 bg-[#fff8e1] border-t border-[#d4af37]/30">
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
                    À apporter le jour du stage
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1.5">
                    <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0" style={{ color: GOLD }} /> Une pièce d'identité valide</li>
                    <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0" style={{ color: GOLD }} /> Votre permis de conduire</li>
                    <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0" style={{ color: GOLD }} /> Un justificatif d'adresse postale</li>
                    <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0" style={{ color: GOLD }} /> Votre lettre 48N, si vous en avez reçu une</li>
                  </ul>
                </div>

                <div className="px-5 py-4 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowRecap(false)}
                    className="flex-1 font-bold uppercase text-xs tracking-wide"
                    data-testid="booking-recap-edit"
                  >
                    Modifier
                  </Button>
                  <Button
                    type="button"
                    onClick={createInscription}
                    disabled={creatingInscription}
                    style={{ backgroundColor: GOLD }}
                    className="flex-1 text-black font-bold uppercase text-xs tracking-wide"
                    data-testid="booking-recap-confirm"
                  >
                    {creatingInscription ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-black inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Redirection...
                      </>
                    ) : (
                      "Confirmer et payer"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {showPayment && inscriptionId && (
              <div className="mt-4 p-4 border border-gray-200 rounded-md bg-gray-50">
                <StripeCheckout
                  inscriptionId={inscriptionId}
                  session={session}
                  center={center}
                  amount={price}
                  customerName={`${form.prenom || ''} ${form.nom || ''}`}
                  customerPhone={form.telephone || ''}
                  customerEmail={form.email || ''}
                  onSuccess={(data) => {
                    onPaymentSuccess?.(data);
                  }}
                  onError={(error) => {
                    console.error("Erreur paiement:", error);
                    setShowPayment(false);
                  }}
                  allowKlarna={true}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export { TopBar };

export default {
  TopBar, StageNav, Hero, FeatureStrip, StepsSection, SessionBanner, TrustBar, FaqGrid, BookingForm,
  GOLD, NAVY,
};

export const DEFAULT_FEATURES = [
  { icon: ShieldCheck, label: "Stage agréé" },
  { icon: CalendarBlank, label: "2 jours" },
  { icon: Plus, label: "Jusqu'à +4 points" },
  { icon: Certificate, label: "Sans examen" },
];

export const DEFAULT_STEPS = [
  { title: "Trouvez votre session", desc: "Choisissez votre centre et la date qui vous convient." },
  { title: "Réservez votre place", desc: "Réservation en ligne rapide et paiement sécurisé." },
  { title: "Participez au stage", desc: "Deux jours de formation en petit comité." },
  { title: "Vos points sont crédités", desc: "Jusqu'à 4 points récupérés sous 6 à 15 jours." },
];