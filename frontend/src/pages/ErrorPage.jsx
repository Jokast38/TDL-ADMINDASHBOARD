import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "@phosphor-icons/react";

const GOLD = "#d4af37";

// Page d'erreur générique aux couleurs de la marque — utilisée pour le 404
// (route inconnue) et par l'ErrorBoundary (plantage React) pour ne jamais
// laisser un visiteur public face à un écran blanc ou une page par défaut du
// navigateur, hors de toute charte graphique.
export default function ErrorPage({
  code = "404",
  title = "Page introuvable",
  message = "La page que vous cherchez n'existe pas ou plus, ou l'adresse est mal orthographiée.",
}) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-6 py-16 text-center" data-testid="error-page">
      <img
        src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png"
        alt="TDL Formation"
        className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-contain bg-white p-2 mb-8"
      />
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>Erreur {code}</p>
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">{title}</h1>
      <p className="text-gray-400 max-w-md mb-10">{message}</p>
      <Link to="/">
        <Button size="lg" style={{ backgroundColor: GOLD }} className="text-black hover:brightness-95 font-bold uppercase text-sm tracking-wide">
          <ArrowLeft size={16} className="mr-2" weight="bold" /> Retour au site TDL Formation
        </Button>
      </Link>
    </div>
  );
}
