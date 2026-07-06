import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, GraduationCap, Lightning, Trophy,
  IdentificationCard, Truck, FireSimple, Car
} from "@phosphor-icons/react";

const CATEGORIES = [
  { key: "CACES", label: "CACES", icon: Truck, desc: "Toutes catégories - chariots, nacelles, grues" },
  { key: "PERMIS", label: "Récup. Permis", icon: IdentificationCard, desc: "Stages agréés 2 jours" },
  { key: "AUTO_ECOLE", label: "Auto-école", icon: Car, desc: "Permis B accompagné ANTS" },
  { key: "SSIAP", label: "SSIAP 1/2/3", icon: FireSimple, desc: "Sécurité incendie" },
  { key: "VTC_TAXI", label: "VTC / Taxi", icon: Car, desc: "Examen + carte pro" },
];

export default function Landing() {
  const [formations, setFormations] = useState([]);

  useEffect(() => {
    api.get("/formations", { params: { active_only: true } }).then((r) => setFormations(r.data));
  }, []);

  return (
    <div className="min-h-screen bg-white" data-testid="landing-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">TDL Formation</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#formations" className="hover:text-[#d4af37]">Formations</a>
            <Link to="/blog" className="hover:text-[#d4af37]">Blog</Link>
            <a href="https://kamistreet.fr/" target="_blank" rel="noreferrer" className="hover:text-[#d4af37]">KAMI STREET ↗</a>
            <a href="#contact" className="hover:text-[#d4af37]">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="outline" size="sm" data-testid="login-link">Connexion</Button>
            </Link>
            <Link to="/inscription">
              <Button size="sm" className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="inscription-cta">
                S'inscrire <ArrowRight size={14} className="ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-gray-200 grid-bg-noise">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-28 grid lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7">
            <p className="overline mb-4">Organisme certifié · Île-de-France</p>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tighter leading-[0.95]">
              Vos formations <span className="text-[#d4af37]">pro</span> &<br />votre mobilité <span className="text-[#d4af37]">électrique</span><br />sur la même plateforme.
            </h1>
            <p className="text-gray-600 text-lg mt-6 max-w-xl">
              CACES, permis, auto-école, SSIAP, VTC — inscription en ligne, dossier ANTS suivi, paiement sécurisé.
              Et la mobilité KAMI STREET en bonus.
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
            <Stat label="Inscriptions actives" value="200+" accent="#0a0a0a" />
            <Stat label="Taux de réussite" value="94%" accent="#0B7238" />
            <Stat label="Formations" value="6" accent="#d4af37" />
            <Stat label="Sessions / mois" value="25" accent="#d4af37" />
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
                {f.image_url && (
                  <div className="aspect-video bg-gray-100 overflow-hidden">
                    <img src={f.image_url} alt={f.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-5">
                  <Badge variant="outline" className="text-xs mb-2">{f.category}</Badge>
                  <h3 className="font-display font-bold text-lg leading-tight">{f.title}</h3>
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2">{f.description}</p>
                  <div className="flex items-end justify-between mt-4 pt-4 border-t border-gray-100">
                    <p className="font-display font-bold text-2xl">{f.price}€</p>
                    <Link to={`/inscription?formation=${f.id}`}>
                      <Button size="sm" className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid={`inscr-${f.id}`}>
                        S'inscrire
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

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8" id="contact">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-wrap gap-4 items-center justify-between">
          <p className="text-sm text-gray-500">© 2026 TDL Formation · Tous droits réservés.</p>
          <p className="text-xs text-gray-400 font-mono">contact@tdlformation.fr</p>
        </div>
      </footer>
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
