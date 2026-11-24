// Réponses aux questions du formulaire Meta (publicité à formulaire), gardées
// à part des notes des commerciaux (demande du 2026-11-24) : une note écrite
// par un commercial ne les fait plus disparaître de l'écran. Source :
// meta_details.answers sur la fiche prospect, `answers` sur un import CSV.
// Dans les tableaux (compact), une icône ouvre les réponses dans une fenêtre.
import { useState } from "react";
import { ListChecks } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const clean = (s) => String(s ?? "")
  .replace(/_/g, " ")
  .replace(/\s*-\s*$/, "")
  .replace(/^\d+\.\s*/, "")
  .replace(/\s+/g, " ")
  .trim();

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function metaFormAnswers(lead) {
  const raw = (lead?.meta_details && lead.meta_details.answers) || lead?.answers || {};
  return Object.entries(raw)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([q, a]) => ({ question: capitalize(clean(q)).replace(/\s*\?$/, " ?"), reponse: capitalize(clean(a)) }));
}

function AnswersList({ answers }) {
  return (
    <div className="border border-indigo-100 bg-indigo-50/40 rounded-md p-2 space-y-1.5" data-testid="meta-form-answers">
      {answers.map((a) => (
        <div key={a.question} className="text-sm">
          <p className="text-xs text-gray-500">{a.question}</p>
          <p className="font-medium">{a.reponse}</p>
        </div>
      ))}
    </div>
  );
}

export default function MetaFormAnswers({ lead, compact = false }) {
  const [open, setOpen] = useState(false);
  const answers = metaFormAnswers(lead);
  if (!answers.length) return compact ? <span className="text-gray-300 text-xs">—</span> : null;
  if (!compact) return <AnswersList answers={answers} />;
  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded px-2 py-1"
        title="Voir les réponses au formulaire" data-testid="meta-form-answers-btn"
      >
        <ListChecks size={14} /> {answers.length}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Réponses au formulaire — {lead?.name || lead?.email || "prospect"}</DialogTitle>
          </DialogHeader>
          <AnswersList answers={answers} />
        </DialogContent>
      </Dialog>
    </>
  );
}
