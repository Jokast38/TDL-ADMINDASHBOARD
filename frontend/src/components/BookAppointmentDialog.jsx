import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MagnifyingGlass } from "@phosphor-icons/react";

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Dialog de prise de rendez-vous (appel ou physique) réutilisable depuis
 * toutes les pages "prospects" (Leads, Marketing...) et l'Agenda général.
 *
 * - `lead` : objet lead déjà connu (pré-rempli, pas de recherche) — utilisé
 *   depuis une page qui liste déjà des leads (Leads.jsx, Marketing.jsx).
 *   Si absent, un champ de recherche de lead est affiché (utilisé depuis
 *   l'Agenda général, qui ne liste pas les leads).
 * - Si le lead sélectionné a déjà un créneau d'appel "disponible" en attente
 *   (généré par un import Cosmosia), on propose de le confirmer directement
 *   plutôt que d'en recréer un nouveau.
 */
const PERSON_TYPES = {
  inscrit: ["Inscrit", "bg-green-50 text-green-700 border-green-200"],
  apprenant: ["Apprenant", "bg-blue-50 text-blue-700 border-blue-200"],
  prospect: ["Prospect", "bg-gray-50 text-gray-500 border-gray-200"],
};

function PersonBadge({ type }) {
  const t = PERSON_TYPES[type];
  if (!t) return null;
  return <span className={`ml-1 text-[10px] font-normal border rounded px-1.5 py-0.5 ${t[1]}`}>{t[0]}</span>;
}

export default function BookAppointmentDialog({ open, onOpenChange, lead: fixedLead, onCreated }) {
  const { user } = useAuth();
  // L'attribution du suivi (qui s'occupe de ce prospect) se fait ici, au
  // moment de la prise de RDV, plutôt que sur l'inscription a posteriori —
  // plus naturel : c'est l'instant où on décide qui va effectivement traiter
  // le dossier. Réservé aux rôles qui gèrent une équipe (admin, responsable
  // d'admission) ou au Centre d'appel (un agent peut passer la main à un
  // collègue ou à l'admission) ; les autres rôles gardent le comportement
  // d'avant (RDV toujours pris en son propre nom, voir commercial_id côté
  // backend qui défaut à l'utilisateur connecté si non fourni).
  // Cahier des charges « Rendez-vous dans le CRM » (2026-11-10) : la
  // personne qui fait le phoning choisit toujours qui assurera le RDV, puis
  // un créneau libre de son agenda (30 min, 9h-18h, lundi-samedi).
  const canAssign = true;
  const [assignees, setAssignees] = useState([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [lead, setLead] = useState(fixedLead || null);
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState([]);
  const [searchingLead, setSearchingLead] = useState(false);
  const [pendingSlot, setPendingSlot] = useState(null);
  const [checkingSlot, setCheckingSlot] = useState(false);
  const [formations, setFormations] = useState([]);
  const [kind, setKind] = useState("physique");
  const [formationId, setFormationId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const assigneeId = assignedTo || user?.id;

  const loadSlots = () => {
    if (!open || !assigneeId || !date) return;
    setLoadingSlots(true);
    api.get("/call-center/availability", { params: { commercial_id: assigneeId, date } })
      .then((r) => {
        setSlots(r.data.creneaux || []);
        // L'heure choisie n'est plus libre (autre personne, autre jour) : on la retire.
        setTime((t) => ((r.data.creneaux || []).some((c) => c.heure === t && c.disponible) ? t : ""));
      })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  };
  useEffect(loadSlots, [open, assigneeId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setLead(fixedLead || null);
    setLeadQuery(""); setLeadResults([]); setPendingSlot(null);
    setKind("physique"); setFormationId(""); setLocation(""); setAssignedTo("");
    setDate(toISO(new Date())); setTime(""); setNotes("");
    api.get("/formations", { params: { active_only: true } }).then((r) => setFormations(r.data)).catch(() => {});
    if (canAssign) {
      api.get("/call-center/assignees").then((r) => setAssignees((r.data || []).filter((u) => u.id !== user?.id))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedLead]);

  // Lead déjà connu (fixedLead) : on vérifie s'il a un créneau d'appel
  // "disponible" en attente, pour proposer de le confirmer plutôt que d'en
  // créer un nouveau — c'est le "prendre un créneau disponible depuis la
  // liste des leads" demandé.
  useEffect(() => {
    if (!open || !lead?.id) { setPendingSlot(null); return; }
    setCheckingSlot(true);
    api.get("/call-center/appointments", { params: { status: "disponible" } })
      .then((r) => {
        const items = r.data.items || r.data || [];
        setPendingSlot(items.find((a) => a.lead_id === lead.id) || null);
      })
      .catch(() => setPendingSlot(null))
      .finally(() => setCheckingSlot(false));
  }, [open, lead]);

  useEffect(() => {
    if (fixedLead || !leadQuery.trim()) { setLeadResults([]); return; }
    setSearchingLead(true);
    const t = setTimeout(() => {
      // Inscrits/apprenants ET prospects (demande du 2026-11-06 : avant,
      // seuls les prospects étaient proposés).
      api.get("/call-center/people", { params: { q: leadQuery.trim() } })
        .then((r) => setLeadResults(r.data || []))
        .catch(() => setLeadResults([]))
        .finally(() => setSearchingLead(false));
    }, 300);
    return () => clearTimeout(t);
  }, [leadQuery, fixedLead]);

  const claimPendingSlot = async () => {
    if (!pendingSlot) return;
    setClaiming(true);
    try {
      await api.post(`/call-center/appointments/${pendingSlot.id}/claim`);
      toast.success("Créneau confirmé");
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ce créneau vient peut-être d'être pris par quelqu'un d'autre");
    } finally {
      setClaiming(false);
    }
  };

  const submit = async () => {
    if (!lead) return toast.error("Choisissez un lead");
    if (!date || !time) return toast.error("Choisissez un créneau disponible");
    if (kind === "physique" && !location.trim()) return toast.error("Lieu requis pour un rendez-vous physique");
    setSubmitting(true);
    try {
      const formation = formations.find((f) => f.id === formationId);
      await api.post("/call-center/appointments", {
        lead_id: lead.id,
        scheduled_at: new Date(`${date}T${time}:00`).toISOString(),
        kind,
        location: kind === "physique" ? location : undefined,
        formation_id: formationId || undefined,
        formation_titre: formation?.title,
        notes: notes || undefined,
        commercial_id: assignedTo || undefined,
      });
      toast.success("Rendez-vous confirmé");
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la création");
      // Créneau pris entre-temps : on recharge pour en choisir un autre.
      if (e.response?.status === 409) { setTime(""); loadSlots(); }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="book-appointment-dialog">
        <DialogHeader><DialogTitle>Prendre un rendez-vous</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          {!fixedLead && (
            <div>
              <label className="text-sm font-medium">Personne</label>
              {lead ? (
                <div className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2 mt-1">
                  <div className="text-sm">
                    <p className="font-medium">{lead.name || lead.full_name} <PersonBadge type={lead.type} /></p>
                    <p className="text-xs text-gray-400">{lead.email || lead.phone}{lead.formation ? ` · ${lead.formation}` : ""}</p>
                  </div>
                  <button className="text-xs text-gray-400 hover:text-red-600 underline" onClick={() => setLead(null)}>Changer</button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <MagnifyingGlass size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                  <Input
                    className="pl-8" placeholder="Rechercher un prospect, un inscrit ou un apprenant (nom, email, téléphone)..."
                    value={leadQuery} onChange={(e) => setLeadQuery(e.target.value)}
                    data-testid="book-appointment-lead-search"
                  />
                  {leadQuery.trim() && (
                    <div className="mt-1 border border-gray-200 rounded-md max-h-48 overflow-y-auto">
                      {searchingLead ? (
                        <p className="text-xs text-gray-400 px-3 py-2">Recherche...</p>
                      ) : leadResults.length === 0 ? (
                        <p className="text-xs text-gray-400 px-3 py-2">{leadQuery.trim().length < 2 ? "Tapez au moins 2 caractères" : "Aucune personne trouvée"}</p>
                      ) : leadResults.map((l) => (
                        <button
                          key={l.id} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                          onClick={() => { setLead(l); setLeadQuery(""); setLeadResults([]); }}
                        >
                          <p className="font-medium">{l.name || l.full_name} <PersonBadge type={l.type} /></p>
                          <p className="text-xs text-gray-400">{l.email || l.phone}{l.formation ? ` · ${l.formation}` : ""}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {checkingSlot && <p className="text-xs text-gray-400">Vérification d'un créneau déjà disponible...</p>}
          {pendingSlot && (
            <div className="border border-[#d4af37]/40 bg-[#fff8e1]/40 rounded-md p-3 space-y-2">
              <p className="text-sm font-medium">Un créneau d'appel est déjà disponible pour ce lead</p>
              <p className="text-xs text-gray-500">
                {new Date(pendingSlot.scheduled_at).toLocaleString("fr-FR")}
                {pendingSlot.notes ? ` — ${pendingSlot.notes}` : ""}
              </p>
              <Button size="sm" onClick={claimPendingSlot} disabled={claiming} data-testid="book-appointment-claim">
                {claiming ? "..." : "Confirmer ce créneau"}
              </Button>
              <p className="text-xs text-gray-400">Ou créez un nouveau rendez-vous ci-dessous.</p>
            </div>
          )}

          {canAssign && (
            <div>
              <label className="text-sm font-medium">Personne qui assurera le rendez-vous</label>
              <Select value={assignedTo || "__self__"} onValueChange={(v) => setAssignedTo(v === "__self__" ? "" : v)}>
                <SelectTrigger data-testid="book-appointment-assignee"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__self__">Moi-même</SelectItem>
                  {assignees.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Type de rendez-vous</label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger data-testid="book-appointment-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="physique">Physique (en présentiel)</SelectItem>
                <SelectItem value="appel">Appel téléphonique</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Formation concernée</label>
            <Select value={formationId || "aucune"} onValueChange={(v) => setFormationId(v === "aucune" ? "" : v)}>
              <SelectTrigger data-testid="book-appointment-formation"><SelectValue placeholder="Aucune formation précise" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aucune">Aucune formation précise</SelectItem>
                {formations.map((f) => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="book-appointment-date" />
          </div>
          <div>
            <label className="text-sm font-medium">Créneau disponible</label>
            {loadingSlots ? (
              <p className="text-xs text-gray-400 mt-1">Chargement de l'agenda...</p>
            ) : !slots.length ? (
              <p className="text-xs text-gray-500 mt-1">Pas de créneau ce jour-là (rendez-vous du lundi au samedi, 9h-18h).</p>
            ) : (
              <div className="grid grid-cols-6 gap-1 mt-1" data-testid="book-appointment-slots">
                {slots.map((c) => (
                  <button
                    key={c.heure} type="button" disabled={!c.disponible} onClick={() => setTime(c.heure)}
                    title={c.pris ? "Déjà pris" : c.passe ? "Passé" : "Libre"}
                    className={`text-xs py-1.5 rounded border ${time === c.heure ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                      : c.disponible ? "border-gray-200 hover:bg-gray-50" : "border-gray-100 text-gray-300 line-through cursor-not-allowed"}`}
                  >
                    {c.heure}
                  </button>
                ))}
              </div>
            )}
          </div>
          {kind === "physique" && (
            <div>
              <label className="text-sm font-medium">Lieu</label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Centre Épinay-sur-Seine" data-testid="book-appointment-location" />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Note (facultatif)</label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contexte de l'appel..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Annuler</Button>
          <Button onClick={submit} disabled={submitting || !lead || !time} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="book-appointment-submit">
            {submitting ? "..." : "Confirmer le rendez-vous"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
