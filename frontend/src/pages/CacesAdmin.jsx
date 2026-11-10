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
        <Button onClick={() => setNewOpen(true)} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="caces-new-attempt">
          <Plus size={16} className="mr-1" /> Nouvel examen
        </Button>
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
          <TabsList>
            <TabsTrigger value="examens">Examens ({attempts.length})</TabsTrigger>
            <TabsTrigger value="cartes">Cartes ({certificates.length})</TabsTrigger>
            <TabsTrigger value="sessions" data-testid="caces-tab-sessions">Sessions</TabsTrigger>
            <TabsTrigger value="questions" data-testid="caces-tab-questions">Questions théoriques</TabsTrigger>
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

      {tab === "sessions" ? <CacesSessionsTab /> : tab === "questions" ? <QuestionBankTab /> : tab === "examens" ? (
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
                    <Button size="sm" variant="outline" onClick={() => setEditCert(c)}><PencilSimple size={14} className="mr-1" /> Compléter</Button>
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

      <NewAttemptDialog open={newOpen} onClose={() => setNewOpen(false)} candidats={candidats} categories={categories} onCreated={load} />
      <ResultDialog target={resultFor} testeurs={testeurs} onClose={() => setResultFor(null)} onSaved={load} />
      <CertificateDialog certificate={editCert} onClose={() => setEditCert(null)} onSaved={load} />
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

function NewAttemptDialog({ open, onClose, candidats, categories, onCreated }) {
  const [dossierId, setDossierId] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setDossierId(""); setCategory(""); } }, [open]);

  const create = async () => {
    const d = candidats.find((x) => x.id === dossierId);
    if (!d || !category) return;
    setSaving(true);
    try {
      await api.post("/caces/exam-attempts", {
        dossier_id: d.id, student_id: d.student_id, student_name: d.student_name, student_email: d.student_email, category,
      });
      toast.success("Examen CACES ouvert");
      onCreated();
      onClose();
    } catch (e) {
      toast.error(errorDetail(e, "Examen non créé"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">Nouvel examen CACES</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium mb-1">Candidat (dossier CACES)</p>
            <Select value={dossierId} onValueChange={setDossierId}>
              <SelectTrigger><SelectValue placeholder="Choisir un candidat" /></SelectTrigger>
              <SelectContent>
                {candidats.map((d) => <SelectItem key={d.id} value={d.id}>{d.student_name} — {d.formation_title}</SelectItem>)}
              </SelectContent>
            </Select>
            {candidats.length === 0 && <p className="text-xs text-gray-500 mt-1">Aucun dossier CACES pour l'instant.</p>}
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Catégorie</p>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Choisir une catégorie" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.category} value={c.category}>
                    Catégorie {c.category}{c.duree_pratique_min ? ` (pratique ${c.duree_pratique_min} min)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={!dossierId || !category || saving} onClick={create} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
            Ouvrir l'examen
          </Button>
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

function CertificateDialog({ certificate, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (certificate) {
      setForm({
        student_name: certificate.student_name || "", date_naissance: certificate.date_naissance || "",
        signataire_name: certificate.signataire_name || "", signataire_qualite: certificate.signataire_qualite || "",
      });
    }
  }, [certificate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/caces/certificates/${certificate.id}`, form);
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
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">Informations de la carte</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><p className="text-sm font-medium mb-1">Titulaire (en toutes lettres)</p><Input value={form.student_name || ""} onChange={set("student_name")} /></div>
          <div><p className="text-sm font-medium mb-1">Date de naissance</p><Input type="date" value={form.date_naissance || ""} onChange={set("date_naissance")} /></div>
          <div><p className="text-sm font-medium mb-1">Signataire</p><Input value={form.signataire_name || ""} onChange={set("signataire_name")} placeholder="Nom du signataire" /></div>
          <div><p className="text-sm font-medium mb-1">Qualité du signataire</p><Input value={form.signataire_qualite || ""} onChange={set("signataire_qualite")} placeholder="Ex : Directeur" /></div>
          <Button disabled={saving} onClick={save} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Enregistrer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
