import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Warning } from "@phosphor-icons/react";

const PLACE_LABELS = { BAFM: "BAFM", PSY: "Psychologue", FORMATEUR: "Formateur", TESTEUR: "Testeur" };

// Correction des formateurs d'une session par l'équipe (demande du
// 2026-11-12) : remplacer un formateur placé par erreur. Backend :
// PUT /stages/{id}/formateurs (ouvert aux employés, sans quota ni date limite).
export default function FormateursDialog({ stage, open, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !stage) return;
    setData(null); setSearch("");
    api.get(`/stages/${stage.id}/formateurs`)
      .then((r) => { setData(r.data); setSelected(r.data.animateur_ids || []); })
      .catch((e) => { toast.error(e.response?.data?.detail || "Chargement impossible"); onClose(); });
  }, [open, stage?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => Object.fromEntries((data?.formateurs || []).map((f) => [f.id, f])), [data]);

  // Place par place : qui l'occupe avec la sélection en cours.
  const occupation = useMemo(() => {
    const out = {};
    (data?.places || []).forEach((p) => { out[p] = []; });
    selected.forEach((id) => {
      const f = byId[id];
      if (f) (out[f.place] = out[f.place] || []).push(f.name);
    });
    return out;
  }, [data, selected, byId]);

  const toggle = (id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const save = async () => {
    setSaving(true);
    try {
      const { data: updated } = await api.put(`/stages/${stage.id}/formateurs`, { animateur_ids: selected });
      toast.success("Formateurs mis à jour");
      onSaved(updated);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Modification impossible");
    } finally {
      setSaving(false);
    }
  };

  const q = search.trim().toLowerCase();
  const list = (data?.formateurs || [])
    .filter((f) => selected.includes(f.id) || f.meme_type)
    .filter((f) => !q || f.name.toLowerCase().includes(q) || f.titre.toLowerCase().includes(q));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="stage-formateurs-dialog">
        <DialogHeader><DialogTitle>Formateurs — {stage?.formation_titre}</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500">Session du {stage?.date_debut} au {stage?.date_fin}. Cochez ou décochez pour corriger le placement.</p>
        {!data ? (
          <p className="text-sm text-gray-400 py-6 text-center">Chargement...</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {Object.entries(occupation).map(([place, names]) => (
                <div key={place} className={`text-xs border rounded-md px-2.5 py-1.5 ${names.length === 1 ? "border-[#0B7238] bg-[#0B7238]/5" : "border-amber-400 bg-amber-50"}`}>
                  <span className="font-semibold">{PLACE_LABELS[place] || place}</span> : {names.length ? names.join(", ") : "libre"}
                  {names.length > 1 && <span className="text-amber-700"> (plusieurs)</span>}
                </div>
              ))}
            </div>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un formateur..." className="h-8 text-sm" />
            <div className="space-y-1 max-h-80 overflow-y-auto border border-gray-100 rounded-md p-1.5" data-testid="stage-formateurs-list">
              {list.map((f) => {
                const checked = selected.includes(f.id);
                return (
                  <label key={f.id} className={`flex items-start gap-2 text-sm px-2 py-1.5 rounded-md cursor-pointer ${checked ? "bg-[#d4af37]/10" : "hover:bg-gray-50"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(f.id)} className="mt-1" data-testid={`stage-formateur-${f.id}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">{f.name}</span>
                        <Badge variant="outline" className="text-[10px]">{PLACE_LABELS[f.place] || f.place}</Badge>
                      </span>
                      {f.deja_place && (
                        <span className="text-[11px] text-amber-700 flex items-center gap-1"><Warning size={11} /> Déjà placé : {f.deja_place}</span>
                      )}
                    </span>
                  </label>
                );
              })}
              {!list.length && <p className="text-xs text-gray-400 text-center py-4">Aucun formateur.</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Annuler</Button>
              <Button onClick={save} disabled={saving} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="stage-formateurs-save">
                Enregistrer
              </Button>
            </div>
            <p className="text-[11px] text-gray-400">Les formateurs ajoutés ou retirés sont prévenus par notification, et leur convention est mise à jour.</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
