import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { MagnifyingGlass, EnvelopeSimple, Phone, GraduationCap, FolderOpen, Sparkle, PaperPlaneTilt, Signature, Trash, DownloadSimple, UsersThree } from "@phosphor-icons/react";
import { toast } from "sonner";

const PAGE_SIZE = 25;

// Seule cette catégorie ("Récupération de points") donne lieu à
// l'attestation officielle de stage — doit rester synchronisé avec
// ATTESTATION_CATEGORY côté backend (routers/stage_attestations.py).
const ATTESTATION_CATEGORY = "PERMIS";

// Les formations VTC/Taxi et permis B (AUTO_ECOLE) passent par le workflow
// examen CMA (voir StudentSpace.jsx) — pas l'ECSR, le TP Vente (VENTE), ni
// la récupération de points de permis (catégorie PERMIS, à ne pas
// confondre avec le permis B). Pour les autres formations, l'agent envoie
// directement un email de réussite une fois le résultat connu. Doit rester
// synchronisé avec CMA_CATEGORIES côté backend (routers/exams.py).
const CMA_CATEGORIES = ["VTC_TAXI", "AUTO_ECOLE"];

const DOC_TYPE_LABELS = {
  identite: "Pièce d'identité", photo: "Photo d'identité", permis: "Permis de conduire",
  justificatif_domicile: "Justificatif de domicile", casier_judiciaire: "Casier judiciaire (B3)",
  cv: "CV", diplome: "Diplôme", rib: "RIB", autre: "Autre document",
};

const DOSSIER_STATUS_LABEL = {
  nouveau: "À traiter", en_verification: "En cours", complet: "Complet",
  soumis_ants: "Soumis ANTS", termine: "Terminé", rejete: "À corriger",
};

const DOSSIER_STATUS_COLOR = {
  nouveau: "bg-gray-100 text-gray-700",
  en_verification: "bg-[#F5A623]/10 text-[#F5A623]",
  complet: "bg-blue-100 text-blue-700",
  soumis_ants: "bg-gray-800 text-white",
  termine: "bg-[#0B7238]/10 text-[#0B7238]",
  rejete: "bg-red-100 text-red-700",
};

const PAYMENT_LABEL = { pending: "En attente", paid: "Payé", refunded: "Remboursé" };

const CENTER_OPTIONS = ["Épinay-sur-Seine (93)", "Creil (60)"];

// Modèle "Convocation à un examen" : génère l'objet + le message à partir de
// l'intitulé de l'examen, la date de convocation et le centre — l'agent peut
// ensuite modifier le texte généré avant l'envoi (voir insertConvocationTemplate).
function convocationText({ studentName, intitule, date, centre }) {
  const dateLabel = date ? new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "[date à préciser]";
  return {
    subject: `Convocation à l'examen — ${intitule || "[intitulé de l'examen]"}`,
    message:
      `Bonjour ${studentName},\n\n` +
      `Vous êtes convoqué(e) à l'examen "${intitule || "[intitulé de l'examen]"}", qui se déroulera :\n\n` +
      `Date : ${dateLabel}\n` +
      `Centre : ${centre || "[centre à préciser]"}\n\n` +
      `Merci de vous présenter 15 minutes avant l'heure de convocation, muni(e) d'une pièce d'identité valide.\n\n` +
      `Cordialement,\nTDL Formation`,
  };
}

