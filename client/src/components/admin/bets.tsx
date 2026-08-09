import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Search, RotateCcw, Trophy, Clock, CheckSquare, Square, ListFilter, Layers } from "lucide-react";

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
    id: number;
    homeTeam: string;
    awayTeam: string;
    league: string;
    matchDate: string;
    predictedScore: string;
    realScore: string | null;
    status: string;
    profitRate: string;
  } | null;
  user: {
    id: number;
    fullName: string;
    phone: string;
  } | null;
}

interface MatchGroup {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  matchDate: string;
  predictedScore: string;
  profitRate: string;
  bets: AdminBet[];
  totalMise: number;
  totalGain: number;
}

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

function fmtAmount(a: string | number) {
  return parseFloat(String(a)).toLocaleString("fr-FR", { minimumFractionDigits: 0 });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pending:  { label: "En cours",  color: "bg-amber-100 text-amber-700 border-amber-200" },
    won:      { label: "Gagné",     color: "bg-green-100 text-green-700 border-green-200" },
    lost:     { label: "Perdu",     color: "bg-red-100 text-red-700 border-red-200" },
    refunded: { label: "Remboursé", color: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  const s = map[status] || { label: status, color: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${s.color}`}>
      {s.label}
    </span>
  );
}

// ─── Vue Liste ────────────────────────────────────────────────────────────────
function ListView({ bets }: { bets: AdminBet[] }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const refundMut = useMutation({
    mutationFn: async (betId: number) => {
      const r = await apiRequest("POST", `/api/admin/bets/${betId}/refund`, {});
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Erreur");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Pari remboursé", description: "Le montant a été crédité." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const q = search.trim().toLowerCase();
  const filtered = bets.filter(b => {
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

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Rechercher par identifiant, nom, téléphone ou match…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <Card><CardContent className="text-center py-10 text-muted-foreground">Aucun pari trouvé</CardContent></Card>
      ) : (
        filtered.map(bet => {
          const cid = commercialId(bet.id, bet.placedAt);
          const isPending = bet.status === "pending";
          return (
            <Card key={bet.id} className={isPending ? "border-amber-200" : ""}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted-foreground truncate">{cid}</p>
                    <p className="text-sm font-semibold mt-0.5">
                      {bet.match ? `${bet.match.homeTeam} vs ${bet.match.awayTeam}` : "Match inconnu"}
                    </p>
                    {bet.match && <p className="text-xs text-muted-foreground">{bet.match.league}</p>}
                  </div>
                  <StatusBadge status={bet.status} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>👤 {bet.user?.fullName || `User #${bet.userId}`}</span>
                  <span>📞 {bet.user?.phone || "—"}</span>
                  <span>💰 Mise : <strong className="text-foreground">{fmtAmount(bet.amount)} F</strong></span>
                  {bet.profit && parseFloat(bet.profit) > 0 && (
                    <span>🏆 Gain : <strong className="text-green-700">+{fmtAmount(bet.profit)} F</strong></span>
                  )}
                  <span>🎯 Score prédit : {bet.chosenScore || bet.match?.predictedScore || "?"}</span>
                  {bet.match?.realScore && <span>✅ Score réel : <strong>{bet.match.realScore}</strong></span>}
                  <span>📅 {fmtDate(bet.placedAt)}</span>
                </div>
                {isPending && (
                  <div className="pt-1">
                    <Button
                      size="sm" variant="outline"
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
        })
      )}
    </div>
  );
}

