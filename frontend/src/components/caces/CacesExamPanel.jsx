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
                        {r.passed ? "Réussie" : "Échouée"} — {r.pct} %
                      </Badge>
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

function CorrectionDialog({ stage, candidat, onClose, onSaved }) {
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
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCategory(""); setGrille(null); setNotes({}); setChariot(""); setObservations(""); }, [candidat]);
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

const EMPTY_ADEQUATION = {
  categories: "", chariot_type: "", chariot_marque: "", chariot_modele: "", chariot_numero: "",
  chariot_capacite: "", vgp_date: "", observations: "",
};

function AdequationForm({ stage, state, isTesteur, onSaved }) {
  const [form, setForm] = useState(EMPTY_ADEQUATION);
  const [checks, setChecks] = useState({});
  const [saving, setSaving] = useState(false);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const todayEntries = state.adequations.filter((a) => a.date === today);
  const allOk = state.checklist.every((c) => checks[c.key]);
  const groups = state.checklist.reduce((acc, c) => { (acc[c.groupe] = acc[c.groupe] || []).push(c); return acc; }, {});

  const save = async (conforme) => {
    setSaving(true);
    try {
      await api.post(`/caces/sessions/${stage.id}/adequation`, { ...form, vgp_date: form.vgp_date || null, checks, conforme });
      toast.success("Examen d'adéquation enregistré et archivé");
      setForm(EMPTY_ADEQUATION);
      setChecks({});
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
          ? `${todayEntries.length} chariot(s) vérifié(s) aujourd'hui : ${todayEntries.map((a) => a.chariot_modele || a.chariot_numero).join(", ")}`
          : "À faire avant les épreuves pratiques : vérifiez chaque chariot utilisé aujourd'hui."}
      </div>
      {isTesteur && (
        <Card className="p-4 border border-gray-200 shadow-none space-y-3">
          <div className="grid sm:grid-cols-3 gap-2">
            <Input placeholder="Catégorie(s) testée(s)" value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} />
            <Input placeholder="Type (frontal, gerbeur…)" value={form.chariot_type} onChange={(e) => setForm({ ...form, chariot_type: e.target.value })} />
            <Input placeholder="Marque" value={form.chariot_marque} onChange={(e) => setForm({ ...form, chariot_marque: e.target.value })} />
            <Input placeholder="Modèle" value={form.chariot_modele} onChange={(e) => setForm({ ...form, chariot_modele: e.target.value })} />
            <Input placeholder="N° de série / identification" value={form.chariot_numero} onChange={(e) => setForm({ ...form, chariot_numero: e.target.value })} />
            <Input placeholder="Capacité / hauteur de levée" value={form.chariot_capacite} onChange={(e) => setForm({ ...form, chariot_capacite: e.target.value })} />
          </div>
          <label className="text-xs text-gray-600 flex items-center gap-2">
            Date de la dernière vérification générale périodique
            <Input type="date" className="w-44" value={form.vgp_date} onChange={(e) => setForm({ ...form, vgp_date: e.target.value })} />
          </label>
          {Object.entries(groups).map(([groupe, items]) => (
            <div key={groupe}>
              <p className="text-sm font-semibold mb-1">{groupe}</p>
              {items.map((c) => (
                <label key={c.key} className="flex items-start gap-2 py-1 text-sm cursor-pointer">
                  <Checkbox checked={!!checks[c.key]} onCheckedChange={(v) => setChecks((x) => ({ ...x, [c.key]: !!v }))} className="mt-0.5" />
                  {c.label}
                </label>
              ))}
            </div>
          ))}
          <Textarea placeholder="Observations" value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={saving} onClick={() => save(false)} className="text-red-700">Chariot non apte</Button>
            <Button disabled={saving || !allOk} onClick={() => save(true)} className="bg-[#0B7238] hover:bg-[#095c2d] text-white" data-testid="caces-adequation-ok">
              <CheckCircle size={14} className="mr-1" /> Chariot apte — enregistrer
            </Button>
          </div>
        </Card>
      )}
      <div className="space-y-1">
        {state.adequations.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 py-2 text-sm">
            <span>{formatDateFR(a.date)} — {[a.chariot_marque, a.chariot_modele, a.chariot_numero].filter(Boolean).join(" ")} — {a.testeur_name}</span>
            <span className="flex items-center gap-2">
              <Badge className={a.conforme ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>{a.conforme ? "Apte" : "Non apte"}</Badge>
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
