import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TopBar } from "@/components/StageLandingPage";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CaretRight, Phone, EnvelopeSimple, MapPin, Clock } from "@phosphor-icons/react";
import { toast } from "sonner";
import { trackLead, newEventId, getFbCookies } from "@/lib/metaPixel";
import SiteFooter from "@/components/SiteFooter";
import ChatWidget from "@/components/ChatWidget";
import ContactBubble from "@/components/ContactBubble";
import PrivacyConsentCheckbox from "@/components/PrivacyConsentCheckbox";
import { useReveal } from "@/hooks/useReveal";
import { setPageMeta } from "@/lib/seo";

// Même validation que le formulaire de contact de la page d'accueil (Landing.jsx)
const PHONE_RE = /^(0[1-9]\d{8}|\+33[1-9]\d{8})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidPhone = (v) => PHONE_RE.test((v || "").replace(/[\s.\-]/g, ""));

export default function Contact() {
  const [contactForm, setContactForm] = useState({ prenom: "", nom: "", email: "", telephone: "", message: "" });
  const [contactPrivacyConsent, setContactPrivacyConsent] = useState(false);
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const revealRef = useReveal();

  useEffect(() => {
    setPageMeta({
      title: "Contact — TDL Formation",
      description: "Contactez TDL Formation : téléphone, email, adresse à Épinay-sur-Seine (93). Notre équipe vous répond sous 24h ouvrées.",
      path: "/contact",
    });
    window.scrollTo(0, 0);
  }, []);

  const submitContact = async (e) => {
    e.preventDefault();
    if (!contactPrivacyConsent) {
      return toast.error("Merci d'accepter l'utilisation de vos données pour continuer");
    }
    if (!contactForm.prenom.trim() || !contactForm.nom.trim() || !contactForm.telephone.trim()) {
      return toast.error("Merci de remplir au moins nom, prénom et téléphone");
    }
    if (!isValidPhone(contactForm.telephone)) {
      return toast.error("Merci de vérifier votre numéro de téléphone (10 chiffres, ex : 06 12 34 56 78)");
    }
    if (contactForm.email.trim() && !EMAIL_RE.test(contactForm.email.trim())) {
      return toast.error("Merci de vérifier le format de votre email");
    }
    setContactSending(true);
    try {
      const eventId = newEventId();
      await api.post("/callback-requests", { ...contactForm, source: "contact_page", page_url: window.location.href, event_id: eventId, ...getFbCookies() });
      setContactSent(true);
      trackLead({ content_name: "contact_page" }, eventId);
    } catch {
      toast.error("Erreur lors de l'envoi, merci de réessayer ou de nous appeler directement.");
    } finally {
      setContactSending(false);
    }
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Contact — TDL Formation",
    url: "https://www.tdl-formation.fr/contact",
    mainEntity: {
      "@type": "EducationalOrganization",
      name: "TDL Formation",
      telephone: "+33180907249",
      email: "contact@tdl-formation.fr",
      address: {
        "@type": "PostalAddress",
        streetAddress: "59 avenue Joffre",
        postalCode: "93800",
        addressLocality: "Épinay-sur-Seine",
        addressCountry: "FR",
      },
    },
  };

  return (
    <div className="min-h-screen bg-white" data-testid="contact-page" ref={revealRef}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <TopBar />
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">TDL Formation</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm">
            <Link to="/formations" className="hover:text-[#d4af37]">Formations</Link>
            <Link to="/blog" className="hover:text-[#d4af37]">Blog</Link>
            <Link to="/faq" className="hover:text-[#d4af37]">FAQ</Link>
            <Link to="/contact" className="text-[#d4af37]">Contact</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden sm:block">
              <Button variant="outline" size="sm">Connexion</Button>
            </Link>
            <Link to="/inscription">
              <Button size="sm" className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">S'inscrire</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="border-b border-gray-100 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-gray-500">
          <Link to="/" className="hover:text-[#d4af37]">Accueil</Link>
          <CaretRight size={10} />
          <span className="text-gray-700">Contact</span>
        </div>
      </div>

      {/* Hero + form */}
      <section className="border-b border-gray-200 grid-bg-noise">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-16 lg:py-20">
          <p className="overline mb-3">Contact</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tighter leading-[0.95] mb-6">
            Une question ? <span className="text-[#d4af37]">Écrivez-nous.</span>
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl">
            Financement, prérequis, dates de session, choix de formation... Notre équipe vous répond sous 24h ouvrées.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-2 gap-12">
          <div data-reveal className="reveal">
            <h2 className="font-display text-2xl font-bold tracking-tight mb-6">Nos coordonnées</h2>
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
              <div className="flex items-center gap-3">
                <Clock size={18} className="text-[#d4af37]" /> Lundi au vendredi 9h-18h · Samedi 10h-17h
              </div>
            </div>

            <div className="mt-8 aspect-video rounded-md overflow-hidden border border-gray-200">
              <iframe
                title="Localisation TDL Formation"
                src="https://www.google.com/maps?q=59+avenue+Joffre,+93800+%C3%89pinay-sur-Seine&output=embed"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          <Card className="p-6 sm:p-8 border border-gray-200 rounded-md shadow-none h-fit" data-reveal>
            {contactSent ? (
              <div className="bg-[#0B7238]/10 border border-[#0B7238] text-[#0B7238] rounded-md px-4 py-3 text-sm">
                Merci, votre message a bien été envoyé. Notre équipe vous recontacte sous 24h ouvrées.
              </div>
            ) : (
              <form onSubmit={submitContact} className="space-y-4" data-testid="contact-page-form">
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
                  <Textarea rows={5} value={contactForm.message} onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })} placeholder="Votre projet, la formation qui vous intéresse..." />
                </div>
                <PrivacyConsentCheckbox checked={contactPrivacyConsent} onChange={setContactPrivacyConsent} testId="contact-page-privacy-consent" />
                <Button type="submit" disabled={contactSending || !contactPrivacyConsent} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
                  {contactSending ? "Envoi..." : "Envoyer le message"}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </section>

      <SiteFooter />
      <ChatWidget />
      <ContactBubble />
    </div>
  );
}
