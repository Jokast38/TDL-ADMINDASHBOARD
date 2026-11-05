import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { api, API } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, CheckCircle, XCircle, Eraser, FilePdf, UserCircle, FileArrowUp, Signature, Lock, LockOpen } from "@phosphor-icons/react";
import { formatDateFR, formatDateTimeFR } from "@/lib/dateFormat";
import { toast } from "sonner";
import { useTour } from "@/contexts/TourContext";
import { HELP_CATEGORIES } from "@/constants/helpTours";
import FormateurPlanningTab from "@/components/FormateurPlanningTab";
import EmargementPanel from "@/components/stages/EmargementPanel";

// Pièces justifiant le droit d'exercer — doit rester synchronisé avec
// FORMATEUR_DOC_TYPES côté backend (routers/employees.py). Dossier à
// compléter (documents + convention signée) dans les 24h suivant la
// création du compte par un agent.

const STAFF_DOC_TYPE_LABELS = {
  identite_recto: "Pièce d'identité (recto)",
  identite_verso: "Pièce d'identité (verso)",
  diplome_bafm_psy: "Diplôme BAFM / PSY",
  autorisation_animer_initiale: "Autorisation d'animer initiale",
  attestation_formation_continue: "Attestation de formation continue",
  attestation_gta_initiale: "Attestation GTA initiale",
  attestation_gta_continue: "Attestation GTA continue",
  kbis: "KBIS de moins de 3 mois",
  attestation_vigilance_urssaf: "Attestation de vigilance URSSAF",
  justificatif_domicile: "Justificatif de domicile",
};

