import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Kanban, FolderOpen, ArrowSquareOut, FileArrowUp, CheckCircle, XCircle, PaperPlaneTilt, Warning, Trash, MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";

const COLUMNS = [
  { key: "nouveau", label: "Nouveau", color: "#868e96" },
  { key: "en_verification", label: "En vérification", color: "#F5A623" },
  { key: "complet", label: "Complet", color: "#0052CC" },
  { key: "soumis_ants", label: "Soumis ANTS", color: "#0a0a0a" },
  { key: "termine", label: "Terminé", color: "#0B7238" },
  { key: "rejete", label: "Rejeté", color: "#D0021B" },
];

const PAGE_SIZE = 5;

export default function Dossiers() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [docs, setDocs] = useState([]);
  const [notes, setNotes] = useState("");
  const [dragging, setDragging] = useState(null);
  const [q, setQ] = useState("");
  const [visibleCounts, setVisibleCounts] = useState({});

  const load = () => api.get("/dossiers").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((d) => (d.student_name || "").toLowerCase().includes(query));
  }, [items, q]);

  const showMore = (colKey) => {
    setVisibleCounts((prev) => ({ ...prev, [colKey]: (prev[colKey] || PAGE_SIZE) + PAGE_SIZE }));
  };

  const openDossier = async (d) => {
    const fresh = await api.get(`/dossiers/${d.id}`);
    setSelected(fresh.data);
    setNotes(fresh.data.notes || "");
    const r = await api.get(`/dossiers/${d.id}/documents`);
    setDocs(r.data);
  };

  const moveTo = async (id, status) => {
    try {
      await api.put(`/dossiers/${id}`, { status });
      toast.success(
        status === "complet" || status === "termine" || status === "soumis_ants" || status === "rejete"
          ? "Statut mis à jour — email envoyé à l'étudiant"
          : "Statut mis à jour (synchronisé Trello)"
      );
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const submitDossier = async (d) => {
    await moveTo(d.id, "soumis_ants");
    if (selected?.id === d.id) setSelected({ ...selected, status: "soumis_ants" });
  };

  const saveNotes = async () => {
    await api.put(`/dossiers/${selected.id}`, { notes });
    toast.success("Notes enregistrées");
    load();
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("doc_type", "identite");
    try {
      await api.post(`/dossiers/${selected.id}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success("Document téléversé");
      const r = await api.get(`/dossiers/${selected.id}/documents`);
      setDocs(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur upload");
    }
  };

  const deleteDossier = async (id) => {
    try {
      await api.delete(`/dossiers/${id}`);
      toast.success("Dossier supprimé");
      if (selected?.id === id) setSelected(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const verifyDoc = async (docId, status) => {
    await api.put(`/documents/${docId}/verify`, null, { params: { status } });
    toast.success("Document " + (status === "approved" ? "approuvé" : "rejeté"));
    const r = await api.get(`/dossiers/${selected.id}/documents`);
    setDocs(r.data);
  };

  return (
    <div className="space-y-6" data-testid="dossiers-page">
      <div>
        <p className="overline flex items-center gap-2"><Kanban size={12} /> Synchronisé avec Trello</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Dossiers — Kanban</h1>
        <p className="text-gray-500 mt-2">Glissez-déposez pour faire avancer chaque dossier dans le pipeline ANTS. Les changements de statut notifient l'étudiant par email.</p>
      </div>

      <div className="relative max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-3 text-gray-400" />
        <Input
          placeholder="Rechercher un apprenant..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
          data-testid="dossiers-search"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4" data-testid="kanban-board">
        {COLUMNS.map((col) => {
          const colAllItems = filteredItems.filter((d) => d.status === col.key);
          const visible = visibleCounts[col.key] || PAGE_SIZE;
          const colItems = colAllItems.slice(0, visible);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragging) { moveTo(dragging, col.key); setDragging(null); } }}
              className="bg-gray-50 p-4 rounded-lg flex flex-col gap-3 min-h-[200px]"
              data-testid={`kanban-col-${col.key}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <h3 className="font-semibold text-sm">{col.label}</h3>
                </div>
                <Badge variant="outline" className="font-mono text-xs">{colAllItems.length}</Badge>
              </div>
              <div className="flex flex-col gap-3">
                {colItems.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={() => setDragging(d.id)}
                    onClick={() => openDossier(d)}
                    className="kanban-card relative group bg-white p-4 rounded-md border border-gray-200 shadow-sm hover:border-[#0a0a0a]"
                    data-testid={`dossier-card-${d.id}`}
                  >
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Supprimer le dossier"
                          data-testid={`delete-dossier-${d.id}`}
                        >
                          <Trash size={13} />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer définitivement ce dossier ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            <span className="font-semibold">{d.student_name}</span> — {d.formation_title}. Les documents liés et la carte Trello ne
                            seront pas automatiquement supprimés. Cette action est irréversible.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteDossier(d.id)} className="bg-red-600 hover:bg-red-700 text-white">
                            Supprimer définitivement
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <p className="text-xs text-gray-500 mb-1">{d.category}</p>
                    <p className="font-semibold text-sm leading-tight pr-4">{d.student_name}</p>
                    <p className="text-xs text-gray-600 mt-1 truncate">{d.formation_title}</p>
                    {d.nb_documents_manquants > 0 && (
                      <p className="text-[10px] text-amber-700 mt-2 flex items-center gap-1">
                        <Warning size={10} weight="fill" /> {d.nb_documents_manquants} doc(s) manquant(s)
                      </p>
                    )}
                    {col.key === "complet" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); submitDossier(d); }}
                        className="mt-2 text-xs inline-flex items-center gap-1 text-[#0a0a0a] hover:underline"
                        data-testid={`submit-${d.id}`}
                      >
                        <PaperPlaneTilt size={11} /> Soumettre
                      </button>
                    )}
                    {d.trello_card_url && (
                      <a
                        href={d.trello_card_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-[#0a0a0a] hover:underline mt-2 inline-flex items-center gap-1"
                      >
                        Trello <ArrowSquareOut size={10} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
              {colAllItems.length > visible && (
                <button
                  onClick={() => showMore(col.key)}
                  className="text-xs text-center text-gray-500 hover:text-[#d4af37] py-1"
                  data-testid={`show-more-${col.key}`}
                >
                  Afficher plus ({colAllItems.length - visible})
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-3xl" data-testid="dossier-dialog">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-3 pr-6">
                  <DialogTitle className="font-display">
                    Dossier — {selected.student_name}
                  </DialogTitle>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="p-1.5 text-red-600 hover:bg-red-50 rounded shrink-0" title="Supprimer le dossier" data-testid="dossier-delete-btn">
                        <Trash size={16} />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer définitivement ce dossier ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          <span className="font-semibold">{selected.student_name}</span> — {selected.formation_title}. Les documents liés et la
                          carte Trello ne seront pas automatiquement supprimés. Cette action est irréversible.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteDossier(selected.id)} className="bg-red-600 hover:bg-red-700 text-white">
                          Supprimer définitivement
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                <div>
                  <p className="overline mb-1">Formation</p>
                  <p className="font-semibold">{selected.formation_title}</p>
                  <Badge variant="outline" className="mt-1">{selected.category}</Badge>
                </div>
                <div>
                  <p className="overline mb-1">Statut</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={selected.status}
                      onChange={(e) => { moveTo(selected.id, e.target.value); setSelected({ ...selected, status: e.target.value }); }}
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full"
                      data-testid="dossier-status-select"
                    >
                      {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                    {selected.status === "complet" && (
                      <Button size="sm" onClick={() => submitDossier(selected)} className="bg-[#0a0a0a] text-white whitespace-nowrap" data-testid="dossier-submit-btn">
                        <PaperPlaneTilt size={14} className="mr-1" /> Soumettre
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="overline mb-1">Contact</p>
                  <p className="text-sm">{selected.student_email}</p>
                </div>
                {selected.trello_card_url && (
                  <div>
                    <p className="overline mb-1">Trello</p>
                    <a href={selected.trello_card_url} target="_blank" rel="noreferrer"
                      className="text-sm text-[#0a0a0a] hover:underline inline-flex items-center gap-1">
                      Ouvrir la carte <ArrowSquareOut size={12} />
                    </a>
                  </div>
                )}
              </div>

              {(selected.documents_manquants || []).length > 0 && (
                <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                  <Warning size={16} weight="fill" className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{selected.documents_manquants.length} document(s) manquant(s)</p>
                    <p className="text-xs mt-1">{selected.documents_manquants.join(", ")}</p>
                  </div>
                </div>
              )}

              <div className="mt-6">
                <p className="overline mb-1">Notes internes</p>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="dossier-notes" />
                <Button size="sm" onClick={saveNotes} className="mt-2 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="save-notes-btn">
                  Enregistrer
                </Button>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="overline">Documents</p>
                  <label className="text-sm cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50">
                    <FileArrowUp size={14} /> Téléverser
                    <input type="file" className="hidden" onChange={upload} data-testid="upload-doc-input" />
                  </label>
                </div>
                <div className="space-y-2">
                  {docs.map((d) => (
                    <div key={d.id} className="flex items-center justify-between border border-gray-200 rounded-md p-3" data-testid={`doc-${d.id}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <FolderOpen size={18} className="text-gray-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{d.original_filename}</p>
                          <p className="text-xs text-gray-500">{d.doc_type} · {(d.size / 1024).toFixed(0)} KB</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={
                          d.verification_status === "approved" ? "border-green-500 text-green-600" :
                          d.verification_status === "rejected" ? "border-red-500 text-red-600" : ""
                        }>{d.verification_status}</Badge>
                        <button onClick={() => verifyDoc(d.id, "approved")} className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                          <CheckCircle size={16} weight="fill" />
                        </button>
                        <button onClick={() => verifyDoc(d.id, "rejected")} className="p-1.5 text-red-600 hover:bg-red-50 rounded">
                          <XCircle size={16} weight="fill" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!docs.length && <p className="text-sm text-gray-400 text-center py-4">Aucun document.</p>}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}