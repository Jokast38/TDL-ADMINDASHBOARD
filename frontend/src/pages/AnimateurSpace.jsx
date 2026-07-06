import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { api, API } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, MapPin, Users, PenNib, CheckCircle, XCircle, Eraser, FilePdf, UserCircle, FileArrowUp } from "@phosphor-icons/react";
import { toast } from "sonner";

const STAFF_DOC_TYPE_LABELS = {
  identite: "Pièce d'identité",
  diplome: "Diplôme",
  cv: "CV",
  casier_judiciaire: "Casier judiciaire (B3)",
  assurance: "Attestation d'assurance",
  permis_conduire: "Permis de conduire",
  contrat: "Contrat",
  autre: "Autre document",
};

function ProfileTab() {
  const [profile, setProfile] = useState(null);
  const [docType, setDocType] = useState("cv");

  const load = () => api.get("/me/profile").then((r) => setProfile(r.data));
  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("doc_type", docType);
    try {
      await api.post("/me/profile/documents", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document envoyé");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      e.target.value = "";
    }
  };

  if (!profile) return null;

  return (
    <Card className="p-6 border border-gray-200 rounded-md shadow-none max-w-2xl">
      <p className="overline mb-1">Mon profil</p>
      <h2 className="font-display text-xl font-bold mb-4">Mon dossier formateur</h2>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger className="w-56 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(STAFF_DOC_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
          <FileArrowUp size={14} /> Ajouter ce document
          <input type="file" className="hidden" onChange={upload} />
        </label>
      </div>

      <div className="space-y-2">
        {(profile.documents_details || []).map((doc) => (
          <div key={doc.id} className="flex items-center justify-between border border-gray-200 rounded-md p-3 text-sm">
            <span className="truncate">{STAFF_DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type} — {doc.original_filename}</span>
            <Badge variant="outline" className={
              doc.verification_status === "approved" ? "border-green-500 text-green-600" :
              doc.verification_status === "rejected" ? "border-red-500 text-red-600" : "text-gray-500"
            }>{doc.verification_status === "approved" ? "Approuvé" : doc.verification_status === "rejected" ? "Rejeté" : "En attente"}</Badge>
          </div>
        ))}
        {!(profile.documents_details || []).length && <p className="text-sm text-gray-400 text-center py-6">Aucun document envoyé.</p>}
      </div>
    </Card>
  );
}