function SignatureTab({ user }) {
  const padRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!user?.signature_path);
  const [bafmNumero, setBafmNumero] = useState(user?.agrement_bafm_numero || "");
  const [savingBafm, setSavingBafm] = useState(false);

  const clear = () => padRef.current?.clear();

  const saveSignature = async () => {
    if (padRef.current?.isEmpty()) return toast.error("Signez d'abord dans la zone");
    setSaving(true);
    try {
      const dataUrl = padRef.current.getCanvas().toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      const fd = new FormData();
      fd.append("file", blob, "signature.png");
      await api.post("/me/signature", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Signature enregistrée");
      setHasSignature(true);
      clear();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const removeSignature = async () => {
    try {
      await api.delete("/me/signature");
      toast.success("Signature supprimée");
      setHasSignature(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const saveBafm = async () => {
    setSavingBafm(true);
    try {
      await api.put("/me/agrement-bafm", { agrement_bafm_numero: bafmNumero });
      toast.success("Numéro d'agrément enregistré");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSavingBafm(false);
    }
  };

  return (
    <Card className="p-6 border border-gray-200 rounded-md shadow-none max-w-2xl">
      <p className="overline mb-1">Ma signature</p>
      <h2 className="font-display text-xl font-bold mb-1">Signature & agrément</h2>
      <p className="text-sm text-gray-500 mb-4">
        Utilisée pour signer automatiquement les attestations de stage de récupération de points (section "Signature des Animateurs").
      </p>

      {hasSignature && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-md p-3 mb-4 text-sm text-green-700">
          <CheckCircle size={16} weight="fill" /> Une signature est déjà enregistrée.
          <button onClick={removeSignature} className="ml-auto text-red-600 hover:underline text-xs" data-testid="remove-signature-btn">Supprimer</button>
        </div>
      )}

      <div>
        <p className="text-sm font-medium mb-1">{hasSignature ? "Mettre à jour ma signature" : "Ma signature manuscrite"}</p>
        <div className="border-2 border-dashed border-gray-300 rounded-md bg-white">
          <SignatureCanvas
            ref={padRef}
            canvasProps={{ width: 460, height: 180, className: "w-full rounded-md", "data-testid": "animateur-signature-pad" }}
            penColor="#0a0a0a"
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Button variant="ghost" size="sm" onClick={clear}><Eraser size={12} className="mr-1" /> Effacer</Button>
          <Button size="sm" onClick={saveSignature} disabled={saving} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="save-signature-btn">
            {saving ? "Enregistrement..." : "Enregistrer ma signature"}
          </Button>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-sm font-medium mb-1">Numéro d'agrément BAFM</p>
        <div className="flex items-center gap-2">
          <Input value={bafmNumero} onChange={(e) => setBafmNumero(e.target.value)} placeholder="B 2409100030" className="max-w-xs" />
          <Button size="sm" variant="outline" onClick={saveBafm} disabled={savingBafm}>Enregistrer</Button>
        </div>
      </div>
    </Card>
  );
}

function DossierTab() {
  const [dossier, setDossier] = useState(null);
  const [signing, setSigning] = useState(false);
  const convPadRef = useRef(null);

  const load = () => api.get("/me/formateur-dossier").then((r) => setDossier(r.data));
  useEffect(() => { load(); }, []);

  const uploadFor = async (docType, file) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("doc_type", docType);
    try {
      await api.post("/me/profile/documents", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document envoyé");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const signConvention = async () => {
    if (convPadRef.current?.isEmpty()) return toast.error("Signez d'abord dans la zone");
    setSigning(true);
    try {
      const dataUrl = convPadRef.current.getCanvas().toDataURL("image/png");
      await api.post("/me/convention/sign", { signature_data_url: dataUrl });
      toast.success("Convention signée");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la signature");
    } finally {
      setSigning(false);
    }
  };

  const downloadConvention = async () => {
    const token = localStorage.getItem("tdl_token");
    const res = await fetch(`${API}/me/convention/download`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), "_blank");
  };

  // Lecture du document complet (texte d'engagement + annexe des sessions)
  // avant signature — sans ça, le formateur ne voyait qu'un résumé d'une
  // phrase au-dessus de la zone de signature.
  const previewConvention = async () => {
    const token = localStorage.getItem("tdl_token");
    const res = await fetch(`${API}/me/convention/preview`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), "_blank");
  };

  if (!dossier) return null;
  const byType = {};
  (dossier.documents_details || []).forEach((d) => { byType[d.doc_type] = d; });

  return (
    <div className="space-y-6 max-w-2xl">
      {dossier.dossier_overdue && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded-md p-3 text-sm">
          ⏰ Le délai de 24h pour compléter votre dossier est dépassé — merci de finaliser au plus vite les éléments manquants.
        </div>
      )}
      {dossier.convention_required && !dossier.convention_signed && dossier.next_upcoming_stage && (
        <div className={`border rounded-md p-3 text-sm ${dossier.next_upcoming_stage.days_until <= 10 ? "border-red-300 bg-red-50 text-red-700" : "border-amber-300 bg-amber-50 text-amber-800"}`} data-testid="convention-session-alert">
          ✏️ Vous animez <b>{dossier.next_upcoming_stage.formation_titre}</b> le {formatDateFR(dossier.next_upcoming_stage.date_debut)}
          {" "}(dans {dossier.next_upcoming_stage.days_until} jour{dossier.next_upcoming_stage.days_until > 1 ? "s" : ""}) — merci de signer votre convention avant le début de la session.
        </div>
      )}
      {!dossier.dossier_complete && !dossier.dossier_overdue && dossier.dossier_deadline && (
        <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded-md p-3 text-sm">
          À compléter avant le {formatDateTimeFR(dossier.dossier_deadline)} ({dossier.convention_required ? "documents + convention" : "documents"}).
        </div>
      )}
      {dossier.dossier_complete && (
        <div className="border border-[#0B7238]/30 bg-[#0B7238]/5 text-[#0B7238] rounded-md p-3 text-sm">
          ✅ Dossier complet — {dossier.convention_required ? "documents et convention en règle" : "documents en règle"}.
        </div>
      )}

      <Card className="p-6 border border-gray-200 rounded-md shadow-none">
        <p className="overline mb-1">Mon dossier</p>
        <h2 className="font-display text-xl font-bold mb-4">Documents justifiant mon droit d'exercer</h2>
        <div className="space-y-2">
          {Object.entries(dossier.document_types || STAFF_DOC_TYPE_LABELS).map(([type, label]) => {
            const doc = byType[type];
            return (
              <div key={type} className="flex items-center justify-between border border-gray-200 rounded-md p-3 text-sm">
                <span className="flex items-center gap-2">
                  {doc ? <CheckCircle size={16} className="text-[#0B7238]" weight="fill" /> : <XCircle size={16} className="text-gray-300" />}
                  {label}
                </span>
                {doc ? (
                  <Badge variant="outline" className={
                    doc.verification_status === "approved" ? "border-green-500 text-green-600" :
                    doc.verification_status === "rejected" ? "border-red-500 text-red-600" : "text-gray-500"
                  }>{doc.verification_status === "approved" ? "Approuvé" : doc.verification_status === "rejected" ? "Rejeté" : "Envoyé"}</Badge>
                ) : (
                  <label className="inline-flex items-center gap-1 text-xs cursor-pointer px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50">
                    <FileArrowUp size={12} /> Charger
                    <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFor(type, e.target.files[0])} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {dossier.convention_required && <Card className="p-6 border border-gray-200 rounded-md shadow-none">
        <p className="overline mb-1">Engagement</p>
        <h2 className="font-display text-xl font-bold mb-4">Convention de collaboration</h2>
        {dossier.convention_signed ? (
          <div className="flex items-center justify-between">
            <p className="text-sm flex items-center gap-2 text-[#0B7238]"><CheckCircle size={16} weight="fill" /> Convention signée</p>
            <Button variant="outline" size="sm" onClick={downloadConvention}><FilePdf size={14} className="mr-1" /> Télécharger</Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-3">
              En signant, vous vous engagez à assurer les sessions qui vous seront assignées via le dashboard.
              Merci de lire le document complet avant de signer.
            </p>
            <Button variant="outline" size="sm" onClick={previewConvention} className="mb-4" data-testid="preview-convention-btn">
              <FilePdf size={14} className="mr-1" /> Lire la convention avant de signer
            </Button>
            <div className="border-2 border-dashed border-gray-300 rounded-md bg-white mb-2">
              <SignatureCanvas ref={convPadRef} canvasProps={{ width: 460, height: 160, className: "w-full rounded-md" }} penColor="#0a0a0a" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => convPadRef.current?.clear()}><Eraser size={12} className="mr-1" /> Effacer</Button>
              <Button onClick={signConvention} disabled={signing} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white ml-auto">
                {signing ? "Signature..." : "Signer la convention"}
              </Button>
            </div>
          </>
        )}
      </Card>}
    </div>
  );
}

export default function AnimateurSpace() {
  const { user } = useAuth();
  const { startTour } = useTour();
  // ?tab=planning : ouvert depuis le bouton du rappel « Choisissez vos dates ».
  const [tab, setTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    return ["sessions", "planning", "dossier", "signature"].includes(requested) ? requested : "sessions";
  }); // sessions | planning | dossier | signature
  const [stages, setStages] = useState([]);
  const [selected, setSelected] = useState(null);

  // Accès aux sessions (backend core/session_access.py) : fermées par défaut,
  // ouvertes le jour même par l'équipe TDL ou à 9h30, fermées à 16h45. On
  // recharge chaque minute pour que l'ouverture/fermeture apparaisse sans
  // recharger la page.
  const load = () => api.get("/stages").then((r) => setStages(r.data)).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La session affichée vient de se fermer (16h45 ou fermée par un agent) :
  // retour à la liste.
  useEffect(() => {
    if (!selected) return;
    const fresh = stages.find((s) => s.id === selected.id);
    if (fresh && !fresh.acces_formateur?.ouvert) {
      toast.info(`Session fermée — ${fresh.acces_formateur?.message || ""}`);
      setSelected(null);
    }
  }, [stages, selected]);

  // Visite guidée automatique au premier passage d'un formateur dans son
  // espace — pour qu'il ne découvre pas seul comment ça marche. Ne se
  // relance pas aux connexions suivantes (flag par compte en localStorage) ;
  // il peut toujours la relancer manuellement depuis le Centre d'aide.
  useEffect(() => {
    if (!user?.id) return;
    const flagKey = `tour_seen_animateur_${user.id}`;
    if (localStorage.getItem(flagKey)) return;
    const category = HELP_CATEGORIES.find((c) => c.key === "animateur");
    if (!category) return;
    localStorage.setItem(flagKey, "1");
    startTour(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const openStage = (s) => {
    if (!s.acces_formateur?.ouvert) {
      toast.info(s.acces_formateur?.message || "Session fermée");
      return;
    }
    setSelected(s);
  };

  const accessLost = (detail) => {
    toast.info(detail || "Session fermée");
    setSelected(null);
    load();
  };

  return (
    <div className="space-y-6" data-testid="animateur-page">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Espace animateur</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">
            {tab === "sessions" ? "Mes sessions" : tab === "planning" ? "Mon planning" : tab === "dossier" ? "Mon dossier" : "Ma signature"}
          </h1>
          <p className="text-gray-500 mt-2">Bienvenue {user?.name}. {stages.length} session(s) attribuée(s).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={tab === "sessions" ? "default" : "outline"} size="sm" onClick={() => setTab("sessions")} className={tab === "sessions" ? "bg-[#0a0a0a] text-white" : ""}>
            <Calendar size={14} className="mr-1" /> Sessions
          </Button>
          <Button variant={tab === "planning" ? "default" : "outline"} size="sm" onClick={() => setTab("planning")} className={tab === "planning" ? "bg-[#0a0a0a] text-white" : ""} data-testid="tab-planning">
            <Calendar size={14} className="mr-1" /> Planning
          </Button>
          <Button variant={tab === "dossier" ? "default" : "outline"} size="sm" onClick={() => setTab("dossier")} className={tab === "dossier" ? "bg-[#0a0a0a] text-white" : ""} data-testid="tab-dossier">
            <UserCircle size={14} className="mr-1" /> Mon dossier
          </Button>
          <Button variant={tab === "signature" ? "default" : "outline"} size="sm" onClick={() => setTab("signature")} className={tab === "signature" ? "bg-[#0a0a0a] text-white" : ""} data-testid="tab-signature">
            <Signature size={14} className="mr-1" /> Ma signature
          </Button>
        </div>
      </div>

      {tab === "planning" && <FormateurPlanningTab />}
      {tab === "dossier" && <DossierTab />}
      {tab === "signature" && <SignatureTab user={user} />}

      {tab === "sessions" && (!selected ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stages.map((s) => {
            const acces = s.acces_formateur || {};
            const ouvert = !!acces.ouvert;
            return (
              <Card
                key={s.id}
                className={`p-5 border rounded-md shadow-none transition-all ${ouvert
                  ? "border-[#0B7238] hover:-translate-y-1 hover:shadow-lg cursor-pointer"
                  : "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed grayscale"}`}
                onClick={() => openStage(s)}
                aria-disabled={!ouvert}
                data-testid={`stage-${s.id}`}
              >
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
                <p className={`flex items-center gap-1 text-xs font-medium mt-3 ${ouvert ? "text-[#0B7238]" : "text-gray-500"}`} data-testid={`stage-acces-${s.id}`}>
                  {ouvert ? <LockOpen size={12} weight="bold" /> : <Lock size={12} weight="bold" />}
                  {ouvert ? "Ouverte" : "Fermée"}{acces.message ? ` — ${acces.message}` : ""}
                </p>
              </Card>
            );
          })}
          {!stages.length && (
            <Card className="p-12 text-center border-dashed col-span-full">
              <p className="text-gray-500">Aucune session attribuée pour l'instant.</p>
            </Card>
          )}
        </div>
      ) : (
        <div>
          <Button variant="outline" size="sm" onClick={() => setSelected(null)} className="mb-4">← Retour aux sessions</Button>
          <Card className="p-6 border border-gray-200 rounded-md shadow-none">
            <h2 className="font-display text-2xl font-bold">{selected.formation_titre}</h2>
            <p className="text-sm text-gray-500 mt-1">{selected.date_debut} au {selected.date_fin} · {selected.lieu_adresse}, {selected.lieu_ville}</p>
            <p className="text-xs text-[#0B7238] mt-1 flex items-center gap-1"><LockOpen size={12} /> {selected.acces_formateur?.message}</p>
            <EmargementPanel stage={selected} todayOnly today={selected.acces_formateur?.jour} onAccessLost={accessLost} />
          </Card>
        </div>
      ))}
    </div>
  );
}