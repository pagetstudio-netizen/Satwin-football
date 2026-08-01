import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Search, Check, X, LogOut, Loader2, ArrowDownCircle, ArrowUpCircle, History, RefreshCw } from "lucide-react";
import type { Deposit, Withdrawal } from "@shared/schema";

interface DepositWithUser extends Deposit {
  user: { id: number; fullName: string; phone: string; country: string; isPromoter: boolean };
}
interface WithdrawalWithUser extends Withdrawal {
  user: { id: number; fullName: string; phone: string; country: string; isPromoter: boolean };
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
    approved: "bg-green-500/15 text-green-600 border-green-500/30",
    rejected: "bg-red-500/15 text-red-600 border-red-500/30",
    processing: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  };
  const labels: Record<string, string> = {
    pending: "En attente", approved: "Validé", rejected: "Rejeté", processing: "En cours",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${variants[status] || "bg-secondary"}`}>
      {labels[status] || status}
    </span>
  );
}

export default function BankerPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [depositSearch, setDepositSearch] = useState("");
  const [depositStatus, setDepositStatus] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [withdrawalStatus, setWithdrawalStatus] = useState<"all" | "pending" | "approved" | "rejected" | "processing">("pending");
  const [historySearch, setHistorySearch] = useState("");
  const [historyType, setHistoryType] = useState<"all" | "deposit" | "withdrawal">("all");

  const { data: allDeposits, isLoading: depositsLoading, refetch: refetchDeposits } = useQuery<DepositWithUser[]>({
    queryKey: ["/api/banker/deposits"],
    queryFn: async () => {
      const res = await fetch("/api/banker/deposits", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: allWithdrawals, isLoading: withdrawalsLoading, refetch: refetchWithdrawals } = useQuery<WithdrawalWithUser[]>({
    queryKey: ["/api/banker/withdrawals"],
    queryFn: async () => {
      const res = await fetch("/api/banker/withdrawals", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const depositMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      const res = await apiRequest("POST", `/api/banker/deposits/${id}/${action}`, {});
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/banker/deposits"] });
      toast({ title: vars.action === "approve" ? "Dépôt validé !" : "Dépôt rejeté" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const withdrawalMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      const res = await apiRequest("POST", `/api/banker/withdrawals/${id}/${action}`, {});
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/banker/withdrawals"] });
      toast({ title: vars.action === "approve" ? "Retrait validé !" : "Retrait rejeté et remboursé" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const filterDeposits = (items: DepositWithUser[]) => {
    const byStatus = depositStatus === "all" ? items : items.filter(d => d.status === depositStatus);
    if (!depositSearch.trim()) return byStatus;
    const q = depositSearch.toLowerCase();
    return byStatus.filter(d =>
      d.user.fullName.toLowerCase().includes(q) ||
      d.user.phone.includes(q) ||
      d.accountNumber.includes(q) ||
      (d.reference && d.reference.toLowerCase().includes(q)) ||
      String(d.id).includes(q)
    );
  };

  const filterWithdrawals = (items: WithdrawalWithUser[]) => {
    const byStatus = withdrawalStatus === "all" ? items : items.filter(w => w.status === withdrawalStatus);
    if (!withdrawalSearch.trim()) return byStatus;
    const q = withdrawalSearch.toLowerCase();
    return byStatus.filter(w =>
      w.user.fullName.toLowerCase().includes(q) ||
      w.user.phone.includes(q) ||
      w.accountNumber.includes(q) ||
      w.accountName.toLowerCase().includes(q) ||
      String(w.id).includes(q)
    );
  };

  const filterHistory = () => {
    const deposits: Array<{ type: "deposit"; item: DepositWithUser; date: Date }> = (allDeposits || [])
      .filter(d => d.status !== "pending")
      .map(d => ({ type: "deposit", item: d, date: new Date(d.createdAt) }));
    const withdrawals: Array<{ type: "withdrawal"; item: WithdrawalWithUser; date: Date }> = (allWithdrawals || [])
      .filter(w => w.status !== "pending")
      .map(w => ({ type: "withdrawal", item: w, date: new Date(w.createdAt) }));

    let combined: Array<{ type: "deposit" | "withdrawal"; item: any; date: Date }> = [];
    if (historyType === "all") combined = [...deposits, ...withdrawals];
    else if (historyType === "deposit") combined = deposits;
    else combined = withdrawals;

    combined.sort((a, b) => b.date.getTime() - a.date.getTime());

    if (!historySearch.trim()) return combined;
    const q = historySearch.toLowerCase();
    return combined.filter(c => {
      const item = c.item;
      return (
        item.user.fullName.toLowerCase().includes(q) ||
        item.user.phone.includes(q) ||
        item.accountNumber.includes(q) ||
        String(item.id).includes(q) ||
        (item.reference && item.reference.toLowerCase().includes(q)) ||
        (item.accountName && item.accountName.toLowerCase().includes(q))
      );
    });
  };

  const pendingDepositsCount = allDeposits?.filter(d => d.status === "pending").length || 0;
  const pendingWithdrawalsCount = allWithdrawals?.filter(w => w.status === "pending").length || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between shadow-md">
        <div>
          <h1 className="text-lg font-bold">Espace Bankier</h1>
          <p className="text-xs opacity-80">{user?.fullName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-primary-foreground hover:bg-white/20"
            onClick={() => { refetchDeposits(); refetchWithdrawals(); }}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-primary-foreground hover:bg-white/20"
            onClick={logout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-1" />
            Déconnexion
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 p-4">
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">{pendingDepositsCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Dépôts en attente</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">{pendingWithdrawalsCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Retraits en attente</p>
          </CardContent>
        </Card>
      </div>

      {/* Main tabs */}
      <div className="px-4 pb-8">
        <Tabs defaultValue="deposits">
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="deposits" className="relative" data-testid="tab-deposits">
              <ArrowDownCircle className="w-4 h-4 mr-1" />
              Dépôts
              {pendingDepositsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {pendingDepositsCount > 9 ? "9+" : pendingDepositsCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="withdrawals" className="relative" data-testid="tab-withdrawals">
              <ArrowUpCircle className="w-4 h-4 mr-1" />
              Retraits
              {pendingWithdrawalsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {pendingWithdrawalsCount > 9 ? "9+" : pendingWithdrawalsCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="w-4 h-4 mr-1" />
              Historique
            </TabsTrigger>
          </TabsList>

          {/* DEPOSITS TAB */}
          <TabsContent value="deposits" className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher nom, téléphone, référence..."
                  value={depositSearch}
                  onChange={(e) => setDepositSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-deposit-search"
                />
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(["pending", "approved", "rejected", "all"] as const).map(s => (
                <Button key={s} size="sm" variant={depositStatus === s ? "default" : "outline"}
                  onClick={() => setDepositStatus(s)} className="whitespace-nowrap" data-testid={`button-deposit-filter-${s}`}>
                  {s === "all" ? "Tous" : s === "pending" ? "En attente" : s === "approved" ? "Validés" : "Rejetés"}
                </Button>
              ))}
            </div>

            {depositsLoading ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-36" />)
            ) : (
              <div className="space-y-3">
                {filterDeposits(allDeposits || []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">Aucun dépôt trouvé</div>
                ) : filterDeposits(allDeposits || []).map(deposit => (
                  <Card key={deposit.id} className={deposit.status === "pending" ? "border-yellow-500/30" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-foreground">{deposit.user.fullName}</p>
                          <p className="text-sm text-muted-foreground">{deposit.user.phone} · {deposit.user.country}</p>
                          {deposit.user.isPromoter && <Badge className="text-xs mt-1">Promoteur</Badge>}
                        </div>
                        <StatusBadge status={deposit.status} />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm bg-secondary/50 rounded-lg p-3 mb-3">
                        <div>
                          <p className="text-muted-foreground text-xs">Montant</p>
                          <p className="font-bold text-lg text-primary">{Number(deposit.amount).toLocaleString()} F</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Canal</p>
                          <p className="font-medium">{deposit.channelName || "Manuel"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Numéro payeur</p>
                          <p className="font-mono font-medium">{deposit.accountNumber}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Référence</p>
                          <p className="font-mono text-sm">{deposit.reference || "—"}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground text-xs">Date</p>
                          <p className="text-sm">{new Date(deposit.createdAt).toLocaleString("fr-FR")}</p>
                        </div>
                      </div>

                      {deposit.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            size="sm"
                            onClick={() => depositMutation.mutate({ id: deposit.id, action: "approve" })}
                            disabled={depositMutation.isPending}
                            data-testid={`button-approve-deposit-${deposit.id}`}
                          >
                            {depositMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Valider</>}
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1"
                            size="sm"
                            onClick={() => depositMutation.mutate({ id: deposit.id, action: "reject" })}
                            disabled={depositMutation.isPending}
                            data-testid={`button-reject-deposit-${deposit.id}`}
                          >
                            <X className="w-4 h-4 mr-1" />Rejeter
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* WITHDRAWALS TAB */}
          <TabsContent value="withdrawals" className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher nom, téléphone, numéro..."
                  value={withdrawalSearch}
                  onChange={(e) => setWithdrawalSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-withdrawal-search"
                />
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(["pending", "approved", "rejected", "processing", "all"] as const).map(s => (
                <Button key={s} size="sm" variant={withdrawalStatus === s ? "default" : "outline"}
                  onClick={() => setWithdrawalStatus(s)} className="whitespace-nowrap" data-testid={`button-withdrawal-filter-${s}`}>
                  {s === "all" ? "Tous" : s === "pending" ? "En attente" : s === "approved" ? "Validés" : s === "rejected" ? "Rejetés" : "En cours"}
                </Button>
              ))}
            </div>

            {withdrawalsLoading ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-40" />)
            ) : (
              <div className="space-y-3">
                {filterWithdrawals(allWithdrawals || []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">Aucun retrait trouvé</div>
                ) : filterWithdrawals(allWithdrawals || []).map(w => (
                  <Card key={w.id} className={w.status === "pending" ? "border-yellow-500/30" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-foreground">{w.user.fullName}</p>
                          <p className="text-sm text-muted-foreground">{w.user.phone} · {w.user.country}</p>
                          {w.user.isPromoter && <Badge className="text-xs mt-1">Promoteur</Badge>}
                        </div>
                        <StatusBadge status={w.status} />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm bg-secondary/50 rounded-lg p-3 mb-3">
                        <div>
                          <p className="text-muted-foreground text-xs">Montant brut</p>
                          <p className="font-bold text-lg">{Number(w.amount).toLocaleString()} F</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Montant net</p>
                          <p className="font-bold text-lg text-primary">{Number(w.netAmount).toLocaleString()} F</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Bénéficiaire</p>
                          <p className="font-medium">{w.accountName}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Numéro</p>
                          <p className="font-mono font-medium">{w.accountNumber}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Méthode</p>
                          <p className="font-medium">{w.paymentMethod}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Date</p>
                          <p className="text-sm">{new Date(w.createdAt).toLocaleString("fr-FR")}</p>
                        </div>
                      </div>

                      {w.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            size="sm"
                            onClick={() => withdrawalMutation.mutate({ id: w.id, action: "approve" })}
                            disabled={withdrawalMutation.isPending}
                            data-testid={`button-approve-withdrawal-${w.id}`}
                          >
                            {withdrawalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Valider</>}
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1"
                            size="sm"
                            onClick={() => withdrawalMutation.mutate({ id: w.id, action: "reject" })}
                            disabled={withdrawalMutation.isPending}
                            data-testid={`button-reject-withdrawal-${w.id}`}
                          >
                            <X className="w-4 h-4 mr-1" />Rejeter
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history" className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Nom, téléphone, numéro, référence..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-history-search"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {(["all", "deposit", "withdrawal"] as const).map(t => (
                <Button key={t} size="sm" variant={historyType === t ? "default" : "outline"}
                  onClick={() => setHistoryType(t)} className="whitespace-nowrap" data-testid={`button-history-filter-${t}`}>
                  {t === "all" ? "Tous" : t === "deposit" ? "Dépôts" : "Retraits"}
                </Button>
              ))}
            </div>

            {depositsLoading || withdrawalsLoading ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)
            ) : (
              <div className="space-y-2">
                {filterHistory().length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">Aucun historique trouvé</div>
                ) : filterHistory().map(({ type, item, date }) => (
                  <Card key={`${type}-${item.id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${type === "deposit" ? "bg-green-500/15" : "bg-orange-500/15"}`}>
                            {type === "deposit"
                              ? <ArrowDownCircle className="w-4 h-4 text-green-600" />
                              : <ArrowUpCircle className="w-4 h-4 text-orange-600" />}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{item.user.fullName}</p>
                            <p className="text-xs text-muted-foreground">{item.user.phone} · {item.user.country}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {type === "deposit" ? `Ref: ${item.reference || item.accountNumber}` : `${item.accountName} · ${item.accountNumber}`}
                            </p>
                            <p className="text-xs text-muted-foreground">{date.toLocaleString("fr-FR")}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${type === "deposit" ? "text-green-600" : "text-orange-600"}`}>
                            {type === "deposit" ? "+" : "-"}{Number(type === "deposit" ? item.amount : item.netAmount).toLocaleString()} F
                          </p>
                          <StatusBadge status={item.status} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
