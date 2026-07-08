import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { MagnifyingGlass, PencilSimple, XCircle, ArrowCounterClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";

const fmtMoney = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);

const PAYMENT_LABEL = { pending: "En attente", paid: "Payé", refunded: "Remboursé" };

export default function Inscriptions() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({ student_name: "", student_phone: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/inscriptions").then((r) => setItems(r.data)).catch(() => toast.error("Erreur de chargement"));

  useEffect(() => { load(); }, []);

  const filtered = items.filter((i) =>
    (i.student_name + i.student_email + i.formation_title).toLowerCase().includes(q.toLowerCase())
  );

  const updatePaymentStatus = async (id, payment_status) => {
    try { await api.put(`/inscriptions/${id}`, { payment_status }); toast.success("Statut de paiement mis à jour"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const cancelInscription = async (id) => {
    try { await api.post(`/inscriptions/${id}/cancel`); toast.success("Inscription annulée"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const reactivateInscription = async (id) => {
    try { await api.post(`/inscriptions/${id}/reactivate`); toast.success("Inscription réactivée"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const openEdit = (i) => {
    setEditItem(i);
    setEditForm({ student_name: i.student_name || "", student_phone: i.student_phone || "", notes: i.notes || "" });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      await api.put(`/inscriptions/${editItem.id}`, editForm);
      toast.success("Inscription mise à jour");
      setEditOpen(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    finally { setSaving(false); }
  };

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
                <th className="py-3 px-4 overline">Statut</th>
                <th className="py-3 px-4 overline text-right">Prix</th>
                <th className="py-3 px-4 overline text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const cancelled = i.status === "annulee";
                return (
                  <tr key={i.id} className={`border-b border-gray-100 hover:bg-gray-50 ${cancelled ? "opacity-50" : ""}`} data-testid={`inscription-row-${i.id}`}>
                    <td className="py-3 px-4 text-xs text-gray-500 font-mono">
                      {new Date(i.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium">{i.student_name}</p>
                      <p className="text-xs text-gray-500">{i.student_email}</p>
                      {i.student_phone && <p className="text-xs text-gray-400">{i.student_phone}</p>}
                    </td>
                    <td className="py-3 px-4">{i.formation_title}</td>
                    <td className="py-3 px-4"><Badge variant="outline">{i.category}</Badge></td>
                    <td className="py-3 px-4">
                      <Select value={i.payment_status} onValueChange={(v) => updatePaymentStatus(i.id, v)} disabled={cancelled}>
                        <SelectTrigger className={`h-7 text-xs w-28 border-0 ${
                          i.payment_status === "paid" ? "bg-[#0B7238]/10 text-[#0B7238]"
                          : i.payment_status === "refunded" ? "bg-gray-200 text-gray-600"
                          : "bg-[#F5A623]/10 text-[#F5A623]"
                        }`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PAYMENT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={cancelled ? "bg-red-100 text-red-700 hover:bg-red-100" : "bg-green-100 text-green-700 hover:bg-green-100"}>
                        {cancelled ? "Annulée" : "Active"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{fmtMoney(i.price)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end items-center gap-1">
                        <button onClick={() => openEdit(i)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="Modifier">
                          <PencilSimple size={14} />
                        </button>
                        {cancelled ? (
                          <button onClick={() => reactivateInscription(i.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Réactiver">
                            <ArrowCounterClockwise size={14} />
                          </button>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Annuler l'inscription">
                                <XCircle size={14} />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Annuler cette inscription ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  <span className="font-semibold">{i.student_name}</span> — {i.formation_title}. L'inscription restera visible mais marquée comme annulée.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Retour</AlertDialogCancel>
                                <AlertDialogAction onClick={() => cancelInscription(i.id)} className="bg-red-600 hover:bg-red-700 text-white">
                                  Annuler l'inscription
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan="8" className="py-12 text-center text-gray-400">Aucune inscription.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier l'inscription</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium">Nom de l'étudiant</label>
              <Input value={editForm.student_name} onChange={(e) => setEditForm({ ...editForm, student_name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Téléphone</label>
              <Input value={editForm.student_phone} onChange={(e) => setEditForm({ ...editForm, student_phone: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={saveEdit} disabled={saving} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
