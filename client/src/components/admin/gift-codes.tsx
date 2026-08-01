import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Loader2, Gift } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface GiftCode {
  id: number;
  code: string;
  amount: string;
  maxUses: number;
  currentUses: number;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}

export default function AdminGiftCodes() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    amount: "",
    maxUses: "",
    expiresAt: "",
  });

  const { data: giftCodes = [], isLoading } = useQuery<GiftCode[]>({
    queryKey: ["/api/admin/gift-codes"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/admin/gift-codes", {
        code: data.code,
        amount: parseFloat(data.amount),
        maxUses: parseInt(data.maxUses),
        expiresAt: data.expiresAt,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gift-codes"] });
      setIsCreateOpen(false);
      setFormData({ code: "", amount: "", maxUses: "", expiresAt: "" });
      toast({ title: "Succes", description: "Code cadeau cree avec succes" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/admin/gift-codes/${id}`);
      if (!response.ok) throw new Error("Erreur lors de la suppression");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gift-codes"] });
      toast({ title: "Succes", description: "Code cadeau supprime" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.amount || !formData.maxUses || !formData.expiresAt) {
      toast({ title: "Erreur", description: "Tous les champs sont requis", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isExpired = (expiresAt: string) => new Date() > new Date(expiresAt);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold" data-testid="text-section-title">Codes Cadeaux</h2>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-gift-code">
              <Plus className="w-4 h-4 mr-2" />
              Creer un code
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau Code Cadeau</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Ex: BONUS2026"
                  data-testid="input-code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Montant (FCFA)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="Ex: 500"
                  data-testid="input-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxUses">Nombre d'utilisateurs max</Label>
                <Input
                  id="maxUses"
                  type="number"
                  value={formData.maxUses}
                  onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                  placeholder="Ex: 100"
                  data-testid="input-max-uses"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Date et heure d'expiration</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  data-testid="input-expires-at"
                />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Creer"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {giftCodes.length === 0 ? (
        <Card data-testid="card-empty-state">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Gift className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p data-testid="text-empty-message">Aucun code cadeau</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {giftCodes.map((giftCode) => (
            <Card key={giftCode.id} data-testid={`gift-code-item-${giftCode.id}`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg font-mono">{giftCode.code}</CardTitle>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-500"
                    onClick={() => deleteMutation.mutate(giftCode.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-${giftCode.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Montant</span>
                  <span className="font-semibold" data-testid={`text-amount-${giftCode.id}`}>{parseFloat(giftCode.amount).toLocaleString()} FCFA</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Utilisations</span>
                  <span className="font-semibold" data-testid={`text-uses-${giftCode.id}`}>{giftCode.currentUses} / {giftCode.maxUses}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expire le</span>
                  <span className={`font-semibold ${isExpired(giftCode.expiresAt) ? "text-red-500" : ""}`} data-testid={`text-expires-${giftCode.id}`}>
                    {formatDate(giftCode.expiresAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Statut</span>
                  <span className={`font-semibold ${isExpired(giftCode.expiresAt) || !giftCode.isActive ? "text-red-500" : "text-green-500"}`} data-testid={`text-status-${giftCode.id}`}>
                    {isExpired(giftCode.expiresAt) ? "Expire" : giftCode.isActive ? "Actif" : "Inactif"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
