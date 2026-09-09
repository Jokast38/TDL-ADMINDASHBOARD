import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle } from "@phosphor-icons/react";

const CHAUD_QUESTIONS = [
  { key: "qualite_formation", label: "Qualité générale de la formation" },
  { key: "contenu_pedagogique", label: "Contenu pédagogique" },
  { key: "formateur", label: "Qualité du formateur / de l'animateur" },
  { key: "organisation", label: "Organisation de la session" },
  { key: "locaux_moyens", label: "Locaux et moyens pédagogiques" },
  { key: "comprehension_contenu", label: "Compréhension du contenu" },
  { key: "satisfaction_generale", label: "Satisfaction générale" },
];

const FROID_QUESTIONS = [
  { key: "utilite_reelle", label: "Utilité réelle de la formation dans votre activité" },
  { key: "application_pratique", label: "Application pratique des compétences acquises" },
  { key: "evolution_professionnelle", label: "Évolution professionnelle depuis la formation" },
  { key: "examen_obtenu", label: "Avez-vous obtenu l'examen / la certification visée ?" },
  { key: "insertion_professionnelle", label: "Insertion professionnelle" },
  { key: "satisfaction_recul", label: "Satisfaction avec le recul" },
];

const SCALE = [1, 2, 3, 4, 5];

export default function SatisfactionSurvey() {
  const { type, inscriptionId } = useParams();
  const isFroid = type === "froid";
  const questions = isFroid ? FROID_QUESTIONS : CHAUD_QUESTIONS;
  const [context, setContext] = useState(null);
  const [answers, setAnswers] = useState({});
  const [commentaire, setCommentaire] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/satisfaction/public/${inscriptionId}`, { params: { type } })
      .then((r) => { setContext(r.data); if (r.data.already_submitted) setDone(true); })
      .catch(() => setError("Impossible de charger ce questionnaire — le lien est peut-être invalide."));
  }, [inscriptionId, type]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post("/satisfaction/public", { inscription_id: inscriptionId, type, answers, commentaire });
      setDone(true);
    } catch (e) {
      setError(e.response?.data?.detail || "Erreur lors de l'envoi.");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return <div className="min-h-screen flex items-center justify-center p-6"><p className="text-gray-500 text-center">{error}</p></div>;
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <CheckCircle size={48} weight="fill" className="text-[#d4af37] mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold mb-2">Merci pour votre retour !</h1>
          <p className="text-gray-500">Votre réponse a bien été enregistrée. Elle nous aide à améliorer nos formations.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8">
        <p className="overline text-[#d4af37]">{isFroid ? "Questionnaire à froid" : "Questionnaire à chaud"}</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">
          {context ? `Bonjour ${context.student_name || ""}` : "Chargement..."}
        </h1>
        {context?.formation_titre && <p className="text-gray-500 mt-1">Formation : {context.formation_titre}</p>}
        <p className="text-sm text-gray-400 mt-3">
          {isFroid
            ? "Quelques mois après votre formation, votre avis nous aide à mesurer son impact réel."
            : "Merci de noter chaque point de 1 (insatisfait) à 5 (très satisfait)."}
        </p>

        <div className="space-y-5 mt-6">
          {questions.map((q) => (
            <div key={q.key}>
              <label className="text-sm font-medium">{q.label}</label>
              <div className="flex gap-2 mt-1.5">
                {SCALE.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [q.key]: n }))}
                    className={`w-9 h-9 rounded-full text-sm font-semibold border transition-colors ${
                      answers[q.key] === n ? "bg-[#d4af37] border-[#d4af37] text-black" : "border-gray-200 text-gray-500 hover:border-[#d4af37]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {isFroid && (
            <div>
              <label className="text-sm font-medium">Difficultés rencontrées après la formation (facultatif)</label>
              <Textarea rows={2} className="mt-1.5" value={answers.difficultes || ""} onChange={(e) => setAnswers((a) => ({ ...a, difficultes: e.target.value }))} />
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Remarques et suggestions</label>
            <Textarea rows={3} className="mt-1.5" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Facultatif" />
          </div>
        </div>

        <Button
          className="w-full mt-6 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white"
          disabled={submitting || !Object.keys(answers).length}
          onClick={submit}
        >
          {submitting ? "Envoi..." : "Envoyer mes réponses"}
        </Button>
      </div>
    </div>
  );
}
