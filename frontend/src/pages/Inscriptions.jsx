import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { MagnifyingGlass, PencilSimple, XCircle, ArrowCounterClockwise, PhoneCall, Check, Trash, GraduationCap, Hourglass, CaretRight, CaretDown, Plus, CreditCard, CalendarCheck, ArrowsClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";

const fmtMoney = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);

// "cpf_valide"/"cpf_attente" couvrent le financement CPF (dossier de
// financement validé ou pas encore) — distinct de "paid"/"pending" qui
// concernent un règlement direct (carte, espèces...). CPF validé est traité
// visuellement comme un paiement acquis (vert), comme "Payé".
const PAYMENT_LABEL = {
  pending: "En attente", paid: "Payé",
  cpf_valide: "CPF Validé", cpf_attente: "CPF en attente",
  refunded: "Remboursé",
};
const PAYMENT_PAID_LIKE = ["paid", "cpf_valide"];

// Tag de suivi commercial manuel — distinct du statut du dossier (traitement
// administratif) et du statut de l'inscription (active/annulée) : c'est le
// suivi "où en est le contact avec cette personne" (voir backend/models/
// inscription.py:InscriptionUpdate.contact_status).
const CONTACT_STATUS_LABEL = {
  en_cours: "En cours d'inscription", a_contacter: "À contacter",
  sans_reponse: "Sans réponse", finalisee: "Inscription finalisée",
};
const CONTACT_STATUS_COLOR = {
  en_cours: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  a_contacter: "bg-[#F5A623]/10 text-[#F5A623] hover:bg-[#F5A623]/10",
  sans_reponse: "bg-red-100 text-red-700 hover:bg-red-100",
  finalisee: "bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10",
};

// Statut du dossier de traitement (voir backend/routers/inscriptions.py — collection
// dossiers). "nouveau" est le seul statut qui déclenche le récap matinal envoyé aux
// employés (voir services/staff_notify.py) : dès qu'on le fait passer à un statut
// suivant, le dossier sort automatiquement de ce récap.
const DOSSIER_STATUS_LABEL = {
  nouveau: "À traiter", en_verification: "En cours", complet: "Complet",
  soumis_ants: "Soumis ANTS", termine: "Terminé", rejete: "À corriger",
};

// Catégorie de formation déduite côté backend (voir routers/callback.py) selon
// l'origine du formulaire — mêmes libellés que Employees.jsx (attribution).
const CATEGORY_LABELS = {
  CACES: "CACES", PERMIS: "Récupération de points", AUTO_ECOLE: "Auto-école",
  SSIAP: "SSIAP", VTC_TAXI: "VTC / Taxi", ECSR: "ECSR", VENTE: "Conseiller de Vente",
};

const callbackInterest = (c) => {
  if (c.source === "offre_fidelite" && c.session) {
    return `Offre fidélité — session du ${c.session}`;
  }
  if (c.interest && CATEGORY_LABELS[c.interest]) {
    return CATEGORY_LABELS[c.interest];
  }
  if (c.source === "contact_form") {
    return c.message?.trim() ? c.message.trim() : "Formulaire de contact du site";
  }
  return "Non précisé";
};

const PAGE_SIZE = 25;

