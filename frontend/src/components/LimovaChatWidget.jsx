import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Bulle WhatsApp Business via Limova (demande du 2026-10-22, confinée au
// site public le 2026-11-02) — widget entièrement hébergé et géré par
// Limova (iframe pointant vers leur embededChatbot), aucune donnée ne
// transite par notre backend. Code fourni tel quel par Limova :
//   <script src="https://new.limova.ai/scripts/chatbot-loader.js"
//           data-connection-id="..."></script>
//
// Monté UNE SEULE FOIS, au niveau racine (voir App.js, même emplacement que
// AnalyticsLoader) — PAS depuis ChatWidget.jsx comme au départ : ce dernier
// n'est rendu que sur certaines pages (dont /espace-etudiant), et surtout,
// le script Limova ne se nettoie jamais lui-même. Le monter depuis un
// composant qui se démonte (navigation SPA vers une page qui ne rend plus
// ChatWidget) laissait donc la bulle et son iframe orphelins dans le DOM
// indéfiniment — observé en prod : la bulle restait visible même après avoir
// navigué vers le dashboard admin, qui ne monte jamais ChatWidget. En la
// montant une fois pour toutes ici, avec useLocation() réactif, on peut
// injecter/retirer le widget à chaque changement de route, y compris les
// navigations internes sans rechargement complet.
const CONNECTION_ID = "615fc19c-97d5-4fd0-8ac1-1a9c82481e88";
const SCRIPT_ID = "limova-chatbot-loader";

function removeWidget() {
  document.getElementById(SCRIPT_ID)?.remove();
  // Le loader ne pose aucun id/class sur l'iframe qu'il crée — seul son src
  // (vers .../embededChatbot) est prévisible, voir chatbot-loader.js.
  document.querySelectorAll('iframe[src*="embededChatbot"]').forEach((el) => el.remove());
}

function injectWidget() {
  if (document.getElementById(SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = "https://new.limova.ai/scripts/chatbot-loader.js";
  script.async = true;
  script.setAttribute("data-connection-id", CONNECTION_ID);
  // Empilée au-dessus de la bulle du chatbot IA interne (ChatWidget.jsx,
  // 56px de haut, ancrée bottom:20px/right:20px).
  script.setAttribute("data-bottom", "90");
  script.setAttribute("data-right", "20");
  document.body.appendChild(script);
}

export default function LimovaChatWidget() {
  const location = useLocation();
  // Réservé au site public : jamais sur le dashboard admin ni sur l'espace
  // apprenant (zone authentifiée, pas "le site public" au sens de la demande).
  const isPublicPage = !location.pathname.startsWith("/admin") && !location.pathname.startsWith("/espace-etudiant");

  useEffect(() => {
    if (isPublicPage) injectWidget();
    else removeWidget();
  }, [isPublicPage]);

  useEffect(() => () => removeWidget(), []);

  return null;
}
