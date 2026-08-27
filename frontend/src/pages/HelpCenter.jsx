import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, Question, BookOpenText } from "@phosphor-icons/react";
import { HELP_CATEGORIES, categoriesForRole } from "@/constants/helpTours";
import { useTour } from "@/contexts/TourContext";

export default function HelpCenter() {
  const { user } = useAuth();
  const { startTour } = useTour();
  const navigate = useNavigate();

  const ordered = categoriesForRole(user?.role);
  const ownKeys = new Set(HELP_CATEGORIES.filter((c) => c.roles.includes(user?.role)).map((c) => c.key));

  return (
    <div className="space-y-6" data-testid="help-center-page">
      <div>
        <p className="overline">Centre d'aide</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Comment ça marche ?</h1>
        <p className="text-gray-500 mt-2 max-w-2xl">
          Une visite guidée par profil, pensée pour former un nouvel employé sans avoir à repasser derrière lui pour
          chaque fonctionnalité. Choisissez une catégorie ci-dessous et lancez la visite — votre profil apparaît en premier.
        </p>
      </div>

      {user?.role === "admin" && (
        <Card className="p-5 border border-gray-200 rounded-md shadow-none flex items-center justify-between gap-4 flex-wrap bg-[#0a0a0a] text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 bg-[#d4af37]/15">
              <BookOpenText size={22} className="text-[#d4af37]" weight="duotone" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg leading-tight">Documentation technique</h3>
              <p className="text-sm text-gray-300 mt-0.5">
                Architecture, modèle de données, intégrations et dépannage — le dossier de passation complet du projet.
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate("/admin/documentation")}
            className="bg-[#d4af37] text-black hover:bg-[#b8941f] shrink-0"
            data-testid="open-documentation-btn"
          >
            <BookOpenText size={16} className="mr-2" weight="fill" /> Ouvrir la documentation
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {ordered.map((cat) => {
          const Icon = cat.icon;
          const isOwn = ownKeys.has(cat.key);
          return (
            <Card
              key={cat.key}
              className={`p-6 border rounded-md shadow-none ${isOwn ? "border-[#d4af37] bg-[#fff8e1]/30" : "border-gray-200"}`}
              data-testid={`help-category-${cat.key}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-md flex items-center justify-center shrink-0 ${isOwn ? "bg-[#0a0a0a]" : "bg-gray-100"}`}>
                    <Icon size={22} className={isOwn ? "text-[#d4af37]" : "text-gray-600"} weight="duotone" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg leading-tight">{cat.label}</h3>
                    {isOwn && <Badge className="bg-[#d4af37] text-black hover:bg-[#d4af37] text-[10px] mt-1">Votre profil</Badge>}
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-3">{cat.description}</p>
              <p className="text-xs text-gray-400 mt-1">{cat.steps.length} fonctionnalités couvertes</p>
              <Button
                onClick={() => startTour(cat)}
                className="w-full mt-4 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white"
                data-testid={`start-tour-${cat.key}`}
              >
                <PlayCircle size={16} className="mr-2" weight="fill" /> Lancer la visite guidée
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="p-6 border border-gray-200 rounded-md shadow-none bg-gray-50">
        <div className="flex items-start gap-3">
          <Question size={22} className="text-[#d4af37] shrink-0 mt-0.5" weight="duotone" />
          <div>
            <h3 className="font-display font-bold">Une question qui n'est couverte par aucune visite ?</h3>
            <p className="text-sm text-gray-600 mt-1">
              Demandez à un administrateur ou à votre responsable — et si c'est une question fréquente, elle mérite
              probablement d'être ajoutée ici.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
