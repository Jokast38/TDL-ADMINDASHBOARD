import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowRight, GraduationCap, Lightning, Trophy, CaretDown,
  IdentificationCard, Truck, FireSimple, Car, Phone, EnvelopeSimple, MapPin,
  List, X,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const CATEGORIES = [
  { key: "CACES", label: "CACES", icon: Truck, desc: "Toutes catégories - chariots, nacelles, grues" },
  { key: "PERMIS", label: "Récup. Permis", icon: IdentificationCard, desc: "Stages agréés 2 jours" },
  { key: "AUTO_ECOLE", label: "Auto-école", icon: Car, desc: "Permis B accompagné ANTS" },
  { key: "SSIAP", label: "SSIAP 1/2/3", icon: FireSimple, desc: "Sécurité incendie" },
  { key: "VTC_TAXI", label: "VTC / Taxi", icon: Car, desc: "Examen + carte pro" },
  { key: "ECSR", label: "ECSR", icon: GraduationCap, desc: "Enseignant de la conduite" },
];

// Menus déroulants navbar : chaque entrée est reliée par son titre exact en
// base (voir /api/formations) à l'inscription pré-remplie correspondante.
const NAV_VTC = ["Formation VTC", "Formation VTC en Ligne", "Formation Continue VTC", "Formation Passerelle Taxi → VTC"];
const NAV_TAXI = ["Formation Taxi Initiale", "Formation Continue Taxi", "Formation Passerelle VTC vers Taxi", "Formation Mobilité Taxi Banlieue (60-93)"];

const PARTENAIRES = ["Uber", "Bolt", "FreeNow", "Heetch", "Marcel", "LeCab"];

