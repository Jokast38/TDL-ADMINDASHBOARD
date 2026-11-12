import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateFR } from "@/lib/dateFormat";

const CENTRES = [{ key: "creil", label: "Creil (8h30-16h30)" }, { key: "epinay", label: "Épinay-sur-Seine (8h-16h)" }];

// Génération des sessions de récupération de points d'une année pour un
// centre (demande du 2026-11-12). Règles : backend core/recup_calendar.py —
// lundi-mardi et vendredi-samedi chaque semaine ; lundi/mardi férié -> mercredi-
// jeudi ; vendredi/samedi férié -> pas de session. Les dates déjà en ligne
// pour ce centre ne sont jamais recréées.
export default function GenerationRecupDialog({ open, onClose, formations, onDone }) {
  const currentYear = new Date().getFullYear();
  const recup = formations.filter((f) => f.category === "PERMIS");
  const [year, setYear] = useState(String(currentYear + 1));
  const [centre, setCentre] = useState("creil");
  const [formationId, setFormationId] = useState("");
  const [apercu, setApercu] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!formationId && recup.length) setFormationId(recup[0].id); }, [recup, formationId]);

  useEffect(() => {
    if (!open || !formationId) return;
    setApercu(null);
    api.get("/stages/generation-recup/apercu", { params: { year, centre, formation_id: formationId } })
      .then((r) => setApercu(r.data))
      .catch((e) => toast.error(e.response?.data?.detail || "Aperçu impossible"));
  }, [open, year, centre, formationId]);

  const generer = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/stages/generation-recup", { year: Number(year), centre, formation_id: formationId });
      toast.success(`${data.crees} session(s) créée(s) à ${data.centre_label} pour ${data.year}`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Génération impossible");
    } finally {
      setBusy(false);
    }
  };

  const decalees = (apercu?.sessions || []).filter((s) => s.note && !s.existe);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="generation-recup-dialog">
        <DialogHeader><DialogTitle>Générer les sessions de récupération de points</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500">
          Chaque semaine : une session <b>lundi-mardi</b> et une session <b>vendredi-samedi</b>. Lundi ou mardi férié : la
          session passe au mercredi-jeudi. Vendredi ou samedi férié : pas de session cette semaine-là. Les dates déjà en ligne
          pour ce centre ne sont pas recréées.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Année</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger data-testid="generation-annee"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear, currentYear + 1, currentYear + 2].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Centre</label>
            <Select value={centre} onValueChange={setCentre}>
              <SelectTrigger data-testid="generation-centre"><SelectValue /></SelectTrigger>
              <SelectContent>{CENTRES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {recup.length > 1 && (
            <div className="col-span-2">
              <label className="text-sm font-medium">Formation</label>
              <Select value={formationId} onValueChange={setFormationId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{recup.map((f) => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        {!recup.length && <p className="text-sm text-red-600">Aucune formation de récupération de points.</p>}
        {apercu ? (
          <div className="border border-gray-200 rounded-md p-3 text-sm space-y-1.5" data-testid="generation-apercu">
            <p><b>{apercu.a_creer}</b> session(s) à créer à {apercu.centre_label} en {apercu.year}
              {apercu.deja_en_ligne ? <span className="text-gray-500"> ({apercu.deja_en_ligne} déjà en ligne, ignorée(s))</span> : null}</p>
            {decalees.length > 0 && (
              <div className="text-xs text-gray-600">
                <p className="font-medium">Décalées au mercredi-jeudi (jour férié) :</p>
                <p>{decalees.map((s) => formatDateFR(s.date_debut)).join(", ")}</p>
              </div>
            )}
          </div>
        ) : (formationId && <p className="text-sm text-gray-400">Calcul de l'aperçu...</p>)}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={generer} disabled={busy || !apercu || !apercu.a_creer} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="generation-confirmer">
            {busy ? "Création..." : `Créer ${apercu?.a_creer || 0} session(s)`}
          </Button>
        </div>
        <p className="text-[11px] text-gray-400">Les sessions créées sont visibles sur le site et dans le planning des formateurs.</p>
      </DialogContent>
    </Dialog>
  );
}
