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
  Phone, EnvelopeSimple, FileText, CalendarPlus, CheckCircle, Headset, MagnifyingGlass, X as XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatDateTimeFR } from "@/lib/dateFormat";

const HISTORY_ACTION_LABELS = {
  lead_note: "Note ajoutée",
  lead_qualifie: "Qualification modifiée",
  lead_pipeline_status: "Déplacé dans le pipeline",
  lead_assigne: "Attribué",
  lead_demande_documents: "Documents demandés",
  lead_contacte: "Contact enregistré",
  rdv_appel_cree: "RDV d'appel créé",
  rdv_physique_cree: "RDV physique créé",
  paiement_lien_envoye: "Lien de paiement envoyé",
  dossier_traite: "Dossier traité",
};

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
  // Filtre par formation — affiche uniquement les prospects de la catégorie
  // de la formation choisie (les leads n'ont pas de formation_id précis,
  // seulement une catégorie déduite de leur intérêt, voir
  // core.utils._category_for_interest côté backend), plutôt que tout
  // mélanger par défaut.
  const [filterFormationCategory, setFilterFormationCategory] = useState("all");

  const [docDialogLead, setDocDialogLead] = useState(null);
  const [docSelection, setDocSelection] = useState([]);
  const [docMessage, setDocMessage] = useState("");
  const [sendingDocs, setSendingDocs] = useState(false);

  const [rdvLead, setRdvLead] = useState(null);

  const [finalizeLead, setFinalizeLead] = useState(null);
  const [finalizeFormationId, setFinalizeFormationId] = useState("");
  const [finalizing, setFinalizing] = useState(false);

  const [detailLead, setDetailLead] = useState(null);
  const [emails, setEmails] = useState([]);
  const [history, setHistory] = useState([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const loadHistory = (leadId) => api.get(`/leads/${leadId}/activity`).then((r) => setHistory(r.data || [])).catch(() => setHistory([]));

  const openDetail = (lead) => {
    setDetailLead(lead);
    setNoteDraft("");
    api.get(`/leads/${lead.id}/emails`).then((r) => setEmails(r.data || [])).catch(() => setEmails([]));
    loadHistory(lead.id);
  };

  const saveNote = async () => {
    if (!noteDraft.trim()) return;
    setSavingNote(true);
    try {
      const { data } = await api.put(`/leads/${detailLead.id}`, { notes: noteDraft.trim() });
      setDetailLead(data);
      setItems((prev) => prev.map((l) => (l.id === data.id ? data : l)));
      setNoteDraft("");
      toast.success("Note enregistrée");
      loadHistory(data.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSavingNote(false);
    }
  };

  const load = () => {
    setLoading(true);
    const params = { page_size: 200 };
    if (isAdminLike && filterAgent !== "all") params.assigned_to = filterAgent;
    if (filterOrigin !== "all") params.origin = filterOrigin;
    if (filterFormationCategory !== "all") params.category = filterFormationCategory;
    return api.get("/leads", { params })
      .then((r) => setItems(r.data.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  const loadOrigins = () => api.get("/leads/origins").then((r) => setOrigins(r.data || [])).catch(() => setOrigins([]));

  useEffect(() => { load(); }, [filterAgent, filterOrigin, filterFormationCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadOrigins();
    if (isAdminLike) {
      api.get("/employees").then((r) => setAgents((r.data || []).filter((u) => u.role === "agent_telephonique"))).catch(() => {});
    }
    api.get("/formations", { params: { active_only: true } }).then((r) => setFormations(r.data || [])).catch(() => {});
  }, [isAdminLike]);

  // Une formation par catégorie affichée (plusieurs formations peuvent
  // partager la même catégorie, ex: VTC et Taxi -> VTC_TAXI) pour éviter des
  // entrées en double dans le menu alors que le filtre porte sur la
  // catégorie, pas sur la formation précise.
  const formationOptions = useMemo(() => {
    const seen = new Set();
    return formations.filter((f) => {
      if (!f.category || seen.has(f.category)) return false;
      seen.add(f.category);
      return true;
    });
  }, [formations]);

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
        <Select value={filterFormationCategory} onValueChange={setFilterFormationCategory}>
          <SelectTrigger className="w-full sm:w-64 h-9 text-xs" data-testid="centre-appel-filter-formation"><SelectValue placeholder="Formation" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les formations</SelectItem>
            {formationOptions.map((f) => <SelectItem key={f.category} value={f.category}>{f.title}</SelectItem>)}
          </SelectContent>
        </Select>
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
        <div className="flex gap-4 overflow-x-auto pb-2" data-testid="centre-appel-kanban">
          {COLUMNS.map((col) => {
            const colAllItems = filteredItems.filter((l) => (l.pipeline_status || DEFAULT_COLUMN) === col.key);
            const visible = visibleCounts[col.key] || PAGE_SIZE;
            const colItems = colAllItems.slice(0, visible);
            // Scroll interne à la colonne : charge la suite au lieu de laisser
            // la colonne grandir sans fin (et casser l'alignement horizontal
            // des autres colonnes à côté).
            const onColScroll = (e) => {
              const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
              if (scrollHeight - scrollTop - clientHeight < 80 && colAllItems.length > visible) {
                showMore(col.key);
              }
            };
            return (
              <div
                key={col.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragging) { moveTo(dragging, col.key); setDragging(null); } }}
                className="bg-gray-50 p-4 rounded-lg flex flex-col gap-3 w-72 shrink-0"
                data-testid={`centre-appel-col-${col.key}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                    <h3 className="font-semibold text-xs leading-tight">{col.label}</h3>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs shrink-0">{colAllItems.length}</Badge>
                </div>
                <div className="flex flex-col gap-3 overflow-y-auto pr-0.5" style={{ maxHeight: "calc(100vh - 320px)" }} onScroll={onColScroll}>
                  {colItems.map((l) => (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setDragging(l.id)}
                      onClick={() => openDetail(l)}
                      className="bg-white p-3 rounded-md border border-gray-200 border-l-4 shadow-sm hover:border-[#0a0a0a] cursor-pointer"
                      style={{ borderLeftColor: (COLUMN_BY_KEY[l.pipeline_status || DEFAULT_COLUMN] || {}).color }}
                      data-testid={`centre-appel-card-${l.id}`}
                    >
                      <p className="font-semibold text-sm leading-tight">{l.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{l.interest || "—"}</p>
                      {l.created_at && (
                        <p className="text-[10px] text-gray-400 mt-0.5">Arrivé le {l.created_at.slice(0, 10)}</p>
                      )}
                      {isAdminLike && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <Select value={l.assigned_to || "__none__"} onValueChange={(v) => assignTo(l.id, v === "__none__" ? null : v)}>
                            <SelectTrigger className="h-7 text-[11px] mt-2"><SelectValue placeholder="Agent" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Non assigné</SelectItem>
                              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-2.5" onClick={(e) => e.stopPropagation()}>
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

      {/* Détail du prospect — ouvert en cliquant n'importe où sur la carte
          (hors boutons d'action, qui gardent leur propre comportement). */}
      <Dialog open={!!detailLead} onOpenChange={(v) => !v && setDetailLead(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="centre-appel-detail-dialog">
          {detailLead && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-6">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: (COLUMN_BY_KEY[detailLead.pipeline_status || DEFAULT_COLUMN] || {}).color }}
                  />
                  {detailLead.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400">Email</p>
                    <p className="truncate">{detailLead.email || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Téléphone</p>
                    <p>{detailLead.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Intérêt</p>
                    <p>{detailLead.interest || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Statut pipeline</p>
                    <p>{(COLUMN_BY_KEY[detailLead.pipeline_status || DEFAULT_COLUMN] || {}).label}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Origine (brute)</p>
                    <p className="truncate" title={detailLead.source}>{detailLead.source || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Relances</p>
                    <p>{detailLead.relance_count || 0}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-400 mb-1">Notes</p>
                  {detailLead.notes && (
                    <p className="whitespace-pre-line bg-gray-50 rounded-md p-2 text-xs mb-2">{detailLead.notes}</p>
                  )}
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Ajouter une note..."
                    className="text-xs"
                    rows={2}
                    data-testid="centre-appel-note-input"
                  />
                  <Button
                    size="sm"
                    className="mt-1"
                    disabled={savingNote || !noteDraft.trim()}
                    onClick={saveNote}
                    data-testid="centre-appel-note-save"
                  >
                    {savingNote ? "Enregistrement..." : "Enregistrer la note"}
                  </Button>
                </div>

                {detailLead.documents_requested?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">
                      Documents demandés {detailLead.documents_requested_at ? `(${detailLead.documents_requested_at.slice(0, 10)})` : ""}
                    </p>
                    <ul className="text-xs list-disc list-inside text-gray-600">
                      {detailLead.documents_requested.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-400 mb-1">Historique des emails ({emails.length})</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {emails.slice(0, 10).map((e, i) => (
                      <p key={i} className="text-xs text-gray-500 truncate">
                        {e.created_at?.slice(0, 10)} — {e.subject}
                      </p>
                    ))}
                    {!emails.length && <p className="text-xs text-gray-400">Aucun email envoyé.</p>}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-400 mb-1">Historique ({history.length})</p>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {history.map((h, i) => (
                      <div key={i} className="text-xs text-gray-600 border-l-2 border-gray-200 pl-2">
                        <span className="text-gray-400">{h.at ? formatDateTimeFR(h.at) : ""}</span>
                        {" — "}
                        <span className="font-medium">{h.user_name || "Système"}</span>
                        {" : "}
                        <span>{HISTORY_ACTION_LABELS[h.action] || h.action}</span>
                        {h.meta?.pipeline_status && (
                          <span className="text-gray-500"> → {(COLUMN_BY_KEY[h.meta.pipeline_status] || {}).label || h.meta.pipeline_status}</span>
                        )}
                        {h.meta?.assigned_to_name && <span className="text-gray-500"> → {h.meta.assigned_to_name}</span>}
                        {h.meta?.qualification && <span className="text-gray-500"> → {h.meta.qualification}</span>}
                      </div>
                    ))}
                    {!history.length && <p className="text-xs text-gray-400">Aucun historique.</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <Button variant="outline" size="sm" onClick={() => setDetailLead(null)} data-testid="centre-appel-detail-close">
                    <XIcon size={14} className="mr-1" /> Fermer
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
