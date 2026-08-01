import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit, Trash2, Loader2, Lock, Users, Calendar, TrendingUp, Eye, EyeOff, Package } from "lucide-react";
import type { StakingProduct, UserStaking } from "@shared/schema";

type UserStakingFull = UserStaking & { product: StakingProduct; user: { id: number; fullName: string; phone: string; country: string } };

const emptyForm = { name: "", description: "", price: "", returnAmount: "", lockDays: "", launchDate: "", imageUrl: "", isActive: true };

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminStaking() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<StakingProduct | null>(null);
  const [bulkCount, setBulkCount] = useState(1);
  const [forms, setForms] = useState<typeof emptyForm[]>([{ ...emptyForm }]);

  const { data: products = [], isLoading: productsLoading } = useQuery<StakingProduct[]>({
    queryKey: ["/api/admin/staking/products"],
  });

  const { data: stakings = [], isLoading: stakingsLoading } = useQuery<UserStakingFull[]>({
    queryKey: ["/api/admin/staking/stakings"],
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editTarget) {
        const form = forms[0];
        const res = await apiRequest("PUT", `/api/admin/staking/products/${editTarget.id}`, {
          ...form, price: parseInt(form.price), returnAmount: parseInt(form.returnAmount), lockDays: parseInt(form.lockDays),
          launchDate: form.launchDate || null,
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
        return res.json();
      } else {
        const results = [];
        for (const form of forms) {
          if (!form.name || !form.price || !form.returnAmount || !form.lockDays) continue;
          const res = await apiRequest("POST", "/api/admin/staking/products", {
            ...form, price: parseInt(form.price), returnAmount: parseInt(form.returnAmount), lockDays: parseInt(form.lockDays),
            launchDate: form.launchDate || null,
          });
          if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
          results.push(await res.json());
        }
        return results;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staking/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staking/products"] });
      toast({ title: editTarget ? "Produit mis à jour" : `${forms.length} produit(s) ajouté(s)` });
      closeForm();
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/staking/products/${id}`, {});
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staking/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staking/products"] });
      toast({ title: "Produit supprimé" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/staking/products/${id}`, { isActive });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staking/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staking/products"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => {
    setEditTarget(null);
    const count = Math.max(1, bulkCount);
    setForms(Array.from({ length: count }, () => ({ ...emptyForm })));
    setShowForm(true);
  };

  const openEdit = (sp: StakingProduct) => {
    setEditTarget(sp);
    const launchStr = sp.launchDate ? new Date(sp.launchDate).toISOString().slice(0, 16) : "";
    setForms([{ name: sp.name, description: sp.description || "", price: String(sp.price), returnAmount: String(sp.returnAmount), lockDays: String(sp.lockDays), launchDate: launchStr, imageUrl: sp.imageUrl || "", isActive: sp.isActive }]);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditTarget(null); setForms([{ ...emptyForm }]); setBulkCount(1); };

  const updateForm = (i: number, field: string, value: any) => {
    setForms(prev => prev.map((f, idx) => idx === i ? { ...f, [field]: value } : f));
  };

  const isScheduled = (sp: StakingProduct) => sp.launchDate && new Date(sp.launchDate) > new Date();
  const totalStaked = stakings.filter(s => s.status === "active").reduce((sum, s) => sum + s.amountPaid, 0);
  const totalReleased = stakings.filter(s => s.status === "released").reduce((sum, s) => sum + s.returnAmount, 0);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="products">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="products">
            <Package className="w-4 h-4 mr-2" />
            Produits Staking ({products.length})
          </TabsTrigger>
          <TabsTrigger value="stakings">
            <Users className="w-4 h-4 mr-2" />
            Achats ({stakings.length})
          </TabsTrigger>
        </TabsList>

        {/* PRODUCTS TAB */}
        <TabsContent value="products" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Nb. à créer :</span>
              <Input type="number" min={1} max={20} value={bulkCount} onChange={e => setBulkCount(parseInt(e.target.value) || 1)}
                className="w-16 h-8 text-center" data-testid="input-bulk-count" />
            </div>
            <Button onClick={openAdd} data-testid="button-add-staking">
              <Plus className="w-4 h-4 mr-2" />
              {bulkCount > 1 ? `Ajouter ${bulkCount} produits` : "Ajouter un produit"}
            </Button>
          </div>

          {productsLoading ? (
            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Lock className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucun produit staking créé</p>
            </div>
          ) : (
            <div className="space-y-3">
              {products.map(sp => {
                const scheduled = isScheduled(sp);
                return (
                  <Card key={sp.id} className={!sp.isActive ? "opacity-60" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="font-bold text-foreground">{sp.name}</p>
                            <Badge variant={!sp.isActive ? "secondary" : scheduled ? "outline" : "default"} className={scheduled ? "border-orange-400 text-orange-600" : ""}>
                              {!sp.isActive ? "Inactif" : scheduled ? "Planifié" : "Actif"}
                            </Badge>
                          </div>
                          {sp.description && <p className="text-xs text-muted-foreground mb-2">{sp.description}</p>}
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="bg-secondary/50 rounded-lg p-2 text-center">
                              <p className="text-muted-foreground text-xs">Prix</p>
                              <p className="font-bold text-primary">{sp.price.toLocaleString()} F</p>
                            </div>
                            <div className="bg-secondary/50 rounded-lg p-2 text-center">
                              <p className="text-muted-foreground text-xs">Retour</p>
                              <p className="font-bold text-green-600">{sp.returnAmount.toLocaleString()} F</p>
                            </div>
                            <div className="bg-secondary/50 rounded-lg p-2 text-center">
                              <p className="text-muted-foreground text-xs">Durée</p>
                              <p className="font-bold">{sp.lockDays}j</p>
                            </div>
                          </div>
                          {sp.launchDate && (
                            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              Lancement : {formatDate(sp.launchDate)}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button size="icon" variant="ghost" onClick={() => toggleMutation.mutate({ id: sp.id, isActive: !sp.isActive })}
                            disabled={toggleMutation.isPending} data-testid={`button-toggle-${sp.id}`}>
                            {sp.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(sp)} data-testid={`button-edit-${sp.id}`}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive"
                            onClick={() => { if (confirm("Supprimer ce produit staking ?")) deleteMutation.mutate(sp.id); }}
                            disabled={deleteMutation.isPending} data-testid={`button-delete-${sp.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* STAKINGS TAB */}
        <TabsContent value="stakings" className="space-y-4 mt-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-secondary rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">En cours</p>
              <p className="font-bold text-primary">{stakings.filter(s => s.status === "active").length}</p>
            </div>
            <div className="bg-secondary rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Total bloqué</p>
              <p className="font-bold text-orange-600">{totalStaked.toLocaleString()} F</p>
            </div>
            <div className="bg-secondary rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Total libéré</p>
              <p className="font-bold text-green-600">{totalReleased.toLocaleString()} F</p>
            </div>
          </div>

          {stakingsLoading ? (
            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : stakings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucun achat staking</div>
          ) : (
            <div className="space-y-2">
              {stakings.map(s => (
                <Card key={s.id} className={s.status === "released" ? "opacity-60" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{s.user.fullName}</p>
                          <Badge variant={s.status === "released" ? "default" : "secondary"} className="text-xs">
                            {s.status === "released" ? "Libéré" : "En cours"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{s.user.phone} · {s.product.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.amountPaid.toLocaleString()} F → {s.returnAmount.toLocaleString()} F · Déblocage : {formatDate(s.releaseDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{formatDate(s.purchasedAt)}</p>
                        {s.status === "released" && s.releasedAt && (
                          <p className="text-xs text-green-600 font-medium">Libéré le {formatDate(s.releasedAt)}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={closeForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Modifier le produit staking" : forms.length > 1 ? `Ajouter ${forms.length} produits staking` : "Ajouter un produit staking"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {forms.map((form, i) => (
              <div key={i} className={`space-y-3 ${forms.length > 1 ? "border border-border rounded-xl p-4" : ""}`}>
                {forms.length > 1 && <p className="font-semibold text-sm text-primary">Produit {i + 1}</p>}
                <div>
                  <label className="text-sm font-medium">Nom du produit</label>
                  <Input value={form.name} onChange={e => updateForm(i, "name", e.target.value)}
                    placeholder="Ex: Staking Gold 30 jours" className="mt-1" data-testid={`input-name-${i}`} />
                </div>
                <div>
                  <label className="text-sm font-medium">Description <span className="text-muted-foreground font-normal">(optionnel)</span></label>
                  <Input value={form.description} onChange={e => updateForm(i, "description", e.target.value)}
                    placeholder="Description du produit" className="mt-1" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-sm font-medium">Prix (F)</label>
                    <Input type="number" value={form.price} onChange={e => updateForm(i, "price", e.target.value)}
                      placeholder="5000" className="mt-1" data-testid={`input-price-${i}`} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Retour (F)</label>
                    <Input type="number" value={form.returnAmount} onChange={e => updateForm(i, "returnAmount", e.target.value)}
                      placeholder="7000" className="mt-1" data-testid={`input-return-${i}`} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Durée (j)</label>
                    <Input type="number" value={form.lockDays} onChange={e => updateForm(i, "lockDays", e.target.value)}
                      placeholder="30" className="mt-1" data-testid={`input-days-${i}`} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Date de lancement <span className="text-muted-foreground font-normal">(optionnel — si planifié, les utilisateurs voient le produit mais ne peuvent pas acheter avant)</span>
                  </label>
                  <Input type="datetime-local" value={form.launchDate} onChange={e => updateForm(i, "launchDate", e.target.value)}
                    className="mt-1" data-testid={`input-launch-${i}`} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id={`active-${i}`} checked={form.isActive}
                    onChange={e => updateForm(i, "isActive", e.target.checked)} />
                  <label htmlFor={`active-${i}`} className="text-sm font-medium">Actif immédiatement</label>
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={closeForm}>Annuler</Button>
              <Button className="flex-1" onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || forms.some(f => !f.name || !f.price || !f.returnAmount || !f.lockDays)}
                data-testid="button-save-staking">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (editTarget ? "Modifier" : `Créer ${forms.length > 1 ? forms.length + " produits" : ""}`)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
