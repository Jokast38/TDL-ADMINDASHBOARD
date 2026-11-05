import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { api, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, PenNib, CheckCircle, XCircle, Eraser, FilePdf, PaperPlaneTilt } from "@phosphor-icons/react";
import { formatDateFR } from "@/lib/dateFormat";
import { toast } from "sonner";

// 4 signatures par jour — doit rester synchronisé avec _PERIODES côté
// backend (routers/emargements.py).
export const PERIODE_LABELS = { matin: "Matin", midi: "Midi", apres_midi: "Après-midi", fin_apres_midi: "Fin d'après-midi" };

/**
 * Émargement d'une session : jour, créneau, liste des apprenants, signature
 * sur l'écran, demande de signature à distance, feuille PDF.
 *
 * Utilisé par le formateur (espace animateur) et par l'équipe TDL (page
 * Sessions de formation, demande du 2026-11-05). `todayOnly` : le formateur
 * n'émarge que la journée en cours, quand la session est ouverte (voir
 * backend core/session_access.py) ; l'équipe TDL choisit n'importe quel jour.
 */
export default function EmargementPanel({ stage, todayOnly = false, today = null, onAccessLost }) {
  const [jours, setJours] = useState([]);
  const [sessionDate, setSessionDate] = useState(null);
  const [periode, setPeriode] = useState("matin");
  const [inscrits, setInscrits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signTarget, setSignTarget] = useState(null);
  const [presence, setPresence] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [requestingSignatures, setRequestingSignatures] = useState(false);
  const padRef = useRef(null);

  const handleError = (e, fallback) => {
    // 403 côté formateur = la session vient de se fermer (16h45 ou un agent).
    if (todayOnly && e.response?.status === 403 && onAccessLost) {
      onAccessLost(e.response?.data?.detail);
      return;
    }
    toast.error(e.response?.data?.detail || fallback);
  };

  const refresh = async (day, per) => {
    setLoading(true);
    try {
      const r = await api.get(`/stages/${stage.id}/inscrits`, { params: { session_date: day, periode: per } });
      setInscrits(r.data);
    } catch (e) {
      handleError(e, "Erreur de chargement des apprenants");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const j = await api.get(`/stages/${stage.id}/jours`);
      if (cancelled) return;
      const all = j.data.jours || [];
      const days = todayOnly ? all.filter((d) => d === today) : all;
      const first = days.includes(today) ? today : days[0];
      setJours(days);
      setSessionDate(first);
      setPeriode("matin");
      if (first) refresh(first, "matin");
    })().catch(() => toast.error("Erreur de chargement de la session"));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.id, todayOnly, today]);

  const changeDay = (day) => { setSessionDate(day); refresh(day, periode); };
  const changePeriode = (per) => { setPeriode(per); refresh(sessionDate, per); };

  const openSign = (ins) => { setSignTarget(ins); setPresence(true); setSignOpen(true); };

  const submitSign = async () => {
    let dataUrl = "";
    if (presence) {
      if (padRef.current?.isEmpty()) return toast.error("Veuillez signer dans la zone");
      dataUrl = padRef.current.getCanvas().toDataURL("image/png");
    }
    try {
      await api.post("/emargements", {
        stage_id: stage.id, inscription_id: signTarget.id, student_id: signTarget.student_id,
        student_name: signTarget.student_name, signature_data_url: dataUrl, present: presence,
        session_date: sessionDate, periode,
      });
      toast.success(presence ? "Émargement signé · attestation générée" : "Absence enregistrée");
      setSignOpen(false);
      refresh(sessionDate, periode);
    } catch (e) {
      handleError(e, "Erreur");
    }
  };

  const requestSignatures = async () => {
    setRequestingSignatures(true);
    try {
      const { data } = await api.post(`/stages/${stage.id}/emargements/request`, { session_date: sessionDate, periode });
      if (data.notified > 0) toast.success(`${data.notified} apprenant(s) invité(s) à signer depuis leur espace`);
      else toast.info("Tous les apprenants ont déjà signé ou ont déjà été relancés pour ce créneau");
    } catch (e) {
      handleError(e, "Erreur lors de la demande");
    } finally {
      setRequestingSignatures(false);
    }
  };

  const generateSheet = async () => {
    setGeneratingPdf(true);
    try {
      const { data } = await api.get(`/stages/${stage.id}/emargement-pdf`, { params: { session_date: sessionDate, periode } });
      const token = localStorage.getItem("tdl_token");
      const res = await fetch(`${API}/documents-generated/${data.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
      window.open(URL.createObjectURL(await res.blob()), "_blank");
      toast.success("Feuille d'émargement générée");
    } catch (e) {
      handleError(e, "Erreur génération PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (!jours.length) {
    return <p className="text-sm text-gray-400 py-4">{todayOnly ? "Émargement possible uniquement le jour de la session." : "Aucun jour pour cette session."}</p>;
  }

  return (
    <div>
      {jours.length > 1 && (
        <div className="mt-4">
          <p className="overline mb-2">Jour de la session ({jours.length} jours)</p>
          <div className="flex flex-wrap gap-2">
            {jours.map((j) => (
              <button
                key={j}
                onClick={() => changeDay(j)}
                className={`px-3 py-1.5 rounded-md text-xs border ${sessionDate === j ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "border-gray-300 hover:bg-gray-50"}`}
                data-testid={`day-${j}`}
              >
                {new Date(j).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}{j === today ? " · aujourd'hui" : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="overline mb-2">Créneau</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PERIODE_LABELS).map(([val, label]) => (
            <button
              key={val}
              onClick={() => changePeriode(val)}
              className={`px-3 py-1.5 rounded-md text-xs border ${periode === val ? "bg-[#d4af37] text-black border-[#d4af37]" : "border-gray-300 hover:bg-gray-50"}`}
              data-testid={`periode-${val}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <p className="overline flex items-center gap-2"><Users size={12} /> Liste d'émargement {sessionDate ? `— ${formatDateFR(sessionDate)}` : ""}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={requestSignatures} disabled={requestingSignatures} data-testid="request-emargements">
              <PaperPlaneTilt size={14} className="mr-1" /> {requestingSignatures ? "Envoi..." : "Demander les émargements"}
            </Button>
            <Button size="sm" variant="outline" onClick={generateSheet} disabled={generatingPdf} data-testid="generate-emargement-pdf">
              <FilePdf size={14} className="mr-1" /> {generatingPdf ? "Génération..." : "Générer la feuille PDF"}
            </Button>
          </div>
        </div>
        <div className={`space-y-2 ${loading ? "opacity-50" : ""}`}>
          {inscrits.map((ins) => (
            <div key={ins.id} className="flex items-center justify-between gap-2 p-3 border border-gray-200 rounded-md" data-testid={`inscrit-${ins.id}`}>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{ins.student_name}</p>
                <p className="text-xs text-gray-500 truncate">{ins.student_email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {ins.emarge ? (
                  ins.present ? (
                    <Badge className="bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10"><CheckCircle size={12} weight="fill" className="mr-1" /> Présent · signé</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><XCircle size={12} weight="fill" className="mr-1" /> Absent</Badge>
                  )
                ) : (
                  <Button size="sm" onClick={() => openSign(ins)} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid={`sign-${ins.id}`}>
                    <PenNib size={14} className="mr-1" /> Émarger
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!inscrits.length && !loading && <p className="text-sm text-gray-400 text-center py-6">Aucun inscrit.</p>}
        </div>
      </div>

      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="max-w-lg" data-testid="signature-dialog">
          {signTarget && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Émargement — {signTarget.student_name} ({sessionDate ? formatDateFR(sessionDate) : ""} · {PERIODE_LABELS[periode] || periode})
                </DialogTitle>
              </DialogHeader>
              <div className="mt-2 space-y-4">
                <div className="flex gap-2">
                  <Button variant={presence ? "default" : "outline"} onClick={() => setPresence(true)}
                    className={presence ? "bg-[#0B7238] hover:bg-[#0a5e2e] text-white" : ""} data-testid="present-btn">
                    <CheckCircle size={14} className="mr-1" /> Présent
                  </Button>
                  <Button variant={!presence ? "default" : "outline"} onClick={() => setPresence(false)}
                    className={!presence ? "bg-red-600 hover:bg-red-700 text-white" : ""} data-testid="absent-btn">
                    <XCircle size={14} className="mr-1" /> Absent
                  </Button>
                </div>
                {presence && (
                  <div>
                    <p className="text-sm font-medium mb-1">Signature de l'apprenant</p>
                    <div className="border-2 border-dashed border-gray-300 rounded-md bg-white">
                      <SignatureCanvas
                        ref={padRef}
                        canvasProps={{ width: 460, height: 180, className: "w-full rounded-md", "data-testid": "signature-pad" }}
                        penColor="#0a0a0a"
                      />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => padRef.current?.clear()} className="mt-1" data-testid="clear-sign">
                      <Eraser size={12} className="mr-1" /> Effacer
                    </Button>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                  <Button variant="outline" onClick={() => setSignOpen(false)}>Annuler</Button>
                  <Button onClick={submitSign} className="bg-[#d4af37] text-black hover:bg-[#b8941f]" data-testid="submit-sign">
                    Valider l'émargement
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
