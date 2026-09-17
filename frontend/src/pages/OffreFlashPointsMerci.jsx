import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle, Phone } from "@phosphor-icons/react";
import { trackPurchase } from "@/lib/metaPixel";
import { setPageMeta } from "@/lib/seo";

export default function OffreFlashPointsMerci() {
  const [params] = useSearchParams();
  const fired = useRef(false);
  const [ready, setReady] = useState(false);

  const inscriptionId = params.get("inscription") || "";
  const session = params.get("session") || "";
  const value = Number(params.get("value") || 0);

  useEffect(() => {
    setPageMeta({
      title: "Paiement confirmé — Offre flash récupération de points | TDL Formation",
      description: "Votre place est réservée au tarif exceptionnel pour le stage de récupération de points.",
      path: "/offre-flash-points/merci",
    });
    const key = `purchase_tracked_${inscriptionId}`;
    if (inscriptionId && !fired.current && !localStorage.getItem(key)) {
      fired.current = true;
      trackPurchase(
        { content_name: "flash_recup_points_sept2026", value, currency: "EUR", session, inscription_id: inscriptionId },
        `purchase_${inscriptionId}`
      );
      localStorage.setItem(key, "1");
    }
    setReady(true);
  }, [inscriptionId, session, value]);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-16">
      <div className="max-w-lg w-full bg-white border border-gray-200 rounded-lg shadow-sm p-8 text-center">
        <CheckCircle size={56} className="mx-auto text-[#0B7238] mb-4" weight="fill" />
        <h1 className="text-2xl sm:text-3xl font-bold">Paiement confirmé !</h1>
        <p className="text-gray-500 mt-3">
          Votre place est réservée au tarif flash{session ? <> pour la session du <b>{session}</b></> : null}. Vous
          allez recevoir un email de confirmation avec toutes les informations utiles.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
          <Link to="/" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full">Retour à l'accueil</Button>
          </Link>
          <a href="tel:+33180907249" className="w-full sm:w-auto">
            <Button className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
              <Phone size={16} className="mr-2" /> Nous appeler
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
