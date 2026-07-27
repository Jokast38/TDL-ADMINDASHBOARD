import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Clock, MapPin, CaretDown, CaretRight, ShieldCheck, CalendarBlank, Plus, Certificate,
  Star, Phone, UsersThree, Armchair, PersonSimple, ChatCircleText, X,
} from "@phosphor-icons/react";
import { trackSchedule } from "@/lib/metaPixel";

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
function Hero({ titleLine1, titleLine2Gold, subheadline, description, heroImage, badgeNumber, villes, onFindSessions }) {
  const [ville, setVille] = useState("");
  const [date, setDate] = useState("");

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
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>Trouver une session</p>
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
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-[#1a1a1a] text-white text-sm rounded-md pl-8 pr-3 py-2.5 border border-white/10"
                />
              </div>
            </div>
            <Button
              onClick={() => onFindSessions?.(ville, date)}
              style={{ backgroundColor: GOLD }}
              className="w-full text-black font-bold uppercase text-xs tracking-wide"
              data-testid="find-session-submit"
            >
              Voir les disponibilités <CaretRight size={12} className="ml-1" weight="bold" />
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
function StepsSection({ title, steps }) {
  return (
    <section className="py-16 lg:py-20 bg-gray-50">
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
function SessionBanner({ image, dateLabel, city, seats, price, priceLabel, onReserve }) {
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
            <p className="font-display text-4xl font-extrabold">{price} €</p>
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
function FaqGrid({ items }) {
  const [open, setOpen] = useState(null);
  return (
    <section className="py-16 lg:py-20 bg-gray-50">
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
function BookingForm({ formRef, form, setForm, session, sending, sent, onSubmit, price, priceLabel }) {
  return (
    <section id="form" ref={formRef} className="py-16 lg:py-20 bg-white scroll-mt-20">
      <div className="max-w-lg mx-auto px-6">
        <div className="text-center mb-8">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Réservation</p>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">Réservez votre session</h2>
          <p className="text-gray-500 text-sm">
            {price} € {priceLabel && <span className="text-gray-400">· {priceLabel}</span>}
            {session && <span className="block mt-1 font-semibold text-black">Session choisie : {session}</span>}
          </p>
        </div>

        {sent ? (
          <div className="text-center bg-gray-50 border border-gray-200 rounded-md p-8" data-testid="booking-sent">
            <ChatCircleText size={32} className="mx-auto mb-3" style={{ color: GOLD }} weight="fill" />
            <p className="font-bold mb-1">Demande envoyée !</p>
            <p className="text-sm text-gray-500">Un conseiller TDL Formation vous recontacte sous 24h ouvrées.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3" data-testid="booking-form">
            <input
              value={form.prenom}
              onChange={(e) => setForm({ ...form, prenom: e.target.value })}
              placeholder="Prénom"
              className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm"
              data-testid="booking-prenom"
            />
            <input
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              placeholder="Nom"
              className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm"
              data-testid="booking-nom"
            />
            <input
              value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
              placeholder="Téléphone"
              className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-sm"
              data-testid="booking-telephone"
            />
            <Button
              type="submit"
              disabled={sending}
              style={{ backgroundColor: GOLD }}
              className="w-full text-black font-bold uppercase text-xs tracking-wide py-6"
              data-testid="booking-submit"
            >
              {sending ? "Envoi..." : "Être rappelé pour réserver"} <CaretRight size={12} className="ml-1" weight="bold" />
            </Button>
          </form>
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
