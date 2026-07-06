// KamiStreet.jsx - Version WooCommerce complète
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, PencilSimple, Trash, ShoppingCart, Lightning } from "@phosphor-icons/react";
import { toast } from "sonner";

const empty = { 
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

export default function KamiStreet() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);

  // Charger les produits et catégories depuis WooCommerce
  const load = async () => {
    setLoading(true);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        api.get("/wordpress/kami/products", { params: { per_page: 50 } }),
        api.get("/wordpress/kami/categories")
      ]);
      setItems(productsRes.data.products || []);
      setCategories(categoriesRes.data || []);
    } catch (e) {
      toast.error("Erreur lors du chargement des produits");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Sauvegarder (mettre à jour)
  const save = async () => {
    if (!editId) {
      toast.error("La création de produits n'est pas encore disponible");
      return;
    }

    try {
      const payload = {
        name: form.name,
        regular_price: String(form.regular_price),
        sale_price: form.sale_price ? String(form.sale_price) : "",
        stock_quantity: parseInt(form.stock_quantity) || 0,
        manage_stock: form.manage_stock,
        stock_status: form.stock_status,
        status: form.status,
        short_description: form.description,
      };

      await api.put(`/wordpress/kami/products/${editId}`, payload);
      toast.success("Produit mis à jour sur WooCommerce");
      
      setOpen(false);
      setForm(empty);
      setEditId(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la sauvegarde");
    }
  };

  const edit = (p) => {
    setForm({
      name: p.name || "",
      category: p.categories?.[0] || "",
      description: p.description || "",
      regular_price: p.regular_price || p.price || "0",
      sale_price: p.sale_price || "",
      stock_quantity: p.stock_quantity || 0,
      manage_stock: p.manage_stock !== undefined ? p.manage_stock : true,
      stock_status: p.stock_status || "instock",
      status: p.status || "publish",
      image: p.image || ""
    });
    setEditId(p.id);
    setOpen(true);
  };

  const remove = async (id) => {
    if (!window.confirm("Supprimer ce produit ? Cette action est irréversible.")) return;
    try {
      // Le backend n'a pas d'endpoint DELETE pour WooCommerce
      // On va marquer le produit comme draft ou on utilise l'API WooCommerce directement
      await api.put(`/wordpress/kami/products/${id}`, { status: "draft" });
      toast.success("Produit dépublié (mis en brouillon)");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la suppression");
    }
  };

  // Formater le statut du stock pour l'affichage
  const getStockStatus = (product) => {
    if (product.manage_stock && product.stock_quantity <= 0) {
      return "Rupture de stock";
    }
    if (product.stock_status === "outofstock") return "Rupture";
    if (product.stock_status === "onbackorder") return "Sur commande";
    return "Disponible";
  };

  return (
    <div className="space-y-6" data-testid="kami-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline flex items-center gap-2" style={{ color: "#d4af37" }}>
            <Lightning size={12} weight="fill" /> KAMI STREET · <a href="https://kamistreet.fr/" target="_blank" rel="noreferrer" className="underline hover:opacity-80">kamistreet.fr ↗</a>
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Stock & catalogue interne</h1>
          <p className="text-gray-500 mt-2">Gérez le stock et les produits WooCommerce depuis votre dashboard.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(empty); setEditId(null); } }}>
          <DialogTrigger asChild>
            <Button className="bg-[#d4af37] hover:bg-[#b8941f] text-black hover:text-black" data-testid="add-product-btn">
              <Plus size={16} className="mr-2" /> Nouveau produit
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editId ? "Modifier" : "Nouveau"} produit</DialogTitle>
              <p className="text-sm text-gray-500">Les modifications sont synchronisées avec WooCommerce</p>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Nom du produit *</label>
                <Input 
                  value={form.name} 
                  onChange={(e) => setForm({ ...form, name: e.target.value })} 
                  placeholder="Ex: Trotinette électrique X7"
                  data-testid="product-name" 
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Catégorie</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Statut</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="publish">Publié</SelectItem>
                    <SelectItem value="draft">Brouillon</SelectItem>
                    <SelectItem value="private">Privé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Prix normal (€)</label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={form.regular_price} 
                  onChange={(e) => setForm({ ...form, regular_price: e.target.value })} 
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Prix promo (€)</label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={form.sale_price} 
                  onChange={(e) => setForm({ ...form, sale_price: e.target.value })} 
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Quantité en stock</label>
                <Input 
                  type="number" 
                  value={form.stock_quantity} 
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} 
                />
              </div>

              <div>
                <label className="text-sm font-medium">Statut du stock</label>
                <Select value={form.stock_status} onValueChange={(v) => setForm({ ...form, stock_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instock">En stock</SelectItem>
                    <SelectItem value="outofstock">Rupture</SelectItem>
                    <SelectItem value="onbackorder">Sur commande</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-sm font-medium">URL de l'image</label>
                <Input 
                  value={form.image} 
                  onChange={(e) => setForm({ ...form, image: e.target.value })} 
                  placeholder="https://kamistreet.fr/wp-content/uploads/..."
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Description courte</label>
                <Textarea 
                  value={form.description} 
                  onChange={(e) => setForm({ ...form, description: e.target.value })} 
                  rows={3} 
                  placeholder="Description du produit..."
                />
              </div>

              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch 
                  checked={form.manage_stock} 
                  onCheckedChange={(v) => setForm({ ...form, manage_stock: v })} 
                />
                <label className="text-sm">Gérer le stock</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button 
                onClick={save} 
                className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" 
                data-testid="product-save"
                disabled={!form.name}
              >
                {editId ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-pulse text-gray-400">Chargement des produits...</div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">Aucun produit trouvé</p>
          <p className="text-sm text-gray-400 mt-1">Les produits sont synchronisés depuis WooCommerce</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((p) => {
            const categoryName = p.categories && p.categories.length > 0 
              ? p.categories[0] 
              : "Non catégorisé";
            
            const statusColor = p.status === "publish" 
              ? "bg-green-100 text-green-800" 
              : p.status === "draft" 
                ? "bg-yellow-100 text-yellow-800" 
                : "bg-gray-100 text-gray-800";
            
            return (
              <Card 
                key={p.id} 
                className="overflow-hidden border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg transition-all" 
                data-testid={`product-card-${p.id}`}
              >
                <div className="aspect-video bg-gray-100 relative">
                  {p.image ? (
                    <img 
                      src={p.image} 
                      alt={p.name} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <ShoppingCart size={48} />
                    </div>
                  )}
                  
                  <div className="absolute top-3 left-3 flex flex-col gap-1">
                    <Badge className="bg-[#d4af37] text-black hover:bg-[#d4af37]">
                      {categoryName}
                    </Badge>
                    <Badge className={`${statusColor} hover:${statusColor}`}>
                      {p.status === "publish" ? "Publié" : p.status === "draft" ? "Brouillon" : "Privé"}
                    </Badge>
                  </div>
                  
                  <div className="absolute bottom-3 right-3">
                    <Badge 
                      className={`
                        ${p.stock_status === "instock" && (!p.manage_stock || p.stock_quantity > 0) 
                          ? "bg-green-500 text-white" 
                          : p.stock_status === "onbackorder" 
                            ? "bg-orange-500 text-white" 
                            : "bg-red-500 text-white"
                        }
                      `}
                    >
                      {p.manage_stock && p.stock_quantity !== null 
                        ? `${p.stock_quantity} en stock` 
                        : p.stock_status === "instock" 
                          ? "En stock" 
                          : p.stock_status === "onbackorder" 
                            ? "Sur commande" 
                            : "Rupture"
                      }
                    </Badge>
                  </div>
                </div>
                
                <div className="p-5">
                  <h3 className="font-display font-bold text-lg leading-tight">{p.name}</h3>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {p.description || "Aucune description"}
                  </p>
                  
                  <div className="flex items-end justify-between mt-4">
                    <div>
                      {p.sale_price && parseFloat(p.sale_price) > 0 ? (
                        <div className="flex items-center gap-2">
                          <p className="font-display font-bold text-2xl text-red-600">{p.sale_price}€</p>
                          <p className="text-sm text-gray-400 line-through">{p.regular_price}€</p>
                        </div>
                      ) : (
                        <p className="font-display font-bold text-2xl">{p.regular_price || p.price || "0"}€</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => edit(p)} 
                      data-testid={`edit-product-${p.id}`}
                      className="hover:bg-gray-100"
                    >
                      <PencilSimple size={14} className="mr-1" /> Modifier
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-red-600 hover:text-red-700 hover:bg-red-50" 
                      onClick={() => remove(p.id)} 
                      data-testid={`delete-product-${p.id}`}
                    >
                      <Trash size={14} className="mr-1" /> Dépublier
                    </Button>
                    {p.permalink && (
                      <a 
                        href={p.permalink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="ml-auto text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center"
                      >
                        Voir sur le site
                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      
      {!loading && items.length > 0 && (
        <div className="border-t border-gray-200 pt-4 flex justify-between text-sm text-gray-500">
          <p>Total: {items.length} produit{items.length > 1 ? 's' : ''}</p>
          <p>Dernière mise à jour: {new Date().toLocaleString('fr-FR')}</p>
        </div>
      )}
    </div>
  );
}