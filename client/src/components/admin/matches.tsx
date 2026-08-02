import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus, Pencil, Trash2, CheckCircle, Radio, Ban, RefreshCw,
  Star, StarOff, Users, TrendingUp, Filter, Search, X,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface Match {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  predictedScore: string;
  profitRate: string;
  matchDate: string;
  minBet: number;
  maxBet: number;
  league: string;
  status: string;
  realScore: string | null;
  result: string | null;
  isActive: boolean;
  externalId: string | null;
  liveScore: string | null;
  isFeatured: boolean;
}

interface MatchForm {
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  predictedScore: string;
  profitRate: string;
  matchDate: string;
  minBet: string;
  maxBet: string;
  league: string;
  status: string;
}

interface MatchStat {
  betCount: number;
  uniqueUsers: number;
  totalAmount: number;
}

interface StatsResponse {
  matchStats: Record<number, MatchStat>;
  featuredSummary: MatchStat;
  otherSummary: MatchStat;
  todayFeatured: MatchStat;
  todayOther: MatchStat;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */
const emptyForm: MatchForm = {
  homeTeam: "", awayTeam: "",
  homeFlag: "🏴", awayFlag: "🏴",
  predictedScore: "", profitRate: "7.5",
  matchDate: "", minBet: "1000", maxBet: "500000",
  league: "", status: "upcoming",
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  upcoming:  { label: "À venir",   variant: "secondary" },
  live:      { label: "En direct", variant: "default" },
  finished:  { label: "Terminé",   variant: "outline" },
  cancelled: { label: "Annulé",    variant: "destructive" },
};

const STATUS_FILTERS = [
  { key: "all",       label: "Tous" },
  { key: "upcoming",  label: "À venir" },
  { key: "live",      label: "En direct" },
  { key: "finished",  label: "Terminé" },
  { key: "cancelled", label: "Annulé" },
];

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtAmount(n: number) {
  return n.toLocaleString("fr-FR") + " F";
}

/* ── Mini stat box ──────────────────────────────────────────────────────────── */
function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 120,
      background: "#fff", borderRadius: 10,
      padding: "12px 14px",
      border: `2px solid ${color}22`,
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <p style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, color }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function AdminMatches() {
  const { toast } = useToast();

  /* ── UI state ── */
  const [formOpen,      setFormOpen]      = useState(false);
  const [settleOpen,    setSettleOpen]    = useState(false);
  const [editingId,     setEditingId]     = useState<number | null>(null);
  const [settleId,      setSettleId]      = useState<number | null>(null);
  const [form,          setForm]          = useState<MatchForm>(emptyForm);
  const [realScore,     setRealScore]     = useState("");
  const [syncDays,      setSyncDays]      = useState("7");

  /* ── Filter state ── */
  const [filterStatus,   setFilterStatus]   = useState<string>("all");
  const [filterFeatured, setFilterFeatured] = useState<boolean>(false);
  const [searchText,     setSearchText]     = useState<string>("");

  /* ── Data ── */
  const { data: matchList = [], isLoading } = useQuery<Match[]>({
    queryKey: ["/api/admin/matches"],
  });

  const { data: statsData } = useQuery<StatsResponse>({
    queryKey: ["/api/admin/matches/stats"],
    refetchInterval: 30_000,
  });

  /* ── Filtered list ── */
  const filteredList = matchList.filter(m => {
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (filterFeatured && !m.isFeatured) return false;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      const haystack = `${m.homeTeam} ${m.awayTeam} ${m.league || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  /* ── Mutations ── */
  const saveMutation = useMutation({
    mutationFn: async (data: MatchForm) => {
      const payload = {
        ...data,
        profitRate: parseFloat(data.profitRate) || 7.5,
        minBet: parseInt(data.minBet) || 1000,
        maxBet: parseInt(data.maxBet) || 500000,
      };
      const url    = editingId ? `/api/admin/matches/${editingId}` : "/api/admin/matches";
      const method = editingId ? "PUT" : "POST";
      const res    = await apiRequest(method, url, payload);
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/matches/stats"] });
      toast({ title: editingId ? "Match mis à jour !" : "Match créé !" });
      closeForm();
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const settleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/matches/${settleId}/settle`, { realScore });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/matches/stats"] });
      toast({ title: "Match réglé !", description: data.message });
      setSettleOpen(false);
      setRealScore("");
      setSettleId(null);
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, isFeatured }: { id: number; status: string; isFeatured?: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/matches/${id}`, { status, isFeatured });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/matches/stats"] });
      toast({ title: "Statut mis à jour" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await apiRequest("POST", "/api/admin/matches/sync", { days });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      toast({ title: "Synchronisation réussie", description: data.message });
    },
    onError: (e: any) => toast({ title: "Erreur sync", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/matches/${id}`);
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      toast({ title: "Match désactivé" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  /* ── Helpers ── */
  function openCreate() { setEditingId(null); setForm(emptyForm); setFormOpen(true); }
  function openEdit(m: Match) {
    setEditingId(m.id);
    setForm({
      homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      homeFlag: m.homeFlag, awayFlag: m.awayFlag,
      predictedScore: m.predictedScore, profitRate: m.profitRate,
      matchDate: m.matchDate ? new Date(m.matchDate).toISOString().slice(0, 16) : "",
      minBet: String(m.minBet), maxBet: String(m.maxBet),
      league: m.league || "", status: m.status,
    });
    setFormOpen(true);
  }
  function openSettle(id: number) { setSettleId(id); setRealScore(""); setSettleOpen(true); }
  function closeForm() { setFormOpen(false); setForm(emptyForm); setEditingId(null); }
  function set(key: keyof MatchForm, val: string) { setForm(f => ({ ...f, [key]: val })); }
  const sb = (m: Match) => STATUS_BADGE[m.status] ?? { label: m.status, variant: "secondary" as const };

  /* ────────────────────────────────────────────────────────────────────────────
     RENDER
  ──────────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="text-lg font-bold">Matchs ({filteredList.length}/{matchList.length})</h2>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <select value={syncDays} onChange={e => setSyncDays(e.target.value)}
              className="text-xs border rounded px-1 py-1 h-8">
              {[1,3,7,14].map(d => <option key={d} value={d}>{d}j</option>)}
            </select>
            <Button size="sm" variant="outline"
              onClick={() => syncMutation.mutate(parseInt(syncDays))}
              disabled={syncMutation.isPending}>
              <RefreshCw className={`w-3 h-3 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Sync…" : "Synchroniser"}
            </Button>
          </div>
          <Button onClick={openCreate} size="sm" data-testid="button-create-match">
            <Plus className="w-4 h-4 mr-1" /> Nouveau match
          </Button>
        </div>
      </div>

      {/* ── Today's summary stats ────────────────────────────────────────────── */}
      {statsData && (
        <div style={{ borderRadius: 12, background: "#F8FAFF", border: "1px solid #E0E8FF", padding: "14px 16px" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#4B5563", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <TrendingUp size={14} /> Statistiques du jour
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {/* Match du jour */}
            <div style={{ flex: 1, minWidth: 200, background: "#FFF8E8", borderRadius: 10, padding: "10px 14px", border: "2px solid #FBBF24" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>⭐ Match du jour (aujourd'hui)</p>
              <div style={{ display: "flex", gap: 16 }}>
                <div>
                  <p style={{ fontSize: 10, color: "#888" }}>Parieurs</p>
                  <p style={{ fontSize: 20, fontWeight: 900, color: "#D97706" }}>
                    {statsData.todayFeatured.uniqueUsers}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: "#888" }}>Montant total</p>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "#D97706" }}>
                    {fmtAmount(statsData.todayFeatured.totalAmount)}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: "#888" }}>Mises</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "#D97706" }}>
                    {statsData.todayFeatured.betCount}
                  </p>
                </div>
              </div>
            </div>

            {/* Autres matchs */}
            <div style={{ flex: 1, minWidth: 200, background: "#F0F7FF", borderRadius: 10, padding: "10px 14px", border: "2px solid #93C5FD" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#1E40AF", marginBottom: 6 }}>🔵 Autres matchs (aujourd'hui)</p>
              <div style={{ display: "flex", gap: 16 }}>
                <div>
                  <p style={{ fontSize: 10, color: "#888" }}>Parieurs</p>
                  <p style={{ fontSize: 20, fontWeight: 900, color: "#1D4ED8" }}>
                    {statsData.todayOther.uniqueUsers}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: "#888" }}>Montant total</p>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "#1D4ED8" }}>
                    {fmtAmount(statsData.todayOther.totalAmount)}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: "#888" }}>Mises</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "#1D4ED8" }}>
                    {statsData.todayOther.betCount}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* All-time summary */}
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, color: "#6B7280", background: "#fff", borderRadius: 6, padding: "4px 10px", border: "1px solid #e5e7eb" }}>
              Total match du jour (tous temps) — {statsData.featuredSummary.uniqueUsers} utilisateurs · {fmtAmount(statsData.featuredSummary.totalAmount)}
            </div>
            <div style={{ fontSize: 11, color: "#6B7280", background: "#fff", borderRadius: 6, padding: "4px 10px", border: "1px solid #e5e7eb" }}>
              Total autres matchs (tous temps) — {statsData.otherSummary.uniqueUsers} utilisateurs · {fmtAmount(statsData.otherSummary.totalAmount)}
            </div>
          </div>
        </div>
      )}

      {/* ── Search bar ──────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Rechercher équipe, ligue…"
          className="w-full pl-8 pr-8 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-blue-200"
          style={{ borderColor: "#D1D5DB" }}
        />
        {searchText && (
          <button
            onClick={() => setSearchText("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Filter size={14} style={{ color: "#6B7280", flexShrink: 0 }} />
        {STATUS_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            style={{
              padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
              cursor: "pointer", border: "1px solid",
              background: filterStatus === f.key ? "#1D4ED8" : "#fff",
              color:      filterStatus === f.key ? "#fff"    : "#374151",
              borderColor: filterStatus === f.key ? "#1D4ED8" : "#D1D5DB",
              transition: "all 0.15s",
            }}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => setFilterFeatured(v => !v)}
          style={{
            padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
            cursor: "pointer", border: "1px solid",
            background: filterFeatured ? "#D97706" : "#fff",
            color:      filterFeatured ? "#fff"    : "#374151",
            borderColor: filterFeatured ? "#D97706" : "#D1D5DB",
            display: "flex", alignItems: "center", gap: 4,
            transition: "all 0.15s",
          }}
        >
          <Star size={11} fill={filterFeatured ? "#fff" : "none"} />
          Match du jour uniquement
        </button>
      </div>

      {/* ── Match list ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Chargement…</p>
      ) : filteredList.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {matchList.length === 0 ? "Aucun match pour l'instant" : "Aucun match ne correspond aux filtres"}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredList.map(m => {
            const badge    = sb(m);
            const isPending = m.status !== "finished" && m.status !== "cancelled";
            const stat     = statsData?.matchStats[m.id];

            return (
              <Card key={m.id} className={!m.isActive ? "opacity-50" : ""}>
                <CardContent className="py-3 px-4">

                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-semibold text-sm">
                        {m.homeFlag} {m.homeTeam} <span className="text-muted-foreground">vs</span> {m.awayFlag} {m.awayTeam}
                      </p>
                      {m.league && <p className="text-xs text-muted-foreground">{m.league}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {m.isFeatured && (
                        <Badge style={{ background: "#FDE68A", color: "#92400E", border: "1px solid #FCD34D" }}>
                          ⭐ Match du jour
                        </Badge>
                      )}
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                  </div>

                  {/* Live score badge */}
                  {m.liveScore && m.status === "live" && (
                    <div className="inline-flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full mt-1">
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse inline-block" />
                      {m.liveScore}
                    </div>
                  )}

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 text-xs text-muted-foreground">
                    <span>📅 {fmtDate(m.matchDate)}</span>
                    <span>🎯 Score prédit : <strong className="text-foreground">{m.predictedScore}</strong></span>
                    <span>💰 Profit : <strong className="text-foreground">{m.profitRate}%</strong></span>
                    <span>🎰 Mise : {m.minBet.toLocaleString()}–{m.maxBet.toLocaleString()} F</span>
                    {m.externalId && <span className="col-span-2 text-[10px] opacity-50">🔗 API-ID: {m.externalId}</span>}
                    {m.realScore && (
                      <span className="col-span-2">
                        ⚽ Score réel : <strong className="text-foreground">{m.realScore}</strong>
                        {" — "}
                        {m.result === "won"      ? "✅ Utilisateurs gagnent"
                        : m.result === "refunded" ? "🔄 Remboursés (match du jour)"
                        : "❌ Perdus"}
                      </span>
                    )}
                  </div>

                  {/* ── Betting stats for this match ───────────────────────── */}
                  {stat && (stat.betCount > 0) && (
                    <div style={{
                      marginTop: 10,
                      display: "flex", gap: 8, flexWrap: "wrap",
                      background: m.isFeatured ? "#FFFBEB" : "#F0F7FF",
                      borderRadius: 8, padding: "8px 12px",
                      border: `1px solid ${m.isFeatured ? "#FDE68A" : "#BFDBFE"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Users size={12} style={{ color: "#6B7280" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>
                          {stat.uniqueUsers}
                        </span>
                        <span style={{ fontSize: 11, color: "#6B7280" }}>parieurs</span>
                      </div>
                      <span style={{ color: "#D1D5DB" }}>|</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <TrendingUp size={12} style={{ color: "#6B7280" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>
                          {fmtAmount(stat.totalAmount)}
                        </span>
                        <span style={{ fontSize: 11, color: "#6B7280" }}>misé</span>
                      </div>
                      <span style={{ color: "#D1D5DB" }}>|</span>
                      <span style={{ fontSize: 11, color: "#6B7280" }}>
                        {stat.betCount} mise{stat.betCount > 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                  {stat && stat.betCount === 0 && (
                    <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>Aucun pari sur ce match</p>
                  )}

                  {/* ── Action buttons ─────────────────────────────────────── */}
                  <div className="flex flex-wrap gap-2 mt-3">

                    {/* Match du jour toggle */}
                    {m.status !== "finished" && m.isActive && (
                      <Button
                        size="sm" variant="outline"
                        className={m.isFeatured ? "text-yellow-600 border-yellow-400 bg-yellow-50" : "text-gray-500"}
                        onClick={() => statusMutation.mutate({ id: m.id, status: m.status, isFeatured: !m.isFeatured })}
                      >
                        {m.isFeatured ? <StarOff className="w-3 h-3 mr-1" /> : <Star className="w-3 h-3 mr-1" />}
                        {m.isFeatured ? "Retirer du jour" : "Match du jour"}
                      </Button>
                    )}

                    {/* Edit */}
                    {m.status !== "finished" && (
                      <Button size="sm" variant="outline" onClick={() => openEdit(m)}>
                        <Pencil className="w-3 h-3 mr-1" /> Modifier
                      </Button>
                    )}

                    {/* Set Live */}
                    {m.status === "upcoming" && m.isActive && (
                      <Button size="sm" variant="outline" className="text-blue-600 border-blue-300"
                        onClick={() => statusMutation.mutate({ id: m.id, status: "live" })}>
                        <Radio className="w-3 h-3 mr-1" /> En direct
                      </Button>
                    )}

                    {/* Settle */}
                    {(m.status === "upcoming" || m.status === "live") && m.isActive && (
                      <Button size="sm" variant="outline" className="text-green-600 border-green-300"
                        onClick={() => openSettle(m.id)} data-testid={`button-settle-${m.id}`}>
                        <CheckCircle className="w-3 h-3 mr-1" /> Résoudre
                      </Button>
                    )}

                    {/* Cancel */}
                    {m.status !== "finished" && m.isActive && (
                      <Button size="sm" variant="outline" className="text-orange-600 border-orange-300"
                        onClick={() => statusMutation.mutate({ id: m.id, status: "cancelled" })}>
                        <Ban className="w-3 h-3 mr-1" /> Annuler
                      </Button>
                    )}

                    {/* Deactivate */}
                    {m.isActive && (
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/30"
                        onClick={() => { if (confirm("Désactiver ce match ?")) deleteMutation.mutate(m.id); }}>
                        <Trash2 className="w-3 h-3 mr-1" /> Désactiver
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={v => !v && closeForm()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier le match" : "Nouveau match"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Équipe domicile *</Label>
                <Input value={form.homeTeam} onChange={e => set("homeTeam", e.target.value)} placeholder="Paris Saint-Germain" />
              </div>
              <div>
                <Label>Équipe extérieur *</Label>
                <Input value={form.awayTeam} onChange={e => set("awayTeam", e.target.value)} placeholder="Real Madrid" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Drapeau domicile</Label>
                <Input value={form.homeFlag} onChange={e => set("homeFlag", e.target.value)} placeholder="🇫🇷" />
              </div>
              <div>
                <Label>Drapeau extérieur</Label>
                <Input value={form.awayFlag} onChange={e => set("awayFlag", e.target.value)} placeholder="🇪🇸" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Score prédit * (ex: 2-1)</Label>
                <Input value={form.predictedScore} onChange={e => set("predictedScore", e.target.value)} placeholder="2-1" />
              </div>
              <div>
                <Label>Taux de profit (%) *</Label>
                <Input type="number" value={form.profitRate} onChange={e => set("profitRate", e.target.value)} placeholder="7.5" />
              </div>
            </div>

            <div>
              <Label>Date et heure du match *</Label>
              <Input type="datetime-local" value={form.matchDate} onChange={e => set("matchDate", e.target.value)} />
            </div>

            <div>
              <Label>Ligue / Compétition</Label>
              <Input value={form.league} onChange={e => set("league", e.target.value)} placeholder="France: Ligue 1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mise minimum (F)</Label>
                <Input type="number" value={form.minBet} onChange={e => set("minBet", e.target.value)} />
              </div>
              <div>
                <Label>Mise maximum (F)</Label>
                <Input type="number" value={form.maxBet} onChange={e => set("maxBet", e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Statut</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">À venir</SelectItem>
                  <SelectItem value="live">En direct</SelectItem>
                  <SelectItem value="cancelled">Annulé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !form.homeTeam || !form.awayTeam || !form.predictedScore || !form.matchDate}
            >
              {saveMutation.isPending ? "Enregistrement…" : editingId ? "Mettre à jour" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Settle Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={settleOpen} onOpenChange={v => !v && (setSettleOpen(false), setRealScore(""), setSettleId(null))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Résoudre le match</DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              <strong>Paris renversé :</strong><br/>
              • Score réel <strong>≠</strong> score prédit → les utilisateurs <strong className="text-green-600">GAGNENT</strong> (mise + profit)<br/>
              • Score réel <strong>=</strong> score prédit + <em>match du jour</em> → <strong className="text-blue-600">REMBOURSEMENT</strong> (mise seule)<br/>
              • Score réel <strong>=</strong> score prédit + match ordinaire → les utilisateurs <strong className="text-red-600">PERDENT</strong> (sans remboursement)
            </p>
            <div>
              <Label>Score réel * (ex: 2-1)</Label>
              <Input
                value={realScore}
                onChange={e => setRealScore(e.target.value)}
                placeholder="2-1"
                data-testid="input-real-score"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setSettleOpen(false); setRealScore(""); setSettleId(null); }}>
              Annuler
            </Button>
            <Button
              onClick={() => settleMutation.mutate()}
              disabled={settleMutation.isPending || !realScore.trim()}
              data-testid="button-confirm-settle"
            >
              {settleMutation.isPending ? "Traitement…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
