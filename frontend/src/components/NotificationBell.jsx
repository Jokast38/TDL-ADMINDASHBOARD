import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Bell, BellRinging, PhoneCall, ChatCircleText } from "@phosphor-icons/react";

const POLL_MS = 60_000;

// Cloche de rappel — tant que les demandes de rappel (page Inscriptions) ou
// les leads "à appeler" (sans email, pas encore contactés) ne sont pas
// traités, ils remontent ici à chaque rafraîchissement : pas de "vu" qui
// masque définitivement, le compteur ne baisse que quand c'est réellement traité.
export default function NotificationBell() {
  const [summary, setSummary] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = () => api.get("/notifications/summary").then(({ data }) => setSummary(data)).catch(() => {});

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!summary) return null;
  const total = summary.total || 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md hover:bg-gray-100 text-gray-600"
        aria-label="Notifications"
        data-testid="notification-bell"
      >
        {total > 0 ? <BellRinging size={20} weight="fill" className="text-[#d4af37]" /> : <Bell size={20} />}
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-md shadow-lg z-30" data-testid="notification-dropdown">
          <div className="p-3 border-b border-gray-100">
            <p className="text-sm font-semibold">Rappels à traiter</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {total === 0 ? (
              <p className="p-4 text-sm text-gray-400 text-center">Rien à traiter pour le moment 🎉</p>
            ) : (
              <>
                {summary.callback_pending > 0 && (
                  <button
                    onClick={() => { setOpen(false); navigate("/admin/inscriptions"); }}
                    className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 text-left border-b border-gray-100"
                    data-testid="notif-callback"
                  >
                    <ChatCircleText size={18} className="text-[#d4af37] mt-0.5 shrink-0" weight="fill" />
                    <div>
                      <p className="text-sm font-medium">{summary.callback_pending} demande(s) de rappel</p>
                      <p className="text-xs text-gray-500">Non traitées — page Inscriptions</p>
                    </div>
                  </button>
                )}
                {summary.leads_a_appeler > 0 && (
                  <button
                    onClick={() => { setOpen(false); navigate("/admin/leads"); }}
                    className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 text-left"
                    data-testid="notif-leads"
                  >
                    <PhoneCall size={18} className="text-[#d4af37] mt-0.5 shrink-0" weight="fill" />
                    <div>
                      <p className="text-sm font-medium">{summary.leads_a_appeler} lead(s) à appeler</p>
                      <p className="text-xs text-gray-500">Sans email, pas encore contactés</p>
                    </div>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
