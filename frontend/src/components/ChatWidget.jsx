import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ChatCircleDots, PaperPlaneRight, X, Robot } from "@phosphor-icons/react";
import { WELCOME_MESSAGE, QUICK_REPLIES, getBotReply } from "@/constants/chatbotScript";

// Chatbot public — branché sur le modèle réel (Ollama, voir backend
// routers/chatbot.py) via POST /api/chat/message. Si l'appel échoue
// (modèle indisponible, réseau...), on retombe sur le script local
// (constants/chatbotScript.js) pour ne jamais laisser le visiteur sans
// réponse — dégradation silencieuse, pas d'erreur affichée.
const SESSION_KEY = "tdl_chat_session_id";
let idCounter = 0;
const nextId = () => `m${++idCounter}`;

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ id: nextId(), from: "bot", text: WELCOME_MESSAGE }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);
  const sessionIdRef = useRef(null);

  useEffect(() => {
    sessionIdRef.current = localStorage.getItem(SESSION_KEY) || null;
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((m) => [...m, { id: nextId(), from: "user", text: trimmed }]);
    setInput("");
    setTyping(true);
    try {
      const { data } = await api.post("/chat/message", {
        session_id: sessionIdRef.current,
        message: trimmed,
      });
      sessionIdRef.current = data.session_id;
      localStorage.setItem(SESSION_KEY, data.session_id);
      setMessages((m) => [...m, { id: nextId(), from: "bot", text: data.reply }]);
    } catch {
      // Repli sur le script local — le visiteur ne voit jamais d'erreur brute.
      setMessages((m) => [...m, { id: nextId(), from: "bot", text: getBotReply(trimmed) }]);
    } finally {
      setTyping(false);
    }
  };

  return (
    <>
      {/* Bulle flottante */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white shadow-xl flex items-center justify-center transition-transform hover:scale-105"
        aria-label={open ? "Fermer le chat" : "Ouvrir le chat"}
        data-testid="chat-widget-toggle"
      >
        {open ? <X size={24} /> : <ChatCircleDots size={26} weight="fill" className="text-[#d4af37]" />}
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-5 z-50 w-[92vw] max-w-sm h-[70vh] max-h-[560px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-fade-in-up"
          data-testid="chat-widget-panel"
        >
          {/* Header */}
          <div className="bg-[#0a0a0a] text-white px-4 py-3 flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-[#d4af37] flex items-center justify-center shrink-0">
              <Robot size={20} weight="fill" className="text-black" />
            </span>
            <div className="min-w-0">
              <p className="font-display font-bold text-sm truncate">Assistant TDL Formation</p>
              <p className="text-[11px] text-gray-300">Répond généralement en quelques secondes</p>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    m.from === "user"
                      ? "bg-[#0a0a0a] text-white rounded-br-sm"
                      : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: "0.15s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: "0.3s" }} />
                </div>
              </div>
            )}
          </div>

          {/* Quick replies (uniquement au tout début de la conversation) */}
          {messages.length === 1 && !typing && (
            <div className="px-4 pb-2 flex flex-wrap gap-2">
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:border-[#d4af37] hover:text-[#d4af37] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
            className="border-t border-gray-200 p-3 flex items-center gap-2 bg-white"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Écrivez votre message..."
              className="flex-1 text-sm px-3 py-2 rounded-full border border-gray-300 focus:outline-none focus:border-[#d4af37]"
              data-testid="chat-widget-input"
            />
            <Button
              type="submit"
              size="icon"
              className="rounded-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white shrink-0"
              disabled={!input.trim()}
              data-testid="chat-widget-send"
            >
              <PaperPlaneRight size={16} />
            </Button>
          </form>

          <p className="text-[10px] text-gray-400 text-center pb-2 px-4">
            Réponses automatiques indicatives ·{" "}
            <a href="tel:+33180907249" className="underline">01 80 90 72 49</a> pour un conseiller,{" "}
            <Link to="/faq" className="underline" onClick={() => setOpen(false)}>voir la FAQ</Link>
          </p>
        </div>
      )}
    </>
  );
}
