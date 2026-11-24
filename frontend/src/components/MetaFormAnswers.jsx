// Réponses aux questions du formulaire Meta (publicité à formulaire), gardées
// à part des notes des commerciaux (demande du 2026-11-24) : une note écrite
// par un commercial ne les fait plus disparaître de l'écran. Source :
// meta_details.answers sur la fiche prospect, `answers` sur un import CSV.

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

export default function MetaFormAnswers({ lead, compact = false }) {
  const answers = metaFormAnswers(lead);
  if (!answers.length) return compact ? <span className="text-gray-300 text-xs">—</span> : null;
  if (compact) {
    return (
      <div className="space-y-1 max-w-[260px]" data-testid="meta-form-answers">
        {answers.map((a) => (
          <p key={a.question} className="text-[11px] leading-snug" title={a.question}>
            <span className="text-gray-500">{a.question}</span>{" "}
            <span className="font-medium text-gray-900">{a.reponse}</span>
          </p>
        ))}
      </div>
    );
  }
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
