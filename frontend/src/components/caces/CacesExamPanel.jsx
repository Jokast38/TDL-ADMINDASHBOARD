import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FilePdf, Lock, Shuffle, CheckCircle, XCircle, ClipboardText, SteeringWheel, Archive } from "@phosphor-icons/react";
import { formatDateFR } from "@/lib/dateFormat";
import { toast } from "sonner";

// Épreuves CACES® R.489 dans l'espace du testeur (demande du 2026-11-10) —
// backend : routers/caces_exam.py, barèmes : core/caces_grilles.py.
// - Théorie : questionnaires papier tirés au sort (grille + ordre des
//   questions), générés et téléchargeables le jour de l'examen uniquement,
//   puis correction en cochant les numéros faux de chaque copie.
// - Pratique : grille de l'annexe A3/2 de la catégorie, notée critère par critère.
// - Examen d'adéquation du chariot, chaque jour de test.
// Tous les documents produits sont archivés au nom du testeur.

const errorDetail = async (e, fallback) => {
  const data = e.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).detail || fallback; } catch { return fallback; }
  }
  return data?.detail || fallback;
};

export async function downloadPdf(url, filename) {
  try {
    const res = await api.get(url, { responseType: "blob" });
    const href = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
  } catch (e) {
    toast.error(await errorDetail(e, "Téléchargement impossible"));
  }
}

const DOC_LABELS = {
  questionnaires: "Questionnaires", corriges: "Corrigés", resultat_theorie: "Résultat théorie",
  grille_pratique: "Grille pratique", adequation: "Examen d'adéquation",
};

