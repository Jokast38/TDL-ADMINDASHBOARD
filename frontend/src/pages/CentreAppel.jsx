import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BookAppointmentDialog from "@/components/BookAppointmentDialog";
import {
  Phone, EnvelopeSimple, FileText, CalendarPlus, CheckCircle, Headset, MagnifyingGlass,
} from "@phosphor-icons/react";
import { toast } from "sonner";

// Doit rester synchronisé avec core.config.PIPELINE_STATUS_LABELS côté
// backend. Une couleur DISTINCTE par statut (même les 3 étapes de relance,
// avant partagées et donc impossibles à distinguer d'un coup d'œil sur une
// carte) — dégradé du bleu (premier contact) vers le rouge (sans réponse)
// en passant par le violet (relances), pour lire la progression visuellement.
const COLUMNS = [
  { key: "formulaire_rempli", label: "Formulaire Rempli", color: "#868e96" },
  { key: "lead_entrant_sans_rdv", label: "Lead Entrant Sans RDV", color: "#0052CC" },
  { key: "a_recontacter", label: "A recontacter (dans la journée)", color: "#2563eb" },
  { key: "premiere_relance", label: "Première relance faite", color: "#7048e8" },
  { key: "deuxieme_relance", label: "Deuxième relance faite", color: "#9333ea" },
  { key: "troisieme_relance", label: "Troisième relance faite", color: "#c026d3" },
  { key: "pas_de_reponse", label: "Pas de réponse", color: "#D0021B" },
  { key: "lead_tiede", label: "Lead tiède", color: "#F5A623" },
  { key: "poubelle", label: "Poubelle", color: "#4b5563" },
];
const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));
const DEFAULT_COLUMN = "lead_entrant_sans_rdv";

const DOCUMENT_OPTIONS = [
  "Pièce d'identité", "Permis de conduire", "Justificatif de domicile",
  "Photo d'identité", "Casier judiciaire (B3)", "RIB",
];

const PAGE_SIZE = 10;

