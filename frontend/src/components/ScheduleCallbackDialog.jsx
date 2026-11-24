import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PersonChooser, { EMPTY_CONTACT, contactValide } from "@/components/PersonChooser";

// Rappel téléphonique planifié (demande du 2026-11-24) : bouton distinct de
// « Rendez-vous » sur les listes de prospects. Le rappel apparaît sur la
// page Rappels, avec le suivi de chaque tentative ; la personne assignée
// reçoit une notification à l'heure prévue. Rien n'est envoyé au prospect.

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function defaultTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return { date: localDate(d), heure: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

const RACCOURCIS = [
  ["Dans 1 h", () => new Date(Date.now() + 60 * 60 * 1000)],
  ["Demain 10h", () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; }],
  ["Demain 14h", () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(14, 0, 0, 0); return d; }],
  ["Dans 1 semaine", () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0); return d; }],
];

export default function ScheduleCallbackDialog({ open, onOpenChange, lead: fixedLead, onCreated }) {
  const { user } = useAuth();
  const [lead, setLead] = useState(fixedLead || null);
  const [personMode, setPersonMode] = useState("recherche");
  const [contact, setContact] = useState(EMPTY_CONTACT);
  const [assignees, setAssignees] = useState([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [formations, setFormations] = useState([]);
  const [formation, setFormation] = useState("");
  const [date, setDate] = useState("");
  const [heure, setHeure] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLead(fixedLead || null);
    setPersonMode("recherche"); setContact(EMPTY_CONTACT); setAssignedTo(""); setNotes("");
    setFormation(fixedLead?.interest || "");
    const t = defaultTime();
    setDate(t.date); setHeure(t.heure);
    api.get("/call-center/assignees").then((r) => setAssignees((r.data || []).filter((u) => u.id !== user?.id))).catch(() => {});
    api.get("/formations", { params: { active_only: true } }).then((r) => setFormations(r.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedLead]);

  const nouveau = !fixedLead && personMode === "nouveau";
  const personneOk = nouveau ? contactValide(contact) : !!lead;

  const submit = async () => {
    if (!personneOk) return toast.error(nouveau ? "Prénom et téléphone (ou email) requis" : "Choisissez une personne");
    if (!date || !heure) return toast.error("Date et heure du rappel requises");
    setSaving(true);
    try {
      await api.post("/call-center/rappels", {
        lead_id: nouveau ? undefined : lead.id,
        nouveau_contact: nouveau ? { ...contact, interest: formation } : undefined,
        scheduled_at: new Date(`${date}T${heure}:00`).toISOString(),
        assigned_to: assignedTo || undefined,
        notes: notes.trim() || undefined,
        formation_titre: formation || undefined,
      });
      toast.success("Rappel planifié — visible sur la page Rappels");
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Rappel non enregistré");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto" data-testid="schedule-callback-dialog">
        <DialogHeader><DialogTitle>Planifier un rappel téléphonique</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          {fixedLead ? (
            <p className="text-sm"><span className="font-medium">{fixedLead.name}</span>
              <span className="text-gray-400"> · {fixedLead.phone || fixedLead.email || "sans téléphone"}</span></p>
          ) : (
            <PersonChooser lead={lead} setLead={setLead} mode={personMode} setMode={setPersonMode}
              contact={contact} setContact={setContact} testid="callback-person" />
          )}
          <div>
            <label className="text-sm font-medium">Quand rappeler</label>
            <div className="flex gap-2 mt-1">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="callback-date" />
              <Input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className="w-32" data-testid="callback-time" />
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {RACCOURCIS.map(([label, fn]) => (
                <button key={label} type="button" className="text-[11px] border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-50"
                  onClick={() => { const d = fn(); setDate(localDate(d)); setHeure(`${pad(d.getHours())}:${pad(d.getMinutes())}`); }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Qui rappelle</label>
            <Select value={assignedTo || "__self__"} onValueChange={(v) => setAssignedTo(v === "__self__" ? "" : v)}>
              <SelectTrigger data-testid="callback-assignee"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__self__">Moi-même</SelectItem>
                {assignees.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Formation qui intéresse</label>
            <Select value={formation || "aucune"} onValueChange={(v) => setFormation(v === "aucune" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Non précisée" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aucune">Non précisée</SelectItem>
                {formation && !formations.some((f) => f.title === formation) && <SelectItem value={formation}>{formation}</SelectItem>}
                {formations.map((f) => <SelectItem key={f.id} value={f.title}>{f.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Motif / note (facultatif)</label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex : rappeler après réception du devis CPF" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving || !personneOk || !date || !heure} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="callback-submit">
            {saving ? "..." : "Planifier le rappel"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
