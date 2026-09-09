import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CheckCircle, Warning } from "@phosphor-icons/react";

export default function FrenchTest() {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | ready | done | error | submitted
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState(null);
  const [redaction, setRedaction] = useState("");
  const [qcmAnswers, setQcmAnswers] = useState({});
  const [calculAnswers, setCalculAnswers] = useState({});
  const [phrases, setPhrases] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    api.get(`/french-tests/${token}`)
      .then((r) => { setData(r.data); setState("ready"); })
      .catch((e) => {
        if (e.response?.status === 410) setState("submitted");
        else { setErrorMsg(e.response?.data?.detail || "Lien invalide"); setState("error"); }
      });
  }, [token]);

  const submit = async () => {
    setErrorMsg("");
    setSubmitting(true);
    try {
      const phrasesReponses = data.content.phrases.map((_, i) => phrases[i] || "");
      await api.post(`/french-tests/${token}/submit`, {
        redaction, qcm_answers: qcmAnswers, calcul_answers: calculAnswers, phrases_reponses: phrasesReponses,
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

  const c = data.content;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-lg shadow-sm p-6 sm:p-8">
        <p className="text-xs uppercase tracking-wide text-[#d4af37] font-semibold">TDL Formation</p>
        <h1 className="text-2xl sm:text-3xl font-bold mt-1">Test de connaissance de la langue française</h1>
        <p className="text-sm text-gray-500 mt-1">{c.theme_label}</p>
        <p className="text-sm text-gray-500 mt-2">
          Candidat : <b>{data.stagiaire_nom}</b>{data.session ? <> — Session : <b>{data.session}</b></> : null}
        </p>

        {errorMsg && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">{errorMsg}</div>
        )}

        <div className="mt-6 space-y-8">
          <div>
            <p className="font-semibold mb-1">1] Observez attentivement la situation suivante :</p>
            {c.image_url && !imageError ? (
              <img
                src={c.image_url} alt="Situation observée"
                className="w-full max-h-80 object-contain rounded-md border border-gray-200 bg-gray-50"
                onError={() => setImageError(true)}
              />
            ) : (
              <p className="text-sm text-gray-500 italic bg-gray-50 border border-gray-200 rounded-md p-3">{c.consigne_situation}</p>
            )}
            <p className="text-sm mt-3">{c.consigne_redaction}</p>
            <Textarea rows={6} className="mt-2" value={redaction} onChange={(e) => setRedaction(e.target.value)} placeholder="Votre réponse..." />
          </div>

          <div>
            <p className="font-semibold mb-2">2] Choisissez la réponse exacte :</p>
            <div className="space-y-4">
              {c.qcm.map((q, i) => (
                <div key={i}>
                  <p className="text-sm font-medium mb-1.5">{q.question}</p>
                  <div className="space-y-1.5">
                    {q.options.map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio" name={`qcm${i}`}
                          checked={qcmAnswers[i] === opt}
                          onChange={() => setQcmAnswers((a) => ({ ...a, [i]: opt }))}
                          className="accent-[#0a0a0a]"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="font-semibold mb-2">3] Tests de calcul :</p>
            <div className="grid grid-cols-2 gap-3">
              {c.calculs.map((calc, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm min-w-[90px]">{calc}</span>
                  <Input className="w-20" value={calculAnswers[i] || ""} onChange={(e) => setCalculAnswers((a) => ({ ...a, [i]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="font-semibold mb-2">4] Remettez les phrases suivantes dans le bon ordre :</p>
            <div className="space-y-3">
              {c.phrases.map((p, i) => (
                <div key={i}>
                  <p className="text-xs text-gray-400">{p}</p>
                  <Input className="mt-1" value={phrases[i] || ""} onChange={(e) => setPhrases((ph) => ({ ...ph, [i]: e.target.value }))} placeholder="Votre réponse..." />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="font-semibold mb-1">5] Lisez le texte suivant à voix haute (devant l'évaluateur) :</p>
            <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-md p-3">{c.texte_lecture}</p>
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
