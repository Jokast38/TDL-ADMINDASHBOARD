import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowRight, Plus, Phone, Tag, Target, SealCheck, CalendarCheck, MapPin } from "@phosphor-icons/react";

const AVANTAGES = [
  { icon: Tag, label: "Tarif fidélité 189 €" },
  { icon: Target, label: "Jusqu'à 4 points récupérables" },
  { icon: SealCheck, label: "Stage agréé" },
  { icon: CalendarCheck, label: "En seulement 2 jours" },
  { icon: MapPin, label: "Épinay-sur-Seine" },
];

const SESSIONS = [
  { mois: "Juillet", items: [["20–21", "20 & 21 juillet"], ["24–25", "24 & 25 juillet"], ["29–30", "29 & 30 juillet"]] },
  { mois: "Août", items: [["03–04", "03 & 04 août"], ["07–08", "07 & 08 août"], ["10–11", "10 & 11 août"], ["12–13", "12 & 13 août"], ["21–22", "21 & 22 août"]] },
];

const RAISONS = [
  { n: "01", titre: "Plus de disponibilités", texte: "Des sessions régulières tout l'été pour vous inscrire rapidement." },
  { n: "02", titre: "Prix fidélité", texte: "189 € au lieu du tarif standard, réservé à nos anciens stagiaires." },
  { n: "03", titre: "Équipe reconnue", texte: "Des formateurs que vous connaissez déjà, agréés par la Préfecture." },
  { n: "04", titre: "Inscription rapide", texte: "Un dossier déjà connu chez nous : moins de démarches pour vous." },
  { n: "05", titre: "Excellent accueil", texte: "Une équipe disponible du lundi au samedi, 9h–18h." },
  { n: "06", titre: "Centre agréé", texte: "Stage conforme à la réglementation, points crédités sous 48h." },
];

const AVIS = [
  "Accueil très agréable et formateurs à l'écoute, le stage s'est très bien passé.",
  "Équipe efficace, inscription rapide et bonne ambiance pendant les deux jours.",
  "Un centre sérieux et bien organisé, je recommande sans hésiter.",
];

const FAQ = [
  { q: "Puis-je refaire un stage ?", r: "Oui. Un stage de récupération de points ne peut être effectué qu'une fois par période de 12 mois. Si votre dernier stage date de plus d'un an, vous pouvez en refaire un dès aujourd'hui." },
  { q: "Pourquoi 189 € ?", r: "189 € est notre tarif fidélité, réservé aux personnes ayant déjà suivi un stage chez TDL Formation, en dessous de notre tarif standard." },
  { q: "Comment se déroule le stage ?", r: "Le stage se déroule sur 2 jours consécutifs (7h/jour), en salle, avec des formateurs agréés par la Préfecture, autour de la sensibilisation à la sécurité routière." },
  { q: "En combien de temps suis-je rappelé ?", r: "Notre équipe vous recontacte sous 24h ouvrées après votre demande pour confirmer votre inscription et le tarif fidélité." },
];

