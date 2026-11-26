import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTimeFR } from "@/lib/dateFormat";
import { PencilSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

// Notes de suivi d'une inscription (demande du 2026-11-26), comme pour les
// prospects : chaque note est datée et signée, la plus récente en haut ;
// une note corrigée garde son auteur et affiche qui l'a modifiée et quand.
// Backend : GET/POST /inscriptions/{id}/notes, PUT /inscriptions/{id}/notes/{noteId}.

const errorDetail = (e, fallback) => e.response?.data?.detail || fallback;

export default function InscriptionNotesDialog({ inscription, onClose, onChanged }) {
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(null); // { id, text }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!inscription) return;
    setNotes(null);
    setText("");
    setEditing(null);
    api.get(`/inscriptions/${inscription.id}/notes`).then((r) => setNotes(r.data)).catch(() => setNotes([]));
  }, [inscription]);

  const add = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/inscriptions/${inscription.id}/notes`, { text });
      setNotes(data);
      setText("");
      toast.success("Note ajoutée");
      onChanged?.();
    } catch (e) { toast.error(errorDetail(e, "Note non enregistrée")); } finally { setSaving(false); }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/inscriptions/${inscription.id}/notes/${editing.id}`, { text: editing.text });
      setNotes(data);
      setEditing(null);
      toast.success("Note modifiée");
      onChanged?.();
    } catch (e) { toast.error(errorDetail(e, "Note non modifiée")); } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!inscription} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Notes — {inscription?.student_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Nouvelle note — les précédentes restent visibles, rien n'est écrasé" data-testid="insc-note-input" />
            <div className="flex justify-end mt-2">
              <Button size="sm" disabled={saving || !text.trim()} onClick={add} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="insc-note-add">
                Ajouter la note
              </Button>
            </div>
          </div>
          {notes === null && <p className="text-sm text-gray-400">Chargement…</p>}
          {notes?.length === 0 && <p className="text-sm text-gray-400">Aucune note pour l'instant.</p>}
          {notes?.length > 0 && (
            <div className="space-y-2" data-testid="insc-notes-list">
              {[...notes].reverse().map((n) => (
                <div key={n.id} className="text-sm border-l-2 border-gray-300 pl-3 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">
                      {n.at ? formatDateTimeFR(n.at) : ""}{n.by_name ? <span className="font-medium text-gray-700"> — {n.by_name}</span> : null}
                    </p>
                    {editing?.id !== n.id && (
                      <button type="button" onClick={() => setEditing({ id: n.id, text: n.text })} className="p-1 text-gray-400 hover:text-gray-700" title="Modifier la note">
                        <PencilSimple size={13} />
                      </button>
                    )}
                  </div>
                  {editing?.id === n.id ? (
                    <div className="mt-1">
                      <Textarea rows={3} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                      <div className="flex justify-end gap-2 mt-1">
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)} disabled={saving}>Annuler</Button>
                        <Button size="sm" onClick={saveEdit} disabled={saving || !editing.text.trim()} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Enregistrer</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-line text-gray-800">{n.text}</p>
                  )}
                  {n.edited_at && <p className="text-[11px] text-gray-400 italic">Modifiée le {formatDateTimeFR(n.edited_at)}{n.edited_by_name ? ` par ${n.edited_by_name}` : ""}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
