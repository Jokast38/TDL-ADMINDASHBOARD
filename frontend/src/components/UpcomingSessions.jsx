import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MapPin, CalendarBlank } from "@phosphor-icons/react";

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

/** Charge les vraies sessions à venir (places restantes > 0) pour une
 * formation donnée — GET /stages/public/available, endpoint public déjà
 * utilisé par la page d'inscription (PublicInscription.jsx). Remplace les
 * dates placeholder des maquettes par les sessions réellement programmées
 * dans l'agenda. */
export function useUpcomingSessions(formationId) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(!!formationId);

  useEffect(() => {
    if (!formationId) { setSessions([]); setLoading(false); return; }
    setLoading(true);
    api.get("/stages/public/available", { params: { formation_id: formationId } })
      .then(({ data }) => setSessions((data || []).sort((a, b) => (a.date_debut || "").localeCompare(b.date_debut || ""))))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [formationId]);

  return { sessions, loading };
}

export function sessionLabel(s) {
  if (!s) return "";
  const dates = s.date_debut === s.date_fin
    ? formatDate(s.date_debut)
    : `Du ${formatDate(s.date_debut)} au ${formatDate(s.date_fin)}`;
  return s.heure_debut && s.heure_fin ? `${dates} · ${s.heure_debut}–${s.heure_fin}` : dates;
}

/** Section "Nos prochaines dates de formation" — une colonne par centre,
 * reprenant le gabarit fourni (en-tête noir + liste de sessions + badge de
 * disponibilité), mais avec les vraies dates de l'agenda plutôt que des
 * placeholders. */
export default function UpcomingSessionsSection({ formationId, title = "Nos prochaines dates de formation" }) {
  const { sessions, loading } = useUpcomingSessions(formationId);
  if (!formationId || (!loading && sessions.length === 0)) return null;

  const byVille = sessions.reduce((acc, s) => {
    const key = s.lieu_ville || "Session";
    (acc[key] = acc[key] || []).push(s);
    return acc;
  }, {});

  return (
    <div data-reveal>
      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#8A6400" }}>Tout savoir sur</p>
      <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mb-6">{title}</h2>
      {loading ? (
        <p className="text-sm text-gray-400">Chargement des sessions...</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-5">
          {Object.entries(byVille).map(([ville, items]) => (
            <div key={ville} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
              <div className="flex items-center gap-2 px-4 py-3 bg-black text-white">
                <span className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#F5C518" }}>
                  <MapPin size={15} weight="bold" className="text-black" />
                </span>
                <span className="font-display font-extrabold text-sm">{ville}</span>
              </div>
              <ol className="divide-y divide-gray-100">
                {items.map((s, i) => (
                  <li key={s.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${i === 0 ? "bg-[#fff8dc]" : ""}`}>
                    <div className="min-w-0">
                      {i === 0 && <em className="block not-italic text-[10px] font-extrabold uppercase tracking-wide" style={{ color: "#8A6400" }}>Prochaine session</em>}
                      <span className="text-sm font-bold flex items-center gap-1.5">
                        <CalendarBlank size={13} />{sessionLabel(s)}
                      </span>
                      <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${s.places_restantes <= 3 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                        {s.places_restantes <= 3 ? "Dernières places" : "Places disponibles"}
                      </span>
                    </div>
                    <a href="#contact" className="text-xs font-bold uppercase border border-black rounded-md px-3 py-1.5 whitespace-nowrap hover:bg-black hover:text-white transition-colors">
                      Réserver
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
