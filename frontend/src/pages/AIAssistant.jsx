import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Robot, PaperPlaneTilt, Lightning } from "@phosphor-icons/react";
import { toast } from "sonner";

const CONTEXTS = [
  { key: "general", label: "Général", desc: "Assistance client générale" },
  { key: "document_verification", label: "Vérif. documents", desc: "Analyse de documents ANTS" },
  { key: "pricing", label: "Proposition de prix", desc: "Génère un devis structuré" },
  { key: "marketing", label: "Marketing", desc: "Actions SEO / Ads / Email" },
];

const SUGGESTIONS = {
  general: [
    "Comment puis-je m'inscrire à une formation CACES ?",
    "Quel est le tarif pour récupérer 4 points de permis ?",
    "Documents nécessaires pour le permis B ?"
  ],
  document_verification: [
    "Le justificatif de domicile doit avoir moins de 3 mois ?",
    "Vérifier la conformité d'un permis B pour ANTS",
    "Quels documents pour la formation VTC ?"
  ],
  pricing: [
    "Génère une proposition pour CACES R489 cat. 3 (35h)",
    "Devis pour pack permis B complet + ANTS",
    "Tarif SSIAP 1 avec accompagnement"
  ],
  marketing: [
    "Plan marketing pour booster les inscriptions CACES",
    "Stratégie SEO local pour TDL Formation",
    "Campagne Ads pour KAMI STREET — budget 500€/mois"
  ],
};

export default function AIAssistant() {
  const [context, setContext] = useState("general");
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text) => {
    const msg = text || input;
    if (!msg.trim()) return;
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setInput("");
    setLoading(true);
    try {
      const { data } = await api.post("/ai/chat", { message: msg, session_id: sessionId, context });
      if (!sessionId) setSessionId(data.session_id);
      setMessages((m) => [...m, { role: "ai", text: data.response }]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur IA");
    } finally {
      setLoading(false);
    }
  };

  const switchContext = (k) => {
    setContext(k);
    setSessionId(null);
    setMessages([]);
  };

  return (
    <div className="space-y-6" data-testid="ai-page">
      <div>
        <p className="overline flex items-center gap-2"><Lightning size={12} weight="fill" /> Claude Sonnet 4.5</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Assistant IA</h1>
        <p className="text-gray-500 mt-2">Assistance client, vérification documents, propositions de prix, marketing.</p>
      </div>

      <Tabs value={context} onValueChange={switchContext}>
        <TabsList data-testid="ai-context-tabs">
          {CONTEXTS.map((c) => (
            <TabsTrigger key={c.key} value={c.key} data-testid={`tab-${c.key}`}>{c.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="border border-gray-200 rounded-md shadow-none flex flex-col h-[60vh]">
        <div className="flex-1 overflow-y-auto p-6 space-y-4" data-testid="ai-messages">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Robot size={48} className="mx-auto text-gray-300 mb-3" weight="duotone" />
              <p className="text-gray-500 mb-6">Posez votre question ou choisissez une suggestion.</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                {SUGGESTIONS[context].map((s) => (
                  <button
                    key={s} onClick={() => send(s)}
                    className="px-3 py-2 text-xs border border-gray-200 rounded-md hover:border-[#0a0a0a] hover:text-[#0a0a0a] transition-colors text-left"
                    data-testid={`suggestion-${s.slice(0, 10)}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] p-4 rounded-md text-sm whitespace-pre-wrap ${
                m.role === "user" ? "bg-[#0a0a0a] text-white" : "bg-gray-100 text-gray-900"
              }`} data-testid={`msg-${m.role}-${i}`}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 p-4 rounded-md text-sm text-gray-500 flex items-center gap-2">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }}></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }}></span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="border-t border-gray-200 p-4 flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Posez votre question..."
            rows={1}
            className="resize-none min-h-[44px]"
            data-testid="ai-input"
          />
          <Button onClick={() => send()} disabled={loading || !input.trim()} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="ai-send">
            <PaperPlaneTilt size={16} weight="fill" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