export default function Inscriptions() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all"); // all | paid | unpaid
  const [traitementFilter, setTraitementFilter] = useState("all"); // all | traite | non_traite
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | cloturee
  const [contactFilter, setContactFilter] = useState("all"); // all | en_cours | a_contacter | sans_reponse | finalisee
  const [page, setPage] = useState(1);

  // Section "Demandes de rappel" : repliée par défaut pour laisser la place à
  // la liste des inscriptions ; dépliée automatiquement s'il y a de nouvelles
  // demandes non traitées, tant que l'utilisateur n'a pas lui-même choisi un
  // état (callbacksToggled).
  const [callbacksCollapsed, setCallbacksCollapsed] = useState(true);
  const [callbacksToggled, setCallbacksToggled] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({ student_name: "", student_phone: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const [callbacks, setCallbacks] = useState([]);

  const [formations, setFormations] = useState([]);
  const [stages, setStages] = useState([]);
  const [assignTarget, setAssignTarget] = useState(null); // inscription en cours de (ré)affectation
  const [assignStageId, setAssignStageId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollCallback, setEnrollCallback] = useState(null);
  const [enrollForm, setEnrollForm] = useState({ formation_id: "", name: "", email: "", phone: "", notes: "" });
  const [enrolling, setEnrolling] = useState(false);

  // Inscription sur place par un agent (walk-in), avec paiement carte
  // (Stripe) immédiat — distinct du flux "Inscrire" ci-dessus qui part d'une
  // demande de rappel existante et ne déclenche pas de paiement.
  const [walkinOpen, setWalkinOpen] = useState(false);
  const [walkinForm, setWalkinForm] = useState({ formation_id: "", name: "", email: "", phone: "", notes: "", pay_now: true });
  const [walkinSubmitting, setWalkinSubmitting] = useState(false);

  const openWalkin = () => {
    setWalkinForm({ formation_id: formations[0]?.id || "", name: "", email: "", phone: "", notes: "", pay_now: true });
    setWalkinOpen(true);
  };

  const submitWalkin = async () => {
    if (!walkinForm.formation_id) return toast.error("Choisissez une formation");
    if (!walkinForm.name.trim()) return toast.error("Le nom est requis");
    if (!walkinForm.email.trim()) return toast.error("Un email est requis pour créer l'inscription");
    setWalkinSubmitting(true);
    try {
      const { data } = await api.post("/inscriptions", {
        formation_id: walkinForm.formation_id,
        student_name: walkinForm.name,
        student_email: walkinForm.email,
        student_phone: walkinForm.phone || null,
        notes: walkinForm.notes,
        source: "admin_walkin",
      });
      const formation = formations.find((f) => f.id === walkinForm.formation_id);
      if (walkinForm.pay_now && !formation?.cpf_eligible) {
        try {
          const { data: checkout } = await api.post("/payments/checkout", {
            inscription_id: data.inscription.id, allow_klarna: false,
          });
          if (checkout.url) {
            window.location.href = checkout.url;
            return;
          }
        } catch (e) {
          toast.error(e.response?.data?.detail || "Inscription créée, mais le paiement n'a pas pu être lancé — encaissez manuellement");
        }
      }
      toast.success("Inscription créée");
      setWalkinOpen(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur lors de l'inscription"); }
    finally { setWalkinSubmitting(false); }
  };

  const load = () => api.get("/inscriptions").then((r) => setItems(r.data)).catch(() => toast.error("Erreur de chargement"));
  const loadCallbacks = () => api.get("/callback-requests").then((r) => setCallbacks(r.data)).catch(() => {});

  useEffect(() => {
    load();
    loadCallbacks();
    api.get("/formations", { params: { active_only: true } }).then((r) => setFormations(r.data)).catch(() => {});
    api.get("/stages").then((r) => setStages(r.data)).catch(() => {});
  }, []);

  const openAssignStage = (i) => {
    setAssignTarget(i);
    setAssignStageId(i.stage_id || "");
  };

  const submitAssignStage = async () => {
    if (!assignTarget) return;
    setAssigning(true);
    try {
      await api.put(`/inscriptions/${assignTarget.id}/stage`, { stage_id: assignStageId || null });
      toast.success(assignStageId ? "Session affectée" : "Session retirée");
      setAssignTarget(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setAssigning(false);
    }
  };

  useEffect(() => {
    if (callbacksToggled) return;
    setCallbacksCollapsed(callbacks.filter((c) => !c.handled).length === 0);
  }, [callbacks, callbacksToggled]);

  const markCallbackHandled = async (id, handled) => {
    try { await api.put(`/callback-requests/${id}`, { handled }); loadCallbacks(); }
    catch { toast.error("Erreur"); }
  };

  const deleteCallback = async (id) => {
    try { await api.delete(`/callback-requests/${id}`); toast.success("Demande supprimée"); loadCallbacks(); }
    catch { toast.error("Erreur"); }
  };

  const openEnroll = (c) => {
    setEnrollCallback(c);
    setEnrollForm({
      formation_id: formations[0]?.id || "",
      name: `${c.prenom || ""} ${c.nom || ""}`.trim(),
      email: c.email || "",
      phone: c.telephone || "",
      notes: c.message || "",
    });
    setEnrollOpen(true);
  };

  const submitEnroll = async () => {
    if (!enrollForm.formation_id) return toast.error("Choisissez une formation");
    if (!enrollForm.name.trim()) return toast.error("Le nom est requis");
    if (!enrollForm.email.trim()) return toast.error("Un email est requis pour créer l'inscription");
    setEnrolling(true);
    try {
      await api.post("/inscriptions", {
        formation_id: enrollForm.formation_id,
        student_name: enrollForm.name,
        student_email: enrollForm.email,
        student_phone: enrollForm.phone || null,
        notes: enrollForm.notes,
      });
      toast.success("Inscription créée");
      if (enrollCallback) await markCallbackHandled(enrollCallback.id, true);
      setEnrollOpen(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur lors de l'inscription"); }
    finally { setEnrolling(false); }
  };

  const filtered = useMemo(() => items.filter((i) => {
    const matchesQuery = (i.student_name + i.student_email + i.formation_title).toLowerCase().includes(q.toLowerCase());
    const matchesPayment =
      paymentFilter === "all" ? true :
      paymentFilter === "paid" ? PAYMENT_PAID_LIKE.includes(i.payment_status) :
      !PAYMENT_PAID_LIKE.includes(i.payment_status);
    const matchesTraitement =
      traitementFilter === "all" ? true :
      traitementFilter === "traite" ? !!i.dossier_status && i.dossier_status !== "nouveau" :
      !i.dossier_status || i.dossier_status === "nouveau";
    const matchesStatus =
      statusFilter === "all" ? true :
      statusFilter === "cloturee" ? i.status === "annulee" :
      i.status !== "annulee";
    const matchesContact = contactFilter === "all" ? true : (i.contact_status || "en_cours") === contactFilter;
    return matchesQuery && matchesPayment && matchesTraitement && matchesStatus && matchesContact;
  }), [items, q, paymentFilter, traitementFilter, statusFilter, contactFilter]);

  useEffect(() => { setPage(1); }, [q, paymentFilter, traitementFilter, statusFilter, contactFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const updateContactStatus = async (id, contact_status) => {
    try { await api.put(`/inscriptions/${id}`, { contact_status }); toast.success("Tag mis à jour"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const [syncingId, setSyncingId] = useState(null);
  const syncPaymentFromStripe = async (id) => {
    setSyncingId(id);
    try {
      const { data } = await api.post(`/payments/${id}/sync`);
      if (data.updated) toast.success("Paiement confirmé sur Stripe — statut mis à jour");
      else toast.info(`Stripe indique : ${data.stripe_payment_status || "aucun paiement confirmé"}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de vérification Stripe");
    } finally {
      setSyncingId(null);
    }
  };

  const updatePaymentStatus = async (id, payment_status) => {
    try { await api.put(`/inscriptions/${id}`, { payment_status }); toast.success("Statut de paiement mis à jour"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const cancelInscription = async (id) => {
    try { await api.post(`/inscriptions/${id}/cancel`); toast.success("Inscription annulée"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const reactivateInscription = async (id) => {
    try { await api.post(`/inscriptions/${id}/reactivate`); toast.success("Inscription réactivée"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const deleteInscription = async (id) => {
    try { await api.delete(`/inscriptions/${id}`); toast.success("Inscription supprimée"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const startProcessing = async (dossierId) => {
    try {
      await api.put(`/dossiers/${dossierId}`, { status: "en_verification" });
      toast.success("Traitement en cours — ne recevra plus le récap matinal");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const openEdit = (i) => {
    setEditItem(i);
    setEditForm({ student_name: i.student_name || "", student_phone: i.student_phone || "", notes: i.notes || "" });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      await api.put(`/inscriptions/${editItem.id}`, editForm);
      toast.success("Inscription mise à jour");
      setEditOpen(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    finally { setSaving(false); }
  };

  const pendingCallbacks = callbacks.filter((c) => !c.handled);

  return (
    <div className="space-y-6" data-testid="inscriptions-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Liste complète</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Inscriptions</h1>
          <p className="text-gray-500 mt-2">{items.length} inscription(s) au total.</p>
        </div>
        <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" onClick={openWalkin} data-testid="walkin-btn">
          <Plus size={16} className="mr-1" /> Inscrire sur place
        </Button>
      </div>

      {callbacks.length > 0 && (
        <Card className="border border-amber-200 bg-amber-50/50 rounded-md shadow-none p-5" data-testid="callback-requests-card">
          <button
            type="button"
            onClick={() => { setCallbacksToggled(true); setCallbacksCollapsed((v) => !v); }}
            className="flex items-center gap-2 mb-1 w-full text-left"
            data-testid="callback-requests-toggle"
          >
            {callbacksCollapsed ? <CaretRight size={14} className="text-amber-700" /> : <CaretDown size={14} className="text-amber-700" />}
            <PhoneCall size={16} className="text-amber-700" />
            <h2 className="font-display text-lg font-bold">Demandes de rappel</h2>
            {pendingCallbacks.length > 0 ? (
              <Badge className="bg-amber-200 text-amber-900 hover:bg-amber-200">{pendingCallbacks.length} en attente</Badge>
            ) : (
              <span className="text-xs text-gray-400">({callbacks.length} traitée(s))</span>
            )}
          </button>
          {!callbacksCollapsed && (
          <>
          <p className="text-xs text-gray-500 mb-4">Formulaire "Être rappelé" de la landing page offre fidélité.</p>
          <div className="space-y-2">
            {callbacks.map((c) => (
              <div
                key={c.id}
                className={`flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-md px-4 py-2.5 ${c.handled ? "opacity-50" : ""}`}
                data-testid={`callback-row-${c.id}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm">{c.prenom} {c.nom}</p>
                  <p className="text-xs text-gray-500">
                    {c.telephone}{c.email && <span> · {c.email}</span>}
                    <span className="ml-2 text-gray-400">{new Date(c.created_at).toLocaleDateString("fr-FR")}</span>
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Intérêt : {callbackInterest(c)}
                  </p>
                  {c.center && <p className="text-xs text-gray-500 mt-0.5">Centre : {c.center}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEnroll(c)}
                    className="p-1.5 text-[#0a0a0a] hover:bg-gray-100 rounded"
                    title="Inscrire à une formation"
                  >
                    <GraduationCap size={14} />
                  </button>
                  {!c.handled ? (
                    <button
                      onClick={() => markCallbackHandled(c.id, true)}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                      title="Marquer comme rappelé"
                    >
                      <Check size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => markCallbackHandled(c.id, false)}
                      className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                      title="Remettre en attente"
                    >
                      <ArrowCounterClockwise size={14} />
                    </button>
                  )}
                  <button onClick={() => deleteCallback(c.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Supprimer">
                    <Trash size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          </>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-3 text-gray-400" />
          <Input
            placeholder="Rechercher un étudiant, formation..."
            value={q} onChange={(e) => setQ(e.target.value)}
            className="pl-9" data-testid="search-input"
          />
        </div>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-40" data-testid="filter-payment"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Paiement : tous</SelectItem>
            <SelectItem value="paid">Payées</SelectItem>
            <SelectItem value="unpaid">Non payées</SelectItem>
          </SelectContent>
        </Select>
        <Select value={traitementFilter} onValueChange={setTraitementFilter}>
          <SelectTrigger className="w-44" data-testid="filter-traitement"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Traitement : tous</SelectItem>
            <SelectItem value="traite">Traitées</SelectItem>
            <SelectItem value="non_traite">Non traitées</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="filter-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Statut : tous</SelectItem>
            <SelectItem value="active">Actives</SelectItem>
            <SelectItem value="cloturee">Clôturées</SelectItem>
          </SelectContent>
        </Select>
        <Select value={contactFilter} onValueChange={setContactFilter}>
          <SelectTrigger className="w-48" data-testid="filter-contact"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tag : tous</SelectItem>
            {Object.entries(CONTACT_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 overline">Date</th>
                <th className="py-3 px-4 overline">Étudiant</th>
                <th className="py-3 px-4 overline">Formation</th>
                <th className="py-3 px-4 overline">Catégorie</th>
                <th className="py-3 px-4 overline">Paiement</th>
                <th className="py-3 px-4 overline">Statut</th>
                <th className="py-3 px-4 overline">Traitement</th>
                <th className="py-3 px-4 overline">Tag</th>
                <th className="py-3 px-4 overline">Session</th>
                <th className="py-3 px-4 overline">Notes</th>
                <th className="py-3 px-4 overline text-right">Prix</th>
                <th className="py-3 px-4 overline text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((i) => {
                const cancelled = i.status === "annulee";
                return (
                  <tr key={i.id} className={`border-b border-gray-100 hover:bg-gray-50 ${cancelled ? "opacity-50" : ""}`} data-testid={`inscription-row-${i.id}`}>
                    <td className="py-3 px-4 text-xs text-gray-500 font-mono">
                      {new Date(i.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium">{i.student_name}</p>
                      <p className="text-xs text-gray-500">{i.student_email}</p>
                      {i.student_phone && <p className="text-xs text-gray-400">{i.student_phone}</p>}
                    </td>
                    <td className="py-3 px-4">{i.formation_title}</td>
                    <td className="py-3 px-4"><Badge variant="outline">{i.category}</Badge></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <Select value={i.payment_status} onValueChange={(v) => updatePaymentStatus(i.id, v)} disabled={cancelled}>
                          <SelectTrigger className={`h-7 text-xs w-32 border-0 ${
                            PAYMENT_PAID_LIKE.includes(i.payment_status) ? "bg-[#0B7238]/10 text-[#0B7238]"
                            : i.payment_status === "refunded" ? "bg-gray-200 text-gray-600"
                            : "bg-[#F5A623]/10 text-[#F5A623]"
                          }`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(PAYMENT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {!PAYMENT_PAID_LIKE.includes(i.payment_status) && i.stripe_session_id && (
                          <button
                            onClick={() => syncPaymentFromStripe(i.id)}
                            disabled={syncingId === i.id}
                            className="p-1 text-gray-400 hover:text-[#d4af37] hover:bg-gray-100 rounded shrink-0"
                            title="Vérifier auprès de Stripe (si le paiement a réussi mais n'apparaît pas ici)"
                            data-testid={`sync-stripe-${i.id}`}
                          >
                            <ArrowsClockwise size={13} className={syncingId === i.id ? "animate-spin" : ""} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={cancelled ? "bg-red-100 text-red-700 hover:bg-red-100" : "bg-green-100 text-green-700 hover:bg-green-100"}>
                        {cancelled ? "Annulée" : "Active"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      {i.dossier_status === "nouveau" ? (
                        <Button
                          size="sm" variant="outline"
                          onClick={() => startProcessing(i.dossier_id)}
                          className="h-7 text-xs border-[#d4af37] text-[#d4af37] hover:bg-[#d4af37]/10 hover:text-[#d4af37]"
                          title="Marque le dossier en cours de traitement — il ne sera plus inclus dans le récap matinal envoyé par email"
                          data-testid={`start-processing-${i.id}`}
                        >
                          <Hourglass size={12} className="mr-1" /> Traiter
                        </Button>
                      ) : i.dossier_status ? (
                        <Badge variant="outline" className="text-xs">{DOSSIER_STATUS_LABEL[i.dossier_status] || i.dossier_status}</Badge>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Select value={i.contact_status || "en_cours"} onValueChange={(v) => updateContactStatus(i.id, v)} disabled={cancelled}>
                        <SelectTrigger className={`h-7 text-xs w-44 border-0 ${CONTACT_STATUS_COLOR[i.contact_status || "en_cours"]}`} data-testid={`contact-status-${i.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CONTACT_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => openAssignStage(i)}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border ${i.stage_id ? "border-[#0B7238] text-[#0B7238] bg-[#0B7238]/5" : "border-gray-200 text-gray-500 hover:border-[#d4af37] hover:text-[#d4af37]"}`}
                        title={i.stage_id ? "Réaffecter à une autre session" : "Affecter à une session"}
                        data-testid={`assign-stage-${i.id}`}
                      >
                        <CalendarCheck size={12} />
                        {(() => {
                          const st = stages.find((s) => s.id === i.stage_id);
                          return st ? `${st.date_debut} → ${st.date_fin}` : "Non affecté";
                        })()}
                      </button>
                    </td>
                    <td className="py-3 px-4 max-w-[180px]">
                      {i.notes ? (
                        <p className="text-xs text-gray-500 truncate" title={i.notes}>{i.notes}</p>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{fmtMoney(i.price)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end items-center gap-1">
                        <button onClick={() => openEdit(i)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="Modifier">
                          <PencilSimple size={14} />
                        </button>
                        {cancelled ? (
                          <button onClick={() => reactivateInscription(i.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Réactiver">
                            <ArrowCounterClockwise size={14} />
                          </button>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Annuler l'inscription">
                                <XCircle size={14} />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Annuler cette inscription ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  <span className="font-semibold">{i.student_name}</span> — {i.formation_title}. L'inscription restera visible mais marquée comme annulée.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Retour</AlertDialogCancel>
                                <AlertDialogAction onClick={() => cancelInscription(i.id)} className="bg-red-600 hover:bg-red-700 text-white">
                                  Annuler l'inscription
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Supprimer définitivement">
                              <Trash size={14} />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Supprimer définitivement cette inscription ?</AlertDialogTitle>
                              <AlertDialogDescription>
                                <span className="font-semibold">{i.student_name}</span> — {i.formation_title}. Cette action est irréversible
                                (contrairement à "Annuler", qui garde une trace). Le dossier associé n'est pas supprimé.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Retour</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteInscription(i.id)} className="bg-red-600 hover:bg-red-700 text-white">
                                Supprimer définitivement
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!paged.length && (
                <tr><td colSpan="12" className="py-12 text-center text-gray-400">Aucune inscription.</td></tr>
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
              data-testid="inscriptions-prev-page"
            >
              Précédent
            </Button>
            <span className="text-xs">Page {page} / {totalPages}</span>
            <Button
              variant="outline" size="sm" disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              data-testid="inscriptions-next-page"
            >
              Suivant
            </Button>
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier l'inscription</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium">Nom de l'étudiant</label>
              <Input value={editForm.student_name} onChange={(e) => setEditForm({ ...editForm, student_name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Téléphone</label>
              <Input value={editForm.student_phone} onChange={(e) => setEditForm({ ...editForm, student_phone: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={saveEdit} disabled={saving} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Inscrire {enrollCallback?.prenom} {enrollCallback?.nom} à une formation</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium">Formation</label>
              <Select value={enrollForm.formation_id} onValueChange={(v) => setEnrollForm({ ...enrollForm, formation_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir une formation" /></SelectTrigger>
                <SelectContent>
                  {formations.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Nom</label>
              <Input value={enrollForm.name} onChange={(e) => setEnrollForm({ ...enrollForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Email <span className="text-red-500">*</span></label>
                <Input value={enrollForm.email} onChange={(e) => setEnrollForm({ ...enrollForm, email: e.target.value })} />
                <p className="text-xs text-gray-400 mt-1">Requis pour créer l'inscription (non collecté par le formulaire de rappel).</p>
              </div>
              <div>
                <label className="text-sm font-medium">Téléphone</label>
                <Input value={enrollForm.phone} onChange={(e) => setEnrollForm({ ...enrollForm, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea rows={2} value={enrollForm.notes} onChange={(e) => setEnrollForm({ ...enrollForm, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEnrollOpen(false)} disabled={enrolling}>Annuler</Button>
            <Button onClick={submitEnroll} disabled={enrolling} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
              {enrolling ? "Inscription..." : "Inscrire"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignTarget} onOpenChange={(v) => !v && setAssignTarget(null)}>
        <DialogContent data-testid="assign-stage-dialog">
          <DialogHeader><DialogTitle>Affecter une session — {assignTarget?.student_name}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-xs text-gray-500">
              Choisissez la session de stage correspondant à <b>{assignTarget?.formation_title}</b>. Pour un repassage
              (ex: nouvel examen VTC), réaffectez simplement cette inscription à une nouvelle session — inutile de recréer une inscription.
            </p>
            <Select value={assignStageId || "none"} onValueChange={(v) => setAssignStageId(v === "none" ? "" : v)}>
              <SelectTrigger data-testid="assign-stage-select"><SelectValue placeholder="Choisir une session" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune (retirer l'affectation)</SelectItem>
                {stages.filter((s) => s.formation_id === assignTarget?.formation_id).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.date_debut} → {s.date_fin} — {s.lieu_ville}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignTarget && !stages.some((s) => s.formation_id === assignTarget.formation_id) && (
              <p className="text-xs text-amber-600">Aucune session planifiée pour cette formation — créez-en une depuis la page Sessions de stage.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setAssignTarget(null)} disabled={assigning}>Annuler</Button>
            <Button onClick={submitAssignStage} disabled={assigning} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="assign-stage-submit">
              {assigning ? "..." : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={walkinOpen} onOpenChange={setWalkinOpen}>
        <DialogContent data-testid="walkin-dialog">
          <DialogHeader><DialogTitle>Inscrire une personne sur place</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium">Formation</label>
              <Select value={walkinForm.formation_id} onValueChange={(v) => setWalkinForm({ ...walkinForm, formation_id: v })}>
                <SelectTrigger data-testid="walkin-formation"><SelectValue placeholder="Choisir une formation" /></SelectTrigger>
                <SelectContent>
                  {formations.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.title}{f.cpf_eligible ? " (CPF)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Nom</label>
              <Input value={walkinForm.name} onChange={(e) => setWalkinForm({ ...walkinForm, name: e.target.value })} data-testid="walkin-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Email <span className="text-red-500">*</span></label>
                <Input value={walkinForm.email} onChange={(e) => setWalkinForm({ ...walkinForm, email: e.target.value })} data-testid="walkin-email" />
              </div>
              <div>
                <label className="text-sm font-medium">Téléphone</label>
                <Input value={walkinForm.phone} onChange={(e) => setWalkinForm({ ...walkinForm, phone: e.target.value })} data-testid="walkin-phone" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea rows={2} value={walkinForm.notes} onChange={(e) => setWalkinForm({ ...walkinForm, notes: e.target.value })} data-testid="walkin-notes" />
            </div>
            <label className="flex items-center gap-2 text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
              <input
                type="checkbox" checked={walkinForm.pay_now}
                onChange={(e) => setWalkinForm({ ...walkinForm, pay_now: e.target.checked })}
                data-testid="walkin-paynow"
              />
              Encaisser le paiement maintenant (carte bancaire, via Stripe)
            </label>
            <p className="text-xs text-gray-400">
              {formations.find((f) => f.id === walkinForm.formation_id)?.cpf_eligible
                ? "Cette formation est éligible CPF — le paiement en ligne n'est pas proposé, l'inscription sera créée en attente."
                : "Vous serez redirigé(e) vers la page de paiement Stripe, puis ramené(e) ici avec un reçu à télécharger."}
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setWalkinOpen(false)} disabled={walkinSubmitting}>Annuler</Button>
            <Button onClick={submitWalkin} disabled={walkinSubmitting} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="walkin-submit">
              {walkinSubmitting ? "..." : walkinForm.pay_now ? (
                <><CreditCard size={16} className="mr-1" /> Inscrire et encaisser</>
              ) : "Inscrire"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
