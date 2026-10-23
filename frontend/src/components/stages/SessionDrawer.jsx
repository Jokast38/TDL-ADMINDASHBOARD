import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Calendar, MapPin, Users, PencilSimple, Trash, Lock, LockOpen, FolderOpen, Copy } from "@phosphor-icons/react";
import FillGauge from "./FillGauge";
import { extractCreneau, placesRestantes, fillRatio, displayStatus } from "./stageHelpers";

const STATUT_LABELS = { planifie: "Planifié", en_cours: "En cours", complet: "Complet", termine: "Terminé", annule: "Annulé" };

// Même code couleur que les colonnes du Kanban dossiers (voir
// frontend/src/pages/Dossiers.jsx::COLUMNS) — demande du 2026-10-23 :
// repérer d'un coup d'œil, depuis la liste des inscrits d'une session, où en
// est le dossier de chacun (vert = terminé).
const DOSSIER_STATUS_LABELS = {
  nouveau: "Nouveau", en_verification: "En vérification", complet: "Complet",
  soumis_ants: "Soumis ANTS", termine: "Terminé", rejete: "Rejeté",
};
const DOSSIER_STATUS_STYLE = {
  nouveau: "bg-gray-50 border-gray-300",
  en_verification: "bg-amber-50 border-amber-300",
  complet: "bg-blue-50 border-blue-300",
  soumis_ants: "bg-gray-200 border-gray-400",
  termine: "bg-green-50 border-green-400",
  rejete: "bg-red-50 border-red-300",
};
const DOSSIER_STATUS_BADGE = {
  nouveau: "border-gray-300 text-gray-600",
  en_verification: "border-amber-400 text-amber-700",
  complet: "border-blue-400 text-blue-700",
  soumis_ants: "border-gray-500 text-gray-700",
  termine: "border-green-500 text-green-700",
  rejete: "border-red-400 text-red-700",
};

// Panneau latéral de détail d'une session — récap, jauge, inscrits, actions.
// Le bouton "Modifier" délègue au formulaire existant (onEdit), qui reste la
// même Dialog qu'avant (aucune logique métier réécrite).
export default function SessionDrawer({ stage, onClose, animateurs, onEdit, onToggleLock, onDelete, onDuplicate, onDownloadAnts }) {
  const navigate = useNavigate();
  const [roster, setRoster] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!stage) return;
    setLoadingRoster(true);
    api.get(`/stages/${stage.id}/roster`)
      .then((r) => setRoster(r.data))
      .catch(() => { toast.error("Erreur de chargement des inscrits"); setRoster([]); })
      .finally(() => setLoadingRoster(false));
  }, [stage]);

  if (!stage) return null;
  const s = stage;
  const creneau = s.creneau || extractCreneau(s.notes);
  const rest = placesRestantes(s);
  const ratio = fillRatio(s);
  const status = displayStatus(s);
  const locked = s.statut === "complet";
  const isPast = (s.date_fin || s.date_debut) < new Date().toISOString().slice(0, 10);
  const animNames = (s.animateur_ids?.length ? s.animateur_ids : (s.animateur_id ? [s.animateur_id] : []))
    .map((id) => animateurs.find((a) => a.id === id)?.name)
    .filter(Boolean);

  return (
    <Sheet open={!!stage} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" data-testid="stage-drawer">
        <SheetHeader>
          <SheetTitle className="pr-6">{s.formation_titre}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4 text-sm">
          <div className="flex items-center flex-wrap gap-1.5">
            <Badge variant="outline">{STATUT_LABELS[status] || status}</Badge>
            {creneau && <Badge variant="outline">{creneau === "JOUR" ? "☀️ Jour" : "🌙 Soir"} {s.heure_debut}–{s.heure_fin}</Badge>}
          </div>

          <p className="flex items-center gap-1.5 text-gray-600"><Calendar size={14} /> {s.date_debut} → {s.date_fin}</p>
          <p className="flex items-center gap-1.5 text-gray-600"><MapPin size={14} /> {s.lieu_ville || "Lieu non précisé"}</p>

          <FillGauge inscrits={s.nb_inscrits || 0} capacite={s.capacite_max || 0} ratio={ratio} />
          <p className="text-xs text-gray-500">{rest} place(s) restante(s){s.external_reserved ? ` (${s.external_reserved} réservée(s) ailleurs)` : ""}</p>

          {!!animNames.length && (
            <p className="text-xs text-gray-600">Formateur(s) : {animNames.join(", ")}</p>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            <Button size="sm" variant="outline" onClick={() => onEdit(s)} data-testid="stage-drawer-edit">
              <PencilSimple size={13} className="mr-1" /> Modifier
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDuplicate(s)} data-testid="stage-drawer-duplicate">
              <Copy size={13} className="mr-1" /> Dupliquer
            </Button>
            <Button size="sm" variant="outline" onClick={() => onToggleLock(s)} data-testid="stage-drawer-lock">
              {locked ? <LockOpen size={13} className="mr-1" /> : <Lock size={13} className="mr-1" />}
              {locked ? "Déverrouiller" : "Verrouiller"}
            </Button>
            {isPast && (
              <Button size="sm" variant="outline" onClick={() => onDownloadAnts(s)} data-testid="stage-drawer-ants">
                <FolderOpen size={13} className="mr-1" /> Dossier ANTS
              </Button>
            )}
            <AlertDialog open={deleting} onOpenChange={setDeleting}>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" data-testid="stage-drawer-delete">
                  <Trash size={13} className="mr-1" /> Supprimer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer cette session ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action est irréversible et supprimera aussi les émargements liés à cette session.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(s.id)} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2"><Users size={13} /> Inscrits ({roster.length})</p>
            <div className="space-y-1 max-h-72 overflow-y-auto border border-gray-100 rounded-md p-2">
              {loadingRoster ? (
                <p className="text-xs text-gray-400 text-center py-4">Chargement...</p>
              ) : roster.length ? (
                roster.map((r) => (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between text-xs border rounded-md px-2.5 py-1.5 ${DOSSIER_STATUS_STYLE[r.dossier_status] || "bg-gray-50 border-gray-200"} ${r.dossier_id ? "cursor-pointer hover:brightness-95 transition-[filter]" : ""}`}
                    onClick={() => r.dossier_id && navigate("/admin/dossiers", { state: { openDossierId: r.dossier_id } })}
                    title={r.dossier_id ? "Ouvrir son dossier" : "Aucun dossier lié"}
                    data-testid={`stage-roster-row-${r.id}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.student_name}</p>
                      <p className="text-gray-400 truncate">{r.student_email}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {r.dossier_status && (
                        <Badge variant="outline" className={`text-[10px] ${DOSSIER_STATUS_BADGE[r.dossier_status] || ""}`}>
                          {DOSSIER_STATUS_LABELS[r.dossier_status] || r.dossier_status}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">{r.payment_status}</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400 text-center py-4">Aucun candidat affecté pour l'instant.</p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