// ─── Vue Par Match ─────────────────────────────────────────────────────────────
function MatchGroupView({ bets }: { bets: AdminBet[] }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  // Grouper uniquement les paris pending par match
  const pendingBets = bets.filter(b => b.status === "pending");
  const groupMap = new Map<number, MatchGroup>();
  for (const bet of pendingBets) {
    if (!bet.match) continue;
    if (!groupMap.has(bet.matchId)) {
      const pr = parseFloat(bet.match.profitRate || "50");
      groupMap.set(bet.matchId, {
        matchId: bet.matchId,
        homeTeam: bet.match.homeTeam,
        awayTeam: bet.match.awayTeam,
        league: bet.match.league,
        matchDate: bet.match.matchDate,
        predictedScore: bet.match.predictedScore,
        profitRate: bet.match.profitRate || "50",
        bets: [],
        totalMise: 0,
        totalGain: 0,
      });
    }
    const g = groupMap.get(bet.matchId)!;
    const mise = parseFloat(bet.amount);
    const gain = mise * parseFloat(g.profitRate) / 100;
    g.bets.push(bet);
    g.totalMise += mise;
    g.totalGain += gain;
  }
  const groups = [...groupMap.values()].sort((a, b) => b.bets.length - a.bets.length);

  const toggleSelect = (matchId: number) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(matchId) ? s.delete(matchId) : s.add(matchId);
      return s;
    });
  };

  const selectAll = () => setSelected(new Set(groups.map(g => g.matchId)));
  const clearAll  = () => setSelected(new Set());

  const bulkAction = async (action: "won" | "refunded" | "postponed") => {
    if (selected.size === 0) {
      toast({ title: "Aucun match sélectionné", variant: "destructive" });
      return;
    }
    const labels: Record<string, string> = {
      won:       "Déclarer GAGNANTS tous les parieurs",
      refunded:  "REMBOURSER tous les parieurs",
      postponed: "Marquer comme REPORTÉ (paris laissés en attente)",
    };
    const matchNames = groups
      .filter(g => selected.has(g.matchId))
      .map(g => `${g.homeTeam} vs ${g.awayTeam}`)
      .join("\n");
    if (!confirm(`Action : ${labels[action]}\n\nMatchs concernés :\n${matchNames}\n\nConfirmer ?`)) return;

    setLoading(true);
    let ok = 0; let err = 0;
    for (const matchId of selected) {
      try {
        const r = await apiRequest("POST", `/api/admin/matches/${matchId}/force-settle`, { action });
        if (r.ok) ok++;
        else err++;
      } catch { err++; }
    }
    setLoading(false);
    queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
    setSelected(new Set());
    if (err === 0)
      toast({ title: "✅ Traitement terminé", description: `${ok} match(s) traité(s) avec succès.` });
    else
      toast({ title: "⚠️ Traitement partiel", description: `${ok} réussi(s), ${err} erreur(s).`, variant: "destructive" });
  };

  if (groups.length === 0) {
    return (
      <Card><CardContent className="text-center py-10 text-muted-foreground">
        Aucun pari en attente à traiter
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barre d'actions */}
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-blue-800">
                {selected.size === 0
                  ? "Aucun match sélectionné"
                  : `${selected.size} match(s) sélectionné(s)`}
              </span>
              <button
                onClick={selected.size === groups.length ? clearAll : selectAll}
                className="text-xs text-blue-600 underline"
              >
                {selected.size === groups.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={loading || selected.size === 0}
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => bulkAction("won")}
            >
              <Trophy className="w-4 h-4 mr-1" />
              Gagné
            </Button>
            <Button
              size="sm"
              disabled={loading || selected.size === 0}
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => bulkAction("refunded")}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Rembourser
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading || selected.size === 0}
              className="border-gray-400 text-gray-700"
              onClick={() => bulkAction("postponed")}
            >
              <Clock className="w-4 h-4 mr-1" />
              Reporté
            </Button>
          </div>

          {loading && (
            <p className="text-xs text-blue-700 animate-pulse">Traitement en cours…</p>
          )}
        </CardContent>
      </Card>

      {/* Liste des groupes */}
      {groups.map(g => {
        const isSelected = selected.has(g.matchId);
        return (
          <Card
            key={g.matchId}
            className={`cursor-pointer transition-all ${isSelected ? "border-2 border-blue-500 bg-blue-50/30" : "border"}`}
            onClick={() => toggleSelect(g.matchId)}
          >
            <CardContent className="p-4 space-y-3">
              {/* Header match */}
              <div className="flex items-start gap-3">
                <div
                  className="mt-1 flex-shrink-0"
                  onClick={e => { e.stopPropagation(); toggleSelect(g.matchId); }}
                >
                  {isSelected
                    ? <CheckSquare className="w-5 h-5 text-blue-600" />
                    : <Square className="w-5 h-5 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base">{g.homeTeam} vs {g.awayTeam}</p>
                  <p className="text-xs text-muted-foreground">{g.league}</p>
                  <p className="text-xs text-muted-foreground">
                    📅 {fmtDate(g.matchDate)} · 🎯 Score prédit : <strong>{g.predictedScore}</strong>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-amber-700">{g.bets.length} pari(s)</p>
                  <p className="text-xs text-muted-foreground">Mise totale</p>
                  <p className="text-sm font-semibold">{fmtAmount(g.totalMise)} F</p>
                  <p className="text-xs text-green-700">Gain si won: +{fmtAmount(g.totalGain)} F</p>
                </div>
              </div>

              {/* Liste des parieurs */}
              <div className="border-t pt-2 space-y-1">
                {g.bets.map(bet => (
                  <div key={bet.id} className="flex items-center justify-between text-xs gap-2" onClick={e => e.stopPropagation()}>
                    <span className="text-muted-foreground truncate max-w-[150px]">
                      👤 {bet.user?.fullName || `User #${bet.userId}`}
                    </span>
                    <span className="text-muted-foreground">{bet.user?.phone || "—"}</span>
                    <span className="font-semibold">{fmtAmount(bet.amount)} F</span>
                    <span className="text-green-700">+{fmtAmount(parseFloat(bet.amount) * parseFloat(g.profitRate) / 100)} F</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────
export default function AdminBets() {
  const [view, setView] = useState<"list" | "match">("match");

  const { data: allBets = [], isLoading } = useQuery<AdminBet[]>({
    queryKey: ["/api/admin/bets"],
    staleTime: 30_000,
  });

  const pendingCount = allBets.filter(b => b.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold">Paris</h2>
          <p className="text-sm text-muted-foreground">
            {allBets.length} pari(s) au total · {pendingCount} en attente
          </p>
        </div>
        {/* Toggle vue */}
        <div className="flex rounded-lg border overflow-hidden">
          <button
            className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
              view === "match" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
            onClick={() => setView("match")}
          >
            <Layers className="w-4 h-4" /> Par match
          </button>
          <button
            className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
              view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
            onClick={() => setView("list")}
          >
            <ListFilter className="w-4 h-4" /> Liste
          </button>
        </div>
      </div>

      {/* Contenu */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
        </div>
      ) : view === "match" ? (
        <MatchGroupView bets={allBets} />
      ) : (
        <ListView bets={allBets} />
      )}
    </div>
  );
}