export default function CentreAppel() {
  const { user } = useAuth();
  const isAdminLike = user?.role === "admin" || user?.role === "responsable_admission";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState([]);
  const [filterAgent, setFilterAgent] = useState("all");
  const [origins, setOrigins] = useState([]);
  const [filterOrigin, setFilterOrigin] = useState("all");
  const [q, setQ] = useState("");
  const [dragging, setDragging] = useState(null);
  const [visibleCounts, setVisibleCounts] = useState({});
  const [formations, setFormations] = useState([]);

  const [docDialogLead, setDocDialogLead] = useState(null);
  const [docSelection, setDocSelection] = useState([]);
  const [docMessage, setDocMessage] = useState("");
  const [sendingDocs, setSendingDocs] = useState(false);

  const [rdvLead, setRdvLead] = useState(null);

  const [finalizeLead, setFinalizeLead] = useState(null);
  const [finalizeFormationId, setFinalizeFormationId] = useState("");
  const [finalizing, setFinalizing] = useState(false);

  const load = () => {
    setLoading(true);
    const params = { page_size: 200 };
    if (isAdminLike && filterAgent !== "all") params.assigned_to = filterAgent;
    if (filterOrigin !== "all") params.origin = filterOrigin;
    return api.get("/leads", { params })
      .then((r) => setItems(r.data.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  const loadOrigins = () => api.get("/leads/origins").then((r) => setOrigins(r.data || [])).catch(() => setOrigins([]));

  useEffect(() => { load(); }, [filterAgent, filterOrigin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadOrigins();
    if (isAdminLike) {
      api.get("/employees").then((r) => setAgents((r.data || []).filter((u) => u.role === "agent_telephonique"))).catch(() => {});
    }
    api.get("/formations", { params: { active_only: true } }).then((r) => setFormations(r.data || [])).catch(() => {});
  }, [isAdminLike]);

  const filteredItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((l) =>
      (l.name || "").toLowerCase().includes(query) ||
      (l.email || "").toLowerCase().includes(query) ||
      (l.phone || "").toLowerCase().includes(query)
    );
  }, [items, q]);

  const showMore = (colKey) => setVisibleCounts((prev) => ({ ...prev, [colKey]: (prev[colKey] || PAGE_SIZE) + PAGE_SIZE }));

  const moveTo = async (id, pipeline_status) => {
    try {
      await api.put(`/leads/${id}`, { pipeline_status });
      setItems((prev) => prev.map((l) => (l.id === id ? { ...l, pipeline_status } : l)));
      toast.success("Déplacé");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const assignTo = async (id, assigned_to) => {
    try {
      await api.put(`/leads/${id}`, { assigned_to });
      setItems((prev) => prev.map((l) => (l.id === id ? { ...l, assigned_to } : l)));
      toast.success("Assigné");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const openDocDialog = (lead) => {
    setDocDialogLead(lead);
    setDocSelection([]);
    setDocMessage("");
  };

  const sendDocRequest = async () => {
    if (!docSelection.length) return toast.error("Sélectionnez au moins un document");
    setSendingDocs(true);
    try {
      await api.post(`/leads/${docDialogLead.id}/request-documents`, { documents: docSelection, message: docMessage || undefined });
      toast.success("Email de demande de documents envoyé");
      setDocDialogLead(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'envoi");
    } finally {
      setSendingDocs(false);
    }
  };

  const openFinalize = (lead) => {
    setFinalizeLead(lead);
    setFinalizeFormationId("");
  };

  const finalizeInscription = async () => {
    if (!finalizeFormationId) return toast.error("Choisissez une formation");
    if (!finalizeLead.email) return toast.error("Ce prospect n'a pas d'email — complétez sa fiche avant de finaliser");
    setFinalizing(true);
    try {
      await api.post("/inscriptions", {
        formation_id: finalizeFormationId,
        student_name: finalizeLead.name,
        student_email: finalizeLead.email,
        student_phone: finalizeLead.phone,
        source: "centre_appel",
      });
      await api.put(`/leads/${finalizeLead.id}`, { qualification: "inscrit", pipeline_status: finalizeLead.pipeline_status });
      toast.success("Inscription créée — à retrouver dans Dossiers");
      setFinalizeLead(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la création de l'inscription");
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="centre-appel-page">
      <div>
        <p className="overline flex items-center gap-2"><Headset size={12} /> Centre d'appel</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Mes prospects</h1>
        <p className="text-gray-500 mt-2">Glissez-déposez pour faire avancer chaque prospect dans le pipeline d'appel.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-md sm:w-72">
          <MagnifyingGlass size={16} className="absolute left-3 top-3 text-gray-400" />
          <Input placeholder="Rechercher un prospect..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="centre-appel-search" />
        </div>
        {isAdminLike && (
          <Select value={filterAgent} onValueChange={setFilterAgent}>
            <SelectTrigger className="w-full sm:w-56 h-9 text-xs" data-testid="centre-appel-filter-agent"><SelectValue placeholder="Agent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les agents</SelectItem>
              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Onglets d'origine du lead — regroupement serveur (voir GET
          /leads/origins et core.config.canonicalize_lead_origin), car il
          existe des dizaines de valeurs brutes différentes (un import Excel
          crée un libellé par onglet mensuel). */}
      <div className="flex items-center gap-1.5 flex-wrap" data-testid="centre-appel-origin-tabs">
        <button
          onClick={() => setFilterOrigin("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filterOrigin === "all" ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
        >
          Toutes origines
        </button>
        {origins.map((o) => (
          <button
            key={o.key}
            onClick={() => setFilterOrigin(o.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filterOrigin === o.key ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
            data-testid={`centre-appel-origin-${o.key}`}
          >
            {o.label} <span className="opacity-60">({o.count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Card className="p-12 text-center border-dashed"><p className="text-gray-500">Chargement...</p></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4" data-testid="centre-appel-kanban">
          {COLUMNS.map((col) => {
            const colAllItems = filteredItems.filter((l) => (l.pipeline_status || DEFAULT_COLUMN) === col.key);
            const visible = visibleCounts[col.key] || PAGE_SIZE;
            const colItems = colAllItems.slice(0, visible);
            return (
              <div
                key={col.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragging) { moveTo(dragging, col.key); setDragging(null); } }}
                className="bg-gray-50 p-4 rounded-lg flex flex-col gap-3 min-h-[200px]"
                data-testid={`centre-appel-col-${col.key}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                    <h3 className="font-semibold text-xs leading-tight">{col.label}</h3>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs shrink-0">{colAllItems.length}</Badge>
                </div>
                <div className="flex flex-col gap-3">
                  {colItems.map((l) => (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setDragging(l.id)}
                      className="bg-white p-3 rounded-md border border-gray-200 border-l-4 shadow-sm hover:border-[#0a0a0a]"
                      style={{ borderLeftColor: (COLUMN_BY_KEY[l.pipeline_status || DEFAULT_COLUMN] || {}).color }}
                      data-testid={`centre-appel-card-${l.id}`}
                    >
                      <p className="font-semibold text-sm leading-tight">{l.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{l.interest || "—"}</p>
                      {isAdminLike && (
                        <Select value={l.assigned_to || "__none__"} onValueChange={(v) => assignTo(l.id, v === "__none__" ? null : v)}>
                          <SelectTrigger className="h-7 text-[11px] mt-2"><SelectValue placeholder="Agent" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Non assigné</SelectItem>
                            {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <div className="flex items-center gap-1 mt-2.5">
                        <a href={l.phone ? `tel:${l.phone}` : undefined} className={`p-1.5 rounded hover:bg-gray-100 ${!l.phone ? "opacity-30 pointer-events-none" : "text-gray-600"}`} title="Appeler">
                          <Phone size={14} />
                        </a>
                        <a href={l.email ? `mailto:${l.email}` : undefined} className={`p-1.5 rounded hover:bg-gray-100 ${!l.email ? "opacity-30 pointer-events-none" : "text-gray-600"}`} title="Email">
                          <EnvelopeSimple size={14} />
                        </a>
                        <button onClick={() => openDocDialog(l)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Demander des documents" data-testid={`centre-appel-docs-${l.id}`}>
                          <FileText size={14} />
                        </button>
                        <button onClick={() => setRdvLead(l)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Planifier un rendez-vous" data-testid={`centre-appel-rdv-${l.id}`}>
                          <CalendarPlus size={14} />
                        </button>
                        <button onClick={() => openFinalize(l)} className="p-1.5 rounded hover:bg-green-50 text-green-600 ml-auto" title="Finaliser l'inscription" data-testid={`centre-appel-finalize-${l.id}`}>
                          <CheckCircle size={16} weight="fill" />
                        </button>
                      </div>
                      {l.documents_requested_at && (
                        <p className="text-[10px] text-gray-400 mt-1.5">Documents demandés le {l.documents_requested_at.slice(0, 10)}</p>
                      )}
                    </div>
                  ))}
                </div>
                {colAllItems.length > visible && (
                  <button onClick={() => showMore(col.key)} className="text-xs text-center text-gray-500 hover:text-[#d4af37] py-1">
                    Afficher plus ({colAllItems.length - visible})
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Demande de documents */}
      <Dialog open={!!docDialogLead} onOpenChange={(v) => !v && setDocDialogLead(null)}>
        <DialogContent data-testid="centre-appel-doc-dialog">
          <DialogHeader><DialogTitle>Demander des documents — {docDialogLead?.name}</DialogTitle></DialogHeader>
          <p className="text-xs text-gray-500 -mt-2">Un email sera envoyé à {docDialogLead?.email || "(pas d'email renseigné)"}.</p>
          <div className="space-y-2">
            {DOCUMENT_OPTIONS.map((doc) => (
              <label key={doc} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={docSelection.includes(doc)}
                  onCheckedChange={(c) => setDocSelection((prev) => (c ? [...prev, doc] : prev.filter((d) => d !== doc)))}
                />
                {doc}
              </label>
            ))}
          </div>
          <Textarea rows={2} placeholder="Message complémentaire (facultatif)" value={docMessage} onChange={(e) => setDocMessage(e.target.value)} />
          <Button onClick={sendDocRequest} disabled={sendingDocs || !docDialogLead?.email} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white w-full" data-testid="centre-appel-send-docs">
            {sendingDocs ? "Envoi..." : "Envoyer la demande"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Finaliser l'inscription */}
      <Dialog open={!!finalizeLead} onOpenChange={(v) => !v && setFinalizeLead(null)}>
        <DialogContent data-testid="centre-appel-finalize-dialog">
          <DialogHeader><DialogTitle>Finaliser l'inscription — {finalizeLead?.name}</DialogTitle></DialogHeader>
          <p className="text-xs text-gray-500 -mt-2">{finalizeLead?.email} · {finalizeLead?.phone}</p>
          <Select value={finalizeFormationId} onValueChange={setFinalizeFormationId}>
            <SelectTrigger data-testid="centre-appel-finalize-formation"><SelectValue placeholder="Choisir la formation" /></SelectTrigger>
            <SelectContent>
              {formations.map((f) => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={finalizeInscription} disabled={finalizing} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white w-full" data-testid="centre-appel-confirm-finalize">
            {finalizing ? "Création..." : "Créer l'inscription"}
          </Button>
        </DialogContent>
      </Dialog>

      <BookAppointmentDialog
        open={!!rdvLead}
        onOpenChange={(v) => !v && setRdvLead(null)}
        lead={rdvLead}
        onCreated={() => { setRdvLead(null); toast.success("Rendez-vous planifié"); }}
      />
    </div>
  );
}
