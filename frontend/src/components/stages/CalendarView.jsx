import { useMemo } from "react";
import { formatDateShortFr } from "./stageHelpers";

const JOURS_COURT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MAX_ROWS = 4;

function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Grille mensuelle : chaque session devient une barre colorée qui couvre ses
// jours, repliée par semaine (une session à cheval sur deux semaines donne
// deux segments de barre, un par semaine). `monthKey` = "YYYY-MM".
export default function CalendarView({ sessions, monthKey, colorFor, onOpen }) {
  const [year, month] = monthKey.split("-").map(Number);

  const weeks = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    const gridStart = startOfWeek(first);
    const days = [];
    let cur = new Date(gridStart);
    while (cur <= last || days.length % 7 !== 0) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
      if (days.length > 42) break;
    }
    const out = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [year, month]);

  const sessionsSorted = useMemo(
    () => [...sessions].sort((a, b) => (a.date_debut || "").localeCompare(b.date_debut || "")),
    [sessions]
  );

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden" data-testid="stage-calendar-view">
      <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
        {JOURS_COURT.map((j) => (
          <div key={j} className="px-2 py-2 text-[11px] font-semibold text-gray-500 text-center">{j}</div>
        ))}
      </div>
      {weeks.map((week, wi) => {
        const weekStartIso = toISO(week[0]);
        const weekEndIso = toISO(week[6]);
        const weekSessions = sessionsSorted.filter(
          (s) => (s.date_debut || "") <= weekEndIso && (s.date_fin || s.date_debut || "") >= weekStartIso
        );
        // Empile les sessions qui se chevauchent sur des rangées distinctes
        // (algorithme glouton : première rangée libre pour la plage de jours).
        const rowEnds = [];
        const placed = weekSessions.map((s) => {
          const startCol = Math.max(0, Math.floor((new Date(Math.max(new Date(s.date_debut), week[0])) - week[0]) / 86400000));
          const endDate = new Date(Math.min(new Date(s.date_fin || s.date_debut), week[6]));
          const endCol = Math.min(6, Math.floor((endDate - week[0]) / 86400000));
          let row = 0;
          while (rowEnds[row] !== undefined && rowEnds[row] >= startCol) row++;
          rowEnds[row] = endCol;
          return { s, startCol, endCol, row };
        });
        const visibleRows = MAX_ROWS;
        const overflowByDay = Array(7).fill(0);
        placed.forEach((p) => {
          if (p.row >= visibleRows) {
            for (let c = p.startCol; c <= p.endCol; c++) overflowByDay[c]++;
          }
        });
        const maxRow = Math.min(visibleRows, placed.reduce((m, p) => Math.max(m, p.row + 1), 0));

        return (
          <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0 relative" style={{ minHeight: 110 }}>
            {week.map((d) => (
              <div key={toISO(d)} className={`border-r border-gray-50 last:border-r-0 px-1 pt-1 ${d.getMonth() !== month - 1 ? "bg-gray-50/60" : ""}`}>
                <span className="text-[11px] text-gray-400">{d.getDate()}</span>
              </div>
            ))}
            <div className="absolute inset-x-0 top-6 px-0.5 relative">
              {placed.filter((p) => p.row < visibleRows).sort((a, b) => a.row - b.row).map(({ s, startCol, endCol, row }) => {
                const color = colorFor(s);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onOpen(s)}
                    className="h-5 rounded px-1.5 text-[10px] font-semibold text-white truncate text-left absolute"
                    style={{
                      left: `${(startCol / 7) * 100}%`,
                      width: `${((endCol - startCol + 1) / 7) * 100}%`,
                      backgroundColor: color,
                      top: row * 22,
                    }}
                    title={`${s.formation_titre} · ${formatDateShortFr(s.date_debut)} → ${formatDateShortFr(s.date_fin)} · ${s.lieu_ville || ""}`}
                  >
                    {s.formation_titre}
                  </button>
                );
              })}
            </div>
            {overflowByDay.some((n) => n > 0) && (
              <div className="absolute inset-x-0" style={{ top: 6 + maxRow * 22 + 20 }}>
                {week.map((d, ci) => overflowByDay[ci] > 0 && (
                  <span key={ci} className="absolute text-[9px] text-gray-400" style={{ left: `${(ci / 7) * 100}%`, marginLeft: 4 }}>
                    +{overflowByDay[ci]}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
