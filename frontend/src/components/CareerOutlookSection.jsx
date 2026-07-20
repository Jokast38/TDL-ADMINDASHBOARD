import { Briefcase, Storefront, CurrencyEur, TrendUp, GraduationCap, Check } from "@phosphor-icons/react";

const NAVY = "#12224a";
const ORANGE = "#f5a623";

const Bullet = ({ children }) => (
  <li className="flex items-center gap-2.5 text-sm text-gray-800">
    <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: ORANGE }}>
      <Check size={12} weight="bold" className="text-black" />
    </span>
    {children}
  </li>
);

const Panel = ({ icon: Icon, title, children, className = "" }) => (
  <div data-reveal className={`reveal bg-white rounded-2xl border-2 p-6 ${className}`} style={{ borderColor: NAVY }}>
    <div className="flex items-center gap-4 mb-4">
      <span className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: ORANGE }}>
        <Icon size={26} weight="bold" className="text-black" />
      </span>
      <h3 className="font-display font-extrabold text-lg sm:text-xl uppercase tracking-tight" style={{ color: NAVY }}>
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
    <section className="mt-10 pt-8 border-t border-gray-200">
      <h2 className="font-display text-xl font-bold mb-6">{title}</h2>
      <div className="grid lg:grid-cols-3 gap-4">
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
          <div className="border-t border-gray-200 pt-4">
            <p className="text-2xl font-display font-extrabold" style={{ color: NAVY }}>
              {salaireRange} <span className="text-sm font-medium text-gray-500">brut</span>
            </p>
            <p className="text-sm text-gray-500 mb-4">{salaireNote}</p>
            <div className="rounded-lg px-4 py-3 text-sm font-medium" style={{ backgroundColor: `${ORANGE}22`, color: NAVY }}>
              {salaireManager}
            </div>
          </div>
        </Panel>

        <Panel icon={TrendUp} title="Évolutions" className="lg:col-span-2">
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {evolutions.map((e) => <Bullet key={e}>{e}</Bullet>)}
          </ul>
        </Panel>
      </div>

      <div
        data-reveal
        className="reveal mt-4 bg-white rounded-2xl border-2 p-6 flex flex-wrap items-center gap-4"
        style={{ borderColor: NAVY }}
      >
        <span className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: ORANGE }}>
          <GraduationCap size={26} weight="bold" className="text-black" />
        </span>
        <h3 className="font-display font-extrabold text-lg uppercase tracking-tight" style={{ color: NAVY }}>
          Poursuites d'études
        </h3>
        <span className="text-sm text-gray-500">Titres niveau 5</span>
        <div className="flex flex-wrap gap-2 ml-auto">
          {poursuites.map((p) => (
            <span
              key={p}
              className="px-4 py-1.5 rounded-full text-sm font-semibold"
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
