import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Check, X, Search, Loader2 } from "lucide-react";
import type { Withdrawal } from "@shared/schema";

interface WithdrawalWithUser extends Withdrawal {
  user: {
    id: number;
    fullName: string;
    phone: string;
    country: string;
    isPromoter: boolean;
  };
}

export default function AdminWithdrawals() {
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  const { data: allWithdrawals, isLoading } = useQuery<WithdrawalWithUser[]>({
    queryKey: ["/api/admin/withdrawals"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/withdrawals?status=all`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch withdrawals");
      return res.json();
    },
  });

  const withdrawals = allWithdrawals?.filter(w =>
    statusFilter === "all" ? true : w.status === statusFilter
  );

  const [processingId, setProcessingId] = useState<number | null>(null);

  const processMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      setProcessingId(id);
      const res = await fetch(`/api/admin/withdrawals/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `Erreur ${res.status}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Retrait traité !" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
    onSettled: () => setProcessingId(null),
  });

  const filteredWithdrawals = withdrawals?.filter(w =>
    w.accountNumber.includes(filter) ||
    w.user.phone.includes(filter) ||
    w.user.fullName.toLowerCase().includes(filter.toLowerCase())
  ) || [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par numero ou nom..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {(["all", "pending", "approved", "rejected"] as const).map((status) => (
          <Button
            key={status}
            size="sm"
            variant={statusFilter === status ? "default" : "outline"}
            onClick={() => setStatusFilter(status)}
          >
            {status === "all" ? "Tous" : status === "pending" ? "En attente" : status === "approved" ? "Approuvés" : "Rejetés"}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-40" />)
        ) : filteredWithdrawals.length > 0 ? (
          filteredWithdrawals.map((withdrawal) => (
            <Card key={withdrawal.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{withdrawal.user.fullName}</p>
                      {withdrawal.user.isPromoter && <Badge className="text-xs">Promoteur</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{withdrawal.user.phone}</p>
                    <p className="text-sm text-muted-foreground">Pays: {withdrawal.user.country}</p>
                  </div>
                  <Badge variant={
                    withdrawal.status === "pending" ? "secondary" :
                    withdrawal.status === "approved" ? "default" : "destructive"
                  }>
                    {withdrawal.status === "pending" ? "En attente" : withdrawal.status === "approved" ? "Approuvé" : "Rejeté"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Montant demandé</p>
                    <p className="font-medium text-foreground">{withdrawal.amount.toLocaleString()} F</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Montant net</p>
                    <p className="font-medium text-primary">{withdrawal.netAmount.toLocaleString()} F</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Frais</p>
                    <p className="font-medium text-destructive">{withdrawal.fees.toLocaleString()} F</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Moyen</p>
                    <p className="font-medium text-foreground">{withdrawal.paymentMethod}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Numéro de réception</p>
                    <p className="font-medium text-foreground">{withdrawal.accountNumber} - {withdrawal.accountName}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Date et heure</p>
                    <p className="font-medium text-foreground">
                      {new Date(withdrawal.createdAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric"
                      })} à {new Date(withdrawal.createdAt).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </p>
                  </div>
                </div>

                {withdrawal.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => processMutation.mutate({ id: withdrawal.id, action: "approve" })}
                      disabled={processingId === withdrawal.id}
                      data-testid={`button-approve-${withdrawal.id}`}
                    >
                      {processingId === withdrawal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" /> Valider</>}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => processMutation.mutate({ id: withdrawal.id, action: "reject" })}
                      disabled={processingId === withdrawal.id}
                      data-testid={`button-reject-${withdrawal.id}`}
                    >
                      <X className="w-4 h-4 mr-1" /> Rejeter
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Aucun retrait trouvé
          </div>
        )}
      </div>
    </div>
  );
}