export default function Students() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dossierFilter, setDossierFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [sending, setSending] = useState(false);
  const [composeTarget, setComposeTarget] = useState(null);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composing, setComposing] = useState(false);
  const [antsStatus, setAntsStatus] = useState(null);
  const [downloadingAnts, setDownloadingAnts] = useState(false);

  // Sélection multiple (cases à cocher) pour les actions groupées : suppression,
  // email groupé, notification d'attestation, téléchargement des attestations.
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState(null); // { ids: [...] } — un seul id ou plusieurs
  const [deleting, setDeleting] = useState(false);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [bulkSubject, setBulkSubject] = useState("");
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkNotifying, setBulkNotifying] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [mailTemplate, setMailTemplate] = useState("libre"); // "libre" | "convocation"
  const [convocIntitule, setConvocIntitule] = useState("");
  const [convocDate, setConvocDate] = useState("");
  const [convocCentre, setConvocCentre] = useState(CENTER_OPTIONS[0]);

  const load = () => {
    setLoading(true);
    api.get("/students")
      .then((r) => setItems(r.data))
      .catch((e) => toast.error(e.response?.data?.detail || "Erreur de chargement"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const categories = useMemo(() => {
    const set = new Set();
    items.forEach((s) => (s.categories || []).forEach((c) => set.add(c)));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => items.filter((s) => {
    const query = q.trim().toLowerCase();
    const matchesQuery = !query || `${s.name || ""} ${s.email || ""}`.toLowerCase().includes(query);
    const matchesCategory = categoryFilter === "all" || (s.categories || []).includes(categoryFilter);
    const matchesDossier =
      dossierFilter === "all" ? true :
      dossierFilter === "aucun" ? !s.dossier_status :
      s.dossier_status === dossierFilter;
    return matchesQuery && matchesCategory && matchesDossier;
  }), [items, q, categoryFilter, dossierFilter]);

  useEffect(() => { setPage(1); }, [q, categoryFilter, dossierFilter]);

  const openDossier = async (s) => {
    if (!s.dossier_id) return toast.error("Aucun dossier pour cet apprenant");
    setAntsStatus(null);
    try {
      const [dossierRes, docsRes] = await Promise.all([
        api.get(`/dossiers/${s.dossier_id}`),
        api.get(`/dossiers/${s.dossier_id}/documents`),
      ]);
      setSelected(dossierRes.data);
      setSelectedDocs(docsRes.data);
      if (dossierRes.data.category === ATTESTATION_CATEGORY) {
        api.get(`/dossiers/${s.dossier_id}/ants-bundle/status`).then((r) => setAntsStatus(r.data)).catch(() => {});
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de chargement du dossier");
    }
  };

  const downloadAntsBundle = async () => {
    if (!selected) return;
    setDownloadingAnts(true);
    try {
      const res = await api.get(`/dossiers/${selected.id}/ants-bundle`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `Dossier_ANTS_${selected.student_name}.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Erreur lors du téléchargement du dossier ANTS");
    } finally {
      setDownloadingAnts(false);
    }
  };

  const openCompose = (s) => {
    setComposeTarget(s);
    setComposeSubject("");
    setComposeMessage("");
    setMailTemplate("libre");
    setConvocIntitule(""); setConvocDate(""); setConvocCentre(CENTER_OPTIONS[0]);
  };

  const insertConvocationTemplate = () => {
    const { subject, message } = convocationText({
      studentName: composeTarget?.name || "", intitule: convocIntitule, date: convocDate, centre: convocCentre,
    });
    setComposeSubject(subject);
    setComposeMessage(message);
  };

  const sendCompose = async () => {
    if (!composeSubject.trim() || !composeMessage.trim()) {
      return toast.error("Objet et message sont requis");
    }
    setComposing(true);
    try {
      const fd = new FormData();
      fd.append("to", composeTarget.email);
      fd.append("subject", composeSubject.trim());
      fd.append("message", composeMessage);
      await api.post("/email/send-custom", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Email envoyé");
      setComposeTarget(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'envoi");
    } finally {
      setComposing(false);
    }
  };

  const sendSuccessEmail = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const { data } = await api.post(`/dossiers/${selected.id}/success-email`);
      setSelected(data);
      toast.success("Email de réussite envoyé — dossier marqué terminé");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSending(false);
    }
  };

  const notifyAttestation = async (s) => {
    if (!s.dossier_id) return toast.error("Aucun dossier pour cet apprenant");
    try {
      await api.post(`/dossiers/${s.dossier_id}/attestation/notify`);
      toast.success("Apprenant notifié — attestation disponible sur son espace");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const toggleChecked = (id) => setCheckedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleCheckAllOnPage = (pagedItems) => setCheckedIds((prev) => {
    const allChecked = pagedItems.every((s) => prev.has(s.id));
    const next = new Set(prev);
    pagedItems.forEach((s) => { if (allChecked) next.delete(s.id); else next.add(s.id); });
    return next;
  });

  const runDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.ids.length === 1) {
        await api.delete(`/students/${deleteTarget.ids[0]}`);
      } else {
        await api.post("/students/bulk-delete", { ids: deleteTarget.ids });
      }
      toast.success(deleteTarget.ids.length > 1 ? `${deleteTarget.ids.length} apprenant(s) supprimé(s)` : "Apprenant supprimé");
      setCheckedIds((prev) => { const next = new Set(prev); deleteTarget.ids.forEach((id) => next.delete(id)); return next; });
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  const openBulkEmail = () => {
    setBulkSubject(""); setBulkMessage("");
    setBulkEmailOpen(true);
  };

  const sendBulkEmail = async () => {
    if (!bulkSubject.trim() || !bulkMessage.trim()) return toast.error("Objet et message sont requis");
    setBulkSending(true);
    try {
      const { data } = await api.post("/students/bulk-email", {
        ids: Array.from(checkedIds), subject: bulkSubject.trim(), message: bulkMessage,
      });
      toast.success(`Email envoyé à ${data.sent}/${data.total} apprenant(s)`);
      setBulkEmailOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'envoi");
    } finally {
      setBulkSending(false);
    }
  };

  const bulkNotifyAttestation = async () => {
    const dossierIds = items.filter((s) => checkedIds.has(s.id) && s.dossier_id).map((s) => s.dossier_id);
    if (!dossierIds.length) return toast.error("Aucun apprenant sélectionné n'a de dossier");
    setBulkNotifying(true);
    try {
      const { data } = await api.post("/students/bulk-notify-attestation", { dossier_ids: dossierIds });
      toast.success(`${data.notified} attestation(s) notifiée(s)${data.skipped?.length ? ` · ${data.skipped.length} ignorée(s) (pas éligible)` : ""}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setBulkNotifying(false);
    }
  };

  const bulkDownloadAttestations = async () => {
    const dossierIds = items.filter((s) => checkedIds.has(s.id) && s.dossier_id).map((s) => s.dossier_id);
    if (!dossierIds.length) return toast.error("Aucun apprenant sélectionné n'a de dossier");
    setBulkDownloading(true);
    try {
      const res = await api.get("/students/bulk-attestations-zip", {
        params: { dossier_ids: dossierIds.join(",") }, responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "Attestations.zip"; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Aucune attestation disponible pour cette sélection");
    } finally {
      setBulkDownloading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6" data-testid="students-page">
      <div>
        <p className="overline">Vue d'ensemble</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Apprenants</h1>
        <p className="text-gray-500 mt-2">{items.length} apprenant(s) au total.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-3 text-gray-400" />
          <Input
            placeholder="Rechercher un apprenant (nom, email)..."
            value={q} onChange={(e) => setQ(e.target.value)}
            className="pl-9" data-testid="students-search"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48" data-testid="students-filter-category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Catégorie : toutes</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dossierFilter} onValueChange={setDossierFilter}>
          <SelectTrigger className="w-48" data-testid="students-filter-dossier"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Dossier : tous</SelectItem>
            {Object.entries(DOSSIER_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            <SelectItem value="aucun">Sans dossier</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {checkedIds.size > 0 && (
        <Card className="p-3 border border-[#d4af37]/40 bg-[#fff8e1]/40 rounded-md shadow-none flex flex-wrap items-center gap-2" data-testid="bulk-actions-bar">
          <span className="text-sm font-medium flex items-center gap-1.5 mr-2">
            <UsersThree size={16} /> {checkedIds.size} sélectionné(s)
          </span>
          <Button size="sm" variant="outline" onClick={openBulkEmail} data-testid="bulk-email-btn">
            <EnvelopeSimple size={14} className="mr-1" /> Email groupé
          </Button>
          <Button size="sm" variant="outline" onClick={bulkNotifyAttestation} disabled={bulkNotifying} data-testid="bulk-notify-attestation-btn">
            <Signature size={14} className="mr-1" /> {bulkNotifying ? "..." : "Notifier attestations"}
          </Button>
          <Button size="sm" variant="outline" onClick={bulkDownloadAttestations} disabled={bulkDownloading} data-testid="bulk-download-attestations-btn">
            <DownloadSimple size={14} className="mr-1" /> {bulkDownloading ? "..." : "Télécharger attestations"}
          </Button>
          <AlertDialog open={deleteTarget?.bulk === true} onOpenChange={(v) => !v && setDeleteTarget(null)}>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 ml-auto" onClick={() => setDeleteTarget({ ids: Array.from(checkedIds), bulk: true })} data-testid="bulk-delete-btn">
                <Trash size={14} className="mr-1" /> Supprimer la sélection
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer {deleteTarget?.ids.length} apprenant(s) ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible : les comptes, leurs inscriptions et leurs dossiers seront supprimés définitivement.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={runDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
                  {deleting ? "Suppression..." : "Supprimer définitivement"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      )}

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 w-8">
                  <input
                    type="checkbox"
                    checked={paged.length > 0 && paged.every((s) => checkedIds.has(s.id))}
                    onChange={() => toggleCheckAllOnPage(paged)}
                    aria-label="Tout sélectionner"
                    data-testid="students-check-all"
                  />
                </th>
                <th className="py-3 px-4 overline">Apprenant</th>
                <th className="py-3 px-4 overline">Formation(s)</th>
                <th className="py-3 px-4 overline">Paiement</th>
                <th className="py-3 px-4 overline">Dossier</th>
                <th className="py-3 px-4 overline">Inscrit(e) le</th>
                <th className="py-3 px-4 overline text-right">Contact</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`student-row-${s.id}`}>
                  <td className="py-3 px-4">
                    <input
                      type="checkbox" checked={checkedIds.has(s.id)} onChange={() => toggleChecked(s.id)}
                      aria-label={`Sélectionner ${s.name}`} data-testid={`student-check-${s.id}`}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-gray-500">{s.email}</p>
                    {s.phone && <p className="text-xs text-gray-400">{s.phone}</p>}
                  </td>
                  <td className="py-3 px-4">
                    {s.formations?.length ? (
                      <div className="space-y-1">
                        <p className="truncate max-w-[220px]">{s.formations[0]}</p>
                        {s.formations.length > 1 && (
                          <p className="text-xs text-gray-400">+{s.formations.length - 1} autre(s)</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300 inline-flex items-center gap-1"><GraduationCap size={12} /> Aucune</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {s.payment_status ? (
                      <Badge className={
                        s.payment_status === "paid" ? "bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10" :
                        s.payment_status === "refunded" ? "bg-gray-200 text-gray-600 hover:bg-gray-200" :
                        "bg-[#F5A623]/10 text-[#F5A623] hover:bg-[#F5A623]/10"
                      }>{PAYMENT_LABEL[s.payment_status] || s.payment_status}</Badge>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="py-3 px-4">
                    {s.dossier_status ? (
                      <Badge className={`${DOSSIER_STATUS_COLOR[s.dossier_status] || "bg-gray-100 text-gray-700"} hover:opacity-90`}>
                        {DOSSIER_STATUS_LABEL[s.dossier_status] || s.dossier_status}
                      </Badge>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-500 font-mono">
                    {s.last_inscription_at ? new Date(s.last_inscription_at).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      {s.dossier_id && (
                        <button onClick={() => openDossier(s)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="Voir le dossier" data-testid={`view-dossier-${s.id}`}>
                          <FolderOpen size={14} />
                        </button>
                      )}
                      {s.dossier_id && (s.categories || []).includes(ATTESTATION_CATEGORY) && (
                        <button
                          onClick={() => notifyAttestation(s)}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                          title="Notifier la disponibilité de l'attestation de stage (uniquement si le stage est terminé)"
                          data-testid={`notify-attestation-${s.id}`}
                        >
                          <Signature size={14} />
                        </button>
                      )}
                      {s.email && (
                        <button onClick={() => openCompose(s)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="Envoyer un email" data-testid={`compose-email-${s.id}`}>
                          <EnvelopeSimple size={14} />
                        </button>
                      )}
                      {s.phone && (
                        <a href={`tel:${s.phone}`} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="Appeler">
                          <Phone size={14} />
                        </a>
                      )}
                      <AlertDialog open={deleteTarget?.ids?.[0] === s.id && !deleteTarget?.bulk} onOpenChange={(v) => !v && setDeleteTarget(null)}>
                        <AlertDialogTrigger asChild>
                          <button
                            onClick={() => setDeleteTarget({ ids: [s.id] })}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Supprimer cet apprenant"
                            data-testid={`delete-student-${s.id}`}
                          >
                            <Trash size={14} />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer {s.name} ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Cette action est irréversible : le compte, ses inscriptions et ses dossiers seront supprimés définitivement.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={runDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
                              {deleting ? "Suppression..." : "Supprimer définitivement"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
              {!paged.length && (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-gray-400">
                    {loading ? "Chargement..." : "Aucun apprenant."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <p>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} sur {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="students-prev-page"
            >
              Précédent
            </Button>
            <span className="text-xs">Page {page} / {totalPages}</span>
            <Button
              variant="outline" size="sm" disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              data-testid="students-next-page"
            >
              Suivant
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-lg" data-testid="student-dossier-dialog">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">{selected.student_name} — {selected.formation_title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{selected.category}</Badge>
                  <Badge className={`${DOSSIER_STATUS_COLOR[selected.status] || "bg-gray-100 text-gray-700"} hover:opacity-90`}>
                    {DOSSIER_STATUS_LABEL[selected.status] || selected.status}
                  </Badge>
                </div>

                {selected.notes && <p className="text-sm bg-gray-50 p-3 rounded-md border border-gray-200">{selected.notes}</p>}

                {selectedDocs.length > 0 ? (
                  <div className="space-y-1">
                    {selectedDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between text-xs border border-gray-100 rounded px-3 py-2">
                        <span className="truncate">{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type} — {doc.original_filename}</span>
                        <Badge variant="outline" className={
                          doc.verification_status === "approved" ? "border-green-500 text-green-600" :
                          doc.verification_status === "rejected" ? "border-red-500 text-red-600" : "text-gray-500"
                        }>{doc.verification_status === "approved" ? "Approuvé" : doc.verification_status === "rejected" ? "Rejeté" : "En attente"}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Aucun document envoyé.</p>
                )}

                {selected.category === ATTESTATION_CATEGORY && antsStatus && (
                  <div className="border-t pt-4">
                    <Button
                      size="sm" disabled={!antsStatus.ready || downloadingAnts} onClick={downloadAntsBundle}
                      className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white disabled:opacity-40"
                      data-testid="download-ants-bundle-btn"
                    >
                      <FolderOpen size={14} className="mr-1" /> {downloadingAnts ? "Préparation..." : "Télécharger le dossier ANTS"}
                    </Button>
                    <p className="text-xs text-gray-400 mt-1">
                      {antsStatus.ready
                        ? "Zip prêt : attestation signée + toutes les pièces du dossier, nommé au nom de l'apprenant."
                        : `Pas encore disponible : ${antsStatus.reasons.join(" · ")}.`}
                    </p>
                  </div>
                )}

                {!CMA_CATEGORIES.includes(selected.category) && selected.status !== "termine" && (
                  <div className="border-t pt-4">
                    <Button
                      size="sm" disabled={sending} onClick={sendSuccessEmail}
                      className="bg-[#0B7238] hover:bg-[#0a6230] text-white"
                      data-testid="send-success-email-btn"
                    >
                      <Sparkle size={14} className="mr-1" weight="fill" /> Envoyer un mail de réussite
                    </Button>
                    <p className="text-xs text-gray-400 mt-1">
                      Pour les formations internes sans examen CMA (TP Vente, etc.) — marque le dossier terminé et notifie l'apprenant.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!composeTarget} onOpenChange={(v) => !v && setComposeTarget(null)}>
        <DialogContent className="max-w-lg" data-testid="compose-email-dialog">
          {composeTarget && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">Écrire à {composeTarget.name}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-500 -mt-2 mb-2">
                À : {composeTarget.email} — mis en forme automatiquement avec le design TDL Formation (logo, couleurs, pied de page), comme pour les campagnes.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Modèle</label>
                  <Select value={mailTemplate} onValueChange={setMailTemplate}>
                    <SelectTrigger data-testid="compose-email-template"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="libre">Message libre</SelectItem>
                      <SelectItem value="convocation">Convocation à un examen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {mailTemplate === "convocation" && (
                  <div className="border border-gray-200 rounded-md p-3 space-y-3 bg-gray-50">
                    <div>
                      <label className="text-sm font-medium">Intitulé de l'examen</label>
                      <Input value={convocIntitule} onChange={(e) => setConvocIntitule(e.target.value)} placeholder="Ex: Examen pratique VTC" data-testid="convoc-intitule" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium">Date de convocation</label>
                        <Input type="date" value={convocDate} onChange={(e) => setConvocDate(e.target.value)} data-testid="convoc-date" />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Centre</label>
                        <Select value={convocCentre} onValueChange={setConvocCentre}>
                          <SelectTrigger data-testid="convoc-centre"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CENTER_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={insertConvocationTemplate} data-testid="convoc-insert">
                      Insérer le modèle dans l'objet / message
                    </Button>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium">Objet</label>
                  <Input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Objet de votre email" data-testid="compose-email-subject" />
                </div>
                <div>
                  <label className="text-sm font-medium">Message</label>
                  <Textarea rows={8} value={composeMessage} onChange={(e) => setComposeMessage(e.target.value)} placeholder="Écrivez votre message ici..." data-testid="compose-email-message" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setComposeTarget(null)} disabled={composing}>Annuler</Button>
                <Button onClick={sendCompose} disabled={composing} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="compose-email-send">
                  <PaperPlaneTilt size={14} className="mr-1" /> {composing ? "Envoi..." : "Envoyer"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={bulkEmailOpen} onOpenChange={setBulkEmailOpen}>
        <DialogContent className="max-w-lg" data-testid="bulk-email-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">Email groupé — {checkedIds.size} apprenant(s)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 -mt-2 mb-2">
            Mis en forme automatiquement avec le design TDL Formation, comme pour un email individuel.
          </p>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Objet</label>
              <Input value={bulkSubject} onChange={(e) => setBulkSubject(e.target.value)} placeholder="Objet de votre email" data-testid="bulk-email-subject" />
            </div>
            <div>
              <label className="text-sm font-medium">Message</label>
              <Textarea rows={8} value={bulkMessage} onChange={(e) => setBulkMessage(e.target.value)} placeholder="Écrivez votre message ici..." data-testid="bulk-email-message" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setBulkEmailOpen(false)} disabled={bulkSending}>Annuler</Button>
            <Button onClick={sendBulkEmail} disabled={bulkSending} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="bulk-email-send">
              <PaperPlaneTilt size={14} className="mr-1" /> {bulkSending ? "Envoi..." : `Envoyer à ${checkedIds.size}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
