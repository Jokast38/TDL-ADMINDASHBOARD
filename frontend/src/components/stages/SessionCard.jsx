import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MapPin, Sun, Moon, Lock, FireSimple, DotsThree, FolderOpen } from "@phosphor-icons/react";
import FillGauge from "./FillGauge";
import { extractCreneau, formatDateShortFr, displayStatus, placesRestantes, fillRatio, isSoonFull } from "./stageHelpers";

const STATUT_LABELS = { planifie: "Planifié", en_cours: "En cours", complet: "Complet", termine: "Terminé", annule: "Annulé" };
const STATUT_BADGE_CLASS = {
  planifie: "border-blue-200 text-blue-700 bg-blue-50",
  en_cours: "border-amber-200 text-amber-700 bg-amber-50",
  complet: "border-red-200 text-red-700 bg-red-50",
  termine: "border-gray-200 text-gray-500 bg-gray-50",
  annule: "border-gray-300 text-gray-400 bg-gray-50 line-through",
};

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

// Carte compacte d'une session — bordure gauche à la couleur de la formation,
// titre de formation masqué sauf en onglet "Toutes" (showFormation).
export default function SessionCard({ s, color, showFormation, animateurs, onOpen, muted }) {
  const creneau = s.creneau || extractCreneau(s.notes);
  const rest = placesRestantes(s);
  const ratio = fillRatio(s);
  const status = displayStatus(s);
  const locked = s.statut === "complet";
  const animNames = (s.animateur_ids?.length ? s.animateur_ids : (s.animateur_id ? [s.animateur_id] : []))
    .map((id) => animateurs.find((a) => a.id === id)?.name)
    .filter(Boolean);

  return (
    <Card
      className={`p-4 border border-gray-200 rounded-lg shadow-none hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer border-l-4 ${muted ? "opacity-70" : ""}`}
      style={{ borderLeftColor: color }}
      onClick={() => onOpen(s)}
      data-testid={`stage-card-${s.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display font-extrabold text-sm leading-tight">
            {formatDateShortFr(s.date_debut)} → {formatDateShortFr(s.date_fin)}
          </p>
          {showFormation && (
            <p className="text-xs font-semibold mt-0.5 truncate" style={{ color }}>{s.formation_titre}</p>
          )}
        </div>
        {creneau && (
          <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
            {creneau === "JOUR" ? <Sun size={10} /> : <Moon size={10} />} {s.heure_debut}–{s.heure_fin}
          </Badge>
        )}
      </div>

      <p className="flex items-center gap-1 text-xs text-gray-500 mt-2"><MapPin size={12} /> {s.lieu_ville || "Lieu non précisé"}</p>

      <div className="mt-3">
        <FillGauge inscrits={s.nb_inscrits || 0} capacite={s.capacite_max || 0} ratio={ratio} />
      </div>

      <div className="flex items-center flex-wrap gap-1.5 mt-3">
        <Badge variant="outline" className={`text-[10px] ${STATUT_BADGE_CLASS[status] || ""}`}>{STATUT_LABELS[status] || status}</Badge>
        {locked && status !== "complet" && (
          <Badge variant="outline" className="text-[10px] gap-1 border-red-300 text-red-700 bg-red-50">
            <Lock size={9} weight="fill" /> Verrouillé
          </Badge>
        )}
        {isSoonFull(s) && (
          <Badge variant="outline" className="text-[10px] gap-1 border-orange-300 text-orange-700 bg-orange-50">
            <FireSimple size={10} weight="fill" /> Bientôt complet
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="flex -space-x-1.5">
          {animNames.slice(0, 3).map((name) => (
            <Avatar key={name} className="h-6 w-6 border border-white">
              <AvatarFallback className="text-[9px] font-bold bg-gray-100 text-gray-600">{initials(name)}</AvatarFallback>
            </Avatar>
          ))}
          {!animNames.length && <span className="text-[10px] text-gray-300">Aucun formateur</span>}
        </div>
        <DotsThree size={16} className="text-gray-300" />
      </div>

      {muted && (
        <p className="mt-2 text-[10px] flex items-center gap-1 text-gray-400">
          <FolderOpen size={11} /> Dossier ANTS disponible dans le détail
        </p>
      )}
    </Card>
  );
}