// Photos provisoires (Unsplash) — à remplacer par de vraies photos du centre
// une fois disponibles : il suffit de changer les URLs ci-dessous.
const PHOTOS = [
  { label: "Salle de stage", src: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=500&h=375&fit=crop" },
  { label: "Accueil", src: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=500&h=375&fit=crop" },
  { label: "Formateur", src: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=500&h=375&fit=crop" },
  { label: "Pause café", src: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500&h=375&fit=crop" },
  { label: "Parking", src: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=500&h=375&fit=crop" },
];

function SiteHeader() {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
          <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">TDL Formation</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm">
          <a href="https://tdl-formation.fr" className="hover:text-[#d4af37]">Formations</a>
          <Link to="/blog" className="hover:text-[#d4af37]">Blog</Link>
          <a href="https://kamistreet.fr/" target="_blank" rel="noreferrer" className="hover:text-[#d4af37]">KAMI STREET ↗</a>
          <a href="tel:+33180907249" className="hover:text-[#d4af37]">01 80 90 72 49</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="outline" size="sm">Connexion</Button>
          </Link>
          <Link to="/inscription">
            <Button size="sm" className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
              S'inscrire <ArrowRight size={14} className="ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function OffreFideliteLanding() {
  const [session, setSession] = useState("");
  const [form, setForm] = useState({ prenom: "", nom: "", telephone: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const formRef = useRef(null);

  const chooseSession = (label) => {
    setSession(label);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.prenom.trim() || !form.nom.trim() || !form.telephone.trim()) {
      return toast.error("Merci de remplir tous les champs");
    }
    setSending(true);
    try {
      await api.post("/callback-requests", { ...form, session });
      setSent(true);
    } catch {
      toast.error("Erreur lors de l'envoi, merci de réessayer ou de nous appeler directement.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="offre-fidelite-page">
      <SiteHeader />

      {/* Hero */}
      <section className="bg-[#0a0a0a] text-white">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-16 lg:py-24">
          <span className="inline-flex items-center gap-2 border border-[#d4af37] text-[#d4af37] text-sm uppercase tracking-widest px-4 py-2 rounded-full mb-7">
            Offre réservée à nos anciens clients
          </span>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tighter leading-[0.98]">
            Votre dernier stage date de plus d'un an ?
          </h1>
          <p className="text-gray-300 text-xl mt-7 max-w-2xl leading-relaxed">
            Si votre solde de points a de nouveau diminué, vous pouvez peut-être récupérer jusqu'à 4 points grâce à un nouveau stage agréé.
          </p>
          <p className="text-white text-lg mt-5 max-w-2xl bg-[#1a1a1a] border-l-4 border-[#d4af37] px-5 py-4 rounded">
            Parce que vous avez déjà effectué un stage chez nous, bénéficiez de notre <strong className="text-[#d4af37]">tarif fidélité de 189&nbsp;€</strong>.
          </p>
          <div className="flex flex-wrap gap-4 mt-10">
            <Button
              size="lg"
              className="bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold text-base px-8 py-6"
              onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
            >
              Être rappelé gratuitement
            </Button>
            <a href="tel:+33180907249">
              <Button size="lg" variant="outline" className="border-gray-600 text-white hover:border-[#d4af37] hover:text-[#d4af37] bg-transparent text-base px-8 py-6">
                <Phone size={18} className="mr-2" /> Appeler maintenant
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Bandeau avantages */}
      <div className="bg-[#1a1a1a] border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 flex flex-wrap">
          {AVANTAGES.map(({ icon: Icon, label }, i) => (
            <div key={label} className={`flex-1 min-w-[180px] py-6 px-5 text-white text-base font-medium flex items-center gap-3 ${i > 0 ? "border-l border-gray-800" : ""}`}>
              <Icon size={26} className="text-[#d4af37] shrink-0" weight="duotone" />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Calendrier */}
      <section className="py-20 lg:py-28">
        <div className="max-w-5xl mx-auto px-6 lg:px-10">
          <div className="max-w-2xl mb-12">
            <p className="overline text-[#b8941f] mb-3">Calendrier</p>
            <h2 className="font-display text-4xl font-bold tracking-tight mb-4">Les prochaines sessions</h2>
            <p className="text-gray-500 text-lg">Cliquez sur « Être rappelé » à côté de la date qui vous convient : nous vous recontactons pour finaliser votre inscription au tarif fidélité.</p>
          </div>
          {SESSIONS.map(({ mois, items }) => (
            <div className="mb-10" key={mois}>
              <div className="flex items-baseline gap-4 mb-5">
                <h3 className="font-display text-xl font-bold">{mois}</h3>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {items.map(([jours, label]) => (
                  <div key={label} className="bg-white border border-gray-200 border-l-4 border-l-[#d4af37] rounded-md p-5 flex flex-col gap-3.5">
                    <div>
                      <div className="font-mono text-2xl font-semibold">{jours}</div>
                      <div className="text-sm uppercase tracking-wider text-gray-400">{mois}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => chooseSession(label)}
                      className="self-start text-sm font-semibold uppercase tracking-wide text-black bg-[#d4af37] hover:bg-[#b8941f] px-4 py-2 rounded"
                    >
                      Être rappelé
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pourquoi revenir */}
      <div className="bg-gray-50 border-y border-gray-200">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-20 lg:py-28">
          <div className="max-w-2xl mb-12">
            <p className="overline text-[#b8941f] mb-3">Pourquoi nous revenir</p>
            <h2 className="font-display text-4xl font-bold tracking-tight">Pourquoi revenir chez TDL ?</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {RAISONS.map((r) => (
              <div key={r.n} className="bg-white border border-gray-200 rounded-md p-6">
                <span className="font-mono text-sm text-[#b8941f] block mb-3">{r.n}</span>
                <h3 className="font-semibold text-base mb-2">{r.titre}</h3>
                <p className="text-base text-gray-500 leading-relaxed">{r.texte}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Avis Google */}
      <section className="py-20 lg:py-28">
        <div className="max-w-5xl mx-auto px-6 lg:px-10">
          <div className="max-w-2xl mb-10">
            <p className="overline text-[#b8941f] mb-3">Ils nous ont fait confiance</p>
            <h2 className="font-display text-4xl font-bold tracking-tight">Les avis Google</h2>
          </div>
          <div className="flex items-center gap-5 flex-wrap mb-9">
            <div className="font-display text-5xl font-bold">4,6/5</div>
            <div>
              <div className="text-[#d4af37] tracking-widest text-lg">★★★★★</div>
              <div className="text-base text-gray-500">
                Note moyenne — <a href="https://www.google.com/search?q=TDL+Formation+Epinay-sur-Seine+avis" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#d4af37]">voir tous nos avis sur Google</a>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {AVIS.map((a, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-md p-6">
                <div className="text-[#d4af37] mb-3">★★★★★</div>
                <p className="text-base mb-3 leading-relaxed">{a}</p>
                <div className="font-mono text-sm text-gray-400">Exemple d'avis client</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Photos */}
      <div className="bg-gray-50 border-y border-gray-200">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-20 lg:py-28">
          <div className="max-w-2xl mb-10">
            <p className="overline text-[#b8941f] mb-3">Le centre</p>
            <h2 className="font-display text-4xl font-bold tracking-tight mb-3">Photos du centre</h2>
            <p className="text-gray-500 text-base">Photos provisoires — à remplacer par vos photos réelles.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            {PHOTOS.map((p) => (
              <div key={p.label} className="bg-white border border-gray-200 rounded-md overflow-hidden">
                <img src={p.src} alt={p.label} className="w-full aspect-[4/3] object-cover" />
                <div className="px-4 py-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{p.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Formulaire de rappel */}
      <div className="bg-[#0a0a0a] text-white" id="rappel" ref={formRef}>
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-20 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <h2 className="font-display text-4xl font-bold tracking-tight mb-5">Récupérez vos points au tarif fidélité</h2>
              <p className="text-gray-300 text-lg leading-relaxed">Laissez-nous vos coordonnées, un membre de notre équipe vous rappelle sous 24h ouvrées pour finaliser votre inscription au tarif de 189&nbsp;€.</p>
            </div>
            <div className="bg-white text-black rounded-md p-9">
              {sent ? (
                <div className="bg-[#0B7238]/10 border border-[#0B7238] text-[#0B7238] rounded-md px-5 py-4 text-base">
                  Merci, votre demande a bien été prise en compte. Nous vous rappelons sous 24h ouvrées.
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-5">
                  <div>
                    <label htmlFor="prenom" className="block text-sm font-mono uppercase tracking-wider text-gray-500 mb-2">Prénom</label>
                    <input
                      id="prenom" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} required
                      className="w-full px-4 py-3.5 border border-gray-300 rounded-md text-base focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>
                  <div>
                    <label htmlFor="nom" className="block text-sm font-mono uppercase tracking-wider text-gray-500 mb-2">Nom</label>
                    <input
                      id="nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required
                      className="w-full px-4 py-3.5 border border-gray-300 rounded-md text-base focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>
                  <div>
                    <label htmlFor="telephone" className="block text-sm font-mono uppercase tracking-wider text-gray-500 mb-2">Téléphone</label>
                    <input
                      id="telephone" type="tel" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} required
                      className="w-full px-4 py-3.5 border border-gray-300 rounded-md text-base focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>
                  <div className="text-sm font-semibold text-[#0B7238] min-h-[18px]">{session ? `Session souhaitée : ${session}` : ""}</div>
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full bg-[#d4af37] hover:bg-[#b8941f] disabled:opacity-60 text-black font-semibold uppercase tracking-wide text-base py-4 rounded-md"
                  >
                    {sending ? "Envoi..." : "Être rappelé"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <section className="py-20 lg:py-28">
        <div className="max-w-5xl mx-auto px-6 lg:px-10">
          <div className="max-w-2xl mb-10">
            <p className="overline text-[#b8941f] mb-3">Questions fréquentes</p>
            <h2 className="font-display text-4xl font-bold tracking-tight">FAQ</h2>
          </div>
          <div className="divide-y divide-gray-200 border-t border-gray-200">
            {FAQ.map((f, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between py-5 text-left font-semibold text-base"
                  >
                    <span>{f.q}</span>
                    <Plus size={22} className={`text-[#b8941f] transition-transform shrink-0 ml-4 ${isOpen ? "rotate-45" : ""}`} />
                  </button>
                  {isOpen && <p className="text-base text-gray-500 pb-5 max-w-2xl leading-relaxed">{f.r}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 py-10 text-center text-base text-gray-500">
        TDL Formation — 59 avenue Joffre, 93800 Épinay-sur-Seine · 01 80 90 72 49 · contact@tdl-formation.fr
      </footer>
    </div>
  );
}
