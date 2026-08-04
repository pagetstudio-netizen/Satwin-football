import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Search, RotateCcw } from "lucide-react";

interface AdminBet {
  id: number;
  userId: number;
  matchId: number;
  amount: string;
  status: string;
  profit: string | null;
  placedAt: string;
  settledAt: string | null;
  chosenScore: string | null;
  match: {
    homeTeam: string;
    awayTeam: string;
    league: string;
    matchDate: string;
    predictedScore: string;
    realScore: string | null;
    status: string;
  } | null;
  user: {
    id: number;
    fullName: string;
    phone: string;
  } | null;
}

// Must match billet.tsx exactly
function commercialId(betId: number, placedAt: string) {
  const ts = new Date(placedAt).getTime();
  return `0${betId}${ts}${betId * 31 + 7}`.slice(0, 22).padEnd(22, "0");
}

function fmtDate(s: string) {
  return new Date(s).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtAmount(a: string) {
  return parseFloat(a).toLocaleString("fr-FR", { minimumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pending:  { label: "En cours",    color: "bg-amber-100 text-amber-700 border-amber-200" },
    won:      { label: "Gagné",       color: "bg-green-100 text-green-700 border-green-200" },
    lost:     { label: "Perdu",       color: "bg-red-100 text-red-700 border-red-200" },
    refunded: { label: "Remboursé",   color: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  const s = map[status] || { label: status, color: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${s.color}`}>
      {s.label}
    </span>
  );
}

export default function AdminBets() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: allBets = [], isLoading } = useQuery<AdminBet[]>({
    queryKey: ["/api/admin/bets"],
    staleTime: 30_000,
  });

  const refundMut = useMutation({
    mutationFn: async (betId: number) => {
      const r = await apiRequest("POST", `/api/admin/bets/${betId}/refund`, {});
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Erreur");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Pari remboursé", description: "Le montant a été crédité à l'utilisateur." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const q = search.trim().toLowerCase();
  const filtered = allBets.filter(b => {
    if (!q) return true;
    const cid = commercialId(b.id, b.placedAt);
    return (
      cid.includes(q) ||
      (b.user?.fullName || "").toLowerCase().includes(q) ||
      (b.user?.phone || "").includes(q) ||
      (b.match?.homeTeam || "").toLowerCase().includes(q) ||
      (b.match?.awayTeam || "").toLowerCase().includes(q)
    );
  });

  const pendingCount = allBets.filter(b => b.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Paris</h2>
          <p className="text-sm text-muted-foreground">
            {allBets.length} pari(s) au total · {pendingCount} en cours
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Rechercher par identifiant commercial, nom, téléphone ou match…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="text-center py-10 text-muted-foreground">Aucun pari trouvé</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(bet => {
            const cid = commercialId(bet.id, bet.placedAt);
            const isPending = bet.status === "pending";
            return (
              <Card key={bet.id} className={isPending ? "border-amber-200" : ""}>
                <CardContent className="p-4 space-y-2">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-muted-foreground truncate">{cid}</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {bet.match ? `${bet.match.homeTeam} vs ${bet.match.awayTeam}` : "Match inconnu"}
                      </p>
                      {bet.match && (
                        <p className="text-xs text-muted-foreground">{bet.match.league}</p>
                      )}
                    </div>
                    <StatusBadge status={bet.status} />
                  </div>

                  {/* Info row */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>👤 {bet.user?.fullName || `User #${bet.userId}`}</span>
                    <span>📞 {bet.user?.phone || "—"}</span>
                    <span>💰 Mise : <strong className="text-foreground">{fmtAmount(bet.amount)} F</strong></span>
                    {bet.profit && parseFloat(bet.profit) > 0 && (
                      <span>🏆 Gain : <strong className="text-green-700">+{fmtAmount(bet.profit)} F</strong></span>
                    )}
                    <span>🎯 Score prédit : {bet.chosenScore || bet.match?.predictedScore || "?"}</span>
                    {bet.match?.realScore && (
                      <span>✅ Score réel : <strong>{bet.match.realScore}</strong></span>
                    )}
                    <span>📅 {fmtDate(bet.placedAt)}</span>
                  </div>

                  {/* Refund button — only for pending bets */}
                  {isPending && (
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-orange-600 border-orange-300 hover:bg-orange-50"
                        disabled={refundMut.isPending}
                        onClick={() => {
                          if (confirm(`Rembourser le pari #${bet.id} de ${fmtAmount(bet.amount)} F à ${bet.user?.fullName || "cet utilisateur"} ?`))
                            refundMut.mutate(bet.id);
                        }}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Rembourser ce pari
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
