import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Check, X, Ban, Search, Loader2, ImageIcon, MessageSquare } from "lucide-react";
import type { Deposit } from "@shared/schema";

interface DepositWithUser extends Deposit {
  user: {
    id: number;
    fullName: string;
    phone: string;
    country: string;
    isPromoter: boolean;
  };
}

// Build a unified reference string for a deposit (mirrors history.tsx logic)
function getDepositRef(d: DepositWithUser): string {
  const sv = (d as any).sendavapayReference;
  const omRef = (d as any).omnipayReference;
  const omId  = (d as any).omnipayId;
  const soRef = (d as any).soleaspayReference;
  const soOrd = (d as any).soleaspayOrderId;
  const plain = (d as any).reference;
  if (sv)    return sv.startsWith("sdk")    ? sv    : `sdk${sv}`;
  if (omRef) return omRef.startsWith("sdk") ? omRef : `sdk${omRef}`;
  if (omId)  return `sdk${omId}`;
  if (soRef) return soRef.startsWith("sdk") ? soRef : `sdk${soRef}`;
  if (soOrd) return `sdk${soOrd}`;
  if (plain) return plain;
  // fallback: generated from id + date
  const dt = new Date(d.createdAt);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `sdk${String(dt.getFullYear()).slice(2)}${pad(dt.getMonth()+1)}${pad(dt.getDate())}${pad(dt.getHours())}${pad(dt.getMinutes())}D${pad(d.id, 4)}`;
}

