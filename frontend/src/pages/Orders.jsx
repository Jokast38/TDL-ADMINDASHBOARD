// Orders.jsx - Version WooCommerce
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShoppingCart, Lightning, ArrowsClockwise } from "@phosphor-icons/react";

const fmtMoney = (n) => new Intl.NumberFormat("fr-FR", { 
  style: "currency", 
  currency: "EUR",
  maximumFractionDigits: 2
}).format(n || 0);

// Statuts WooCommerce
const WOO_STATUSES = [
  { value: "pending", label: "En attente" },
  { value: "processing", label: "En traitement" },
  { value: "completed", label: "Terminée" },
  { value: "on-hold", label: "En attente" },
  { value: "cancelled", label: "Annulée" },
  { value: "refunded", label: "Remboursée" },
  { value: "failed", label: "Échouée" },
];

// Couleurs des statuts pour l'affichage
const getStatusColor = (status) => {
  const colors = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    processing: "bg-blue-100 text-blue-800 border-blue-200",
    completed: "bg-green-100 text-green-800 border-green-200",
    "on-hold": "bg-orange-100 text-orange-800 border-orange-200",
    cancelled: "bg-red-100 text-red-800 border-red-200",
    refunded: "bg-gray-100 text-gray-800 border-gray-200",
    failed: "bg-red-100 text-red-800 border-red-200",
  };
  return colors[status] || "bg-gray-100 text-gray-800 border-gray-200";
};

// Libellés des statuts
const getStatusLabel = (status) => {
  const labels = {
    pending: "En attente",
    processing: "En traitement",
    completed: "Terminée",
    "on-hold": "En attente",
    cancelled: "Annulée",
    refunded: "Remboursée",
    failed: "Échouée",
  };
  return labels[status] || status;
};

// Couleurs des statuts de paiement
const getPaymentStatusColor = (status) => {
  const colors = {
    pending: "bg-yellow-50 text-yellow-800 border-yellow-200",
    processing: "bg-blue-50 text-blue-800 border-blue-200",
    completed: "bg-green-50 text-green-800 border-green-200",
    failed: "bg-red-50 text-red-800 border-red-200",
    refunded: "bg-gray-50 text-gray-800 border-gray-200",
  };
  return colors[status] || "bg-gray-50 text-gray-800 border-gray-200";
};

// Libellés des statuts de paiement
const getPaymentStatusLabel = (status) => {
  const labels = {
    pending: "En attente",
    processing: "En cours",
    completed: "Payé",
    failed: "Échoué",
    refunded: "Remboursé",
  };
  return labels[status] || status;
};

