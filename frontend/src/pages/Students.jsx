import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MagnifyingGlass, EnvelopeSimple, Phone, GraduationCap, FolderOpen, Sparkle, PaperPlaneTilt, Signature } from "@phosphor-icons/react";
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
    try {
      const [dossierRes, docsRes] = await Promise.all([
        api.get(`/dossiers/${s.dossier_id}`),
        api.get(`/dossiers/${s.dossier_id}/documents`),
      ]);
      setSelected(dossierRes.data);
      setSelectedDocs(docsRes.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de chargement du dossier");
    }
  };

  const openCompose = (s) => {
    setComposeTarget(s);
    setComposeSubject("");
    setComposeMessage("");
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

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left border-b border-gray-200">
              <tr>
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
                    </div>
                  </td>
                </tr>
              ))}
              {!paged.length && (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-400">
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
    </div>
  );
}
