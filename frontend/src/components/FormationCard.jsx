import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { heroForCategory } from "@/constants/formationAssets";

// Carte formation réutilisée sur la page d'accueil et le catalogue public complet.
export default function FormationCard({ formation: f, revealDelay }) {
  return (
    <Card
      data-reveal={revealDelay ? true : undefined}
      className={`overflow-hidden border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg transition-all ${revealDelay ? `reveal reveal-delay-${revealDelay}` : ""}`}
      data-testid={`public-formation-${f.id}`}
    >
      <Link to={`/formations/${f.id}`}>
        <div className="aspect-video bg-gray-100 overflow-hidden">
          <img
            src={f.image_url || heroForCategory(f.category)}
            alt={f.title}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
          />
        </div>
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
  );
}
