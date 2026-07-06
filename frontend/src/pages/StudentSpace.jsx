import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignOut, FileArrowUp, FolderOpen, Warning, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_LABEL = {
  nouveau: "Nouveau", en_verification: "En vérification", complet: "Complet",
  soumis_ants: "Soumis à l'ANTS", termine: "Terminé", rejete: "Rejeté"
};

const STATUS_COLOR = {
  nouveau: "bg-gray-100 text-gray-600",
  en_verification: "bg-amber-100 text-amber-700",
  complet: "bg-blue-100 text-blue-700",
  soumis_ants: "bg-[#0a0a0a]/10 text-[#0a0a0a]",
  termine: "bg-green-100 text-green-700",
  rejete: "bg-red-100 text-red-700",
};

// Libellés lisibles pour les types de documents (à étendre selon les besoins)
const DOC_TYPE_LABELS = {
  identite: "Pièce d'identité",
  photo: "Photo d'identité",
  permis: "Permis de conduire",
  justificatif_domicile: "Justificatif de domicile",
  casier_judiciaire: "Casier judiciaire (B3)",
  cv: "CV",
  diplome: "Diplôme",
  rib: "RIB",
  autre: "Autre document",
};

export default function StudentSpace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dossiers, setDossiers] = useState([]);
  const [docsByDossier, setDocsByDossier] = useState({});
  const [uploadType, setUploadType] = useState({});

  useEffect(() => { fetchDossiers(); }, []);

  const fetchDossiers = async () => {
    try {
      const { data } = await api.get("/dossiers/me");
      setDossiers(data);
      // Charge la liste détaillée des documents déjà envoyés pour chaque dossier
      data.forEach((d) => loadDocs(d.id));
    } catch {
      setDossiers([]);
    }
  };

  const loadDocs = async (dossierId) => {
    try {
      const { data } = await api.get(`/dossiers/${dossierId}/documents`);
      setDocsByDossier((prev) => ({ ...prev, [dossierId]: data }));
    } catch {
      setDocsByDossier((prev) => ({ ...prev, [dossierId]: [] }));
    }
  };

  const upload = async (e, dossierId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const docType = uploadType[dossierId] || "autre";
    const fd = new FormData();
    fd.append("file", file);
    fd.append("doc_type", docType);
    try {
      await api.post(`/dossiers/${dossierId}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success("Document envoyé !");
      loadDocs(dossierId);
      fetchDossiers(); // recalcule le compteur de documents manquants
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" data-testid="student-space">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold hidden sm:inline">TDL Formation</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm hidden md:inline">Bonjour, <b>{user?.name}</b></span>
            <Button variant="outline" size="sm" onClick={async () => { await logout(); navigate("/"); }} data-testid="student-logout">
              <SignOut size={14} className="mr-1" /> Déconnexion
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <p className="overline">Mon espace</p>
        <h1 className="font-display text-4xl font-bold tracking-tight mt-1 mb-8">Mes formations & dossiers</h1>

        <div className="space-y-4">
          {dossiers.map((d) => {
            const docs = docsByDossier[d.id] || [];
            const manquants = d.documents_manquants || [];
            return (
              <Card key={d.id} className="p-6 border border-gray-200 rounded-md shadow-none" data-testid={`student-dossier-${d.id}`}>
                <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
                  <div>
                    <Badge variant="outline" className="text-xs mb-1">{d.category}</Badge>
                    <h3 className="font-display font-bold text-lg">{d.formation_title}</h3>
                  </div>
                  <Badge className={`${STATUS_COLOR[d.status] || ""} hover:${STATUS_COLOR[d.status] || ""}`}>{STATUS_LABEL[d.status] || d.status}</Badge>
                </div>
                <p className="text-sm text-gray-500 mb-4">Dossier #{d.id.slice(0, 8)} · créé le {new Date(d.created_at).toLocaleDateString("fr-FR")}</p>
                {d.notes && <p className="text-sm bg-gray-50 p-3 rounded-md mb-4 border border-gray-200">{d.notes}</p>}

                {manquants.length > 0 ? (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 mb-4 text-sm text-amber-800">
                    <Warning size={16} weight="fill" className="mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">{manquants.length} document{manquants.length > 1 ? "s" : ""} manquant{manquants.length > 1 ? "s" : ""}</p>
                      <p className="text-xs mt-1">{manquants.map((m) => DOC_TYPE_LABELS[m] || m).join(", ")}</p>
                    </div>
                  </div>
                ) : (d.documents_requis || []).length > 0 ? (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-md p-3 mb-4 text-sm text-green-700">
                    <CheckCircle size={16} weight="fill" /> Tous les documents requis ont été envoyés.
                  </div>
                ) : null}

                {docs.length > 0 && (
                  <div className="space-y-1 mb-4">
                    {docs.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between text-xs border border-gray-100 rounded px-3 py-2">
                        <span className="truncate">{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type} — {doc.original_filename}</span>
                        <Badge variant="outline" className={
                          doc.verification_status === "approved" ? "border-green-500 text-green-600" :
                          doc.verification_status === "rejected" ? "border-red-500 text-red-600" : "text-gray-500"
                        }>{doc.verification_status === "approved" ? "Approuvé" : doc.verification_status === "rejected" ? "Rejeté" : "En attente"}</Badge>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Select value={uploadType[d.id] || (manquants[0] || "autre")} onValueChange={(v) => setUploadType((p) => ({ ...p, [d.id]: v }))}>
                    <SelectTrigger className="w-56 h-9 text-sm" data-testid={`doctype-${d.id}`}>
                      <SelectValue placeholder="Type de document" />
                    </SelectTrigger>
                    <SelectContent>
                      {(d.documents_requis?.length ? d.documents_requis : Object.keys(DOC_TYPE_LABELS)).map((t) => (
                        <SelectItem key={t} value={t}>{DOC_TYPE_LABELS[t] || t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
                    <FileArrowUp size={14} /> Ajouter ce document
                    <input type="file" className="hidden" onChange={(e) => upload(e, d.id)} data-testid={`upload-${d.id}`} />
                  </label>
                </div>
              </Card>
            );
          })}
          {!dossiers.length && (
            <Card className="p-12 text-center border-dashed">
              <FolderOpen size={32} className="mx-auto text-gray-400 mb-3" />
              <p className="text-gray-500 mb-4">Aucun dossier. Inscrivez-vous à une formation.</p>
              <Link to="/inscription"><Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Voir les formations</Button></Link>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}