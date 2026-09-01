import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  SignOut, FileArrowUp, FolderOpen, Warning, CheckCircle, ThumbsUp, ThumbsDown,
  CalendarCheck, ArrowSquareOut, CreditCard, Clock, Sparkle, MapPin,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import ChatWidget from "@/components/ChatWidget";
import ContactBubble from "@/components/ContactBubble";

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

// Lien externe officiel pour consulter son résultat d'examen (même URL que
// backend/routers/exams.py:EXAMENT3P_URL — pas d'API, juste un lien).
const EXAMENT3P_URL = "https://www.exament3p.fr/id/14";

const REINSCRIPTION_PRICE = 119;

// La vérification de résultat sur le site de la CMA (exament3p.fr) ne
// concerne que les formations VTC / Taxi (VTC, passerelle VTC-Taxi, Taxi
// banlieue) et le permis B (catégorie AUTO_ECOLE) — explicitement pas
// l'ECSR, le TP Vente (VENTE), ni la récupération de points de permis
// (catégorie PERMIS, à ne pas confondre avec le permis B). Doit rester
// synchronisé avec CMA_CATEGORIES côté backend (routers/exams.py).
const CMA_CATEGORIES = ["VTC_TAXI", "AUTO_ECOLE"];

const ONBOARDING_STEPS = [
  {
    icon: Sparkle,
    title: "Bienvenue dans votre espace",
    text: "Retrouvez ici tous vos dossiers de formation, les documents à fournir et le suivi de vos examens — au même endroit, sur mobile comme sur ordinateur.",
  },
  {
    icon: FolderOpen,
    title: "Vos documents",
    text: "Chaque dossier indique les documents encore manquants. Ajoutez-les directement ici, ou venez avec en agence si c'est plus simple pour vous.",
  },
  {
    icon: ThumbsUp,
    title: "Vos résultats d'examen",
    text: "Dès que vous passez un examen, indiquez ici si vous avez réussi ou échoué avec le bouton dédié — nous mettons automatiquement votre dossier à jour et un conseiller est prévenu.",
  },
  {
    icon: CalendarCheck,
    title: "Vos rendez-vous",
    text: "Une fois votre examen théorique réussi, choisissez ici votre créneau de préparation à l'épreuve pratique parmi les disponibilités.",
  },
];

function Onboarding({ userId }) {
  const storageKey = `tdl_student_onboarding_seen_${userId}`;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey)) setOpen(true);
    } catch { /* stockage indisponible : pas d'onboarding, tant pis */ }
  }, [storageKey]);

  const close = () => {
    try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  const current = ONBOARDING_STEPS[step];
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-sm text-center" data-testid="student-onboarding">
        <div className="w-14 h-14 rounded-full bg-[#d4af37]/10 text-[#d4af37] flex items-center justify-center mx-auto mt-2">
          <Icon size={28} weight="fill" />
        </div>
        <DialogHeader>
          <DialogTitle className="font-display text-center">{current.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">{current.text}</p>
        <div className="flex items-center justify-center gap-1.5 my-2">
          {ONBOARDING_STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-[#d4af37]" : "w-1.5 bg-gray-200"}`} />
          ))}
        </div>
        <div className="flex justify-center gap-2">
          {step > 0 && <Button variant="outline" onClick={() => setStep((s) => s - 1)}>Précédent</Button>}
          {step < ONBOARDING_STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Suivant</Button>
          ) : (
            <Button onClick={close} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">C'est parti !</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExamTheoriqueSection({ dossier, onNotified }) {
  const [loading, setLoading] = useState(false);

  const notify = async (result) => {
    setLoading(true);
    try {
      await api.post(`/dossiers/${dossier.id}/exam-theorique/notify`, { result });
      toast.success(result === "reussi" ? "Bravo, félicitations !" : "Résultat enregistré, courage pour la suite !");
      onNotified();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  if (!dossier.exam_theorique_result) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-4">
        <p className="text-sm font-medium mb-3 flex items-center gap-2"><Sparkle size={16} className="text-[#d4af37]" /> Résultat de votre examen théorique</p>
        <div className="flex gap-2">
          <Button size="sm" disabled={loading} onClick={() => notify("reussi")} className="bg-[#0B7238] hover:bg-[#0a6230] text-white" data-testid={`exam-theo-reussi-${dossier.id}`}>
            <ThumbsUp size={14} className="mr-1" /> Réussi
          </Button>
          <Button size="sm" disabled={loading} variant="outline" onClick={() => notify("echoue")} className="border-red-300 text-red-600 hover:bg-red-50" data-testid={`exam-theo-echoue-${dossier.id}`}>
            <ThumbsDown size={14} className="mr-1" /> Échoué
          </Button>
        </div>
      </div>
    );
  }

  if (dossier.exam_theorique_result === "reussi") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4 text-sm text-green-800 flex items-center gap-2">
        <CheckCircle size={16} weight="fill" /> Examen théorique réussi — voir les prochaines étapes ci-dessous.
      </div>
    );
  }
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-4 text-sm text-amber-800">
      Résultat déclaré : échec à l'examen théorique. Un conseiller va revenir vers vous pour la suite.
    </div>
  );
}

