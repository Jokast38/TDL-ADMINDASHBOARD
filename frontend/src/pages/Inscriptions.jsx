import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MagnifyingGlass } from "@phosphor-icons/react";

const fmtMoney = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);

export default function Inscriptions() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => { api.get("/inscriptions").then((r) => setItems(r.data)); }, []);

  const filtered = items.filter((i) =>
    (i.student_name + i.student_email + i.formation_title).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-6" data-testid="inscriptions-page">
      <div>
        <p className="overline">Liste complète</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Inscriptions</h1>
        <p className="text-gray-500 mt-2">{items.length} inscription(s) au total.</p>
      </div>

      <div className="relative max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-3 text-gray-400" />
        <Input
          placeholder="Rechercher un étudiant, formation..."
          value={q} onChange={(e) => setQ(e.target.value)}
          className="pl-9" data-testid="search-input"
        />
      </div>

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 overline">Date</th>
                <th className="py-3 px-4 overline">Étudiant</th>
                <th className="py-3 px-4 overline">Formation</th>
                <th className="py-3 px-4 overline">Catégorie</th>
                <th className="py-3 px-4 overline">Paiement</th>
                <th className="py-3 px-4 overline text-right">Prix</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`inscription-row-${i.id}`}>
                  <td className="py-3 px-4 text-xs text-gray-500 font-mono">
                    {new Date(i.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-medium">{i.student_name}</p>
                    <p className="text-xs text-gray-500">{i.student_email}</p>
                  </td>
                  <td className="py-3 px-4">{i.formation_title}</td>
                  <td className="py-3 px-4"><Badge variant="outline">{i.category}</Badge></td>
                  <td className="py-3 px-4">
                    <Badge className={
                      i.payment_status === "paid"
                        ? "bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10"
                        : "bg-[#F5A623]/10 text-[#F5A623] hover:bg-[#F5A623]/10"
                    }>{i.payment_status}</Badge>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{fmtMoney(i.price)}</td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan="6" className="py-12 text-center text-gray-400">Aucune inscription.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
