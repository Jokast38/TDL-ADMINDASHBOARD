import { Briefcase, Storefront, CurrencyEur, TrendUp, GraduationCap, Check } from "@phosphor-icons/react";

const NAVY = "#12224a";
const ORANGE = "#f5a623";

const Bullet = ({ children }) => (
  <li className="flex items-start gap-2.5 text-sm text-gray-800">
    <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: ORANGE }}>
      <Check size={12} weight="bold" className="text-black" />
    </span>
    <span className="min-w-0 break-words">{children}</span>
  </li>
);

const Panel = ({ icon: Icon, title, children, className = "" }) => (
  <div data-reveal className={`reveal min-w-0 bg-white rounded-2xl border-2 p-5 sm:p-6 ${className}`} style={{ borderColor: NAVY }}>
    <div className="flex items-start gap-3 mb-5">
      <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: ORANGE }}>
        <Icon size={20} weight="bold" className="text-black" />
      </span>
      <h3
        className="flex-1 min-w-0 break-words leading-snug font-display font-extrabold text-sm sm:text-base uppercase tracking-tight pt-1"
        style={{ color: NAVY }}
      >
        {title}
      </h3>
    </div>
    {children}
  </div>
);

export default function CareerOutlookSection({ outlook, title = "Débouchés & perspectives de carrière" }) {
  if (!outlook) return null;
  const { debouches, structures, salaireRange, salaireNote, salaireManager, evolutions, poursuites } = outlook;

  return (
    <section className="mt-10 pt-8 border-t border-gray-200 overflow-hidden">
      <h2 className="font-display text-xl font-bold mb-6 break-words">{title}</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel icon={Briefcase} title="Débouchés professionnels">
          <ul className="space-y-2.5">
            {debouches.map((d) => <Bullet key={d}>{d}</Bullet>)}
          </ul>
        </Panel>

        <Panel icon={Storefront} title="Structures d'emploi">
          <ul className="space-y-2.5">
            {structures.map((s) => <Bullet key={s}>{s}</Bullet>)}
          </ul>
        </Panel>

        <Panel icon={CurrencyEur} title="Salaires (tendances)" className="lg:row-span-2 flex flex-col">
          <div className="flex items-end gap-1.5 h-16 mb-4">
            <span className="w-6 rounded-t" style={{ height: "40%", backgroundColor: ORANGE }} />
            <span className="w-6 rounded-t" style={{ height: "65%", backgroundColor: ORANGE }} />
            <span className="w-6 rounded-t" style={{ height: "100%", backgroundColor: ORANGE }} />
          </div>
          <div className="border-t border-gray-200 pt-4 min-w-0">
            <p className="text-xl sm:text-2xl font-display font-extrabold break-words" style={{ color: NAVY }}>
              {salaireRange}
            </p>
            <p className="text-sm text-gray-500 mb-4">brut {salaireNote}</p>
            <div className="rounded-lg px-4 py-3 text-sm font-medium break-words" style={{ backgroundColor: `${ORANGE}22`, color: NAVY }}>
              {salaireManager}
            </div>
          </div>
        </Panel>

        <Panel icon={TrendUp} title="Évolutions" className="lg:col-span-2">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {evolutions.map((e) => <Bullet key={e}>{e}</Bullet>)}
          </ul>
        </Panel>
      </div>

      <div
        data-reveal
        className="reveal min-w-0 mt-4 bg-white rounded-2xl border-2 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4"
        style={{ borderColor: NAVY }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: ORANGE }}>
            <GraduationCap size={20} weight="bold" className="text-black" />
          </span>
          <div className="min-w-0">
            <h3 className="break-words leading-snug font-display font-extrabold text-sm sm:text-base uppercase tracking-tight pt-1" style={{ color: NAVY }}>
              Poursuites d'études
            </h3>
            <span className="text-sm text-gray-500">Titres niveau 5</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {poursuites.map((p) => (
            <span
              key={p}
              className="px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap"
              style={{ backgroundColor: `${ORANGE}33`, color: NAVY }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
