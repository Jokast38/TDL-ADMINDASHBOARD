import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Warning } from "@phosphor-icons/react";

const DOMAINES = ["Réglementation", "Gestion/calcul", "Sécurité routière", "Français/anglais", "Commercial", "Pratique"];

export default function PositioningTest() {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | ready | done | error | submitted
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [reponseQ17, setReponseQ17] = useState("");
  const [domaines, setDomaines] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/positioning-tests/${token}`)
      .then((r) => { setData(r.data); setState("ready"); })
      .catch((e) => {
        if (e.response?.status === 410) { setState("submitted"); }
        else { setErrorMsg(e.response?.data?.detail || "Lien invalide"); setState("error"); }
      });
  }, [token]);

  const choose = (i, opt) => setAnswers((a) => ({ ...a, [i]: opt }));
  const toggleDomaine = (d) => setDomaines((ds) => ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]);

  const submit = async () => {
    if (Object.keys(answers).length < data.questions.length) {
      setErrorMsg("Merci de répondre à toutes les questions avant d'envoyer.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrorMsg("");
    setSubmitting(true);
    try {
      await api.post(`/positioning-tests/${token}/submit`, {
        answers, reponse_q17: reponseQ17, domaines_a_renforcer: domaines,
      });
      setState("done");
    } catch (e) {
      setErrorMsg(e.response?.data?.detail || "Erreur lors de l'envoi");
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Chargement...</div>;
  }

  if (state === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <Warning size={40} className="text-red-500" />
        <p className="text-lg font-medium">{errorMsg}</p>
      </div>
    );
  }

  if (state === "submitted") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <CheckCircle size={40} className="text-[#0B7238]" weight="fill" />
        <p className="text-lg font-medium">Ce test a déjà été complété.</p>
        <p className="text-sm text-gray-500">Vous pouvez fermer cette page.</p>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <CheckCircle size={48} className="text-[#0B7238]" weight="fill" />
        <p className="text-xl font-semibold">Merci {data.stagiaire_nom} !</p>
        <p className="text-sm text-gray-500 max-w-md">
          Vos réponses ont bien été envoyées à TDL Formation. Un formateur les examinera avant votre entrée en formation.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-lg shadow-sm p-6 sm:p-8">
        <p className="text-xs uppercase tracking-wide text-[#d4af37] font-semibold">TDL Formation</p>
        <h1 className="text-2xl sm:text-3xl font-bold mt-1">Test de positionnement</h1>
        <p className="text-sm text-gray-500 mt-2">
          Candidat : <b>{data.stagiaire_nom}</b>{data.session ? <> — Session : <b>{data.session}</b></> : null}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Répondez à toutes les questions ci-dessous, il n'y a pas de mauvaise réponse : cela nous permet d'adapter votre accompagnement.
        </p>

        {errorMsg && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">{errorMsg}</div>
        )}

        <div className="mt-6 space-y-6">
          {data.questions.map((q, i) => (
            <div key={i} className="border-b border-gray-100 pb-5">
              <p className="text-xs font-semibold text-[#d4af37] mb-1">{q.theme}</p>
              <p className="font-medium mb-2">{i + 1}. {q.question}</p>
              <div className="space-y-1.5">
                {q.options.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={`q${i}`}
                      checked={answers[i] === opt}
                      onChange={() => choose(i, opt)}
                      className="accent-[#0a0a0a]"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="border-b border-gray-100 pb-5">
            <p className="font-medium mb-2">
              {data.questions.length + 1}. Citez deux comportements favorisant une prise en charge professionnelle du client :
            </p>
            <Textarea rows={3} value={reponseQ17} onChange={(e) => setReponseQ17(e.target.value)} placeholder="Votre réponse..." />
          </div>

          <div>
            <p className="font-medium mb-2">
              {data.questions.length + 2}. Selon vous, quels domaines auriez-vous besoin de renforcer ? (plusieurs choix possibles)
            </p>
            <div className="flex flex-wrap gap-3">
              {DOMAINES.map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={domaines.includes(d)} onChange={() => toggleDomaine(d)} className="accent-[#0a0a0a]" />
                  {d}
                </label>
              ))}
            </div>
          </div>
        </div>

        <Button
          onClick={submit}
          disabled={submitting}
          className="w-full mt-8 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white py-6 text-base"
        >
          {submitting ? "Envoi en cours..." : "Envoyer mes réponses"}
        </Button>
      </div>
    </div>
  );
}
