const GOLD = "#F5C518";

function formatPrice(price) {
  if (!price || price <= 0) return "Sur devis";
  return `${price.toLocaleString("fr-FR")} € TTC`;
}

/**
 * Tableau de tarifs dynamique, repris du gabarit de maquette (ligne dorée/noire
 * mise en avant pour la formation courante). Les lignes viennent du backend :
 * la formation affichée + les formations "sœurs" de la même catégorie
 * (`others`), donc pas de prix ni de formules en dur dans le code.
 */
export default function PricingTable({ formation, others = [], ctaHref = "#contact" }) {
  if (!formation) return null;
  const rows = [
    { ...formation, current: true },
    ...others.filter((o) => o.id !== formation.id),
  ];
  if (rows.length === 0) return null;

  return (
    <div data-reveal>
      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#8A6400" }}>Tarifs</p>
      <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">Les prix</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-2xl">
        Prix TTC. Financement possible : CPF, France Travail, OPCO, paiement en plusieurs fois.
      </p>

      {/* Desktop : tableau */}
      <div className="hidden sm:block overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full border-collapse text-sm min-w-[560px]">
          <thead>
            <tr className="bg-black text-white">
              <th className="text-left font-bold text-xs uppercase tracking-wide py-3 px-4">Formule</th>
              <th className="text-left font-bold text-xs uppercase tracking-wide py-3 px-4">Durée</th>
              <th className="text-left font-bold text-xs uppercase tracking-wide py-3 px-4">Sessions</th>
              <th className="text-left font-bold text-xs uppercase tracking-wide py-3 px-4">CPF</th>
              <th className="text-right font-bold text-xs uppercase tracking-wide py-3 px-4">Prix</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-gray-100 ${r.current ? "bg-[#fffbea]" : "hover:bg-gray-50"}`}>
                <td className="py-3 px-4">
                  <a href={r.current ? ctaHref : `/formations/${r.id}`} className="font-bold hover:underline">
                    {r.title}
                  </a>
                  {r.current && (
                    <span className="ml-2 inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: GOLD, color: "#0a0a0a" }}>
                      Cette formation
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-gray-600">{r.duration_hours ? `${r.duration_hours} h` : "—"}</td>
                <td className="py-3 px-4 text-gray-600">{r.sessions_per_month ? `${r.sessions_per_month} / mois` : "—"}</td>
                <td className="py-3 px-4 text-gray-600">{r.cpf_eligible ? "Éligible" : "—"}</td>
                <td className={`py-3 px-4 text-right font-display font-extrabold ${r.current ? "" : "text-gray-800"}`}>
                  {formatPrice(r.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile : cartes */}
      <div className="sm:hidden flex flex-col gap-3">
        {rows.map((r) => (
          <a
            key={r.id}
            href={r.current ? ctaHref : `/formations/${r.id}`}
            className={`block rounded-xl border p-4 ${r.current ? "border-[#F5C518]" : "border-gray-200"}`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-bold text-sm">{r.title}</span>
              {r.current && (
                <span className="inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: GOLD, color: "#0a0a0a" }}>
                  Cette formation
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{r.duration_hours ? `${r.duration_hours} h` : "—"} · {r.cpf_eligible ? "CPF éligible" : "Hors CPF"}</span>
              <span className="font-display font-extrabold text-black text-sm">{formatPrice(r.price)}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
