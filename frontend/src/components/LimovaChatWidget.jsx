import { useEffect } from "react";

// Bulle WhatsApp Business via Limova (demande du 2026-10-22) — widget
// entièrement hébergé et géré par Limova (iframe pointant vers leur
// embededChatbot), aucune donnée ne transite par notre backend. Code fourni
// tel quel par Limova :
//   <script src="https://new.limova.ai/scripts/chatbot-loader.js"
//           data-connection-id="..."></script>
//
// `data-bottom`/`data-right` sont des attributs officiellement supportés par
// leur loader (voir chatbot-loader.js) pour positionner la bulle — utilisés
// ici pour l'empiler AU-DESSUS de la bulle du chatbot IA interne
// (ChatWidget.jsx, 56px de haut, ancrée bottom:20px/right:20px), plutôt que
// de bidouiller du CSS sur un widget tiers dont le DOM peut changer.
const CONNECTION_ID = "615fc19c-97d5-4fd0-8ac1-1a9c82481e88";
const SCRIPT_ID = "limova-chatbot-loader";

export default function LimovaChatWidget() {
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://new.limova.ai/scripts/chatbot-loader.js";
    script.async = true;
    script.setAttribute("data-connection-id", CONNECTION_ID);
    // Empilée au-dessus du chatbot IA (20 + 56px de bulle + 14px d'écart).
    script.setAttribute("data-bottom", "90");
    script.setAttribute("data-right", "20");
    document.body.appendChild(script);
  }, []);

  return null;
}
