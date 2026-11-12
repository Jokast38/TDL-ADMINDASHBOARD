import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, WarningCircle, PaperPlaneTilt, ArrowCounterClockwise } from "@phosphor-icons/react";

const FILTRES = [
  { key: "a_revoir", label: "À revoir" },
  { key: "a_corriger", label: "À corriger" },
  { key: "valide", label: "Validées" },
  { key: "toutes", label: "Toutes" },
];
const statutOf = (q) => q.revue?.statut || "a_revoir";

// Validation des questions théoriques CACES par le formateur (demande du
// 2026-11-12). Backend : routers/caces_exam.py (/caces/theorie/revue). Il
// valide chaque question ou la signale « à corriger » avec une remarque ;
// l'équipe corrige la banque, et une question modifiée repasse « à revoir ».
export default function QuestionsRevueTab() {
  const [data, setData] = useState(null);
  const [numero, setNumero] = useState("1");
  const [filtre, setFiltre] = useState("a_revoir");
  const [signaler, setSignaler] = useState(null); // qid en cours de signalement
  const [commentaire, setCommentaire] = useState("");
  const [busy, setBusy] = useState(null);
  const [sending, setSending] = useState(false);

  const load = () => api.get("/caces/theorie/revue").then((r) => setData(r.data)).catch(() => toast.error("Questions non chargées"));
  useEffect(() => { load(); }, []);

  const themes = useMemo(() => Object.fromEntries((data?.themes || []).map((t) => [t.key, t.label])), [data]);
  const grille = data?.grilles.find((g) => g.numero === numero);
  const total = useMemo(() => (data?.grilles || []).reduce((acc, g) => ({
    valide: acc.valide + g.stats.valide, a_corriger: acc.a_corriger + g.stats.a_corriger, a_revoir: acc.a_revoir + g.stats.a_revoir,
  }), { valide: 0, a_corriger: 0, a_revoir: 0 }), [data]);

  // Mise à jour locale (statistiques comprises) sans tout recharger.
  const applyRevue = (qid, revue) => setData((d) => ({
    ...d,
    grilles: d.grilles.map((g) => {
      if (g.numero !== numero) return g;
      const questions = g.questions.map((q) => (q.qid === qid ? { ...q, revue } : q));
      const count = (s) => questions.filter((q) => statutOf(q) === s).length;
      return { ...g, questions, stats: { valide: count("valide"), a_corriger: count("a_corriger"), a_revoir: count("a_revoir") } };
    }),
  }));

  const setStatut = async (q, statut, comment = "") => {
    setBusy(q.qid);
    try {
      const { data: res } = await api.put(`/caces/theorie/revue/${numero}/${q.qid}`, { statut, commentaire: comment });
      applyRevue(q.qid, res.revue);
      setSignaler(null); setCommentaire("");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Avis non enregistré");
      if (e.response?.status === 404) load();
    } finally {
      setBusy(null);
    }
  };

  const envoyer = async () => {
    setSending(true);
    try {
      const { data: res } = await api.post("/caces/theorie/revue/envoyer");
      toast.success(`Remarques envoyées à l'équipe TDL (${res.a_corriger} question(s) à corriger)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Envoi impossible");
    } finally {
      setSending(false);
    }
  };

  if (!data) return <p className="text-sm text-gray-400">Chargement…</p>;
  const nbTotal = total.valide + total.a_corriger + total.a_revoir;
  const questions = (grille?.questions || []).filter((q) => filtre === "toutes" || statutOf(q) === filtre);

  return (
    <div className="space-y-4 max-w-4xl" data-testid="caces-revue-tab">
      <Card className="p-4 border border-gray-200 shadow-none space-y-3">
        <p className="text-sm text-gray-600">
          Voici les questions vrai/faux des 4 grilles de l'épreuve théorique CACES® R489, utilisées pour les questionnaires
          papier. Pour chaque question, vérifiez l'affirmation <b>et la réponse attendue</b> : cliquez sur <b>« Correcte »</b>,
          ou sur <b>« À corriger »</b> en expliquant ce qui ne va pas. L'équipe TDL corrige ensuite la question, qui
          revient dans « À revoir ».
        </p>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm" data-testid="caces-revue-progression">
            <b>{total.valide + total.a_corriger}</b> / {nbTotal} questions revues —{" "}
            <span className="text-green-700">{total.valide} correcte(s)</span>,{" "}
            <span className="text-red-700">{total.a_corriger} à corriger</span>
          </p>
          <Button size="sm" onClick={envoyer} disabled={sending || total.valide + total.a_corriger === 0}
            className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="caces-revue-envoyer">
            <PaperPlaneTilt size={14} className="mr-1" /> Envoyer mes remarques à l'équipe
          </Button>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="bg-[#0B7238]" style={{ width: `${nbTotal ? (100 * total.valide) / nbTotal : 0}%` }} />
          <div className="bg-red-500" style={{ width: `${nbTotal ? (100 * total.a_corriger) / nbTotal : 0}%` }} />
        </div>
        <p className="text-[11px] text-gray-400">Vos avis sont enregistrés au fur et à mesure : vous pouvez vous arrêter et reprendre plus tard.</p>
      </Card>

      <div className="flex gap-2 flex-wrap" data-testid="caces-revue-grilles">
        {data.grilles.map((g) => (
          <button key={g.numero} type="button" onClick={() => setNumero(g.numero)}
            className={`text-sm px-3 py-1.5 rounded-md border ${numero === g.numero ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "border-gray-300 hover:bg-gray-50"}`}>
            Grille {g.numero} <span className="opacity-70 text-xs">({g.stats.a_revoir} à revoir)</span>
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {FILTRES.map((f) => (
          <button key={f.key} type="button" onClick={() => setFiltre(f.key)}
            className={`text-xs px-2.5 py-1 rounded-full border ${filtre === f.key ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 text-gray-600"}`}>
            {f.label}{f.key !== "toutes" && grille ? ` (${grille.stats[f.key]})` : ""}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {questions.map((q) => {
          const statut = statutOf(q);
          return (
            <Card key={q.qid} className={`p-4 border shadow-none ${statut === "valide" ? "border-green-200 bg-green-50/40" : statut === "a_corriger" ? "border-red-200 bg-red-50/40" : "border-gray-200"}`}
              data-testid={`caces-revue-q-${q.numero_question}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-gray-400">Question {q.numero_question} · {themes[q.theme] || q.theme}</p>
                  <p className="text-sm mt-1">{q.enonce}</p>
                  <p className="text-xs mt-1.5">Réponse attendue : <Badge variant="outline" className={q.reponse ? "border-green-600 text-green-700" : "border-red-600 text-red-700"}>{q.reponse ? "VRAI" : "FAUX"}</Badge></p>
                  {statut === "a_corriger" && <p className="text-xs text-red-700 mt-1.5">Votre remarque : {q.revue.commentaire}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {statut === "a_revoir" ? (
                    <>
                      <Button size="sm" variant="outline" disabled={busy === q.qid} onClick={() => setStatut(q, "valide")}
                        className="border-green-600 text-green-700 hover:bg-green-50" data-testid={`caces-revue-ok-${q.numero_question}`}>
                        <CheckCircle size={14} className="mr-1" /> Correcte
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy === q.qid} onClick={() => { setSignaler(q.qid); setCommentaire(""); }}
                        className="border-red-600 text-red-700 hover:bg-red-50" data-testid={`caces-revue-ko-${q.numero_question}`}>
                        <WarningCircle size={14} className="mr-1" /> À corriger
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={busy === q.qid} onClick={() => setStatut(q, null)} title="Annuler mon avis">
                      <ArrowCounterClockwise size={14} className="mr-1" /> Changer d'avis
                    </Button>
                  )}
                </div>
              </div>
              {signaler === q.qid && (
                <div className="mt-3 space-y-2">
                  <Textarea rows={2} autoFocus value={commentaire} onChange={(e) => setCommentaire(e.target.value)}
                    placeholder="Ce qui ne va pas : réponse fausse, formulation ambiguë, mauvais thème… et la correction proposée" />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSignaler(null)}>Annuler</Button>
                    <Button size="sm" disabled={!commentaire.trim() || busy === q.qid} onClick={() => setStatut(q, "a_corriger", commentaire)}
                      className="bg-red-700 hover:bg-red-800 text-white">Signaler</Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {!questions.length && (
          <Card className="p-8 text-center border-dashed text-sm text-gray-500">
            {filtre === "a_revoir" ? `Toutes les questions de la grille ${numero} ont été revues. Merci !` : "Aucune question ici."}
          </Card>
        )}
      </div>
    </div>
  );
}
