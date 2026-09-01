import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarPlus, Clock, LockKey, Trash, UserPlus } from "@phosphor-icons/react";
import { toast } from "sonner";

const TYPES = [
  { value: "formation_pratique", label: "Formation pratique" },
  { value: "examen_blanc", label: "Examen blanc" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Appointments() {
  const [type, setType] = useState("formation_pratique");
  const [formule, setFormule] = useState("journee");
  const [startDate, setStartDate] = useState(todayStr());
  const [department, setDepartment] = useState("");
  const [generating, setGenerating] = useState(false);

  const [slots, setSlots] = useState([]);
  const [filterType, setFilterType] = useState("formation_pratique");
  const [dossiers, setDossiers] = useState([]);
  const [pickedStudent, setPickedStudent] = useState("");

  const loadSlots = () => {
    api.get("/slots", { params: { type: filterType } }).then((r) => setSlots(r.data)).catch(() => setSlots([]));
  };
  useEffect(() => { loadSlots(); }, [filterType]);
  useEffect(() => {
    api.get("/dossiers").then((r) => setDossiers(r.data.filter((d) => d.status !== "termine"))).catch(() => {});
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post("/slots/generate", { type, formule, start_date: startDate, department: department || null });
      toast.success(`${data.created} créneau(x) généré(s)`);
      loadSlots();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setGenerating(false);
    }
  };

  const unlock4th = async (slotId) => {
    if (!pickedStudent) return toast.error("Choisissez d'abord un apprenant dans la liste");
    const [studentId, dossierId] = pickedStudent.split("|");
    try {
      await api.post(`/slots/${slotId}/unlock-4th`, { student_id: studentId, dossier_id: dossierId });
      toast.success("4e place débloquée — l'apprenant a été notifié");
      loadSlots();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const removeSlot = async (slotId) => {
    if (!window.confirm("Supprimer ce créneau ?")) return;
    try {
      await api.delete(`/slots/${slotId}`);
      loadSlots();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const byDate = useMemo(() => {
    const map = new Map();
    for (const s of slots) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date).push(s);
    }
    return Array.from(map.entries());
  }, [slots]);

  return (
    <div className="space-y-6" data-testid="appointments-page">
      <div>
        <p className="overline">Planification</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Rendez-vous</h1>
        <p className="text-gray-500 mt-2">Créneaux de formation pratique et d'examen blanc — 3 places/heure, 24/jour.</p>
      </div>

      <Card className="p-5 border border-gray-200 rounded-md shadow-none">
        <h2 className="font-display font-bold mb-3 flex items-center gap-2"><CalendarPlus size={18} /> Générer des créneaux</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Formule</label>
            <Select value={formule} onValueChange={setFormule}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="journee">Journée — 9h-17h, 1 semaine</SelectItem>
                <SelectItem value="soiree">Soirée — 18h-21h, 2 semaines</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Semaine à partir du</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-44" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Département (optionnel)</label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="75" className="w-28" />
          </div>
          <Button disabled={generating} onClick={generate} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="generate-slots-btn">
            {generating ? "Génération..." : "Générer"}
          </Button>
        </div>
      </Card>

      <Card className="p-5 border border-gray-200 rounded-md shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-display font-bold flex items-center gap-2"><Clock size={18} /> Créneaux</h2>
          <div className="flex items-center gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={pickedStudent} onValueChange={setPickedStudent}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Apprenant pour 4e place..." /></SelectTrigger>
              <SelectContent>
                {dossiers.map((d) => (
                  <SelectItem key={d.id} value={`${d.student_id}|${d.id}`}>{d.student_name} — {d.formation_title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {byDate.map(([date, daySlots]) => (
            <div key={date}>
              <p className="text-sm font-medium mb-2">{new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {daySlots.map((s) => {
                  const full = s.places_disponibles <= 0;
                  return (
                    <div key={s.id} className={`border rounded-md p-2.5 text-xs ${full ? "border-amber-300 bg-amber-50" : "border-gray-200"}`} data-testid={`slot-cell-${s.id}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{s.heure_debut}</span>
                        <button onClick={() => removeSlot(s.id)} className="text-gray-300 hover:text-red-600"><Trash size={12} /></button>
                      </div>
                      <p className="text-gray-500">{s.bookings.length}/{s.places_totales} place(s)</p>
                      {full && (
                        <button
                          onClick={() => unlock4th(s.id)}
                          className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[#d4af37] hover:underline"
                          data-testid={`unlock-4th-${s.id}`}
                        >
                          {s.capacite_bonus ? <UserPlus size={10} /> : <LockKey size={10} />} Débloquer 4e place
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {!byDate.length && <p className="text-sm text-gray-400 text-center py-8">Aucun créneau généré pour ce type.</p>}
        </div>
      </Card>
    </div>
  );
}