export default function Orders() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const params = { per_page: 50 };
      if (filter !== "all") {
        params.status = filter;
      }
      const response = await api.get("/wordpress/kami/orders", { params });
      setItems(response.data.orders || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Erreur lors du chargement des commandes");
      console.error("Erreur chargement commandes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/wordpress/kami/orders/${id}/status`, null, { params: { status } });
      toast.success(`Statut mis à jour: ${getStatusLabel(status)}`);
      load();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Erreur lors de la mise à jour");
    }
  };

  // Compter les commandes par statut
  const getStatusCount = (status) => {
    if (status === "all") return items.length;
    return items.filter(item => item.status === status).length;
  };

  // Calculer le total des commandes
  const getTotalAmount = () => {
    return items.reduce((sum, item) => sum + parseFloat(item.total || 0), 0);
  };

  return (
    <div className="space-y-6" data-testid="orders-page">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline flex items-center gap-2" style={{ color: "#d4af37" }}>
            <Lightning size={12} weight="fill" /> KAMI STREET · <a href="https://kamistreet.fr/" target="_blank" rel="noreferrer" className="underline hover:opacity-80">kamistreet.fr ↗</a>
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Commandes WooCommerce</h1>
          <p className="text-gray-500 mt-2">{total} commande(s) au total · {fmtMoney(getTotalAmount())}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40 h-10 text-sm">
              <SelectValue placeholder="Filtrer par statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes ({getStatusCount("all")})</SelectItem>
              {WOO_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label} ({getStatusCount(s.value)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button 
            onClick={load} 
            className="flex items-center gap-2 px-4 py-2 bg-[#0a0a0a] text-white rounded text-sm hover:bg-[#1a1a1a] transition-colors"
            disabled={loading}
          >
            <ArrowsClockwise size={15} className={loading ? "animate-spin" : ""} /> 
            {loading ? "Chargement..." : "Rafraîchir"}
          </button>
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border border-gray-200 rounded-md shadow-none">
          <p className="text-xs text-gray-500">Total commandes</p>
          <p className="font-display text-2xl font-bold">{total}</p>
        </Card>
        <Card className="p-4 border border-gray-200 rounded-md shadow-none">
          <p className="text-xs text-gray-500">En attente</p>
          <p className="font-display text-2xl font-bold text-yellow-600">
            {items.filter(i => i.status === "pending").length}
          </p>
        </Card>
        <Card className="p-4 border border-gray-200 rounded-md shadow-none">
          <p className="text-xs text-gray-500">En traitement</p>
          <p className="font-display text-2xl font-bold text-blue-600">
            {items.filter(i => i.status === "processing").length}
          </p>
        </Card>
        <Card className="p-4 border border-gray-200 rounded-md shadow-none">
          <p className="text-xs text-gray-500">Terminées</p>
          <p className="font-display text-2xl font-bold text-green-600">
            {items.filter(i => i.status === "completed").length}
          </p>
        </Card>
      </div>

      {/* Tableau des commandes */}
      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-pulse text-gray-400">Chargement des commandes...</div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Aucune commande trouvée</p>
            <p className="text-sm text-gray-400 mt-1">
              {filter !== "all" ? `Aucune commande avec le statut "${getStatusLabel(filter)}"` : "Les commandes sont synchronisées depuis WooCommerce"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4 overline">Commande</th>
                    <th className="py-3 px-4 overline">Date</th>
                    <th className="py-3 px-4 overline">Client</th>
                    <th className="py-3 px-4 overline">Produits</th>
                    <th className="py-3 px-4 overline text-right">Total</th>
                    <th className="py-3 px-4 overline">Paiement</th>
                    <th className="py-3 px-4 overline">Statut</th>
                    <th className="py-3 px-4 overline text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((o) => (
                    <tr 
                      key={o.id} 
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      data-testid={`order-row-${o.id}`}
                      onClick={() => setSelectedOrder(selectedOrder?.id === o.id ? null : o)}
                    >
                      <td className="py-3 px-4">
                        <p className="font-medium">#{o.number}</p>
                        <p className="text-xs text-gray-500">
                          {o.line_items?.length} article{o.line_items?.length > 1 ? 's' : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500 font-mono">
                        {o.date_created ? new Date(o.date_created).toLocaleDateString("fr-FR", {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium">
                          {o.customer?.first_name} {o.customer?.last_name}
                        </p>
                        <p className="text-xs text-gray-500">{o.customer?.email}</p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="max-w-xs">
                          {o.line_items?.slice(0, 2).map((item, idx) => (
                            <p key={idx} className="text-sm truncate">
                              {item.quantity} × {item.name}
                            </p>
                          ))}
                          {o.line_items?.length > 2 && (
                            <p className="text-xs text-gray-400">+{o.line_items.length - 2} autres</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">
                        {fmtMoney(o.total)}
                        <p className="text-xs text-gray-400">{o.currency || 'EUR'}</p>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`${getPaymentStatusColor(o.payment_method || 'pending')} border`}>
                          {getPaymentStatusLabel(o.payment_method || 'pending')}
                        </Badge>
                        {o.payment_method_title && (
                          <p className="text-xs text-gray-400 mt-1">{o.payment_method_title}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`${getStatusColor(o.status)} border`}>
                          {getStatusLabel(o.status)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Select 
                          value={o.status} 
                          onValueChange={(v) => {
                            e.stopPropagation();
                            updateStatus(o.id, v);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SelectTrigger className="w-36 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WOO_STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Détails de la commande sélectionnée */}
            {selectedOrder && (
              <div className="p-4 bg-gray-50 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold">Détails de la commande #{selectedOrder.number}</h4>
                  <button 
                    onClick={() => setSelectedOrder(null)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Fermer
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Client</p>
                    <p className="font-medium">
                      {selectedOrder.customer?.first_name} {selectedOrder.customer?.last_name}
                    </p>
                    <p className="text-sm text-gray-600">{selectedOrder.customer?.email}</p>
                    <p className="text-sm text-gray-600">{selectedOrder.customer?.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Adresse de livraison</p>
                    <p className="text-sm">
                      {selectedOrder.shipping?.first_name} {selectedOrder.shipping?.last_name}<br />
                      {selectedOrder.shipping?.address_1}<br />
                      {selectedOrder.shipping?.address_2 && <>{selectedOrder.shipping?.address_2}<br /></>}
                      {selectedOrder.shipping?.postcode} {selectedOrder.shipping?.city}<br />
                      {selectedOrder.shipping?.country}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Articles</p>
                    <div className="space-y-1">
                      {selectedOrder.line_items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm border-b border-gray-100 py-1">
                          <span>{item.quantity} × {item.name}</span>
                          <span className="font-mono">{fmtMoney(item.total)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold pt-2 border-t border-gray-200">
                        <span>Total</span>
                        <span>{fmtMoney(selectedOrder.total)}</span>
                      </div>
                      {selectedOrder.shipping_total && parseFloat(selectedOrder.shipping_total) > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Livraison</span>
                          <span className="font-mono">{fmtMoney(selectedOrder.shipping_total)}</span>
                        </div>
                      )}
                      {selectedOrder.discount_total && parseFloat(selectedOrder.discount_total) > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Réduction</span>
                          <span className="font-mono">-{fmtMoney(selectedOrder.discount_total)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {selectedOrder.customer_note && (
                  <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Note du client</p>
                    <p className="text-sm">{selectedOrder.customer_note}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      {/* Footer avec pagination et source */}
      <div className="flex justify-between items-center text-xs text-gray-400">
        <div className="flex items-center gap-4">
          <span>Source: WooCommerce · kamistreet.fr</span>
          <span>Dernière mise à jour: {new Date().toLocaleString('fr-FR')}</span>
        </div>
        <div>
          {items.length} commande{items.length > 1 ? 's' : ''} affichée{items.length > 1 ? 's' : ''}
          {filter !== "all" && ` · Filtré par: ${getStatusLabel(filter)}`}
        </div>
      </div>
    </div>
  );
}