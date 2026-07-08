// Dashboard.jsx - Version avec limites et sections compactes
import { useEffect, useRef, useState } from "react";
import {
  api, getDashboardData, getUsers,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartLineUp, GraduationCap, Folders, ShoppingCart, ArrowUpRight,
  Plugs, Robot, CheckCircle, Warning, Globe, ArrowsClockwise,
  Package, PencilSimple, Trash, Plus, X, Check, Lightning,
  CaretDown, CaretUp,
} from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

/* ─────────────────────────────────────────────
   Imports pour les Graphiques
───────────────────────────────────────────── */
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';

/* ─────────────────────────────────────────────
   Enregistrement des éléments Chart.js
───────────────────────────────────────────── */
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const LEAD_STATUS_LABELS = {
  nouveau: "Nouveau", contacte: "Contacté", interesse: "Intéressé",
  pas_interesse: "Pas intéressé", a_relancer: "À relancer",
};

const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString('fr-FR', { month: 'short' });
};

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
const fmtMoney = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);

const statusLabels = {
  nouveau: "Nouveau", en_verification: "En vérif.", complet: "Complet",
  soumis_ants: "Soumis ANTS", termine: "Terminé", rejete: "Rejeté",
};

/* ─────────────────────────────────────────────
   API calls - WooCommerce
───────────────────────────────────────────── */
const getWpStatsTDL  = () => api.get("/wordpress/stats").then(r => r.data);
const getWpStatsKami = () => api.get("/wordpress/stats/kami").then(r => r.data);

// WooCommerce Products API
const getWooProducts = (limit = 3) => api.get("/wordpress/kami/products", { params: { per_page: limit } }).then(r => r.data.products || []);
const updateWooProduct = (id, payload) => api.put(`/wordpress/kami/products/${id}`, payload).then(r => r.data);
const deleteWooProduct = (id) => api.put(`/wordpress/kami/products/${id}`, { status: "draft" }).then(r => r.data);

// WooCommerce Orders API
const getWooOrders = (limit = 3) => api.get("/wordpress/kami/orders", { params: { per_page: limit } }).then(r => r.data.orders || []);
const updateWooOrderStatus = (orderId, status) => api.put(`/wordpress/kami/orders/${orderId}/status`, null, { params: { status } }).then(r => r.data);

/* ─────────────────────────────────────────────
   Default product form - Format WooCommerce
───────────────────────────────────────────── */
const EMPTY_PRODUCT = { 
  name: "", 
  category: "", 
  description: "", 
  regular_price: "0", 
  sale_price: "",
  stock_quantity: 0, 
  manage_stock: true,
  stock_status: "instock",
  status: "publish",
  image: "" 
};

/* ─────────────────────────────────────────────
   Couleurs des statuts de commande
───────────────────────────────────────────── */
const getOrderStatusColor = (status) => {
  const colors = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    "on-hold": "bg-orange-100 text-orange-800",
    cancelled: "bg-red-100 text-red-800",
    refunded: "bg-gray-100 text-gray-800",
    failed: "bg-red-100 text-red-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
};