export default function AnimateurSpace() {
  const { user } = useAuth();
  const [tab, setTab] = useState("sessions"); // sessions | profile
  const [stages, setStages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [jours, setJours] = useState([]);
  const [sessionDate, setSessionDate] = useState(null);
  const [inscrits, setInscrits] = useState([]);
  const [signOpen, setSignOpen] = useState(false);
  const [signTarget, setSignTarget] = useState(null);
  const [presence, setPresence] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const padRef = useRef(null);

  const load = () => api.get("/stages").then((r) => setStages(r.data));
  useEffect(() => { load(); }, []);

  const openStage = async (s) => {
    setSelected(s);
    const j = await api.get(`/stages/${s.id}/jours`);
    const days = j.data.jours || [];
    setJours(days);
    const firstDay = days[0];
    setSessionDate(firstDay);
    const r = await api.get(`/stages/${s.id}/inscrits`, { params: { session_date: firstDay } });
    setInscrits(r.data);
  };

  const changeDay = async (day) => {
    setSessionDate(day);
    const r = await api.get(`/stages/${selected.id}/inscrits`, { params: { session_date: day } });
    setInscrits(r.data);
  };

  const openSign = (ins) => { setSignTarget(ins); setPresence(true); setSignOpen(true); };

  const clearSign = () => padRef.current?.clear();

  const submitSign = async () => {
    if (!presence) {
      try {
        await api.post("/emargements", {
          stage_id: selected.id,
          inscription_id: signTarget.id,
          student_id: signTarget.student_id,
          student_name: signTarget.student_name,
          signature_data_url: "",
          present: false,
          session_date: sessionDate,
        });
        toast.success("Absence enregistrée");
        setSignOpen(false);
        changeDay(sessionDate);
      } catch (e) {
        toast.error(e.response?.data?.detail || "Erreur");
      }
      return;
    }
    if (padRef.current?.isEmpty()) {
      toast.error("Veuillez signer dans la zone");
      return;
    }
    const dataUrl = padRef.current.getCanvas().toDataURL("image/png");
    try {
      await api.post("/emargements", {
        stage_id: selected.id,
        inscription_id: signTarget.id,
        student_id: signTarget.student_id,
        student_name: signTarget.student_name,
        signature_data_url: dataUrl,
        present: true,
        session_date: sessionDate,
      });
      toast.success("Émargement signé · attestation générée");
      setSignOpen(false);
      changeDay(sessionDate);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const generateSheet = async () => {
    setGeneratingPdf(true);
    try {
      const { data } = await api.get(`/stages/${selected.id}/emargement-pdf`, { params: { session_date: sessionDate } });
      const token = localStorage.getItem("tdl_token");
      const res = await fetch(`${API}/documents-generated/${data.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast.success("Feuille d'émargement générée");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur génération PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="animateur-page">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Espace animateur</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">
            {tab === "sessions" ? "Mes sessions" : "Mon profil"}
          </h1>
          <p className="text-gray-500 mt-2">Bienvenue {user?.name}. {stages.length} session(s) attribuée(s).</p>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === "sessions" ? "default" : "outline"} size="sm" onClick={() => setTab("sessions")} className={tab === "sessions" ? "bg-[#0a0a0a] text-white" : ""}>
            <Calendar size={14} className="mr-1" /> Sessions
          </Button>
          <Button variant={tab === "profile" ? "default" : "outline"} size="sm" onClick={() => setTab("profile")} className={tab === "profile" ? "bg-[#0a0a0a] text-white" : ""}>
            <UserCircle size={14} className="mr-1" /> Mon profil
          </Button>
        </div>
      </div>

      {tab === "profile" && <ProfileTab />}

      {tab === "sessions" && (!selected ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stages.map((s) => (
            <Card key={s.id} className="p-5 border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg cursor-pointer transition-all" onClick={() => openStage(s)} data-testid={`stage-${s.id}`}>
              <div className="flex items-start justify-between mb-2">
                <Badge variant="outline">{s.statut}</Badge>
                <p className="text-xs text-gray-500">{s.nb_inscrits || 0}/{s.capacite_max}</p>
              </div>
              <h3 className="font-display font-bold leading-tight">{s.formation_titre}</h3>
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-3">
                <Calendar size={12} /> {s.date_debut} → {s.date_fin}
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                <MapPin size={12} /> {s.lieu_ville}
              </div>
            </Card>
          ))}
          {!stages.length && (
            <Card className="p-12 text-center border-dashed col-span-full">
              <p className="text-gray-500">Aucune session attribuée pour l'instant.</p>
            </Card>
          )}
        </div>
      ) : (
        <div>
          <Button variant="outline" size="sm" onClick={() => { setSelected(null); setInscrits([]); setJours([]); }} className="mb-4">← Retour aux sessions</Button>
          <Card className="p-6 border border-gray-200 rounded-md shadow-none">
            <h2 className="font-display text-2xl font-bold">{selected.formation_titre}</h2>
            <p className="text-sm text-gray-500 mt-1">{selected.date_debut} au {selected.date_fin} · {selected.lieu_adresse}, {selected.lieu_ville}</p>

            {jours.length > 1 && (
              <div className="mt-4">
                <p className="overline mb-2">Jour de la session ({jours.length} jours)</p>
                <div className="flex flex-wrap gap-2">
                  {jours.map((j) => (
                    <button
                      key={j}
                      onClick={() => changeDay(j)}
                      className={`px-3 py-1.5 rounded-md text-xs border ${sessionDate === j ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "border-gray-300 hover:bg-gray-50"}`}
                      data-testid={`day-${j}`}
                    >
                      {new Date(j).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <p className="overline flex items-center gap-2"><Users size={12} /> Liste d'émargement {sessionDate ? `— ${new Date(sessionDate).toLocaleDateString("fr-FR")}` : ""}</p>
                <Button size="sm" variant="outline" onClick={generateSheet} disabled={generatingPdf} data-testid="generate-emargement-pdf">
                  <FilePdf size={14} className="mr-1" /> {generatingPdf ? "Génération..." : "Générer la feuille PDF"}
                </Button>
              </div>
              <div className="space-y-2">
                {inscrits.map((ins) => (
                  <div key={ins.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-md" data-testid={`inscrit-${ins.id}`}>
                    <div>
                      <p className="font-medium text-sm">{ins.student_name}</p>
                      <p className="text-xs text-gray-500">{ins.student_email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {ins.emarge ? (
                        ins.present ? (
                          <Badge className="bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10"><CheckCircle size={12} weight="fill" className="mr-1" /> Présent · signé</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><XCircle size={12} weight="fill" className="mr-1" /> Absent</Badge>
                        )
                      ) : (
                        <Button size="sm" onClick={() => openSign(ins)} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid={`sign-${ins.id}`}>
                          <PenNib size={14} className="mr-1" /> Émarger
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {!inscrits.length && <p className="text-sm text-gray-400 text-center py-6">Aucun inscrit.</p>}
              </div>
            </div>
          </Card>
        </div>
      ))}

      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="max-w-lg" data-testid="signature-dialog">
          {signTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Émargement — {signTarget.student_name} ({sessionDate ? new Date(sessionDate).toLocaleDateString("fr-FR") : ""})</DialogTitle>
              </DialogHeader>
              <div className="mt-2 space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={presence ? "default" : "outline"}
                    onClick={() => setPresence(true)}
                    className={presence ? "bg-[#0B7238] hover:bg-[#0a5e2e] text-white" : ""}
                    data-testid="present-btn"
                  >
                    <CheckCircle size={14} className="mr-1" /> Présent
                  </Button>
                  <Button
                    variant={!presence ? "default" : "outline"}
                    onClick={() => setPresence(false)}
                    className={!presence ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                    data-testid="absent-btn"
                  >
                    <XCircle size={14} className="mr-1" /> Absent
                  </Button>
                </div>
                {presence && (
                  <>
                    <div>
                      <p className="text-sm font-medium mb-1">Signature de l'apprenant</p>
                      <div className="border-2 border-dashed border-gray-300 rounded-md bg-white">
                        <SignatureCanvas
                          ref={padRef}
                          canvasProps={{ width: 460, height: 180, className: "w-full rounded-md", "data-testid": "signature-pad" }}
                          penColor="#0a0a0a"
                        />
                      </div>
                      <Button variant="ghost" size="sm" onClick={clearSign} className="mt-1" data-testid="clear-sign">
                        <Eraser size={12} className="mr-1" /> Effacer
                      </Button>
                    </div>
                  </>
                )}
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                  <Button variant="outline" onClick={() => setSignOpen(false)}>Annuler</Button>
                  <Button onClick={submitSign} className="bg-[#d4af37] text-black hover:bg-[#b8941f]" data-testid="submit-sign">
                    Valider l'émargement
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}