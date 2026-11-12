import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadSimple, DownloadSimple, PencilSimple, Plus, Trash, Archive } from "@phosphor-icons/react";
import { formatDateFR } from "@/lib/dateFormat";
import { toast } from "sonner";
import { DocumentsList, downloadPdf } from "@/components/caces/CacesExamPanel";

// Page CACES, côté équipe (demande du 2026-11-10) — backend routers/caces_exam.py :
// - « Questions théoriques » : les 4 grilles vrai/faux, saisies ici ou
//   importées d'un fichier Excel/CSV ;
// - « Sessions » : jour de l'examen théorique (déverrouille les
//   questionnaires du testeur ce jour-là) et archives de chaque session.

const errorDetail = (e, fallback) => e.response?.data?.detail || fallback;

export function QuestionBankTab() {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const load = () => api.get("/caces/theorie/grilles").then((r) => setData(r.data)).catch(() => toast.error("Grilles non chargées"));
  useEffect(() => { load(); }, []);

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data: res } = await api.post("/caces/theorie/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Import réussi : " + Object.entries(res.grilles).map(([g, n]) => `grille ${g} (${n} questions)`).join(", "));
      load();
    } catch (err) {
      toast.error(errorDetail(err, "Import impossible"), { duration: 12000 });
    } finally {
      setImporting(false);
    }
  };

  if (!data) return <p className="text-sm text-gray-400">Chargement…</p>;
  return (
    <div className="space-y-4">
      <Card className="p-4 border border-gray-200 shadow-none text-sm text-gray-600 space-y-2">
        <p>
          4 grilles de questions vrai/faux (recommandation R.489, annexe A3/1 : 100 questions par grille — 15 en
          connaissances générales, 25 en technologie, 10 en abaque, 50 en exploitation). Le jour de l'examen, le testeur
          imprime une copie par candidat : grille tirée au sort, questions dans un ordre aléatoire.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={importing} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
            <UploadSimple size={14} className="mr-1" /> {importing ? "Import…" : "Importer un fichier (Excel / CSV)"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadPdf("/caces/theorie/modele.xlsx", "modele_questions_caces_r489.xlsx")}>
            <DownloadSimple size={14} className="mr-1" /> Modèle de fichier
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={onImport} />
        </div>
        <p className="text-xs text-gray-400">Chaque grille présente dans le fichier remplace la grille existante. Rien n'est enregistré si une ligne est invalide.</p>
      </Card>
      <div className="grid sm:grid-cols-2 gap-3">
        {data.grilles.map((g) => {
          const complete = data.themes.every((t) => g.par_theme[t.key] === t.bareme);
          return (
            <Card key={g.numero} className="p-4 border border-gray-200 shadow-none" data-testid={`caces-grille-${g.numero}`}>
              <div className="flex items-center justify-between">
                <p className="font-display font-bold">Grille {g.numero}</p>
                <Badge className={g.nb_questions === 0 ? "bg-gray-100 text-gray-600 hover:bg-gray-100" : complete ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>
                  {g.nb_questions} question(s)
                </Badge>
              </div>
              <div className="mt-2 space-y-0.5">
                {data.themes.map((t) => (
                  <p key={t.key} className={`text-xs ${g.par_theme[t.key] === t.bareme ? "text-gray-600" : "text-amber-700"}`}>
                    {t.label} : {g.par_theme[t.key]} / {t.bareme}
                  </p>
                ))}
              </div>
              {g.revue && g.nb_questions > 0 && (
                <p className="text-xs mt-2" data-testid={`caces-grille-revue-${g.numero}`}>
                  Revue du formateur : <span className="text-green-700 font-medium">{g.revue.valide} validée(s)</span>
                  {" · "}<span className={g.revue.a_corriger ? "text-red-700 font-medium" : "text-gray-500"}>{g.revue.a_corriger} à corriger</span>
                  {" · "}<span className="text-gray-500">{g.revue.a_revoir} à revoir</span>
                </p>
              )}
              {g.updated_at && <p className="text-xs text-gray-400 mt-2">Modifiée le {formatDateFR(g.updated_at)}{g.updated_by ? ` par ${g.updated_by}` : ""}</p>}
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(g.numero)}>
                <PencilSimple size={14} className="mr-1" /> Voir / modifier
              </Button>
            </Card>
          );
        })}
      </div>
      {editing && <GridEditor numero={editing} themes={data.themes} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function GridEditor({ numero, themes, onClose, onSaved }) {
  const [questions, setQuestions] = useState(null);
  const [saving, setSaving] = useState(false);
  const [onlyToFix, setOnlyToFix] = useState(false);
  const nbToFix = (questions || []).filter((q) => q.revue?.statut === "a_corriger").length;

  useEffect(() => {
    api.get(`/caces/theorie/grilles/${numero}`).then((r) => setQuestions(r.data.questions)).catch(() => toast.error("Grille non chargée"));
  }, [numero]);

  const update = (i, patch) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const add = () => setQuestions((qs) => [...qs, { theme: "generales", enonce: "", reponse: true }]);
  const remove = (i) => setQuestions((qs) => qs.filter((_, j) => j !== i));

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/caces/theorie/grilles/${numero}`, { questions });
      toast.success(`Grille ${numero} enregistrée`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorDetail(e, "Grille non enregistrée"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Grille {numero} — {questions?.length ?? 0} question(s)</DialogTitle></DialogHeader>
        {questions === null ? <p className="text-sm text-gray-400">Chargement…</p> : (
          <div className="space-y-2">
            {nbToFix > 0 && (
              <label className="flex items-center gap-2 text-sm text-red-700">
                <input type="checkbox" checked={onlyToFix} onChange={(e) => setOnlyToFix(e.target.checked)} />
                Afficher seulement les {nbToFix} question(s) signalée(s) « à corriger » par le formateur
              </label>
            )}
            {questions.map((q, i) => (onlyToFix && q.revue?.statut !== "a_corriger") ? null : (
              <div key={i} className="flex gap-2 items-start border-b border-gray-100 pb-2">
                <span className="text-xs font-semibold w-7 pt-2">{i + 1}.</span>
                <div className="flex-1 space-y-1">
                  <Textarea rows={2} value={q.enonce} onChange={(e) => update(i, { enonce: e.target.value })} placeholder="Affirmation" />
                  <div className="flex flex-wrap gap-2">
                    <Select value={q.theme} onValueChange={(v) => update(i, { theme: v })}>
                      <SelectTrigger className="w-72 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{themes.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={q.reponse ? "V" : "F"} onValueChange={(v) => update(i, { reponse: v === "V" })}>
                      <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="V">Vrai</SelectItem><SelectItem value="F">Faux</SelectItem></SelectContent>
                    </Select>
                    {q.revue?.statut === "valide" && <Badge className="bg-green-100 text-green-700 hover:bg-green-100 self-center">Validée par {q.revue.by_name}</Badge>}
                    {q.revue?.statut === "a_corriger" && <Badge className="bg-red-100 text-red-700 hover:bg-red-100 self-center">À corriger</Badge>}
                  </div>
                  {q.revue?.statut === "a_corriger" && (
                    <p className="text-xs text-red-700 bg-red-50 rounded px-2 py-1">
                      {q.revue.by_name} : {q.revue.commentaire} <span className="text-red-400">— une fois modifiée, la question repasse « à revoir » pour le formateur.</span>
                    </p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(i)} aria-label="Supprimer"><Trash size={14} /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={add}><Plus size={14} className="mr-1" /> Ajouter une question</Button>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving || !questions} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Enregistrer la grille</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CacesSessionsTab() {
  const [sessions, setSessions] = useState(null);
  const [archivesFor, setArchivesFor] = useState(null);
  const [docs, setDocs] = useState([]);

  const load = () => api.get("/caces/sessions").then((r) => setSessions(r.data)).catch(() => toast.error("Sessions non chargées"));
  useEffect(() => { load(); }, []);

  const setDate = async (s, date) => {
    try {
      await api.put(`/caces/sessions/${s.id}/date-examen`, { date });
      toast.success("Jour de l'examen enregistré");
      load();
    } catch (e) {
      toast.error(errorDetail(e, "Date non enregistrée"));
    }
  };

  const openArchives = async (s) => {
    setArchivesFor(s);
    setDocs([]);
    try {
      const { data } = await api.get("/caces/documents", { params: { stage_id: s.id } });
      setDocs(data);
    } catch {
      toast.error("Archives non chargées");
    }
  };

  if (!sessions) return <p className="text-sm text-gray-400">Chargement…</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500">
        Le testeur est un formateur de la session avec le titre « Testeur CACES » (il doit être différent du formateur).
        Les questionnaires ne s'ouvrent pour lui que le jour de l'examen.
      </p>
      {!sessions.length && <p className="text-sm text-gray-500">Aucune session CACES.</p>}
      {sessions.map((s) => (
        <Card key={s.id} className="p-4 border border-gray-200 shadow-none" data-testid={`caces-session-${s.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium">{s.formation_titre}</p>
              <p className="text-xs text-gray-500">
                {formatDateFR(s.date_debut)} → {formatDateFR(s.date_fin)} · {s.lieu_ville} ·{" "}
                <span className={s.nb_candidats > s.max_candidats ? "text-red-600 font-semibold" : ""}>{s.nb_candidats}/{s.max_candidats} candidats</span>
              </p>
              <p className={`text-xs ${s.testeurs.length ? "text-gray-600" : "text-red-600"}`}>
                Testeur : {s.testeurs.length ? s.testeurs.join(", ") : "aucun formateur « Testeur CACES » affecté"}
                {s.formateurs.length ? ` · Formateur(s) : ${s.formateurs.join(", ")}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-gray-600 flex items-center gap-1">
                Examen théorique le
                <Input type="date" className="w-40 h-8" value={s.date_examen || ""} min={s.date_debut} max={s.date_fin}
                  onChange={(e) => e.target.value && setDate(s, e.target.value)} />
              </label>
              <Button size="sm" variant="outline" onClick={() => openArchives(s)}><Archive size={14} className="mr-1" /> Archives</Button>
            </div>
          </div>
        </Card>
      ))}
      <Dialog open={!!archivesFor} onOpenChange={(o) => { if (!o) setArchivesFor(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Archives — {archivesFor?.formation_titre} ({formatDateFR(archivesFor?.date_debut)})</DialogTitle></DialogHeader>
          <DocumentsList documents={docs} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