function SlotPicker({ dossierId, onBooked }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    api.get("/slots", { params: { type: "formation_pratique" } })
      .then((r) => setSlots(r.data))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, []);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const s of slots) {
      if (s.places_disponibles <= 0) continue;
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date).push(s);
    }
    return Array.from(map.entries()).slice(0, 7); // pas plus d'une semaine affichée à la fois
  }, [slots]);

  const book = async (slotId) => {
    setBooking(slotId);
    try {
      await api.post(`/slots/${slotId}/book`, { dossier_id: dossierId });
      toast.success("Créneau réservé !");
      onBooked();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de réservation");
    } finally {
      setBooking(null);
    }
  };

  if (loading) return <p className="text-xs text-gray-400">Chargement des créneaux...</p>;
  if (!byDate.length) return <p className="text-xs text-gray-400">Aucun créneau disponible pour le moment — revenez bientôt.</p>;

  return (
    <div className="space-y-3">
      {byDate.map(([date, daySlots]) => (
        <div key={date}>
          <p className="text-xs font-medium text-gray-500 mb-1">{new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
          <div className="flex flex-wrap gap-2">
            {daySlots.map((s) => (
              <button
                key={s.id}
                onClick={() => book(s.id)}
                disabled={booking === s.id}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-300 hover:border-[#d4af37] hover:text-[#d4af37] transition-colors inline-flex items-center gap-1"
                data-testid={`slot-${s.id}`}
              >
                <Clock size={12} /> {s.heure_debut} ({s.places_disponibles} place{s.places_disponibles > 1 ? "s" : ""})
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExamPratiqueSection({ dossier, refresh }) {
  const [paying, setPaying] = useState(false);

  const pay = async () => {
    setPaying(true);
    try {
      const { data } = await api.post("/payments/checkout", { inscription_id: dossier.reinscription_inscription_id, allow_klarna: false });
      window.location.href = data.url;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Le paiement en ligne n'est pas disponible pour le moment — contactez l'agence.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-3 mb-4">
      <a href={EXAMENT3P_URL} target="_blank" rel="noreferrer" className="block">
        <Button variant="outline" className="w-full sm:w-auto" data-testid={`check-result-${dossier.id}`}>
          <ArrowSquareOut size={14} className="mr-1" /> Vérifier mon résultat (site CMA)
        </Button>
      </a>

      {dossier.exam_theorique_result === "reussi" && !dossier.exam_pratique_date && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <p className="text-sm font-medium mb-3 flex items-center gap-2"><CalendarCheck size={16} className="text-[#d4af37]" /> Choisissez votre créneau de préparation pratique</p>
          <SlotPicker dossierId={dossier.id} onBooked={refresh} />
        </div>
      )}

      {dossier.exam_pratique_date && !dossier.exam_pratique_result && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800 flex items-start gap-2">
          <CalendarCheck size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Examen pratique prévu le {new Date(dossier.exam_pratique_date).toLocaleDateString("fr-FR")}</p>
            {dossier.exam_pratique_department && <p className="text-xs mt-0.5">Département : {dossier.exam_pratique_department}</p>}
          </div>
        </div>
      )}

      {dossier.exam_jour_date && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm flex items-center gap-2">
          <MapPin size={16} className="text-[#d4af37]" />
          <span>Jour d'examen : <b>{new Date(dossier.exam_jour_date).toLocaleDateString("fr-FR")}</b>{dossier.exam_jour_confirmed && <Badge className="ml-2 bg-green-100 text-green-700 hover:bg-green-100">Confirmé</Badge>}</span>
        </div>
      )}

      {dossier.exam_pratique_result === "echoue" && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-sm text-amber-800">
          <p className="font-medium mb-1">Résultat : à repasser</p>
          <p className="mb-2">
            Pas d'inquiétude, le parcours est à refaire. Une réinscription de <b>{REINSCRIPTION_PRICE} €</b> est nécessaire pour reprendre.
            {dossier.exam_cma_next_date && <> Prochaine date d'examen (CMA) : <b>{new Date(dossier.exam_cma_next_date).toLocaleDateString("fr-FR")}</b>.</>}
          </p>
          {dossier.reinscription_inscription_id && !dossier.reinscription_paid && (
            <Button size="sm" disabled={paying} onClick={pay} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid={`pay-reinscription-${dossier.id}`}>
              <CreditCard size={14} className="mr-1" /> Payer {REINSCRIPTION_PRICE} € pour reprendre
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

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
      {user?.id && <Onboarding userId={user.id} />}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold hidden sm:inline">TDL Formation</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-sm hidden md:inline">Bonjour, <b>{user?.name}</b></span>
            <Button variant="outline" size="sm" onClick={async () => { await logout(); navigate("/"); }} data-testid="student-logout">
              <SignOut size={14} className="sm:mr-1" /> <span className="hidden sm:inline">Déconnexion</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <p className="overline">Mon espace</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-1 mb-6 sm:mb-8">Mes formations & dossiers</h1>

        <div className="space-y-4">
          {dossiers.map((d) => {
            const docs = docsByDossier[d.id] || [];
            const manquants = d.documents_manquants || [];
            return (
              <Card key={d.id} className="p-4 sm:p-6 border border-gray-200 rounded-md shadow-none" data-testid={`student-dossier-${d.id}`}>
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
                      <p className="text-xs mt-1">{manquants.map((m) => DOC_TYPE_LABELS[m] || m).join(", ")} — vous pouvez aussi venir en agence avec ces documents.</p>
                    </div>
                  </div>
                ) : (d.documents_requis || []).length > 0 ? (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-md p-3 mb-4 text-sm text-green-700">
                    <CheckCircle size={16} weight="fill" /> Tous les documents requis ont été envoyés.
                  </div>
                ) : null}

                {CMA_CATEGORIES.includes(d.category) && (
                  <>
                    <ExamTheoriqueSection dossier={d} onNotified={fetchDossiers} />
                    <ExamPratiqueSection dossier={d} refresh={fetchDossiers} />
                  </>
                )}

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
                    <SelectTrigger className="w-full sm:w-56 h-9 text-sm" data-testid={`doctype-${d.id}`}>
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
      <ChatWidget />
      <ContactBubble />
    </div>
  );
}
