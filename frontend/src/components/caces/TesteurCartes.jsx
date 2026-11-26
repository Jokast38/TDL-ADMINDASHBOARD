import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PhotoCapture from "@/components/PhotoCapture";
import { CACES_CATEGORIES_PROPOSEES, CACES_CATEGORIE_LABELS } from "@/components/caces/CacesCategoriesPicker";
import { downloadPdf } from "@/components/caces/CacesExamPanel";
import { formatDateFR } from "@/lib/dateFormat";
import { Camera, Certificate, CheckCircle, DownloadSimple, Lock, LockOpen, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

// Cartes CACES® générées par le testeur (demande du 2026-11-26) — backend
// routers/caces_cartes.py. Pour chaque session dont l'examen est passé :
// 1. déclarer les catégories obtenues (admis / ajourné) ;
// 2. compléter la carte des admis (nom, date de naissance, signataire) et
//    prendre la photo avec l'aide au cadrage ;
// 3. générer la carte (PDF archivé au nom du testeur).
// Ouvert le jour de l'examen et le lendemain (24 h), rouvert si le testeur
// est placé sur une autre session CACES, ou sur autorisation de l'équipe.

const errorDetail = (e, fallback) => e.response?.data?.detail || fallback;

export default function TesteurCartes({ onCount }) {
  const [data, setData] = useState(null);

  const load = () => api.get("/caces/testeur/cartes").then((r) => {
    setData(r.data);
    onCount?.(r.data.sessions.filter((s) => s.fenetre.ouvert).reduce((n, s) => n + s.a_faire, 0));
  }).catch(() => setData({ sessions: [] }));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <p className="text-sm text-gray-500">Chargement…</p>;
  if (!data.sessions.length) {
    return (
      <Card className="p-8 text-center border-dashed shadow-none">
        <p className="text-gray-500">Aucune session CACES passée pour l'instant. Les cartes se génèrent à partir du jour de l'examen.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-4" data-testid="testeur-cartes">
      <Card className="p-4 border border-blue-200 bg-blue-50/50 shadow-none text-sm text-gray-700 space-y-1">
        <p className="font-medium">Comment faire les cartes CACES® de vos candidats</p>
        <p>1. Déclarez pour chaque candidat les catégories obtenues (Admis) ou non (Ajourné), puis enregistrez.</p>
        <p>2. Pour chaque admis, complétez la date de naissance et le signataire, et prenez la photo en suivant le cadre.</p>
        <p>3. Cliquez sur « Générer la carte ». Possible le jour de l'examen et le lendemain ; ensuite, demandez l'autorisation à l'équipe TDL.</p>
      </Card>
      {data.sessions.map((s) => <SessionCartes key={s.stage_id} session={s} onChanged={load} />)}
    </div>
  );
}

function SessionCartes({ session, onChanged }) {
  const ouvert = session.fenetre.ouvert;
  // Signataire déjà saisi pour un autre candidat : proposé par défaut.
  const signataire = session.candidats.map((c) => c.carte).find((c) => c?.signataire_name) || null;
  return (
    <Card className={`p-5 border rounded-md shadow-none ${ouvert ? "border-gray-200" : "border-gray-200 bg-gray-50"}`} data-testid={`cartes-session-${session.stage_id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold">{session.formation_titre}</h3>
          <p className="text-xs text-gray-500">
            Du {formatDateFR(session.date_debut)} au {formatDateFR(session.date_fin)}{session.lieu_ville ? ` · ${session.lieu_ville}` : ""} · examen le {formatDateFR(session.date_examen)}
          </p>
        </div>
        <Badge className={ouvert ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-gray-200 text-gray-600 hover:bg-gray-200"}>
          {ouvert ? <LockOpen size={12} className="mr-1" /> : <Lock size={12} className="mr-1" />} {session.fenetre.message}
        </Badge>
      </div>
      <div className="mt-4 space-y-3">
        {session.candidats.length === 0 && <p className="text-sm text-gray-500">Aucun candidat inscrit.</p>}
        {session.candidats.map((c) => (
          <CandidatCarte key={c.inscription_id} stageId={session.stage_id} cand={c} ouvert={ouvert} signataire={signataire} onChanged={onChanged} />
        ))}
      </div>
    </Card>
  );
}

function CandidatCarte({ stageId, cand, ouvert, signataire, onChanged }) {
  const cats = cand.categories.length ? cand.categories : CACES_CATEGORIES_PROPOSEES;
  const [resultats, setResultats] = useState(cand.declaration || {});
  const [infos, setInfos] = useState({});
  const [busy, setBusy] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const carte = cand.carte;
  const sur = (c) => (carte?.categories || []).includes(c);

  useEffect(() => {
    setResultats(cand.declaration || {});
    setInfos({
      student_name: carte?.student_name || cand.student_name || "",
      date_naissance: carte?.date_naissance || "",
      signataire_name: carte?.signataire_name || signataire?.signataire_name || "",
      signataire_qualite: carte?.signataire_qualite || signataire?.signataire_qualite || "",
    });
  }, [cand, carte, signataire]);

  const modifie = Object.entries(resultats).some(([k, v]) => (cand.declaration || {})[k] !== v);

  const declarer = async () => {
    setBusy(true);
    try {
      await api.post(`/caces/sessions/${stageId}/candidats/${cand.inscription_id}/declaration`, { resultats });
      toast.success("Résultats enregistrés");
      onChanged();
    } catch (e) { toast.error(errorDetail(e, "Résultats non enregistrés")); } finally { setBusy(false); }
  };

  const enregistrerInfos = async () => {
    setBusy(true);
    try {
      await api.put(`/caces/sessions/${stageId}/candidats/${cand.inscription_id}/carte`, infos);
      toast.success("Informations de la carte enregistrées");
      onChanged();
    } catch (e) { toast.error(errorDetail(e, "Informations non enregistrées")); } finally { setBusy(false); }
  };

  const generer = async () => {
    setBusy(true);
    await downloadPdf(`/caces/sessions/${stageId}/candidats/${cand.inscription_id}/carte.pdf`,
      `carte_caces_${(carte?.student_name || cand.student_name || "candidat").replace(/\s+/g, "_")}.pdf`);
    setBusy(false);
    onChanged();
  };

  const infosModifiees = carte && ["student_name", "date_naissance", "signataire_name", "signataire_qualite"].some((k) => (infos[k] || "") !== (carte[k] || ""));

  return (
    <div className="border border-gray-200 rounded-md p-4 bg-white" data-testid={`carte-candidat-${cand.inscription_id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{cand.student_name}</p>
        {carte?.carte_generee_at && (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100"><CheckCircle size={12} className="mr-1" /> Carte générée le {formatDateFR(carte.carte_generee_at)}</Badge>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {cats.map((c) => (
          <div key={c} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-56 min-w-0"><b>Catégorie {c}</b> <span className="text-xs text-gray-500">{CACES_CATEGORIE_LABELS[c]}</span></span>
            {[["admis", "Admis", "bg-green-600 hover:bg-green-700"], ["ajourne", "Ajourné", "bg-red-600 hover:bg-red-700"]].map(([v, label, cls]) => (
              <Button key={v} size="sm" type="button" disabled={!ouvert || sur(c)} data-testid={`decl-${cand.inscription_id}-${c}-${v}`}
                onClick={() => setResultats((r) => ({ ...r, [c]: r[c] === v ? undefined : v }))}
                className={resultats[c] === v ? `${cls} text-white` : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}>
                {label}
              </Button>
            ))}
            {sur(c) && <span className="text-xs text-green-700">Sur la carte</span>}
          </div>
        ))}
        {ouvert && modifie && (
          <Button size="sm" disabled={busy} onClick={declarer} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid={`decl-save-${cand.inscription_id}`}>
            Enregistrer les résultats
          </Button>
        )}
      </div>

      {carte && (
        <div className="mt-4 pt-3 border-t border-gray-100 space-y-3">
          <p className="text-sm font-medium flex items-center gap-1"><Certificate size={16} /> Carte CACES® — catégorie(s) {carte.categories.join(", ")}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><p className="text-xs font-medium mb-1">Nom et prénom (en toutes lettres)</p><Input disabled={!ouvert} value={infos.student_name || ""} onChange={(e) => setInfos({ ...infos, student_name: e.target.value })} /></div>
            <div><p className="text-xs font-medium mb-1">Date de naissance <span className="text-red-500">*</span></p><Input type="date" disabled={!ouvert} value={infos.date_naissance || ""} onChange={(e) => setInfos({ ...infos, date_naissance: e.target.value })} data-testid={`carte-naissance-${cand.inscription_id}`} /></div>
            <div><p className="text-xs font-medium mb-1">Signataire <span className="text-red-500">*</span></p><Input disabled={!ouvert} value={infos.signataire_name || ""} onChange={(e) => setInfos({ ...infos, signataire_name: e.target.value })} placeholder="Nom du signataire" /></div>
            <div><p className="text-xs font-medium mb-1">Qualité du signataire</p><Input disabled={!ouvert} value={infos.signataire_qualite || ""} onChange={(e) => setInfos({ ...infos, signataire_qualite: e.target.value })} placeholder="Ex : Directeur" /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ouvert && infosModifiees && (
              <Button size="sm" disabled={busy} onClick={enregistrerInfos} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid={`carte-infos-save-${cand.inscription_id}`}>
                Enregistrer les informations
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={!ouvert || !cand.dossier_id} onClick={() => setPhotoOpen(true)} data-testid={`carte-photo-${cand.inscription_id}`}>
              <Camera size={14} className="mr-1" /> {cand.has_photo ? "Refaire la photo" : "Prendre la photo"}
            </Button>
            <Button size="sm" disabled={!ouvert || busy || cand.manque.length > 0 || infosModifiees} onClick={generer}
              className="bg-[#0052CC] hover:bg-[#0041a3] text-white" data-testid={`carte-generer-${cand.inscription_id}`}>
              <DownloadSimple size={14} className="mr-1" /> Générer la carte
            </Button>
          </div>
          {cand.manque.length > 0 && (
            <p className="text-xs text-amber-700 flex items-center gap-1"><WarningCircle size={14} /> À compléter avant de générer : {cand.manque.join(", ")}</p>
          )}
          {!cand.dossier_id && <p className="text-xs text-red-600">Pas de dossier pour ce candidat : prévenez l'équipe TDL pour la photo.</p>}
        </div>
      )}

      <Dialog open={photoOpen} onOpenChange={(o) => { setPhotoOpen(o); if (!o) onChanged(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Photo d'identité — {cand.student_name}</DialogTitle></DialogHeader>
          {photoOpen && (
            <PhotoCapture
              uploadUrl={`/caces/sessions/${stageId}/candidats/${cand.inscription_id}/photo`}
              fetchUrl={`/caces/sessions/${stageId}/candidats/${cand.inscription_id}/photo`}
              label="Photo pour la carte CACES" testId={`photo-${cand.inscription_id}`}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