export default function CacesExamPanel({ stage }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState(null);
  const [practicalFor, setPracticalFor] = useState(null);

  const load = () => api.get(`/caces/sessions/${stage.id}/examen`).then((r) => setState(r.data)).catch(() => setState({ is_caces: false }));
  useEffect(() => { load(); }, [stage.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state?.is_caces) return null;
  const { candidats = [], jour_examen: jourExamen, is_testeur: isTesteur } = state;
  const nbCopies = candidats.filter((c) => c.copie).length;

  const generate = async (regenerer = false) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/caces/sessions/${stage.id}/theorie/generer`, { regenerer });
      setState(data);
      toast.success("Questionnaires générés — téléchargez-les pour les imprimer");
    } catch (e) {
      toast.error(await errorDetail(e, "Génération impossible"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-gray-200 space-y-4" data-testid="caces-exam-panel">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="overline">CACES® R.489</p>
          <h3 className="font-display text-xl font-bold">Épreuves de la session</h3>
          <p className="text-xs text-gray-500 mt-1">
            Examen théorique le {formatDateFR(state.date_examen)} · {candidats.length}/{state.max_candidats} candidat(s)
          </p>
        </div>
        {!isTesteur && (
          <Badge variant="outline" className="text-amber-700 border-amber-300">
            Saisie réservée au testeur CACES de la session
          </Badge>
        )}
      </div>
      {candidats.length > state.max_candidats && (
        <p className="text-xs text-red-600">Attention : plus de {state.max_candidats} candidats sont inscrits sur cette session.</p>
      )}

      <Tabs defaultValue="theorie">
        <TabsList className="flex-wrap">
          <TabsTrigger value="theorie"><ClipboardText size={14} className="mr-1" /> Théorie</TabsTrigger>
          <TabsTrigger value="pratique"><SteeringWheel size={14} className="mr-1" /> Pratique</TabsTrigger>
          <TabsTrigger value="adequation"><CheckCircle size={14} className="mr-1" /> Examen d'adéquation</TabsTrigger>
          <TabsTrigger value="documents"><Archive size={14} className="mr-1" /> Documents ({state.documents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="theorie" className="space-y-3">
          {!jourExamen ? (
            <Card className="p-4 border border-gray-200 bg-gray-50 shadow-none flex items-center gap-2 text-sm text-gray-600">
              <Lock size={16} /> Questionnaires disponibles uniquement le jour de l'examen ({formatDateFR(state.date_examen)}).
            </Card>
          ) : !state.grilles_pretes.length ? (
            <p className="text-sm text-amber-700">Aucune grille de questions n'est encore saisie : l'équipe doit les ajouter sur la page CACES.</p>
          ) : isTesteur && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => generate(false)} disabled={busy} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="caces-generate">
                <Shuffle size={14} className="mr-1" /> {nbCopies ? "Générer les copies manquantes" : "Générer les questionnaires"}
              </Button>
              {nbCopies > 0 && (
                <>
                  <Button variant="outline" onClick={() => downloadPdf(`/caces/sessions/${stage.id}/theorie/questionnaires.pdf`, "questionnaires_caces.pdf")}>
                    <FilePdf size={14} className="mr-1" /> Questionnaires à imprimer
                  </Button>
                  <Button variant="outline" onClick={() => downloadPdf(`/caces/sessions/${stage.id}/theorie/corriges.pdf`, "corriges_caces.pdf")}>
                    <FilePdf size={14} className="mr-1" /> Corrigés (testeur)
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => {
                    if (window.confirm("Refaire le tirage au sort des copies non corrigées ? Les copies déjà imprimées ne seront plus valables.")) generate(true);
                  }}>
                    Refaire le tirage
                  </Button>
                </>
              )}
            </div>
          )}
          <div className="space-y-2">
            {candidats.map((c) => {
              const r = c.copie?.resultat;
              return (
                <Card key={c.inscription_id} className="p-3 border border-gray-200 shadow-none flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{c.student_name}</p>
                    <p className="text-xs text-gray-500">
                      {c.copie ? `Copie n°${c.copie.numero_copie} · grille ${c.copie.grille}` : "Pas encore de copie"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r && (
                      <Badge className={r.passed ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
                        {r.passed ? "Réussie" : "Échouée"} — {r.bonnes}/{r.total}
                      </Badge>
                    )}
                    {c.copie?.copie_pdf && (
                      <Button size="sm" variant="ghost" onClick={() => downloadPdf(`/caces/sessions/${stage.id}/theorie/copies/${c.copie.id}/copie.pdf`, `copie_corrigee_${c.copie.numero_copie}.pdf`)}>
                        <FilePdf size={14} className="mr-1" /> Copie corrigée
                      </Button>
                    )}
                    {isTesteur && c.copie && (
                      <Button size="sm" variant="outline" onClick={() => setCorrecting(c)} data-testid={`caces-correct-${c.inscription_id}`}>
                        {r ? "Modifier la correction" : "Corriger la copie"}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
            {!candidats.length && <p className="text-sm text-gray-500">Aucun candidat inscrit.</p>}
          </div>
        </TabsContent>

        <TabsContent value="pratique" className="space-y-2">
          {candidats.map((c) => (
            <Card key={c.inscription_id} className="p-3 border border-gray-200 shadow-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-sm">{c.student_name}</p>
                {isTesteur && (
                  <Button size="sm" variant="outline" onClick={() => setPracticalFor(c)} data-testid={`caces-practical-${c.inscription_id}`}>
                    <SteeringWheel size={14} className="mr-1" /> Noter une épreuve pratique
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {c.pratiques.map((p) => (
                  <Badge key={p.id} className={p.passed ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
                    Cat. {p.category} : {p.passed ? "réussie" : "échouée"} ({p.total}/100) — {formatDateFR(p.date)}
                  </Badge>
                ))}
                {!c.pratiques.length && <span className="text-xs text-gray-400">Aucune épreuve pratique notée</span>}
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="adequation">
          <AdequationForm stage={stage} state={state} isTesteur={isTesteur} onSaved={load} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsList documents={state.documents} />
        </TabsContent>
      </Tabs>

      <CorrectionDialog stage={stage} candidat={correcting} onClose={() => setCorrecting(null)} onSaved={load} />
      <PracticalDialog stage={stage} candidat={practicalFor} categories={state.categories} onClose={() => setPracticalFor(null)} onSaved={load} />
    </div>
  );
}

export function DocumentsList({ documents }) {
  if (!documents?.length) return <p className="text-sm text-gray-500">Aucun document archivé.</p>;
  return (
    <div className="space-y-1">
      {documents.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 py-2">
          <div className="min-w-0">
            <p className="text-sm truncate">{d.titre}</p>
            <p className="text-xs text-gray-500">
              {DOC_LABELS[d.type] || d.type} · {formatDateFR(d.date)} · {d.testeur_name}
              {d.formation_titre ? ` · ${d.formation_titre}` : ""}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => downloadPdf(`/caces/documents/${d.id}/download`, `${d.date}_${d.type}.pdf`)}>
            <FilePdf size={14} className="mr-1" /> PDF
          </Button>
        </div>
      ))}
    </div>
  );
}

function CorrectionDialog(props) {
  if (!props.candidat) return null;
  return props.candidat.copie?.officielle ? <TrueFalseCorrection {...props} /> : <ErrorsCorrection {...props} />;
}

// Copie d'une grille officielle R.489 (2026-11-19) : le testeur recopie les
// cases cochées par le candidat, VRAI ou FAUX, question par question, dans
// l'ordre de la grille papier ; les erreurs et la note sont calculées, et la
// copie corrigée est regénérée en PDF (croix du candidat, erreurs entourées).
function TrueFalseCorrection({ stage, candidat, onClose, onSaved }) {
  const copie = candidat.copie;
  const [grille, setGrille] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(copie?.resultat || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/caces/sessions/${stage.id}/theorie/copies/${copie.id}/grille`)
      .then((r) => { setGrille(r.data); setAnswers(r.data.reponses || {}); })
      .catch((e) => toast.error(e.response?.data?.detail || "Copie non chargée"));
  }, [stage.id, copie.id]);

  const total = (grille?.themes || []).reduce((n, t) => n + t.questions.length, 0);
  const filled = Object.values(answers).filter((v) => v === true || v === false).length;
  const set = (key, value) => setAnswers((a) => ({ ...a, [key]: a[key] === value ? null : value }));

  const save = async () => {
    if (filled < total && !window.confirm(`${total - filled} question(s) sans réponse : elles compteront comme fausses. Enregistrer quand même ?`)) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/caces/sessions/${stage.id}/theorie/copies/${copie.id}/correction`, { reponses: answers });
      setResult(data);
      toast.success(data.passed ? "Théorie réussie — copie corrigée enregistrée" : "Théorie échouée — copie corrigée enregistrée");
      onSaved();
    } catch (e) {
      toast.error(await errorDetail(e, "Correction non enregistrée"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            Correction — {candidat.student_name} (copie n°{copie.numero_copie}, grille {copie.grille})
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          Recopiez les cases cochées par le candidat sur sa grille papier : <b>VRAI</b> ou <b>FAUX</b> pour chaque question.
          {" "}{filled}/{total} réponse(s) saisie(s). Une question laissée vide compte comme fausse.
        </p>
        {!grille ? <p className="text-sm text-gray-400">Chargement…</p> : (
          <div className="space-y-4" data-testid="caces-correction-vf">
            {grille.themes.map((t) => (
              <div key={t.num}>
                <p className="text-xs font-semibold bg-[#17375e] text-white px-2 py-1 rounded-t">THÈME {t.num} : {t.label.toUpperCase()}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 border border-t-0 border-gray-200 rounded-b p-2">
                  {t.questions.map((q) => (
                    <div key={q.key} className="flex items-center justify-between gap-2 py-0.5 border-b border-dashed border-gray-100">
                      <span className="text-sm font-medium w-8 text-right">{q.numero}</span>
                      <div className="flex gap-1">
                        {[[true, "VRAI"], [false, "FAUX"]].map(([v, label]) => (
                          <button key={label} type="button" onClick={() => set(q.key, v)} data-testid={`caces-vf-${q.key}-${label}`}
                            className={`text-[11px] font-semibold w-12 h-7 rounded border ${answers[q.key] === v
                              ? "bg-[#0052CC] text-white border-[#0052CC]" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {result && (
          <Card className={`p-3 shadow-none border ${result.passed ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
            <p className="font-medium text-sm">{result.passed ? "Favorable" : "Défavorable"} — {result.bonnes}/{result.total}</p>
            {Object.values(result.par_theme || {}).map((t) => (
              <p key={t.label} className="text-xs">{t.label} : {t.bonnes}/{t.total}{t.pct !== null && t.pct < 50 ? " — sous la moyenne" : ""}</p>
            ))}
            <Button size="sm" variant="outline" className="mt-2"
              onClick={() => downloadPdf(`/caces/sessions/${stage.id}/theorie/copies/${copie.id}/copie.pdf`, `copie_corrigee_${copie.numero_copie}.pdf`)}>
              <FilePdf size={14} className="mr-1" /> Copie corrigée (PDF)
            </Button>
          </Card>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          <Button onClick={save} disabled={saving || !grille} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="caces-correction-save">
            Enregistrer la correction
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ErrorsCorrection({ stage, candidat, onClose, onSaved }) {
  const copie = candidat?.copie;
  const [wrong, setWrong] = useState(new Set());
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const total = copie?.nb_questions || 0;

  useEffect(() => {
    setWrong(new Set(copie?.resultat?.erreurs || []));
    setResult(copie?.resultat || null);
  }, [copie]);

  if (!candidat) return null;
  const toggle = (n) => setWrong((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/caces/sessions/${stage.id}/theorie/copies/${copie.id}/correction`, { erreurs: [...wrong] });
      setResult(data);
      toast.success(data.passed ? "Théorie réussie — résultat enregistré" : "Théorie échouée — résultat enregistré");
      onSaved();
    } catch (e) {
      toast.error(await errorDetail(e, "Correction non enregistrée"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Correction — {candidat.student_name} (copie n°{copie.numero_copie})</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          Avec le corrigé de cette copie, touchez les numéros des réponses <b>fausses ou absentes</b>. {wrong.size} erreur(s) — {total - wrong.size}/{total} bonnes réponses.
        </p>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
            <button
              key={n} type="button" onClick={() => toggle(n)}
              className={`h-9 rounded text-sm font-medium border ${wrong.has(n) ? "bg-red-600 text-white border-red-600" : "bg-white border-gray-200 hover:bg-gray-50"}`}
            >
              {n}
            </button>
          ))}
        </div>
        {result && (
          <Card className={`p-3 shadow-none border ${result.passed ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
            <p className="font-medium text-sm">{result.passed ? "Réussite" : "Échec"} — {result.pct} % ({result.bonnes}/{result.total})</p>
            {Object.values(result.par_theme || {}).map((t) => (
              <p key={t.label} className="text-xs">{t.label} : {t.bonnes}/{t.total}{t.pct !== null && t.pct < 50 ? " — sous la moyenne" : ""}</p>
            ))}
          </Card>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          <Button onClick={save} disabled={saving} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Enregistrer la correction</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PracticalDialog({ stage, candidat, categories, onClose, onSaved }) {
  const [category, setCategory] = useState("");
  const [grille, setGrille] = useState(null);
  const [notes, setNotes] = useState({});
  const [chariot, setChariot] = useState("");
  const [observations, setObservations] = useState("");
  // Fiche officielle TDL : horaires et temps des 3 séquences (prise de poste, conduite + manœuvres, fin de poste).
  const [horaires, setHoraires] = useState({ heure_debut: "", heure_fin: "", T1: "", T2: "", T3: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCategory(""); setGrille(null); setNotes({}); setChariot(""); setObservations("");
    setHoraires({ heure_debut: "", heure_fin: "", T1: "", T2: "", T3: "" });
  }, [candidat]);
  useEffect(() => {
    if (!category) return;
    api.get(`/caces/grilles-pratiques/${category}`).then((r) => { setGrille(r.data); setNotes({}); }).catch(() => toast.error("Grille non chargée"));
  }, [category]);

  // Calcul en direct, mêmes règles que le serveur (core/caces_grilles.py:score_pratique).
  const live = useMemo(() => {
    if (!grille) return null;
    return grille.volets.map((v, vi) => {
      let total = 0;
      const zeros = [];
      const themes = v.themes.map((t) => {
        let note = 0;
        t.points.forEach((p) => {
          const ps = p.criteres.reduce((s, c) => s + (Number(notes[`${vi}:${c.id}`]) || 0), 0);
          if (ps <= 0) zeros.push(p.n);
          note += ps;
        });
        total += note;
        return { titre: t.titre, note, max: t.max, ok: note >= t.max / 2 };
      });
      return { total, themes, zeros, passed: total >= 70 && themes.every((t) => t.ok) && !zeros.length };
    });
  }, [grille, notes]);

  if (!candidat) return null;
  const setNote = (key, max, value) => {
    const v = value === "" ? "" : Math.max(0, Math.min(max, Number(value)));
    setNotes((n) => ({ ...n, [key]: v }));
  };
  const fillMax = () => {
    const all = {};
    grille.volets.forEach((v, vi) => v.themes.forEach((t) => t.points.forEach((p) => p.criteres.forEach((c) => { all[`${vi}:${c.id}`] = c.max; }))));
    setNotes(all);
  };

  const save = async () => {
    setSaving(true);
    try {
      const clean = Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, Number(v) || 0]));
      const { data } = await api.post(`/caces/sessions/${stage.id}/pratique`, {
        inscription_id: candidat.inscription_id, category, notes: clean, chariot: chariot || null, observations: observations || null,
        heure_debut: horaires.heure_debut || null, heure_fin: horaires.heure_fin || null,
        temps: { T1: horaires.T1, T2: horaires.T2, T3: horaires.T3 },
      });
      toast.success(data.passed ? `Pratique cat. ${category} réussie (${data.total}/100)` : `Pratique cat. ${category} échouée (${data.total}/100)`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(await errorDetail(e, "Évaluation non enregistrée"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Épreuve pratique — {candidat.student_name}</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="caces-practical-category"><SelectValue placeholder="Catégorie" /></SelectTrigger>
            <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>Catégorie {c}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Chariot utilisé (marque, modèle, n°)" value={chariot} onChange={(e) => setChariot(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" data-testid="caces-practical-horaires">
          <label className="text-[11px] text-gray-500">Début
            <Input type="time" value={horaires.heure_debut} onChange={(e) => setHoraires({ ...horaires, heure_debut: e.target.value })} />
          </label>
          <label className="text-[11px] text-gray-500">Fin
            <Input type="time" value={horaires.heure_fin} onChange={(e) => setHoraires({ ...horaires, heure_fin: e.target.value })} />
          </label>
          {[["T1", "T1 prise de poste"], ["T2", "T2 conduite + manœuvres"], ["T3", "T3 fin de poste"]].map(([k, label]) => (
            <label key={k} className="text-[11px] text-gray-500">{label}
              <Input placeholder="ex. 4 min" value={horaires[k]} onChange={(e) => setHoraires({ ...horaires, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        {grille && (
          <>
            <p className="text-xs text-gray-500">{grille.libelle}</p>
            <Button variant="ghost" size="sm" onClick={fillMax} className="self-start">Tout mettre au maximum, puis retirer les points</Button>
            {grille.volets.map((v, vi) => (
              <div key={vi} className="space-y-3">
                {v.titre && <p className="font-semibold text-sm">{v.titre}</p>}
                {v.themes.map((t, ti) => (
                  <div key={t.titre} className="border border-gray-200 rounded-md">
                    <div className="flex justify-between bg-gray-50 px-3 py-2 text-sm font-medium">
                      <span>{t.titre}</span>
                      <span className={live[vi].themes[ti].ok ? "text-green-700" : "text-red-600"}>{live[vi].themes[ti].note} / {t.max}</span>
                    </div>
                    {t.points.map((p) => (
                      <div key={p.n} className="px-3 py-2 border-t border-gray-100">
                        <p className={`text-xs font-semibold ${live[vi].zeros.includes(p.n) ? "text-red-600" : ""}`}>{p.n}. {p.titre}</p>
                        {p.criteres.map((c) => (
                          <div key={c.id} className="flex items-center justify-between gap-3 mt-1">
                            <p className="text-xs text-gray-700">{c.label}</p>
                            <div className="flex items-center gap-1 shrink-0">
                              <Input
                                type="number" min={0} max={c.max} step="0.5" inputMode="decimal"
                                className="w-16 h-8 text-center" value={notes[`${vi}:${c.id}`] ?? ""}
                                onChange={(e) => setNote(`${vi}:${c.id}`, c.max, e.target.value)}
                              />
                              <span className="text-xs text-gray-500 w-6">/{c.max}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
                <div className={`p-3 rounded-md text-sm font-medium ${live[vi].passed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {live[vi].passed ? <CheckCircle size={16} className="inline mr-1" /> : <XCircle size={16} className="inline mr-1" />}
                  Total {live[vi].total} / 100 {live[vi].passed ? "— réussite" : "— échec"}
                  {live[vi].zeros.length > 0 && ` (note nulle au point ${live[vi].zeros.join(", ")})`}
                </div>
              </div>
            ))}
            <Textarea placeholder="Observations (facultatif)" value={observations} onChange={(e) => setObservations(e.target.value)} />
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={!grille || saving} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Enregistrer et archiver</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Examen d'adéquation sur le document officiel TDL 4.5.2 (2026-11-19) : à
// remplir chaque jour de test, en début de journée. Le testeur coche les
// catégories du jour ; seules les vérifications de ces catégories sont
// proposées (zone d'évolution, charges, palettier, camion) avec les documents
// de chaque machine. Le document est regénéré à l'identique, cases cochées.
function AdequationForm({ stage, state, isTesteur, onSaved }) {
  const items = state.adequation_officielle || [];
  const [cases, setCases] = useState(new Set());
  const [observations, setObservations] = useState("");
  const [saving, setSaving] = useState(false);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const todayEntries = state.adequations.filter((a) => a.date === today);
  const categories = items.filter((c) => c.section === "categories");
  const selectedCats = categories.filter((c) => cases.has(c.key)).map((c) => c.categories[0]);
  const required = items.filter((c) => c.section === "documents"
    || (c.section !== "categories" && c.categories.some((cat) => selectedCats.includes(cat))));
  const missing = required.filter((c) => !cases.has(c.key));
  const sections = required.reduce((acc, c) => { (acc[c.section_label] = acc[c.section_label] || []).push(c); return acc; }, {});
  const toggle = (key) => setCases((x) => { const n = new Set(x); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const save = async (conforme) => {
    setSaving(true);
    try {
      await api.post(`/caces/sessions/${stage.id}/adequation`, { cases: [...cases], conforme, observations });
      toast.success("Examen d'adéquation enregistré — document archivé");
      setCases(new Set());
      setObservations("");
      onSaved();
    } catch (e) {
      toast.error(await errorDetail(e, "Non enregistré"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`p-3 rounded-md text-sm ${todayEntries.length ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
        {todayEntries.length
          ? `Examen d'adéquation fait aujourd'hui (${todayEntries.map((a) => a.categories || a.chariot_modele || a.chariot_numero).join(" ; ")}).`
          : "À faire chaque jour de test, en début de journée, avant les épreuves pratiques."}
      </div>
      {isTesteur && (
        <Card className="p-4 border border-gray-200 shadow-none space-y-4" data-testid="caces-adequation-form">
          <div>
            <p className="text-sm font-semibold mb-1">1. Catégories testées aujourd'hui</p>
            <div className="grid sm:grid-cols-2 gap-x-4">
              {categories.map((c) => (
                <label key={c.key} className="flex items-start gap-2 py-1 text-sm cursor-pointer">
                  <Checkbox checked={cases.has(c.key)} onCheckedChange={() => toggle(c.key)} className="mt-0.5" data-testid={`caces-adeq-${c.key}`} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          {selectedCats.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-1">2. Vérifications du site et du matériel ({missing.length ? `${missing.length} restante(s)` : "tout est coché"})</p>
              {Object.entries(sections).map(([label, list]) => (
                <div key={label} className="mb-2">
                  <p className="text-xs font-semibold text-[#17375e] bg-[#dbe5f1] px-2 py-0.5 rounded">{label}</p>
                  {list.map((c) => (
                    <label key={c.key} className="flex items-start gap-2 py-1 text-sm cursor-pointer">
                      <Checkbox checked={cases.has(c.key)} onCheckedChange={() => toggle(c.key)} className="mt-0.5" data-testid={`caces-adeq-${c.key}`} />
                      <span>
                        {c.categories.length > 0 && <Badge variant="outline" className="mr-1 text-[10px]">{c.categories.join(", ")}</Badge>}
                        {c.label}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
          <Textarea placeholder="Observations (facultatif)" value={observations} onChange={(e) => setObservations(e.target.value)} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={saving || !selectedCats.length} onClick={() => save(false)} className="text-red-700">
              Non adapté — enregistrer
            </Button>
            <Button disabled={saving || !selectedCats.length || missing.length > 0} onClick={() => save(true)}
              className="bg-[#0B7238] hover:bg-[#095c2d] text-white" data-testid="caces-adequation-ok">
              <CheckCircle size={14} className="mr-1" /> Adapté — enregistrer et générer le document
            </Button>
          </div>
        </Card>
      )}
      <div className="space-y-1">
        {state.adequations.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 py-2 text-sm">
            <span>{formatDateFR(a.date)} — {a.officiel ? `catégories ${a.categories}` : [a.chariot_marque, a.chariot_modele, a.chariot_numero].filter(Boolean).join(" ")} — {a.testeur_name}</span>
            <span className="flex items-center gap-2">
              <Badge className={a.conforme ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>{a.conforme ? (a.officiel ? "Adapté" : "Apte") : (a.officiel ? "Non adapté" : "Non apte")}</Badge>
              {a.document_id && (
                <Button size="sm" variant="ghost" onClick={() => downloadPdf(`/caces/documents/${a.document_id}/download`, `adequation_${a.date}.pdf`)}>
                  <FilePdf size={14} />
                </Button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