export default function Landing() {
  const [formations, setFormations] = useState([]);

  const [contactForm, setContactForm] = useState({ prenom: "", nom: "", email: "", telephone: "", message: "" });
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSubOpen, setMobileSubOpen] = useState(null); // "vtc" | "taxi" | null

  useEffect(() => {
    api.get("/formations", { params: { active_only: true } }).then((r) => setFormations(r.data));
  }, []);

  const byTitle = (title) => formations.find((f) => f.title === title);
  const autoEcole = byTitle("Permis B - Forfait complet");

  const submitContact = async (e) => {
    e.preventDefault();
    if (!contactForm.prenom.trim() || !contactForm.nom.trim() || !contactForm.telephone.trim()) {
      return toast.error("Merci de remplir au moins nom, prénom et téléphone");
    }
    setContactSending(true);
    try {
      await api.post("/callback-requests", { ...contactForm, source: "contact_form" });
      setContactSent(true);
    } catch {
      toast.error("Erreur lors de l'envoi, merci de réessayer ou de nous appeler directement.");
    } finally {
      setContactSending(false);
    }
  };

  const NavDropdown = ({ label, titles }) => (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 hover:text-[#d4af37] outline-none">
        {label} <CaretDown size={12} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {titles.map((title) => {
          const f = byTitle(title);
          return (
            <DropdownMenuItem key={title} asChild>
              <Link to={f ? `/formations/${f.id}` : "#formations"} className="text-sm">
                {title}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-h-screen bg-white" data-testid="landing-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">TDL Formation</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm">
            <NavDropdown label="Formations VTC" titles={NAV_VTC} />
            <NavDropdown label="Formations Taxi" titles={NAV_TAXI} />
            <Link to={autoEcole ? `/formations/${autoEcole.id}` : "#formations"} className="hover:text-[#d4af37]">Auto-école</Link>
            <a href="#formations" className="hover:text-[#d4af37]">Toutes les formations</a>
            <Link to="/blog" className="hover:text-[#d4af37]">Blog</Link>
            <a href="#contact" className="hover:text-[#d4af37]">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden sm:block">
              <Button variant="outline" size="sm" data-testid="login-link">Connexion</Button>
            </Link>
            <Link to="/inscription" className="hidden sm:block">
              <Button size="sm" className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="inscription-cta">
                S'inscrire <ArrowRight size={14} className="ml-1" />
              </Button>
            </Link>
            <button
              className="md:hidden p-2 text-gray-700"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
              data-testid="mobile-menu-toggle"
            >
              {mobileOpen ? <X size={22} /> : <List size={22} />}
            </button>
          </div>
        </div>

        {/* Panneau mobile */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white max-h-[calc(100vh-4rem)] overflow-y-auto" data-testid="mobile-menu-panel">
            <nav className="px-6 py-4 flex flex-col text-sm">
              <MobileSubMenu
                label="Formations VTC" titles={NAV_VTC} byTitle={byTitle}
                open={mobileSubOpen === "vtc"} onToggle={() => setMobileSubOpen((v) => (v === "vtc" ? null : "vtc"))}
                onNavigate={() => setMobileOpen(false)}
              />
              <MobileSubMenu
                label="Formations Taxi" titles={NAV_TAXI} byTitle={byTitle}
                open={mobileSubOpen === "taxi"} onToggle={() => setMobileSubOpen((v) => (v === "taxi" ? null : "taxi"))}
                onNavigate={() => setMobileOpen(false)}
              />
              <Link to={autoEcole ? `/formations/${autoEcole.id}` : "#formations"} className="py-3 border-b border-gray-100" onClick={() => setMobileOpen(false)}>
                Auto-école
              </Link>
              <a href="#formations" className="py-3 border-b border-gray-100" onClick={() => setMobileOpen(false)}>Toutes les formations</a>
              <Link to="/blog" className="py-3 border-b border-gray-100" onClick={() => setMobileOpen(false)}>Blog</Link>
              <a href="#contact" className="py-3 border-b border-gray-100" onClick={() => setMobileOpen(false)}>Contact</a>
              <div className="flex gap-2 pt-4">
                <Link to="/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full">Connexion</Button>
                </Link>
                <Link to="/inscription" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button size="sm" className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">S'inscrire</Button>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="border-b border-gray-200 grid-bg-noise">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-28 grid lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7">
            <p className="overline mb-4">Organisme certifié Qualiopi · Épinay-sur-Seine (93) & Creil (60)</p>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tighter leading-[0.95]">
              Devenez chauffeur <span className="text-[#d4af37]">VTC</span> ou <span className="text-[#d4af37]">Taxi</span><br />professionnel.
            </h1>
            <p className="text-gray-600 text-lg mt-6 max-w-xl">
              Formation initiale, continue, passerelle VTC ↔ Taxi, SSIAP, ECSR — inscription en ligne, dossier ANTS
              suivi, paiement sécurisé.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link to="/inscription">
                <Button size="lg" className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="hero-cta">
                  Démarrer mon inscription <ArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
              <a href="#formations">
                <Button size="lg" variant="outline" data-testid="hero-formations">
                  Voir les formations
                </Button>
              </a>
            </div>
          </div>
          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            <Stat label="Réussite examen VTC" value="97%" accent="#0B7238" />
            <Stat label="Réussite examen Taxi" value="95%" accent="#0B7238" />
            <Stat label="Examens réussis" value="5000+" accent="#d4af37" />
            <Stat label="Formateurs qualifiés" value="15" accent="#d4af37" />
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16 lg:py-24" id="formations">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="overline">Domaines</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2 mb-2">Nos spécialités</h2>
          <p className="text-gray-600 max-w-2xl mb-10">
            6 domaines de formation professionnelle agréés, plus la mobilité électrique KAMI STREET.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {CATEGORIES.map((c) => (
              <Card key={c.key} className="p-5 border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg hover:border-[#0a0a0a] transition-all" data-testid={`cat-${c.key}`}>
                <c.icon size={28} className="text-[#0a0a0a]" weight="duotone" />
                <h3 className="font-display font-bold mt-3">{c.label}</h3>
                <p className="text-xs text-gray-500 mt-1">{c.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Formations grid */}
      <section className="py-16 lg:py-24 bg-gray-50 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="overline">Catalogue</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2 mb-10">Formations disponibles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {formations.map((f) => (
              <Card key={f.id} className="overflow-hidden border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg transition-all" data-testid={`public-formation-${f.id}`}>
                <Link to={`/formations/${f.id}`}>
                  {f.image_url && (
                    <div className="aspect-video bg-gray-100 overflow-hidden">
                      <img src={f.image_url} alt={f.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                </Link>
                <div className="p-5">
                  <Badge variant="outline" className="text-xs mb-2">{f.category}</Badge>
                  <Link to={`/formations/${f.id}`}>
                    <h3 className="font-display font-bold text-lg leading-tight hover:text-[#d4af37]">{f.title}</h3>
                  </Link>
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2">{f.description}</p>
                  <div className="flex items-end justify-between mt-4 pt-4 border-t border-gray-100">
                    <p className="font-display font-bold text-2xl">{f.price > 0 ? `${f.price}€` : "Sur devis"}</p>
                    <Link to={`/formations/${f.id}`}>
                      <Button size="sm" className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid={`inscr-${f.id}`}>
                        En savoir plus
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* KAMI STREET */}
      <section className="py-16 lg:py-24 bg-black text-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="overline" style={{ color: "#d4af37" }}>
              <Lightning size={12} className="inline mr-1" weight="fill" /> KAMI STREET
            </p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-2 mb-4">
              Mobilité électrique<br />nouvelle génération.
            </h2>
            <p className="text-gray-300 mb-6 max-w-md">
              Vélos & scooters électriques sélectionnés pour la ville. Livraison rapide, SAV inclus.
            </p>
            <a href="https://kamistreet.fr/" target="_blank" rel="noreferrer">
              <Button size="lg" className="bg-[#d4af37] text-black hover:bg-[#b8941f] hover:text-black" data-testid="kami-cta">
                Découvrir la gamme sur kamistreet.fr <ArrowRight size={16} className="ml-2" />
              </Button>
            </a>
          </div>
          <div className="aspect-square bg-[#d4af37]/10 rounded-md flex items-center justify-center border border-white/10">
            <img
              src="https://images.unsplash.com/photo-1597260491619-bab87197869f?w=800"
              alt="KAMI STREET"
              className="w-full h-full object-cover rounded-md"
            />
          </div>
        </div>
      </section>

      {/* Certifications & Partenaires */}
      <section className="py-14 border-t border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10 mb-10">
            <div className="flex items-center bg-white border border-gray-200 rounded-md px-5 py-3 shrink-0">
              <img
                src="/Logo-Qualiopi-150dpi-Avec-Marianne-1.jpg.jpeg"
                alt="Certifié Qualiopi - Processus certifié"
                className="h-20 w-auto"
              />
            </div>
            <p className="text-sm text-gray-500 max-w-xl">
              TDL Formation est certifié Qualiopi au titre des actions de formation, garantissant la qualité de notre
              processus pédagogique. Nos formations VTC/Taxi préparent nos stagiaires à exercer sur toutes les
              plateformes de mobilité.
            </p>
          </div>

          <p className="overline text-center mb-5">Nos stagiaires exercent sur ces plateformes</p>
          <div className="partner-marquee-wrap">
            <style>{`
              .partner-marquee-wrap { overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, black 10%, black 90%, transparent); mask-image: linear-gradient(90deg, transparent, black 10%, black 90%, transparent); }
              .partner-marquee { display: flex; width: max-content; animation: partner-scroll 22s linear infinite; }
              .partner-marquee:hover { animation-play-state: paused; }
              @keyframes partner-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
            `}</style>
            <div className="partner-marquee">
              {[...PARTENAIRES, ...PARTENAIRES].map((p, i) => (
                <div
                  key={`${p}-${i}`}
                  className="flex items-center justify-center mx-3 px-8 py-4 bg-white border border-gray-200 rounded-md min-w-[160px]"
                >
                  <span className="font-display font-bold text-lg text-gray-400">{p}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="py-16 lg:py-24 border-t border-gray-200" id="contact">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-2 gap-12">
          <div>
            <p className="overline">Contact</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2 mb-4">Une question ? Écrivez-nous.</h2>
            <p className="text-gray-600 mb-8 max-w-md">
              Notre équipe vous répond sous 24h ouvrées pour vous accompagner dans le choix de votre formation.
            </p>
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <MapPin size={18} className="text-[#d4af37]" /> 59 avenue Joffre, 93800 Épinay-sur-Seine
              </div>
              <div className="flex items-center gap-3">
                <Phone size={18} className="text-[#d4af37]" />
                <a href="tel:+33180907249" className="hover:text-[#d4af37]">01 80 90 72 49</a>
              </div>
              <div className="flex items-center gap-3">
                <EnvelopeSimple size={18} className="text-[#d4af37]" />
                <a href="mailto:contact@tdl-formation.fr" className="hover:text-[#d4af37]">contact@tdl-formation.fr</a>
              </div>
              <p className="text-gray-500 pt-2">Lundi au vendredi 9h-18h · Samedi 10h-17h</p>
            </div>
          </div>

          <Card className="p-6 sm:p-8 border border-gray-200 rounded-md shadow-none">
            {contactSent ? (
              <div className="bg-[#0B7238]/10 border border-[#0B7238] text-[#0B7238] rounded-md px-4 py-3 text-sm">
                Merci, votre message a bien été envoyé. Notre équipe vous recontacte sous 24h ouvrées.
              </div>
            ) : (
              <form onSubmit={submitContact} className="space-y-4" data-testid="contact-form">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-1.5 block">Prénom</label>
                    <Input value={contactForm.prenom} onChange={(e) => setContactForm({ ...contactForm, prenom: e.target.value })} required />
                  </div>
                  <div>
                    <label className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-1.5 block">Nom</label>
                    <Input value={contactForm.nom} onChange={(e) => setContactForm({ ...contactForm, nom: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-1.5 block">Téléphone</label>
                    <Input type="tel" value={contactForm.telephone} onChange={(e) => setContactForm({ ...contactForm, telephone: e.target.value })} required />
                  </div>
                  <div>
                    <label className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-1.5 block">Email</label>
                    <Input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-1.5 block">Message</label>
                  <Textarea rows={4} value={contactForm.message} onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })} placeholder="Votre projet, la formation qui vous intéresse..." />
                </div>
                <Button type="submit" disabled={contactSending} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
                  {contactSending ? "Envoi..." : "Envoyer le message"}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-wrap gap-4 items-center justify-between">
          <p className="text-sm text-gray-500">© 2026 TDL Formation · Tous droits réservés.</p>
          <p className="text-xs text-gray-400 font-mono">contact@tdl-formation.fr</p>
        </div>
      </footer>
    </div>
  );
}

function MobileSubMenu({ label, titles, byTitle, open, onToggle, onNavigate }) {
  return (
    <div className="border-b border-gray-100">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3 text-left"
      >
        {label}
        <CaretDown size={14} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="pb-2 pl-3 flex flex-col">
          {titles.map((title) => {
            const f = byTitle(title);
            return (
              <Link
                key={title}
                to={f ? `/formations/${f.id}` : "#formations"}
                className="py-2 text-gray-600 text-sm"
                onClick={onNavigate}
              >
                {title}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <Card className="p-5 border border-gray-200 rounded-md shadow-none">
      <div className="w-1 h-6 mb-2 rounded-sm" style={{ background: accent }} />
      <p className="overline">{label}</p>
      <p className="font-display font-bold text-3xl tracking-tight mt-1">{value}</p>
    </Card>
  );
}