const getOrderStatusLabel = (status) => {
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

/* ─────────────────────────────────────────────
   Dashboard
───────────────────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth();
  const isCommercial = user?.role === "commercial" || user?.role === "responsable_commercial" || user?.role === "admin";
  const isFirstRender = useRef(true);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [stats, setStats]             = useState(null);
  const [users, setUsers]             = useState([]);
  const [integrations, setIntegrations] = useState(null);
  const [commercialStats, setCommercialStats] = useState(null);

  // WordPress / Analytics
  const [wpTDL, setWpTDL]   = useState(null);
  const [wpKami, setWpKami] = useState(null);
  const [wpTab, setWpTab]   = useState("tdl");

  // Products - WooCommerce (limité à 3)
  const [products, setProducts]       = useState([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productForm, setProductForm] = useState(null);
  const [productSaving, setProductSaving] = useState(false);
  const [productError, setProductError]   = useState(null);
  const [categories, setCategories]       = useState([]);
  const [showAllProducts, setShowAllProducts] = useState(false);

  // Orders - WooCommerce (limité à 3)
  const [orders, setOrders] = useState([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  /* ── Loaders granulaires ── */
  const loadProducts = (limit) => {
    getWooProducts(limit ?? (showAllProducts ? 50 : 3))
      .then(prods => { setProducts(prods); setProductsTotal(prods.length); })
      .catch(() => {});
  };

  const loadOrders = () => {
    getWooOrders(3)
      .then(ordersData => { setOrders(ordersData); setOrdersTotal(ordersData.length); })
      .catch(() => {});
  };

  /* ── Chargement initial du dashboard ── */
  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const dash = await getDashboardData();
      setStats(dash);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || "Erreur chargement dashboard");
    } finally {
      setLoading(false);
    }

    // Sections secondaires — chargées en arrière-plan, indépendamment (une erreur
    // ici, ex: /users réservé à l'admin, ne doit jamais bloquer le reste du dashboard).
    getUsers().then(setUsers).catch(() => {});
    if (isCommercial) {
      api.get("/dashboard/commercial-stats").then(r => setCommercialStats(r.data)).catch(() => {});
    }
    loadProducts(3);
    loadOrders();
    api.get("/wordpress/kami/categories").then(r => setCategories(r.data)).catch(() => {});
    api.get("/integrations/status").then(r => setIntegrations(r.data)).catch(() => {});
    getWpStatsTDL().then(setWpTDL).catch(e => setWpTDL({ error: e?.response?.data?.detail || String(e) }));
    getWpStatsKami().then(setWpKami).catch(e => setWpKami({ error: e?.response?.data?.detail || String(e) }));
  };

  // Chargement initial du dashboard
  useEffect(() => { loadDashboard(); }, []);

  // Changement de limite produits → recharge uniquement les produits (skip au mount)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    loadProducts(showAllProducts ? 50 : 3);
  }, [showAllProducts]);

  /* ── Product CRUD - WooCommerce ── */
  const openNew  = () => { 
    setProductForm({ ...EMPTY_PRODUCT }); 
    setProductError(null); 
  };
  
  const openEdit = (p) => { 
    setProductForm({
      id: p.id,
      name: p.name || "",
      category: p.categories?.[0] || "",
      description: p.description || "",
      regular_price: p.regular_price || p.price || "0",
      sale_price: p.sale_price || "",
      stock_quantity: p.stock_quantity || 0,
      manage_stock: p.manage_stock !== undefined ? p.manage_stock : true,
      stock_status: p.stock_status || "instock",
      status: p.status || "publish",
      image: p.image || "",
      permalink: p.permalink || "",
    }); 
    setProductError(null); 
  };
  
  const closeForm = () => { 
    setProductForm(null); 
    setProductError(null); 
  };

  const saveProduct = async () => {
    if (!productForm.id) {
      toast.error("La création de produits n'est pas encore disponible");
      return;
    }

    setProductSaving(true);
    setProductError(null);
    try {
      const payload = {
        name: productForm.name,
        regular_price: String(productForm.regular_price),
        sale_price: productForm.sale_price ? String(productForm.sale_price) : "",
        stock_quantity: parseInt(productForm.stock_quantity) || 0,
        manage_stock: productForm.manage_stock,
        stock_status: productForm.stock_status,
        status: productForm.status,
        short_description: productForm.description,
      };

      const updated = await updateWooProduct(productForm.id, payload);
      setProducts(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
      toast.success("Produit mis à jour sur WooCommerce");
      closeForm();
    } catch (e) {
      setProductError(e?.response?.data?.detail || e.message || "Erreur sauvegarde");
      toast.error(e?.response?.data?.detail || "Erreur lors de la sauvegarde");
    } finally {
      setProductSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Dépublier ce produit ? Il sera mis en brouillon.")) return;
    try {
      await deleteWooProduct(id);
      setProducts(prev => prev.map(p => p.id === id ? { ...p, status: "draft" } : p));
      toast.success("Produit dépublié");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur suppression");
    }
  };

  /* ── Order status update ── */
  const handleOrderStatusChange = async (orderId, newStatus) => {
    try {
      await updateWooOrderStatus(orderId, newStatus);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      toast.success(`Statut mis à jour: ${getOrderStatusLabel(newStatus)}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur lors de la mise à jour");
    }
  };

  /* ── Données pour les Graphiques ── */
  const inscriptionsData = stats?.recent_inscriptions || [];
  const inscriptionsByMonth = inscriptionsData.reduce((acc, curr) => {
    if (!curr.created_at) return acc;
    const month = new Date(curr.created_at).toLocaleString('fr-FR', { month: 'short' });
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});

  const lineChartData = {
    labels: Object.keys(inscriptionsByMonth),
    datasets: [
      {
        label: 'Inscriptions',
        data: Object.values(inscriptionsByMonth),
        borderColor: '#0a0a0a',
        backgroundColor: 'rgba(10, 10, 10, 0.5)',
        tension: 0.3,
      },
    ],
  };

  const statusData = stats?.by_status || [];
  const donutChartData = {
    labels: statusData.map(s => statusLabels[s.status] || s.status),
    datasets: [
      {
        data: statusData.map(s => s.count),
        backgroundColor: [
          '#F5A623',
          '#0B7238',
          '#0a0a0a',
          '#d4af37',
          '#FF4136',
          '#aaaaaa',
        ],
        borderWidth: 1,
      },
    ],
  };

  /* ── Render ── */
  if (loading) return <div className="p-6 text-gray-600">Chargement du dashboard…</div>;
  if (error)   return <div className="p-6 text-red-500">Erreur : {error}</div>;

  return (
    <div className="space-y-8" data-testid="dashboard-page">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="overline">Vue d'ensemble</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Dashboard</h1>
          <p className="text-gray-500 mt-2">TDL Formation · KAMI STREET</p>
        </div>
        <button onClick={loadDashboard} className="flex items-center gap-2 px-4 py-2 bg-[#0a0a0a] text-white rounded text-sm">
          <ArrowsClockwise size={15} /> Rafraîchir
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6" data-testid="kpi-grid">
        <KpiCard label="Inscriptions"       value={stats?.total_inscriptions ?? "—"} icon={GraduationCap} accent="#0a0a0a"   testid="kpi-inscriptions" />
        <KpiCard label="Dossiers en cours" value={stats?.in_progress ?? "—"}         icon={Folders}       accent="#F5A623"  testid="kpi-dossiers" />
        <KpiCard label="Commandes"         value={stats?.total_orders ?? "—"}       icon={ShoppingCart}  accent="#d4af37"  testid="kpi-orders" />
        <KpiCard label="Chiffre d'affaires" value={fmtMoney(stats?.revenue)}         icon={ChartLineUp}   accent="#0B7238" testid="kpi-revenue" />
      </div>

      {/* KPIs secondaires */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatMini label="Utilisateurs"     value={users.length} />
        <StatMini label="Produits KAMI"    value={productsTotal} />
        <StatMini label="CA total"         value={fmtMoney(stats?.revenue)} />
      </div>

      {/* ── WORDPRESS / ANALYTICS ── */}
      <div className="bg-white border border-gray-200 rounded-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="overline">Analytiques</p>
            <h2 className="font-display text-2xl font-bold">Sites WordPress</h2>
          </div>
          <div className="flex rounded overflow-hidden border border-gray-200 text-sm">
            {["tdl", "kami"].map(tab => (
              <button
                key={tab}
                onClick={() => setWpTab(tab)}
                className={`px-4 py-2 ${wpTab === tab ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {tab === "tdl" ? "TDL Formation" : "KAMI STREET"}
              </button>
            ))}
          </div>
        </div>

        {wpTab === "tdl"  && <WpSiteBlock data={wpTDL}  label="TDL Formation"  showGA />}
        {wpTab === "kami" && <WpSiteBlock data={wpKami} label="KAMI STREET"    showGA showJetpack />}
      </div>

      {/* ── PRODUITS KAMI STREET - WooCommerce (limité à 3) ── */}
      <div className="bg-white border border-gray-200 rounded-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="overline flex items-center gap-2" style={{ color: "#d4af37" }}>
              <Lightning size={12} weight="fill" /> KAMI STREET
            </p>
            <h2 className="font-display text-2xl font-bold">Produits WooCommerce</h2>
            <p className="text-xs text-gray-500 mt-1">
              {showAllProducts ? `Tous les produits (${products.length})` : `3 derniers produits · ${productsTotal} au total`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAllProducts(!showAllProducts)}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded text-sm hover:bg-gray-50"
            >
              {showAllProducts ? (
                <><CaretUp size={14} /> Voir moins</>
              ) : (
                <><CaretDown size={14} /> Voir tous</>
              )}
            </button>
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-4 py-2 bg-[#0a0a0a] text-white rounded text-sm"
            >
              <Plus size={15} /> Nouveau produit
            </button>
          </div>
        </div>

        {/* Formulaire produit */}
        {productForm && (
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
            <h3 className="font-semibold mb-3">{productForm.id ? "Modifier le produit" : "Nouveau produit"}</h3>
            <p className="text-xs text-gray-500 mb-3">Les modifications sont synchronisées avec WooCommerce</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Nom du produit</label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={e => setProductForm(f => ({...f, name: e.target.value}))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-xs text-gray-500 mb-1">Catégorie</label>
                <select
                  value={productForm.category}
                  onChange={e => setProductForm(f => ({...f, category: e.target.value}))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                >
                  <option value="">Sélectionner...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Statut</label>
                <select
                  value={productForm.status}
                  onChange={e => setProductForm(f => ({...f, status: e.target.value}))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                >
                  <option value="publish">Publié</option>
                  <option value="draft">Brouillon</option>
                  <option value="private">Privé</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Prix normal (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={productForm.regular_price}
                  onChange={e => setProductForm(f => ({...f, regular_price: e.target.value}))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-xs text-gray-500 mb-1">Prix promo (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={productForm.sale_price}
                  onChange={e => setProductForm(f => ({...f, sale_price: e.target.value}))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-xs text-gray-500 mb-1">Quantité en stock</label>
                <input
                  type="number"
                  value={productForm.stock_quantity}
                  onChange={e => setProductForm(f => ({...f, stock_quantity: e.target.value}))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Statut du stock</label>
                <select
                  value={productForm.stock_status}
                  onChange={e => setProductForm(f => ({...f, stock_status: e.target.value}))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                >
                  <option value="instock">En stock</option>
                  <option value="outofstock">Rupture</option>
                  <option value="onbackorder">Sur commande</option>
                </select>
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">URL de l'image</label>
                <input
                  type="text"
                  value={productForm.image}
                  onChange={e => setProductForm(f => ({...f, image: e.target.value}))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                  placeholder="https://kamistreet.fr/wp-content/uploads/..."
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Description courte</label>
                <textarea
                  value={productForm.description}
                  onChange={e => setProductForm(f => ({...f, description: e.target.value}))}
                  rows={2}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="prod-manage-stock"
                  checked={productForm.manage_stock}
                  onChange={e => setProductForm(f => ({...f, manage_stock: e.target.checked}))}
                />
                <label htmlFor="prod-manage-stock" className="text-sm">Gérer le stock</label>
              </div>
            </div>
            {productError && <p className="text-red-500 text-sm mt-2">{productError}</p>}
            <div className="flex gap-2 mt-4">
              <button
                onClick={saveProduct}
                disabled={productSaving || !productForm.id}
                className="flex items-center gap-2 px-4 py-2 bg-[#0B7238] text-white rounded text-sm disabled:opacity-50"
              >
                <Check size={14} /> {productSaving ? "Sauvegarde…" : "Sauvegarder"}
              </button>
              <button onClick={closeForm} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded text-sm">
                <X size={14} /> Annuler
              </button>
            </div>
          </div>
        )}

        {/* Table produits */}
        {products.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Package size={48} className="mx-auto text-gray-300 mb-4" />
            <p>Aucun produit trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-b border-gray-200">
                <tr>
                  <th className="py-2 overline">Produit</th>
                  <th className="py-2 overline">Catégorie</th>
                  <th className="py-2 overline text-right">Prix</th>
                  <th className="py-2 overline text-right">Stock</th>
                  <th className="py-2 overline text-center">Statut</th>
                  <th className="py-2 overline text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.slice(0, showAllProducts ? 50 : 3).map(p => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        {p.image && <img src={p.image} alt="" className="w-10 h-10 rounded object-cover" />}
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="py-3 capitalize">{p.categories?.[0] || "Non catégorisé"}</td>
                    <td className="py-3 text-right font-mono">
                      {p.sale_price && parseFloat(p.sale_price) > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="text-red-600">{p.sale_price}€</span>
                          <span className="text-xs text-gray-400 line-through">{p.regular_price}€</span>
                        </div>
                      ) : (
                        <span>{p.regular_price || p.price || "0"}€</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {p.manage_stock && p.stock_quantity !== null ? (
                        <span className={p.stock_quantity === 0 ? "text-red-500 font-semibold" : ""}>
                          {p.stock_quantity}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      <Badge className={p.status === "publish" ? "bg-[#0B7238]/10 text-[#0B7238]" : "bg-gray-100 text-gray-500"}>
                        {p.status === "publish" ? "Publié" : p.status === "draft" ? "Brouillon" : "Privé"}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Modifier">
                          <PencilSimple size={15} />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Dépublier">
                          <Trash size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        <div className="mt-4 text-xs text-gray-400 flex justify-between">
          <span>Source: WooCommerce · kamistreet.fr</span>
          <span>
            {showAllProducts ? `${products.length} produits` : `3/${productsTotal} produits affichés`}
          </span>
        </div>
      </div>

      {/* ── COMMANDES RÉCENTES WOOCOMMERCE (3 dernières) ── */}
      <div className="bg-white border border-gray-200 rounded-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="overline flex items-center gap-2" style={{ color: "#d4af37" }}>
              <ShoppingCart size={12} weight="fill" /> KAMI STREET
            </p>
            <h2 className="font-display text-2xl font-bold">Dernières commandes</h2>
            <p className="text-xs text-gray-500 mt-1">3 dernières commandes synchronisées avec WooCommerce</p>
          </div>
          <Link to="/admin/orders" className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded text-sm hover:bg-gray-50">
            Voir toutes <ArrowUpRight size={14} />
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
            <p>Aucune commande récente</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-b border-gray-200">
                <tr>
                  <th className="py-2 overline">Commande</th>
                  <th className="py-2 overline">Client</th>
                  <th className="py-2 overline text-right">Total</th>
                  <th className="py-2 overline text-center">Statut</th>
                  <th className="py-2 overline text-center">Date</th>
                  <th className="py-2 overline text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedOrder(selectedOrder?.id === o.id ? null : o)}>
                    <td className="py-3">
                      <p className="font-medium">#{o.number}</p>
                      <p className="text-xs text-gray-500">
                        {o.line_items?.length} article{o.line_items?.length > 1 ? 's' : ''}
                      </p>
                    </td>
                    <td className="py-3">
                      <p className="font-medium">
                        {o.customer?.first_name} {o.customer?.last_name}
                      </p>
                      <p className="text-xs text-gray-500">{o.customer?.email}</p>
                    </td>
                    <td className="py-3 text-right font-mono font-bold">
                      {fmtMoney(o.total)}
                    </td>
                    <td className="py-3 text-center">
                      <Badge className={getOrderStatusColor(o.status)}>
                        {getOrderStatusLabel(o.status)}
                      </Badge>
                    </td>
                    <td className="py-3 text-center text-xs text-gray-500">
                      {o.date_created ? new Date(o.date_created).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      }) : '—'}
                    </td>
                    <td className="py-3 text-right">
                      <select
                        value={o.status}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleOrderStatusChange(o.id, e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white hover:bg-gray-50"
                      >
                        <option value="pending">En attente</option>
                        <option value="processing">En traitement</option>
                        <option value="completed">Terminée</option>
                        <option value="on-hold">En attente</option>
                        <option value="cancelled">Annulée</option>
                        <option value="refunded">Remboursée</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Détails de la commande sélectionnée */}
        {selectedOrder && (
          <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold">Détails de la commande #{selectedOrder.number}</h4>
              <button onClick={() => setSelectedOrder(null)} className="text-sm text-gray-500 hover:text-gray-700">
                Fermer
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Client</p>
                <p className="font-medium">
                  {selectedOrder.customer?.first_name} {selectedOrder.customer?.last_name}
                </p>
                <p className="text-sm text-gray-600">{selectedOrder.customer?.email}</p>
                <p className="text-sm text-gray-600">{selectedOrder.customer?.phone}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Articles</p>
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
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 text-xs text-gray-400 flex justify-between">
          <span>Source: WooCommerce · kamistreet.fr</span>
          <span>Dernières {orders.length} commandes</span>
        </div>
      </div>

      {/* Inscriptions par catégorie + Evolution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 border border-gray-200 rounded-md shadow-none" data-testid="category-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="overline">Répartition</p>
              <h2 className="font-display text-2xl font-bold">Inscriptions par catégorie</h2>
            </div>
            <Link to="/admin/inscriptions" className="text-sm hover:underline flex items-center gap-1">
              Voir tout <ArrowUpRight size={14} />
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-3">
              {(stats?.by_category || []).map(c => {
                const max = Math.max(...(stats?.by_category || []).map(x => x.count), 1);
                return (
                  <div key={c.category} className="flex items-center gap-3">
                    <span className="w-32 text-sm font-medium">{c.category}</span>
                    <div className="flex-1 h-7 bg-gray-100 rounded-sm overflow-hidden">
                      <div className="h-full bg-[#0a0a0a] flex items-center justify-end px-2"
                        style={{ width: `${(c.count / max) * 100}%` }}>
                        <span className="text-xs text-white font-semibold">{c.count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!stats?.by_category?.length && <p className="text-sm text-gray-400">Aucune inscription.</p>}
            </div>
            
            <div className="h-48">
              <p className="text-xs text-gray-400 mb-2 text-center">Évolution mensuelle des inscriptions</p>
              <Line 
                data={lineChartData} 
                options={{ 
                  responsive: true, 
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } 
                }} 
              />
            </div>
          </div>
        </Card>

        {/* Dossiers par statut + Donut */}
        <Card className="p-6 border border-gray-200 rounded-md shadow-none" data-testid="dossiers-status-card">
          <p className="overline">Pipeline</p>
          <h2 className="font-display text-2xl font-bold mb-4">Dossiers par statut</h2>
          
          <div className="flex flex-col gap-6">
            <div className="h-40 flex justify-center">
              <Doughnut 
                data={donutChartData} 
                options={{ 
                  responsive: true, 
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } }
                }} 
              />
            </div>
            
            <div className="space-y-2.5">
              {(stats?.by_status || []).map(s => (
                <div key={s.status} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{statusLabels[s.status] || s.status}</span>
                  <Badge variant="outline" className="font-mono">{s.count}</Badge>
                </div>
              ))}
              {!stats?.by_status?.length && <p className="text-sm text-gray-400">Aucun dossier.</p>}
            </div>
          </div>
        </Card>
      </div>

      {/* Performance commerciale — CA et funnel leads (rôles commerciaux + admin) */}
      {isCommercial && commercialStats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 border border-gray-200 rounded-md shadow-none" data-testid="commercial-revenue-card">
            <p className="overline">Performance commerciale</p>
            <h2 className="font-display text-2xl font-bold mb-1">Évolution du CA (commandes)</h2>
            <p className="text-sm text-gray-500 mb-4">
              {fmtMoney(commercialStats.total_orders_revenue)} sur les 6 derniers mois
            </p>
            <div className="h-56">
              <Line
                data={{
                  labels: commercialStats.revenue_by_month.map(r => monthLabel(r.month)),
                  datasets: [{
                    label: 'CA (€)',
                    data: commercialStats.revenue_by_month.map(r => r.revenue),
                    borderColor: '#d4af37',
                    backgroundColor: 'rgba(212, 175, 55, 0.25)',
                    fill: true,
                    tension: 0.3,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmtMoney(v) } } },
                }}
              />
            </div>
          </Card>

          <Card className="p-6 border border-gray-200 rounded-md shadow-none" data-testid="commercial-leads-card">
            <p className="overline">Funnel leads</p>
            <h2 className="font-display text-2xl font-bold mb-1">{commercialStats.total_leads} leads</h2>
            <p className="text-sm text-gray-500 mb-4">
              Taux de conversion : <span className="font-semibold text-[#0a0a0a]">{commercialStats.conversion_rate}%</span>
              {" "}({commercialStats.converted_leads} intéressé{commercialStats.converted_leads > 1 ? "s" : ""})
            </p>
            <div className="h-40 flex justify-center mb-4">
              <Doughnut
                data={{
                  labels: commercialStats.leads_by_status.map(s => LEAD_STATUS_LABELS[s.status] || s.status),
                  datasets: [{
                    data: commercialStats.leads_by_status.map(s => s.count),
                    backgroundColor: ['#F5A623', '#0B7238', '#0a0a0a', '#d0021b', '#9013FE'],
                  }],
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
              />
            </div>
            <div className="space-y-2">
              {commercialStats.leads_by_status.map(s => (
                <div key={s.status} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{LEAD_STATUS_LABELS[s.status] || s.status}</span>
                  <Badge variant="outline" className="font-mono">{s.count}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-3 p-6 border border-gray-200 rounded-md shadow-none" data-testid="commercial-leads-evolution-card">
            <p className="overline">Prospection</p>
            <h2 className="font-display text-2xl font-bold mb-4">Nouveaux leads par mois</h2>
            <div className="h-48">
              <Bar
                data={{
                  labels: commercialStats.leads_by_month.map(l => monthLabel(l.month)),
                  datasets: [{
                    label: 'Nouveaux leads',
                    data: commercialStats.leads_by_month.map(l => l.count),
                    backgroundColor: '#0a0a0a',
                    borderRadius: 4,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                }}
              />
            </div>
          </Card>
        </div>
      )}

      {/* Dernières inscriptions + Intégrations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 border border-gray-200 rounded-md shadow-none" data-testid="recent-inscriptions-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="overline">Activité récente</p>
              <h2 className="font-display text-2xl font-bold">Dernières inscriptions</h2>
            </div>
            <Link to="/admin/inscriptions" className="text-sm hover:underline flex items-center gap-1">
              Voir tout <ArrowUpRight size={14} />
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left border-b border-gray-200">
              <tr>
                <th className="py-2 overline">Étudiant</th>
                <th className="py-2 overline">Formation</th>
                <th className="py-2 overline text-right">Prix</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.recent_inscriptions || []).map(i => (
                <tr key={i.id} className="border-b border-gray-100">
                  <td className="py-3">
                    <p className="font-medium">{i.student_name}</p>
                    <p className="text-xs text-gray-500">{i.student_email}</p>
                  </td>
                  <td className="py-3">
                    <p>{i.formation_title}</p>
                    <Badge variant="outline" className="text-xs">{i.category}</Badge>
                  </td>
                  <td className="py-3 text-right font-mono">{fmtMoney(i.price)}</td>
                </tr>
              ))}
              {!stats?.recent_inscriptions?.length && (
                <tr><td colSpan="3" className="py-6 text-center text-gray-400">Aucune inscription récente.</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card className="p-6 border border-gray-200 rounded-md shadow-none" data-testid="integrations-card">
          <p className="overline">État système</p>
          <h2 className="font-display text-2xl font-bold mb-4">Intégrations</h2>
          <div className="space-y-3">
            <IntegrationRow name="Trello"           ok={integrations?.trello?.connected}      hint={integrations?.trello?.board_id ? "Connecté" : "Clés OK"} />
            <IntegrationRow name="Stripe"           ok={integrations?.stripe?.configured}     hint={integrations?.stripe?.configured ? "Configuré" : "À configurer"} />
            <IntegrationRow name="Email"            ok={integrations?.email?.configured}      hint={integrations?.email?.provider || "mock"} />
            <IntegrationRow name="Agent IA"         ok={integrations?.ai?.configured}         hint="Claude Sonnet" icon={Robot} />
            <IntegrationRow name="Stockage docs"    ok={integrations?.storage?.configured}    hint="Object Storage" />
            <IntegrationRow name="WP TDL"           ok={!!wpTDL?.success}                     hint={wpTDL?.error ? "Erreur" : wpTDL ? "Connecté" : "Chargement…"} icon={Globe} />
            <IntegrationRow name="WP KAMI + Jetpack" ok={!!wpKami?.success}                  hint={wpKami?.error ? "Erreur" : wpKami ? "Connecté" : "Chargement…"} icon={Globe} />
            <IntegrationRow name="n8n"              ok={!!(integrations?.n8n?.inscription || integrations?.n8n?.dossier)} hint="Webhooks" />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   WpSiteBlock
───────────────────────────────────────────── */
function WpSiteBlock({ data, label, showGA, showJetpack }) {
  if (!data) return <p className="text-sm text-gray-400">Chargement…</p>;
  if (data.error) return (
    <div className="text-sm text-red-500 bg-red-50 p-3 rounded">
      <strong>{label} :</strong> {data.error}
    </div>
  );

  const traffic = data.traffic;
  const jetpack = data.jetpack;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <Globe size={14} />
        <a href={data.site} target="_blank" rel="noreferrer" className="underline">{data.site}</a>
        <span>·</span>
        <span>{data.authenticated_as?.name}</span>
        {(data.authenticated_as?.roles || []).map(r => (
          <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatMini label="Articles publiés" value={data.content?.total_published_posts ?? 0} />
        <StatMini label="Pages"             value={data.content?.total_pages ?? 0} />
        <StatMini label="Médias"            value={data.content?.total_media ?? 0} />
      </div>

      {data.recent_posts?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Derniers articles</p>
          <ul className="space-y-1">
            {data.recent_posts.map(p => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <a href={p.link} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-xs">{p.title}</a>
                <span className="text-gray-400 text-xs ml-2 shrink-0">
                  {p.date ? new Date(p.date).toLocaleDateString("fr-FR") : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showJetpack && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Trafic Jetpack</p>
          {data.jetpack_error && (
            <p className="text-xs text-orange-500">{data.jetpack_error}</p>
          )}
          {jetpack && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatMini label="Vues aujourd'hui" value={jetpack.total_views ?? 0} small />
              <StatMini label="Visiteurs auj."   value={jetpack.total_visitors ?? 0} small />
              <StatMini label="Meilleur jour"    value={jetpack.views_best_day ?? 0} small />
              <StatMini label="Abonnés"          value={jetpack.followers ?? 0} small />
            </div>
          )}
          {jetpack?.top_posts?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-400 mb-1">Top articles ce mois</p>
              <ul className="space-y-1">
                {jetpack.top_posts.map((p, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <a href={p.link} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-xs">{p.title}</a>
                    <span className="text-gray-400 text-xs ml-2 shrink-0">{p.views} vues</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {jetpack?.referrers?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-400 mb-1">Sources de trafic</p>
              <div className="flex flex-wrap gap-2">
                {jetpack.referrers.map((r, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{r.name} · {r.views}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showGA && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Google Analytics 4 — 30 derniers jours</p>
          {data.traffic_error && (
            <p className="text-xs text-orange-500">{data.traffic_error}</p>
          )}
          {traffic && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <StatMini label="Sessions"      value={traffic.sessions?.toLocaleString("fr-FR") ?? 0} small />
                <StatMini label="Pages vues"    value={traffic.page_views?.toLocaleString("fr-FR") ?? 0} small />
                <StatMini label="Utilisateurs"  value={traffic.active_users?.toLocaleString("fr-FR") ?? 0} small />
                <StatMini label="Taux de rebond" value={`${traffic.bounce_rate ?? 0}%`} small />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {traffic.top_pages?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Top pages</p>
                    <ul className="space-y-1">
                      {traffic.top_pages.map((p, i) => (
                        <li key={i} className="flex justify-between text-sm">
                          <span className="truncate max-w-[200px] text-gray-700" title={p.path}>{p.title || p.path}</span>
                          <span className="text-gray-400 text-xs ml-2 shrink-0">{p.views} vues</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {traffic.channels?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Canaux d'acquisition</p>
                    <ul className="space-y-1">
                      {traffic.channels.map((c, i) => (
                        <li key={i} className="flex justify-between text-sm">
                          <span className="text-gray-700">{c.channel}</span>
                          <span className="text-gray-400 text-xs">{c.sessions} sessions</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */
function KpiCard({ label, value, icon: Icon, accent, testid }) {
  return (
    <Card className="p-6 border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg transition-all duration-200" data-testid={testid}>
      <div className="flex items-start justify-between">
        <p className="overline">{label}</p>
        <Icon size={20} style={{ color: accent }} weight="duotone" />
      </div>
      <p className="font-display text-4xl font-bold tracking-tight mt-3">{value}</p>
    </Card>
  );
}

function StatMini({ label, value, small }) {
  return (
    <div className="p-3 bg-gray-50 rounded">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`font-bold ${small ? "text-lg" : "text-xl"}`}>{value}</p>
    </div>
  );
}

function IntegrationRow({ name, ok, hint, icon: Icon = Plugs }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
      {ok
        ? <Badge className="bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10"><CheckCircle size={12} weight="fill" className="mr-1" />OK</Badge>
        : <Badge variant="outline" className="text-[#F5A623] border-[#F5A623]/30"><Warning size={12} className="mr-1" />À config.</Badge>}
    </div>
  );
}