export default function AdminDeposits() {
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [screenshotModal, setScreenshotModal] = useState<string | null>(null);

  const { data: allDeposits, isLoading } = useQuery<DepositWithUser[]>({
    queryKey: ["/api/admin/deposits"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/deposits?status=all`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deposits");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const deposits = allDeposits?.filter(d =>
    statusFilter === "all" ? true :
    statusFilter === "pending" ? (d.status === "pending" || d.status === "processing") :
    d.status === statusFilter
  );

  const [processingId, setProcessingId] = useState<number | null>(null);

  const processMutation = useMutation({
    mutationFn: async ({ id, action, ban }: { id: number; action: "approve" | "reject"; ban?: boolean }) => {
      setProcessingId(id);
      const res = await fetch(`/api/admin/deposits/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ban }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `Erreur ${res.status}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deposits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Dépôt traité !" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
    onSettled: () => setProcessingId(null),
  });

  const filteredDeposits = deposits?.filter(d =>
    d.accountNumber.includes(filter) ||
    d.user.phone.includes(filter) ||
    d.user.fullName.toLowerCase().includes(filter.toLowerCase()) ||
    (d.reference && d.reference.toLowerCase().includes(filter.toLowerCase())) ||
    ((d as any).channelName && (d as any).channelName.toLowerCase().includes(filter.toLowerCase())) ||
    String(d.id).includes(filter)
  ) || [];

  const pendingCount = allDeposits?.filter(d => d.status === "pending" || d.status === "processing").length || 0;

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
            {pendingCount} dépôt{pendingCount > 1 ? "s" : ""} en attente de validation
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, numéro, référence..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-10"
            data-testid="input-search-deposits"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {(["pending", "approved", "rejected", "all"] as const).map((status) => (
          <Button
            key={status}
            size="sm"
            variant={statusFilter === status ? "default" : "outline"}
            onClick={() => setStatusFilter(status)}
            className="whitespace-nowrap"
            data-testid={`button-filter-${status}`}
          >
            {status === "all" ? "Tous" : status === "pending" ? `En attente${pendingCount > 0 ? ` (${pendingCount})` : ""}` : status === "approved" ? "Approuvés" : "Rejetés"}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-52" />)
        ) : filteredDeposits.length > 0 ? (
          filteredDeposits.map((deposit) => {
            const isManual = !!(deposit as any).paymentNumberId || !!(deposit as any).channelName;
            return (
              <Card key={deposit.id} className={deposit.status === "pending" ? "border-yellow-400/50" : ""}>
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground">{deposit.user.fullName}</p>
                        {deposit.user.isPromoter && <Badge className="text-xs">Promoteur</Badge>}
                        {isManual && (
                          <Badge className="text-xs bg-red-600 text-white border-red-600">
                            Paiement manuel
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{deposit.user.phone} · {deposit.user.country}</p>
                    </div>
                    <Badge variant={deposit.status === "pending" ? "secondary" : deposit.status === "approved" ? "default" : "destructive"}>
                      {deposit.status === "pending" ? "En attente" : deposit.status === "approved" ? "Approuvé" : "Rejeté"}
                    </Badge>
                  </div>

                  {/* Main info */}
                  <div className="grid grid-cols-2 gap-2 text-sm bg-secondary/50 rounded-xl p-3">
                    <div>
                      <p className="text-muted-foreground text-xs">Montant</p>
                      <p className="font-bold text-lg text-primary">{deposit.amount.toLocaleString()} F</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Opérateur</p>
                      <p className="font-medium">{deposit.paymentMethod}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Numéro payeur</p>
                      <p className="font-mono font-medium">{deposit.accountNumber}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Date</p>
                      <p className="font-medium text-xs">
                        {new Date(deposit.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        {" "}
                        {new Date(deposit.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    {/* Payment number (channel) used */}
                    {(deposit as any).channelName && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground text-xs">Numéro destinataire utilisé</p>
                        <p className="font-bold text-red-600">{(deposit as any).channelName}</p>
                      </div>
                    )}

                    {/* Reference */}
                    {(deposit as any).reference && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground text-xs">Référence</p>
                        <p className="font-mono font-medium">{(deposit as any).reference}</p>
                      </div>
                    )}
                  </div>

                  {/* Payment message */}
                  {(deposit as any).paymentMessage && (
                    <div className="bg-blue-50 dark:bg-blue-950 rounded-xl p-3">
                      <div className="flex items-center gap-1 mb-1">
                        <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                        <p className="text-xs font-medium text-blue-600">Message de paiement reçu</p>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{(deposit as any).paymentMessage}</p>
                    </div>
                  )}

                  {/* Screenshot */}
                  {(deposit as any).screenshot && (
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        <p className="text-xs font-medium text-muted-foreground">Capture d'écran</p>
                      </div>
                      <button
                        onClick={() => setScreenshotModal((deposit as any).screenshot)}
                        className="w-full rounded-xl overflow-hidden border border-border hover:border-primary transition-colors"
                        data-testid={`button-screenshot-${deposit.id}`}
                      >
                        <img
                          src={(deposit as any).screenshot}
                          alt="Capture"
                          className="w-full max-h-40 object-contain bg-secondary/30"
                        />
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  {deposit.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => processMutation.mutate({ id: deposit.id, action: "approve" })}
                        disabled={processingId === deposit.id}
                        data-testid={`button-approve-${deposit.id}`}
                      >
                        {processingId === deposit.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Valider</>}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => processMutation.mutate({ id: deposit.id, action: "reject" })}
                        disabled={processingId === deposit.id}
                        data-testid={`button-reject-${deposit.id}`}
                      >
                        <X className="w-4 h-4 mr-1" />Rejeter
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => processMutation.mutate({ id: deposit.id, action: "reject", ban: true })}
                        disabled={processingId === deposit.id}
                        title="Rejeter et bannir"
                        data-testid={`button-ban-${deposit.id}`}
                      >
                        <Ban className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Aucun dépôt trouvé
          </div>
        )}
      </div>

      {/* Screenshot modal */}
      <Dialog open={!!screenshotModal} onOpenChange={() => setScreenshotModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Capture d'écran du paiement</DialogTitle>
          </DialogHeader>
          {screenshotModal && (
            <img src={screenshotModal} alt="Capture" className="w-full rounded-xl object-contain max-h-[70vh]" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
