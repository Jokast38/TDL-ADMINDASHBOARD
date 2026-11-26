import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PhotoCapture from "@/components/PhotoCapture";
import { QuestionBankTab, CacesSessionsTab } from "@/components/caces/CacesAdminTabs";
import AttestationsFormationTab from "@/components/caces/AttestationsFormationTab";
import CacesCategoriesPicker, { CACES_CATEGORIES_PROPOSEES } from "@/components/caces/CacesCategoriesPicker";
import { formatDateFR } from "@/lib/dateFormat";
import {
  MagnifyingGlass, Plus, PaperPlaneTilt, DownloadSimple, Certificate, Link as LinkIcon, PencilSimple, Camera,
} from "@phosphor-icons/react";
import { toast } from "sonner";

// Gestion CACES R.489 (demande du 2026-11-04) : saisie des épreuves
// théorique et pratique, envoi des résultats au candidat, téléchargement
// des cartes. Règles (12 mois entre les deux épreuves, échéance de la carte)
// : backend/services/caces.py.

const STATUS = {
  en_attente: { label: "En attente", cls: "bg-gray-100 text-gray-700 hover:bg-gray-100" },
  theorie_ok: { label: "Théorie réussie", cls: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  pratique_ok: { label: "Pratique réussie", cls: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  valide: { label: "CACES obtenu", cls: "bg-green-100 text-green-700 hover:bg-green-100" },
  expire: { label: "Délai de 12 mois dépassé", cls: "bg-red-100 text-red-700 hover:bg-red-100" },
};

const today = () => new Date().toISOString().slice(0, 10);
const errorDetail = (e, fallback) => e.response?.data?.detail || fallback;

function Epreuve({ label, part }) {
  if (!part) return <p className="text-xs text-gray-400">{label} : à passer</p>;
  return (
    <p className={`text-xs ${part.passed ? "text-green-700" : "text-red-600"}`}>
      {label} : {part.passed ? "réussie" : "échouée"} le {formatDateFR(part.date)}
      {part.testeur_name ? ` — ${part.testeur_name}` : ""}
    </p>
  );
}

export default function CacesAdmin() {
  const [tab, setTab] = useState("examens");
  const [attempts, setAttempts] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [candidats, setCandidats] = useState([]);
  const [testeurs, setTesteurs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [newOpen, setNewOpen] = useState(false);
  const [resultFor, setResultFor] = useState(null); // { attempt, epreuve: "theorie" | "pratique" }
  const [editCert, setEditCert] = useState(null);
  const [editAttempt, setEditAttempt] = useState(null);
  const [newCertOpen, setNewCertOpen] = useState(false);
  const [photoFor, setPhotoFor] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => {
    api.get("/caces/exam-attempts").then((r) => setAttempts(r.data)).catch(() => toast.error("Examens CACES non chargés"));
    api.get("/caces/certificates").then((r) => setCertificates(r.data)).catch(() => toast.error("Cartes CACES non chargées"));
    api.get("/caces/stats").then((r) => setStats(r.data)).catch(() => {});
    api.get("/caces/candidats").then((r) => setCandidats(r.data)).catch(() => {});
  };

  useEffect(() => {
    load();
    api.get("/caces/categories").then((r) => setCategories(r.data)).catch(() => {});
    api.get("/caces/testeurs").then((r) => setTesteurs(r.data)).catch(() => {});
  }, []);

  const match = (name, cats) =>
    (!q || (name || "").toLowerCase().includes(q.toLowerCase())) && (category === "all" || cats.includes(category));
  const shownAttempts = useMemo(() => attempts.filter((a) => match(a.student_name, [a.category])), [attempts, q, category]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownCerts = useMemo(
    () => certificates.filter((c) => match(c.student_name, (c.categories || []).map((x) => x.category))),
    [certificates, q, category], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const dossierOf = (attempt) => candidats.find((d) => d.id === attempt.dossier_id);

  const sendResults = async (attempt) => {
    setBusy(attempt.id);
    try {
      const { data } = await api.post(`/caces/exam-attempts/${attempt.id}/send-results`);
      setAttempts((list) => list.map((a) => (a.id === data.id ? { ...a, ...data } : a)));
      toast.success(data.status === "valide" ? "Résultats et carte CACES envoyés au candidat" : "Résultats envoyés au candidat");
    } catch (e) {
      toast.error(errorDetail(e, "Échec de l'envoi des résultats"));
    } finally {
      setBusy(null);
    }
  };

  const downloadCard = async (cert) => {
    setBusy(cert.id);
    try {
      const res = await api.get(`/caces/certificates/${cert.id}/card.pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `carte_caces_${(cert.student_name || "titulaire").replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Carte non générée");
    } finally {
      setBusy(null);
    }
  };

  const copyVerifLink = (cert) => {
    navigator.clipboard.writeText(`${window.location.origin}/verif-caces/${cert.id}`);
    toast.success("Lien de vérification copié");
  };

  return (
    <div className="space-y-6" data-testid="caces-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="overline">Certification</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">CACES®</h1>
          <p className="text-gray-500 mt-2">Résultats des épreuves, envoi au candidat et cartes CACES R.489.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setNewCertOpen(true)} data-testid="caces-new-cert">
            <Certificate size={16} className="mr-1" /> Nouvelle carte
          </Button>
          <Button onClick={() => setNewOpen(true)} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="caces-new-attempt">
            <Plus size={16} className="mr-1" /> Nouvel examen
          </Button>
        </div>
      </div>

      {stats && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline">{stats.total_titulaires} titulaire(s)</Badge>
          {Object.entries(stats.par_categorie).filter(([, n]) => n > 0).map(([cat, n]) => (
            <Badge key={cat} variant="outline">Cat. {cat} : {n}</Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="examens">Examens ({attempts.length})</TabsTrigger>
            <TabsTrigger value="cartes">Cartes ({certificates.length})</TabsTrigger>
            <TabsTrigger value="sessions" data-testid="caces-tab-sessions">Sessions</TabsTrigger>
            <TabsTrigger value="questions" data-testid="caces-tab-questions">Questions théoriques</TabsTrigger>
            <TabsTrigger value="attestations" data-testid="caces-tab-attestations">Attestations de formation</TabsTrigger>
          </TabsList>
        </Tabs>
        {(tab === "examens" || tab === "cartes") && (<>
        <div className="relative w-full sm:w-64">
          <MagnifyingGlass size={16} className="absolute left-3 top-3 text-gray-400" />
          <Input placeholder="Rechercher un candidat..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {categories.map((c) => <SelectItem key={c.category} value={c.category}>Catégorie {c.category}</SelectItem>)}
          </SelectContent>
        </Select>
        </>)}
      </div>

      {tab === "sessions" ? <CacesSessionsTab /> : tab === "questions" ? <QuestionBankTab /> : tab === "attestations" ? <AttestationsFormationTab candidats={candidats} /> : tab === "examens" ? (
        <div className="space-y-2">
          {shownAttempts.length === 0 && <p className="text-sm text-gray-500">Aucun examen CACES.</p>}
          {shownAttempts.map((a) => {
            const st = STATUS[a.status] || STATUS.en_attente;
            const dossier = dossierOf(a);
            return (
              <Card key={a.id} className="p-4 border border-gray-200 rounded-md shadow-none" data-testid={`caces-attempt-${a.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{a.student_name}</p>
                      <Badge variant="outline">Cat. {a.category}</Badge>
                      <Badge className={st.cls}>{st.label}</Badge>
                    </div>
                    <Epreuve label="Théorie" part={a.theorie} />
                    <Epreuve label="Pratique" part={a.pratique} />
                    {a.results_sent_at && (
                      <p className="text-xs text-gray-500">Résultats envoyés le {formatDateFR(a.results_sent_at)}{a.results_sent_by ? ` par ${a.results_sent_by}` : ""}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {a.status !== "valide" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setResultFor({ attempt: a, epreuve: "theorie" })}>Théorie</Button>
                        <Button size="sm" variant="outline" onClick={() => setResultFor({ attempt: a, epreuve: "pratique" })}>Pratique</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditAttempt(a)} title="Changer la catégorie ou supprimer"><PencilSimple size={14} /></Button>
                      </>
                    )}
                    {dossier && (
                      <Button size="sm" variant="outline" onClick={() => setPhotoFor(dossier)} title="Photo d'identité de la carte">
                        <Camera size={14} className="mr-1" /> {dossier.has_photo ? "Photo" : "Photo manquante"}
                      </Button>
                    )}
                    <Button
                      size="sm" disabled={busy === a.id || (!a.theorie && !a.pratique)} onClick={() => sendResults(a)}
                      className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid={`caces-send-${a.id}`}
                    >
                      <PaperPlaneTilt size={14} className="mr-1" /> {a.results_sent_at ? "Renvoyer les résultats" : "Envoyer les résultats"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {shownCerts.length === 0 && <p className="text-sm text-gray-500">Aucune carte CACES.</p>}
          {shownCerts.map((c) => {
            const valide = c.expiration_date && c.expiration_date >= today();
            return (
              <Card key={c.id} className="p-4 border border-gray-200 rounded-md shadow-none" data-testid={`caces-cert-${c.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Certificate size={16} />
                      <p className="font-medium">{c.student_name}</p>
                      <Badge className={valide ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
                        {valide ? `Valable jusqu'au ${formatDateFR(c.expiration_date)}` : "Expirée"}
                      </Badge>
                    </div>
                    {(c.categories || []).map((cat) => (
                      <p key={cat.category} className="text-xs text-gray-600 font-mono">
                        Cat. {cat.category} — {cat.numero_caces} — obtenu le {formatDateFR(cat.date_obtention)}
                        {cat.external ? ` (${cat.external.otc_name})` : ""}
                      </p>
                    ))}
                    {(!c.date_naissance || !c.signataire_name) && (
                      <p className="text-xs text-amber-600">À compléter avant impression : {[!c.date_naissance && "date de naissance", !c.signataire_name && "signataire"].filter(Boolean).join(", ")}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setEditCert(c)}><PencilSimple size={14} className="mr-1" /> Modifier</Button>
                    <Button size="sm" variant="outline" onClick={() => copyVerifLink(c)}><LinkIcon size={14} className="mr-1" /> Lien de vérification</Button>
                    <Button size="sm" disabled={busy === c.id} onClick={() => downloadCard(c)} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid={`caces-card-${c.id}`}>
                      <DownloadSimple size={14} className="mr-1" /> Télécharger la carte
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NewAttemptDialog open={newOpen} onClose={() => setNewOpen(false)} candidats={candidats} testeurs={testeurs} onCreated={load} />
      <EditAttemptDialog attempt={editAttempt} categories={categories} onClose={() => setEditAttempt(null)} onSaved={load} />
      <ResultDialog target={resultFor} testeurs={testeurs} onClose={() => setResultFor(null)} onSaved={load} />
      <CertificateDialog certificate={editCert} categories={categories} testeurs={testeurs} onClose={() => setEditCert(null)} onSaved={load} />
      <NewCertificateDialog open={newCertOpen} onClose={() => setNewCertOpen(false)} candidats={candidats} categories={categories} testeurs={testeurs} onCreated={load} />
      <Dialog open={!!photoFor} onOpenChange={(o) => { if (!o) { setPhotoFor(null); load(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Photo d'identité — {photoFor?.student_name}</DialogTitle></DialogHeader>
          {photoFor && (
            <PhotoCapture uploadUrl={`/caces/dossiers/${photoFor.id}/photo`} fetchUrl={`/caces/dossiers/${photoFor.id}/photo`} label="Photo pour la carte CACES" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewAttemptDialog({ open, onClose, candidats, testeurs, onCreated }) {
  const [dossierId, setDossierId] = useState("");
  const [cats, setCats] = useState([]);
  // Examen déjà passé (ex : sur papier) : résultats saisis tout de suite, la carte est créée.
  const [dejaAdmis, setDejaAdmis] = useState(false);
  const [date, setDate] = useState(today());
  const [testeur, setTesteur] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setDossierId(""); setCats([]); setDejaAdmis(false); setDate(today()); setTesteur(""); } }, [open]);

  const pick = (id) => {
    setDossierId(id);
    const d = candidats.find((x) => x.id === id);
    setCats((d?.caces_categories || []).filter((c) => CACES_CATEGORIES_PROPOSEES.includes(c)));
  };

  const create = async () => {
    const d = candidats.find((x) => x.id === dossierId);
    if (!d || !cats.length) return;
    setSaving(true);
    let ok = 0;
    for (const category of cats) {
      try {
        const { data } = await api.post("/caces/exam-attempts", {
          dossier_id: d.id, student_id: d.student_id, student_name: d.student_name, student_email: d.student_email, category,
        });
        if (dejaAdmis) {
          await api.post(`/caces/exam-attempts/${data.id}/theorie`, { passed: true, date });
          await api.post(`/caces/exam-attempts/${data.id}/pratique`, { passed: true, date, testeur_name: testeur.trim() });
        }
        ok += 1;
      } catch (e) {
        toast.error(`Catégorie ${category} : ${errorDetail(e, "examen non créé")}`);
      }
    }
    setSaving(false);
    if (ok) {
      toast.success(dejaAdmis ? `${ok} catégorie(s) obtenue(s) — carte créée` : `${ok} examen(s) CACES ouvert(s)`);
      onCreated();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">Nouvel examen CACES</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium mb-1">Candidat (dossier CACES)</p>
            <Select value={dossierId} onValueChange={pick}>
              <SelectTrigger><SelectValue placeholder="Choisir un candidat" /></SelectTrigger>
              <SelectContent>
                {candidats.map((d) => <SelectItem key={d.id} value={d.id}>{d.student_name} — {d.formation_title}</SelectItem>)}
              </SelectContent>
            </Select>
            {candidats.length === 0 && <p className="text-xs text-gray-500 mt-1">Aucun dossier CACES pour l'instant.</p>}
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Catégorie(s) passée(s)</p>
            <CacesCategoriesPicker value={cats} onChange={setCats} testId="new-attempt-cats" />
            <p className="text-xs text-gray-400 mt-1">Pré-cochées d'après l'inscription. Un examen est ouvert par catégorie.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dejaAdmis} onChange={(e) => setDejaAdmis(e.target.checked)} data-testid="new-attempt-admis" />
            Examen déjà passé et réussi (théorie + pratique) — créer la carte
          </label>
          {dejaAdmis && (
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Input list="caces-testeurs-new" placeholder="Nom du testeur" value={testeur} onChange={(e) => setTesteur(e.target.value)} />
              <datalist id="caces-testeurs-new">{testeurs.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
          )}
          <Button disabled={!dossierId || !cats.length || saving || (dejaAdmis && (!date || !testeur.trim()))} onClick={create} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
            {dejaAdmis ? "Enregistrer et créer la carte" : "Ouvrir l'examen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditAttemptDialog({ attempt, categories, onClose, onSaved }) {
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (attempt) setCategory(attempt.category); }, [attempt]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/caces/exam-attempts/${attempt.id}`, { category });
      toast.success("Catégorie de l'examen modifiée");
      onSaved();
      onClose();
    } catch (e) { toast.error(errorDetail(e, "Examen non modifié")); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Supprimer l'examen catégorie ${attempt.category} de ${attempt.student_name} ?`)) return;
    setSaving(true);
    try {
      await api.delete(`/caces/exam-attempts/${attempt.id}`);
      toast.success("Examen supprimé");
      onSaved();
      onClose();
    } catch (e) { toast.error(errorDetail(e, "Examen non supprimé")); } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!attempt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">Modifier l'examen — {attempt?.student_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c.category} value={c.category}>Catégorie {c.category}{c.proposee ? "" : " (non proposée)"}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button variant="outline" disabled={saving} onClick={remove} className="text-red-600 border-red-200 hover:bg-red-50">Supprimer l'examen</Button>
            <Button disabled={saving || category === attempt?.category} onClick={save} className="flex-1 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Enregistrer</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultDialog({ target, testeurs, onClose, onSaved }) {
  const [passed, setPassed] = useState("true");
  const [date, setDate] = useState(today());
  const [testeur, setTesteur] = useState("");
  const [saving, setSaving] = useState(false);
  const pratique = target?.epreuve === "pratique";

  useEffect(() => {
    if (!target) return;
    const part = target.attempt[target.epreuve];
    setPassed(part ? String(part.passed) : "true");
    setDate(part?.date || today());
    setTesteur(part?.testeur_name || "");
  }, [target]);

  const save = async () => {
    setSaving(true);
    try {
      const body = { passed: passed === "true", date, ...(pratique ? { testeur_name: testeur.trim() } : {}) };
      const { data } = await api.post(`/caces/exam-attempts/${target.attempt.id}/${target.epreuve}`, body);
      toast.success(data.status === "valide" ? "CACES obtenu — carte créée" : "Résultat enregistré");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorDetail(e, "Résultat non enregistré"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">
            Épreuve {pratique ? "pratique" : "théorique"} — {target?.attempt.student_name} (cat. {target?.attempt.category})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={passed} onValueChange={setPassed}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Réussie</SelectItem>
              <SelectItem value="false">Échouée</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {pratique && (
            <>
              <Input list="caces-testeurs" placeholder="Nom du testeur" value={testeur} onChange={(e) => setTesteur(e.target.value)} />
              <datalist id="caces-testeurs">{testeurs.map((t) => <option key={t} value={t} />)}</datalist>
            </>
          )}
          <Button disabled={saving || !date || (pratique && !testeur.trim())} onClick={save} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
            Enregistrer le résultat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Lignes « catégorie » de la carte : catégorie, n° CACES (généré si vide),
// date d'obtention, testeur — demande du 2026-11-26.
function CategoriesEditor({ rows, setRows, categories, testeurs }) {
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const libres = categories.filter((c) => !rows.some((r) => r.category === c.category));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[80px_1fr_130px_1fr_auto] gap-1.5 items-center">
          <Select value={r.category} onValueChange={(v) => set(i, "category", v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.filter((c) => c.category === r.category || !rows.some((x) => x.category === c.category)).map((c) => (
                <SelectItem key={c.category} value={c.category}>{c.category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input className="h-9 font-mono text-xs" value={r.numero_caces || ""} onChange={(e) => set(i, "numero_caces", e.target.value)} placeholder="N° généré si vide" />
          <Input className="h-9" type="date" value={r.date_obtention || ""} onChange={(e) => set(i, "date_obtention", e.target.value)} />
          <Input className="h-9" list="caces-testeurs-cert" value={r.testeur_name || ""} onChange={(e) => set(i, "testeur_name", e.target.value)} placeholder="Testeur" />
          <Button type="button" variant="ghost" size="sm" disabled={rows.length <= 1} onClick={() => setRows(rows.filter((_, j) => j !== i))} title="Retirer la catégorie">✕</Button>
        </div>
      ))}
      <datalist id="caces-testeurs-cert">{testeurs.map((t) => <option key={t} value={t} />)}</datalist>
      {libres.length > 0 && (
        <Button type="button" size="sm" variant="outline" onClick={() => {
          const next = libres.find((c) => c.proposee) || libres[0];
          setRows([...rows, { category: next.category, numero_caces: "", date_obtention: today(), testeur_name: rows[0]?.testeur_name || "" }]);
        }}>
          <Plus size={14} className="mr-1" /> Ajouter une catégorie
        </Button>
      )}
    </div>
  );
}

function CertificateDialog({ certificate, categories, testeurs, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (certificate) {
      setForm({
        student_name: certificate.student_name || "", date_naissance: certificate.date_naissance || "",
        signataire_name: certificate.signataire_name || "", signataire_qualite: certificate.signataire_qualite || "",
        otc_numero_inrs: certificate.otc_numero_inrs || "",
      });
      setRows((certificate.categories || []).map((c) => ({
        category: c.category, numero_caces: c.numero_caces || "", date_obtention: c.date_obtention || "", testeur_name: c.testeur_name || "",
      })));
    }
  }, [certificate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/caces/certificates/${certificate.id}`, form);
      await api.put(`/caces/certificates/${certificate.id}/categories`, { categories: rows });
      toast.success("Carte mise à jour");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorDetail(e, "Carte non mise à jour"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!certificate} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Modifier la carte CACES®</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><p className="text-sm font-medium mb-1">Titulaire (en toutes lettres)</p><Input value={form.student_name || ""} onChange={set("student_name")} /></div>
            <div><p className="text-sm font-medium mb-1">Date de naissance</p><Input type="date" value={form.date_naissance || ""} onChange={set("date_naissance")} /></div>
            <div><p className="text-sm font-medium mb-1">Signataire</p><Input value={form.signataire_name || ""} onChange={set("signataire_name")} placeholder="Nom du signataire" /></div>
            <div><p className="text-sm font-medium mb-1">Qualité du signataire</p><Input value={form.signataire_qualite || ""} onChange={set("signataire_qualite")} placeholder="Ex : Directeur" /></div>
          </div>
          <div>
            <p className="text-sm font-medium mb-1">N° d'inscription dans la base INRS</p>
            <Input value={form.otc_numero_inrs || ""} onChange={set("otc_numero_inrs")} placeholder="Vide = celui des Paramètres → Attestations" data-testid="cert-inrs" />
            <p className="text-xs text-gray-400 mt-1">Imprimé au recto : « Inscrit dans la base INRS sous le n° … ».</p>
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Catégories obtenues</p>
            <CategoriesEditor rows={rows} setRows={setRows} categories={categories} testeurs={testeurs} />
            <p className="text-xs text-gray-400 mt-1">L'échéance (5 ans) part de la première catégorie obtenue.</p>
          </div>
          <Button disabled={saving || !rows.length} onClick={save} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="cert-save">Enregistrer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Carte créée à la main, sans examen saisi ici (examen fait sur papier…).
function NewCertificateDialog({ open, onClose, candidats, categories, testeurs, onCreated }) {
  const [dossierId, setDossierId] = useState("");
  const [rows, setRows] = useState([]);
  const [naissance, setNaissance] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setDossierId(""); setRows([]); setNaissance(""); } }, [open]);

  const pick = (id) => {
    setDossierId(id);
    const d = candidats.find((x) => x.id === id);
    const cats = d?.caces_categories?.length ? d.caces_categories : ["3"];
    setRows(cats.map((c) => ({ category: c, numero_caces: "", date_obtention: today(), testeur_name: "" })));
  };

  const create = async () => {
    setSaving(true);
    try {
      await api.post("/caces/certificates", { dossier_id: dossierId, categories: rows, date_naissance: naissance || null });
      toast.success("Carte CACES créée — complétez-la puis téléchargez-la");
      onCreated();
      onClose();
    } catch (e) { toast.error(errorDetail(e, "Carte non créée")); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Nouvelle carte CACES®</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={dossierId} onValueChange={pick}>
            <SelectTrigger><SelectValue placeholder="Choisir un candidat" /></SelectTrigger>
            <SelectContent>
              {candidats.map((d) => <SelectItem key={d.id} value={d.id}>{d.student_name} — {d.formation_title}</SelectItem>)}
            </SelectContent>
          </Select>
          {dossierId && (
            <>
              <div><p className="text-sm font-medium mb-1">Date de naissance</p><Input type="date" value={naissance} onChange={(e) => setNaissance(e.target.value)} /></div>
              <div>
                <p className="text-sm font-medium mb-1">Catégories obtenues</p>
                <CategoriesEditor rows={rows} setRows={setRows} categories={categories} testeurs={testeurs} />
              </div>
            </>
          )}
          <Button disabled={!dossierId || !rows.length || saving} onClick={create} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Créer la carte</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
