import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getPaymentMethodsForCountry } from "@/lib/countries";
import { Loader2, Plus, Trash2, CreditCard, Check } from "lucide-react";
import type { WithdrawalWallet } from "@shared/schema";

const walletSchema = z.object({
  accountName: z.string().min(2, "Nom du compte requis"),
  accountNumber: z.string().min(8, "Numéro requis"),
  paymentMethod: z.string().min(2, "Moyen de paiement requis"),
});

type WalletForm = z.infer<typeof walletSchema>;

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
}

export default function WalletModal({ open, onClose }: WalletModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const { data: wallets, isLoading } = useQuery<WithdrawalWallet[]>({
    queryKey: ["/api/wallets"],
    enabled: open,
  });

  const form = useForm<WalletForm>({
    resolver: zodResolver(walletSchema),
    defaultValues: {
      accountName: "",
      accountNumber: "",
      paymentMethod: "",
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: WalletForm) => {
      const response = await apiRequest("POST", "/api/wallets", {
        ...data,
        country: user!.country,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "Portefeuille ajouté!" });
      form.reset();
      setShowForm(false);
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (walletId: number) => {
      const response = await apiRequest("DELETE", `/api/wallets/${walletId}`, {});
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "Portefeuille supprimé!" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (walletId: number) => {
      const response = await apiRequest("PATCH", `/api/wallets/${walletId}/default`, {});
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "Portefeuille par défaut mis à jour!" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  if (!user) return null;

  const paymentMethods = getPaymentMethodsForCountry(user.country);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestion des portefeuilles</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : wallets && wallets.length > 0 ? (
            wallets.map((wallet) => (
              <Card key={wallet.id} className={wallet.isDefault ? "border-primary" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{wallet.accountName}</p>
                        <p className="text-sm text-muted-foreground">{wallet.accountNumber}</p>
                        <p className="text-xs text-muted-foreground">{wallet.paymentMethod}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!wallet.isDefault && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDefaultMutation.mutate(wallet.id)}
                          disabled={setDefaultMutation.isPending}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(wallet.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {wallet.isDefault && (
                    <div className="mt-2">
                      <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">Par défaut</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : !showForm ? (
            <div className="text-center py-8">
              <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">Aucun portefeuille enregistré</p>
            </div>
          ) : null}

          {showForm ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => addMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="accountName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom du compte</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Votre nom complet" data-testid="input-wallet-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Numéro</FormLabel>
                      <FormControl>
                        <Input {...field} type="tel" placeholder="Votre numéro" data-testid="input-wallet-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Moyen de paiement</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-wallet-method">
                            <SelectValue placeholder="Choisir" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {paymentMethods.map((method) => (
                            <SelectItem key={method} value={method}>
                              {method}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">
                    Annuler
                  </Button>
                  <Button type="submit" className="flex-1" disabled={addMutation.isPending}>
                    {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ajouter"}
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <Button className="w-full" onClick={() => setShowForm(true)} data-testid="button-add-wallet">
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un portefeuille
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
