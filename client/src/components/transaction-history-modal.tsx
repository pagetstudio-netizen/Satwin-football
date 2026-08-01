import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/countries";
import { ArrowDownToLine, ArrowUpFromLine, TrendingUp, Clock, Check, X } from "lucide-react";
import type { Deposit, Withdrawal, Transaction } from "@shared/schema";

interface TransactionHistoryModalProps {
  open: boolean;
  onClose: () => void;
}

export default function TransactionHistoryModal({ open, onClose }: TransactionHistoryModalProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("deposits");

  const { data: deposits, isLoading: depositsLoading } = useQuery<Deposit[]>({
    queryKey: ["/api/deposits/history"],
    enabled: open && activeTab === "deposits",
  });

  const { data: withdrawals, isLoading: withdrawalsLoading } = useQuery<Withdrawal[]>({
    queryKey: ["/api/withdrawals/history"],
    enabled: open && activeTab === "withdrawals",
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
    enabled: open && activeTab === "earnings",
  });

  if (!user) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="text-xs"><Clock className="w-3 h-3 mr-1" /> En attente</Badge>;
      case "approved":
        return <Badge className="text-xs bg-green-500"><Check className="w-3 h-3 mr-1" /> Approuvé</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="text-xs"><X className="w-3 h-3 mr-1" /> Rejeté</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Historique des transactions</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="deposits">Dépôts</TabsTrigger>
            <TabsTrigger value="withdrawals">Retraits</TabsTrigger>
            <TabsTrigger value="earnings">Revenus</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="deposits" className="mt-0 space-y-3">
              {depositsLoading ? (
                Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              ) : deposits && deposits.length > 0 ? (
                deposits.map((deposit) => (
                  <Card key={deposit.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                            <ArrowDownToLine className="w-5 h-5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              +{formatCurrency(deposit.amount, user.country)}
                            </p>
                            <p className="text-xs text-muted-foreground">{deposit.paymentMethod}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(deposit.createdAt as unknown as string)}</p>
                          </div>
                        </div>
                        {getStatusBadge(deposit.status)}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8">
                  <ArrowDownToLine className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Aucun dépôt</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="withdrawals" className="mt-0 space-y-3">
              {withdrawalsLoading ? (
                Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              ) : withdrawals && withdrawals.length > 0 ? (
                withdrawals.map((withdrawal) => (
                  <Card key={withdrawal.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                            <ArrowUpFromLine className="w-5 h-5 text-red-500" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              -{formatCurrency(withdrawal.amount, user.country)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Net: {formatCurrency(withdrawal.netAmount, user.country)}
                            </p>
                            <p className="text-xs text-muted-foreground">{formatDate(withdrawal.createdAt as unknown as string)}</p>
                          </div>
                        </div>
                        {getStatusBadge(withdrawal.status)}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8">
                  <ArrowUpFromLine className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Aucun retrait</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="earnings" className="mt-0 space-y-3">
              {transactionsLoading ? (
                Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              ) : transactions && transactions.length > 0 ? (
                transactions.map((transaction) => (
                  <Card key={transaction.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              +{formatCurrency(parseFloat(transaction.amount), user.country)}
                            </p>
                            <p className="text-xs text-muted-foreground">{transaction.description}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(transaction.createdAt as unknown as string)}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Aucun revenu</p>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
