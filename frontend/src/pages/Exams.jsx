import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MagnifyingGlass, CheckCircle, Warning, ThumbsUp, ThumbsDown,
  CalendarCheck, ArrowSquareOut, ClipboardText,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const EXAMENT3P_URL = "https://www.exament3p.fr/id/14";

// Le workflow examen CMA ne concerne que les formations VTC/Taxi (VTC,
// passerelle VTC-Taxi, Taxi banlieue) et le permis B (catégorie
// AUTO_ECOLE) — explicitement pas l'ECSR, le TP Vente (VENTE), ni la
// récupération de points de permis (catégorie PERMIS, à ne pas confondre
// avec le permis B). Doit rester synchronisé avec CMA_CATEGORIES côté
// backend (routers/exams.py).
const CMA_CATEGORIES = ["VTC_TAXI", "AUTO_ECOLE"];

export default function Exams() {
  const [dossiers, setDossiers] = useState([]);
  const [passed, setPassed] = useState([]);
  const [q, setQ] = useState("");
  const [checking, setChecking] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = () => {
    api.get("/dossiers").then((r) => setDossiers(r.data)).catch(() => {});
    api.get("/dossiers/exam-theorique/passed").then((r) => setPassed(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const openable = useMemo(() => {
    const query = q.trim().toLowerCase();
    return dossiers
      .filter((d) => d.status !== "termine")
      .filter((d) => CMA_CATEGORIES.includes(d.category))
      .filter((d) => !query || (d.student_name || "").toLowerCase().includes(query))
      .slice(0, 30);
  }, [dossiers, q]);

  const checkTheorique = async (dossierId) => {
    setChecking(dossierId);
    try {
      const { data } = await api.post(`/dossiers/${dossierId}/exam-theorique/check`);
      if (data.ok) toast.success("Dossier prêt pour l'examen théorique.");
      else toast.warning(`Éléments manquants envoyés à l'apprenant : ${data.missing.join(", ")}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setChecking(null);
    }
  };

  const openDetail = async (id) => {
    const { data } = await api.get(`/dossiers/${id}`);
    setSelected(data);
  };

  return (
    <div className="space-y-6" data-testid="exams-page">
      <div>
        <p className="overline">Suivi</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Examens</h1>
        <p className="text-gray-500 mt-2">Vérification de l'examen théorique, jour d'examen et suivi de l'épreuve pratique.</p>
      </div>

      <Card className="p-5 border border-gray-200 rounded-md shadow-none">
        <h2 className="font-display font-bold mb-3 flex items-center gap-2"><ClipboardText size={18} /> Vérifier l'examen théorique</h2>
        <div className="relative max-w-md mb-3">
          <MagnifyingGlass size={16} className="absolute left-3 top-3 text-gray-400" />
          <Input placeholder="Rechercher un apprenant..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="exams-search" />
        </div>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {openable.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-md px-3 py-2 text-sm" data-testid={`exam-check-row-${d.id}`}>
              <div className="min-w-0">
                <p className="font-medium truncate">{d.student_name}</p>
                <p className="text-xs text-gray-500 truncate">{d.formation_title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.exam_theorique_ready && <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Prêt</Badge>}
                <Button size="sm" variant="outline" disabled={checking === d.id} onClick={() => checkTheorique(d.id)} data-testid={`exam-check-btn-${d.id}`}>
                  {checking === d.id ? "..." : "Vérifier"}
                </Button>
              </div>
            </div>
          ))}
          {!openable.length && <p className="text-sm text-gray-400 text-center py-6">Aucun dossier.</p>}
        </div>
      </Card>

      <Card className="p-5 border border-gray-200 rounded-md shadow-none">
        <h2 className="font-display font-bold mb-3 flex items-center gap-2"><ThumbsUp size={18} className="text-[#0B7238]" /> Apprenants ayant réussi l'examen théorique</h2>
        <div className="space-y-1">
          {passed.map((d) => (
            <button
              key={d.id}
              onClick={() => openDetail(d.id)}
              className="w-full flex items-center justify-between gap-3 border border-gray-100 rounded-md px-3 py-2.5 text-sm hover:border-[#d4af37] text-left"
              data-testid={`exam-passed-row-${d.id}`}
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{d.student_name}</p>
                <p className="text-xs text-gray-500 truncate">{d.formation_title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.exam_pratique_result === "reussi" && <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Diplômé</Badge>}
                {d.exam_pratique_result === "echoue" && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">À repasser</Badge>}
                {d.exam_pratique_date && !d.exam_pratique_result && <Badge variant="outline">Pratique le {d.exam_pratique_date}</Badge>}
                {!d.exam_pratique_date && <Badge variant="outline">À classer</Badge>}
              </div>
            </button>
          ))}
          {!passed.length && <p className="text-sm text-gray-400 text-center py-6">Aucun apprenant n'a encore déclaré avoir réussi.</p>}
        </div>
      </Card>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-lg" data-testid="exam-detail-dialog">
          {selected && <ExamDetail dossier={selected} onChange={(d) => { setSelected(d); load(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExamDetail({ dossier, onChange }) {
  const [jourDate, setJourDate] = useState(dossier.exam_jour_date || "");
  const [pratiqueDate, setPratiqueDate] = useState(dossier.exam_pratique_date || "");
  const [department, setDepartment] = useState(dossier.exam_pratique_department || "");
  const [nextExamDate, setNextExamDate] = useState("");
  const [saving, setSaving] = useState(false);

  const saveJour = async () => {
    if (!jourDate) return toast.error("Renseignez une date");
    setSaving(true);
    try {
      const { data } = await api.put(`/dossiers/${dossier.id}/exam-jour`, { date: jourDate });
      onChange(data);
      toast.success("Jour d'examen enregistré");
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    finally { setSaving(false); }
  };

  const confirmJour = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/dossiers/${dossier.id}/exam-jour/confirm`);
      onChange(data);
      toast.success("Jour d'examen confirmé — l'apprenant a été notifié");
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    finally { setSaving(false); }
  };

  const savePratique = async () => {
    if (!pratiqueDate) return toast.error("Renseignez une date");
    setSaving(true);
    try {
      const { data } = await api.put(`/dossiers/${dossier.id}/exam-pratique`, { date: pratiqueDate, department: department || null });
      onChange(data);
      toast.success("Date d'examen pratique enregistrée — l'apprenant a été notifié");
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    finally { setSaving(false); }
  };

  const recordResult = async (result) => {
    setSaving(true);
    try {
      const { data } = await api.post(`/dossiers/${dossier.id}/exam-pratique/result`, { result, next_exam_date: result === "echoue" ? (nextExamDate || null) : null });
      onChange(data);
      toast.success(result === "reussi" ? "Résultat enregistré — dossier terminé !" : "Résultat enregistré — réinscription envoyée à l'apprenant");
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    finally { setSaving(false); }
  };

  return (
    <>
      <DialogHeader><DialogTitle className="font-display">{dossier.student_name} — {dossier.formation_title}</DialogTitle></DialogHeader>

      <div className="space-y-5 mt-2">
        <div>
          <p className="overline mb-2 flex items-center gap-1"><CalendarCheck size={14} /> Jour d'examen (reçu de l'agence)</p>
          <div className="flex items-center gap-2">
            <Input type="date" value={jourDate} onChange={(e) => setJourDate(e.target.value)} className="w-44" />
            <Button size="sm" variant="outline" disabled={saving} onClick={saveJour}>Enregistrer</Button>
            {jourDate && !dossier.exam_jour_confirmed && (
              <Button size="sm" disabled={saving} onClick={confirmJour} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Confirmer</Button>
            )}
            {dossier.exam_jour_confirmed && <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Confirmé</Badge>}
          </div>
          <a href={EXAMENT3P_URL} target="_blank" rel="noreferrer" className="text-xs text-[#0a0a0a] hover:underline inline-flex items-center gap-1 mt-2">
            Lien résultat (exament3p.fr) <ArrowSquareOut size={11} />
          </a>
        </div>

        <div className="border-t pt-4">
          <p className="overline mb-2">Examen pratique</p>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Input type="date" value={pratiqueDate} onChange={(e) => setPratiqueDate(e.target.value)} className="w-44" />
            <Input placeholder="Département" value={department} onChange={(e) => setDepartment(e.target.value)} className="w-32" />
            <Button size="sm" variant="outline" disabled={saving} onClick={savePratique}>Enregistrer</Button>
          </div>

          {!dossier.exam_pratique_result ? (
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={saving} onClick={() => recordResult("reussi")} className="bg-[#0B7238] hover:bg-[#0a6230] text-white">
                <CheckCircle size={14} className="mr-1" /> Réussi
              </Button>
              <div className="flex items-center gap-2">
                <Input type="date" placeholder="Prochaine date CMA" value={nextExamDate} onChange={(e) => setNextExamDate(e.target.value)} className="w-40" title="Prochaine date d'examen (si échec)" />
                <Button size="sm" variant="outline" disabled={saving} onClick={() => recordResult("echoue")} className="border-red-300 text-red-600 hover:bg-red-50">
                  <Warning size={14} className="mr-1" /> Échoué
                </Button>
              </div>
            </div>
          ) : (
            <Badge className={dossier.exam_pratique_result === "reussi" ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>
              {dossier.exam_pratique_result === "reussi" ? "Réussi" : "Échoué — réinscription envoyée"}
            </Badge>
          )}
        </div>
      </div>
    </>
  );
}
