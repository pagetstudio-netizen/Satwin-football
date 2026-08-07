/**
 * AdminPlanB — Gestion de la liste exclusive "Plan B"
 * - Recherche et ajout d'utilisateurs
 * - Assignation de matchs réservés aux membres Plan B
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Search, UserPlus, UserMinus, Crown, Shield, Lock, Unlock, X, ScanSearch, Zap, Wallet, CheckCheck, Trash2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface AnalysisCandidate {
  id: number;
  full_name: string;
  phone: string;
  country: string;
  balance: string;
  referral_code: string;
  has_deposited: boolean;
  has_active_product: boolean;
  team_count: number;
}

interface AnalysisResult {
  threshold: number;
  candidates: AnalysisCandidate[];
}

interface PlanBMember {
  id: number;
  user_id: number;
  added_at: string;
  full_name: string;
  phone: string;
  country: string;
  balance: string;
  referral_code: string;
}

interface SearchUser {
  id: number;
  fullName: string;
  phone: string;
  country: string;
  balance: string;
  referralCode: string;
}

interface AdminMatch {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  status: string;
  matchDate: string;
  league: string;
  isVipOnly: boolean;
  isFeatured: boolean;
  predictedScore: string;
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_COLOR: Record<string, string> = {
  upcoming: "#6B7280",
  live:     "#DC2626",
  finished: "#9CA3AF",
  cancelled: "#F97316",
};

/* ══════════════════════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function AdminPlanB() {
  const { toast } = useToast();

  /* ── Search (users) ── */
  const [searchQ,    setSearchQ]    = useState("");
  const [searchDone, setSearchDone] = useState(false);

  /* ── Search (matches) ── */
  const [matchSearch, setMatchSearch] = useState("");

  /* ── Vider la liste ── */
  const [showClearAll, setShowClearAll] = useState(false);

  /* ── Analyse Plan B ── */
  const [showAnalyse,    setShowAnalyse]    = useState(false);
  const [threshold,      setThreshold]      = useState("20000");
  const [analyseResult,  setAnalyseResult]  = useState<AnalysisResult | null>(null);
  const [analyseLoading, setAnalyseLoading] = useState(false);
  const [selectedIds,    setSelectedIds]    = useState<Set<number>>(new Set());

  /* ── Data ── */
  const { data: members = [], isLoading: membersLoading } = useQuery<PlanBMember[]>({
    queryKey: ["/api/admin/plan-b/users"],
  });

  const { data: searchResults, isFetching: searching, refetch: runSearch } = useQuery<{ users: SearchUser[] }>({
    queryKey: ["/api/admin/users", { search: searchQ }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchQ)}&limit=20`, {
        credentials: "include",
      });
      return res.json();
    },
    enabled: false,
  });

  const { data: planBMatches = [], isLoading: matchesLoading } = useQuery<AdminMatch[]>({
    queryKey: ["/api/admin/plan-b/matches"],
  });

  /* ── Vider toute la liste Plan B ── */
  const clearAllMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/admin/plan-b/users");
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plan-b/users"] });
      setShowClearAll(false);
      toast({ title: `🗑️ Liste Plan B vidée — ${data.removed} membre(s) supprimé(s)` });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  /* ── Analyse: lancer le scan ── */
  const runAnalyse = async () => {
    setAnalyseLoading(true);
    setAnalyseResult(null);
    setSelectedIds(new Set());
    try {
      const res = await fetch(`/api/admin/plan-b/analyse?threshold=${encodeURIComponent(threshold)}`, { credentials: "include" });
      let data: any;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok || !data || !Array.isArray(data.candidates)) {
        const msg = data?.message || `Erreur serveur (${res.status})`;
        toast({ title: "Erreur", description: msg, variant: "destructive" });
        return;
      }
      setAnalyseResult(data as AnalysisResult);
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message || "Impossible de contacter le serveur", variant: "destructive" });
    } finally {
      setAnalyseLoading(false);
    }
  };

  const bulkAddMut = useMutation({
    mutationFn: async (userIds: number[]) => {
      const res = await apiRequest("POST", "/api/admin/plan-b/bulk-add", { userIds });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plan-b/users"] });
      toast({ title: `✅ ${data.added} compte(s) autorisé(s) au Plan B !` });
      // Retirer les IDs ajoutés de la liste candidates
      if (analyseResult) {
        const addedSet = new Set(Array.from(selectedIds));
        setAnalyseResult(prev => prev ? {
          ...prev,
          candidates: prev.candidates.filter(c => !addedSet.has(c.id)),
        } : null);
      }
      setSelectedIds(new Set());
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (!analyseResult) return;
    if (selectedIds.size === analyseResult.candidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(analyseResult.candidates.map(c => c.id)));
    }
  };

  /* ── Mutations ── */
  const addMut = useMutation({
    mutationFn: (userId: number) => apiRequest("POST", "/api/admin/plan-b/users", { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plan-b/users"] });
      toast({ title: "Utilisateur ajouté au Plan B ✓" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const removeMut = useMutation({
    mutationFn: (userId: number) => apiRequest("DELETE", `/api/admin/plan-b/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plan-b/users"] });
      toast({ title: "Utilisateur retiré du Plan B" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const toggleMatchMut = useMutation({
    mutationFn: (matchId: number) => apiRequest("POST", `/api/admin/plan-b/matches/${matchId}/toggle-vip`),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plan-b/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/matches"] });
      toast({ title: "Statut VIP du match mis à jour" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  /* ── Helpers ── */
  const memberIds = new Set(members.map(m => m.user_id));

  const filteredMatches = planBMatches.filter(m => {
    if (!matchSearch.trim()) return true;
    const q = matchSearch.toLowerCase();
    return `${m.homeTeam} ${m.awayTeam} ${m.league || ""}`.toLowerCase().includes(q);
  });

  const handleSearch = () => {
    if (!searchQ.trim()) return;
    setSearchDone(true);
    runSearch();
  };

  /* ─────────────────────────────────────────────────────────────────────────
     RENDER
  ────────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Crown size={22} color="#D97706" />
          <div>
            <h2 className="text-lg font-bold">Liste Plan B — Accès exclusif</h2>
            <p className="text-xs text-muted-foreground">
              Les membres de cette liste peuvent parier sur les matchs marqués « VIP ». En cas de perte sur ces matchs, aucun remboursement.
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={() => setShowClearAll(true)}
            disabled={members.length === 0}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Vider la liste
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => { setShowAnalyse(true); runAnalyse(); }}
          >
            <ScanSearch className="w-4 h-4 mr-1" />
            Analyse Plan B
          </Button>
        </div>
      </div>

      {/* ── Règle Plan B ── */}
      <div style={{ borderRadius: 12, background: "#FFF8E8", border: "2px solid #FCD34D", padding: "12px 16px" }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <Shield size={14} color="#D97706" /> Règle Plan B — Comment le remboursement fonctionne
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ background: "#D97706", color: "white", borderRadius: 4, padding: "2px 8px", fontWeight: 700, flexShrink: 0 }}>👑 Plan B</span>
            <span style={{ color: "#78350F" }}>Si un match VIP est <strong>perdu</strong> (score = prédit) → le membre Plan B est <strong>remboursé</strong> automatiquement.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ background: "#6B7280", color: "white", borderRadius: 4, padding: "2px 8px", fontWeight: 700, flexShrink: 0 }}>👤 Standard</span>
            <span style={{ color: "#78350F" }}>Si un match VIP est <strong>perdu</strong> par un utilisateur non-Plan B → <strong>aucun remboursement</strong>.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ background: "#16A34A", color: "white", borderRadius: 4, padding: "2px 8px", fontWeight: 700, flexShrink: 0 }}>✅ Gagné</span>
            <span style={{ color: "#78350F" }}>Score réel ≠ score prédit → <strong>tous les parieurs gagnent</strong> (Plan B ou non).</span>
          </div>
        </div>
      </div>

      {/* ── Dialog confirmation — Vider la liste ── */}
      <Dialog open={showClearAll} onOpenChange={setShowClearAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Vider la liste Plan B
            </DialogTitle>
            <DialogDescription>
              Cette action retirera <strong>tous les {members.length} membres</strong> de la liste Plan B. 
              Ils ne seront plus remboursés sur les matchs VIP en cas de perte.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded-xl p-3">
            ⚠️ Action irréversible. Les paris déjà en cours sur des matchs VIP ne seront pas affectés 
            (le statut Plan B est vérifié au moment du règlement du match).
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowClearAll(false)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => clearAllMut.mutate()}
              disabled={clearAllMut.isPending}
            >
              {clearAllMut.isPending
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Suppression…</>
                : <><Trash2 className="w-4 h-4 mr-2" />Vider la liste ({members.length})</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════
          DIALOG — Analyse Plan B (solde > seuil)
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={showAnalyse} onOpenChange={setShowAnalyse}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanSearch className="w-5 h-5 text-blue-600" />
              Analyse Plan B — Comptes éligibles
            </DialogTitle>
          </DialogHeader>

          {/* Paramètre seuil */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
            <Wallet className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="text-xs text-blue-700 flex-shrink-0">Solde minimum :</span>
            <input
              type="number"
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              className="h-7 text-sm border rounded px-2 w-28 text-center"
              min="0"
              step="1000"
            />
            <span className="text-xs text-blue-700">F</span>
            <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={runAnalyse} disabled={analyseLoading}>
              {analyseLoading ? "…" : "Actualiser"}
            </Button>
          </div>

          {/* Résultats */}
          {analyseLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Analyse en cours…</p>
            </div>
          ) : analyseResult ? (
            analyseResult.candidates.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <ScanSearch className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Aucun compte avec plus de {parseFloat(threshold).toLocaleString("fr-FR")} F<br/>non encore membre Plan B.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Résumé + sélection */}
                <div className="flex items-center justify-between bg-blue-50 rounded-xl px-3 py-2">
                  <p className="text-sm font-semibold text-blue-800">
                    <span className="text-2xl font-black">{analyseResult.candidates.length}</span> compte(s) éligible(s)
                  </p>
                  <button
                    className="text-xs text-blue-600 underline"
                    onClick={toggleSelectAll}
                  >
                    {selectedIds.size === analyseResult.candidates.length ? "Tout désélectionner" : "Tout sélectionner"}
                  </button>
                </div>

                {/* Liste des candidats */}
                <div className="space-y-2">
                  {analyseResult.candidates.map(c => {
                    const sel = selectedIds.has(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => toggleSelect(c.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                          border: `2px solid ${sel ? "#2563EB" : "#E5E7EB"}`,
                          background: sel ? "#EFF6FF" : "#fff",
                          transition: "all 0.15s",
                        }}
                      >
                        {/* Checkbox visuel */}
                        <div style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                          border: `2px solid ${sel ? "#2563EB" : "#D1D5DB"}`,
                          background: sel ? "#2563EB" : "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {sel && <CheckCheck size={12} color="white" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 700, fontSize: 14, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                            {c.full_name}
                            {c.has_active_product && (
                              <span style={{ fontSize: 10, background: "#D1FAE5", color: "#065F46", borderRadius: 4, padding: "1px 5px" }}>✓ Produit</span>
                            )}
                          </p>
                          <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>
                            📱 {c.phone} · 🌍 {c.country}
                          </p>
                          <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
                            👥 {c.team_count} filleul(s) · 🔗 {c.referral_code}
                          </p>
                        </div>
                        {/* Solde */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <p style={{ fontWeight: 800, fontSize: 15, color: "#16A34A", margin: 0 }}>
                            {parseFloat(c.balance).toLocaleString("fr-FR")} F
                          </p>
                          <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>solde</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : null}

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowAnalyse(false)}>Fermer</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={selectedIds.size === 0 || bulkAddMut.isPending}
              onClick={() => bulkAddMut.mutate(Array.from(selectedIds))}
            >
              {bulkAddMut.isPending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Autoriser Plan B ({selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Stats summary ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 130, background: "#FFF8E8", borderRadius: 10, padding: "10px 14px", border: "2px solid #FCD34D" }}>
          <p style={{ fontSize: 11, color: "#92400E" }}>Membres Plan B</p>
          <p style={{ fontSize: 26, fontWeight: 900, color: "#D97706" }}>{members.length}</p>
        </div>
        <div style={{ flex: 1, minWidth: 130, background: "#F0FDF4", borderRadius: 10, padding: "10px 14px", border: "2px solid #86EFAC" }}>
          <p style={{ fontSize: 11, color: "#166534" }}>Matchs VIP actifs</p>
          <p style={{ fontSize: 26, fontWeight: 900, color: "#16A34A" }}>
            {planBMatches.filter(m => m.isVipOnly && m.status !== "finished" && m.status !== "cancelled").length}
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — Rechercher et ajouter des utilisateurs
      ══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="font-bold text-sm mb-3 flex items-center gap-2">
            <Search size={14} /> Rechercher un utilisateur
          </p>

          {/* Search bar */}
          <div className="flex gap-2 mb-4">
            <Input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Nom, téléphone, code parrainage..."
              onKeyDown={e => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={searching || !searchQ.trim()} size="sm">
              <Search className="w-4 h-4 mr-1" />
              {searching ? "…" : "Chercher"}
            </Button>
          </div>

          {/* Results */}
          {searchDone && searchResults && (
            <div className="space-y-2">
              {(searchResults.users || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun résultat</p>
              ) : (
                (searchResults.users || []).map(u => (
                  <div key={u.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb",
                    background: memberIds.has(u.id) ? "#FFFBEB" : "#fff",
                  }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>
                        {u.fullName}
                        {memberIds.has(u.id) && (
                          <Crown size={12} color="#D97706" style={{ display: "inline", marginLeft: 6 }} />
                        )}
                      </p>
                      <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
                        📱 {u.phone} · 🌍 {u.country} · 💰 {parseFloat(u.balance).toLocaleString("fr-FR")} F
                      </p>
                      <p style={{ fontSize: 11, color: "#aaa", margin: 0 }}>
                        🔗 {u.referralCode}
                      </p>
                    </div>
                    {memberIds.has(u.id) ? (
                      <Button
                        size="sm" variant="outline"
                        className="text-orange-600 border-orange-300"
                        onClick={() => removeMut.mutate(u.id)}
                        disabled={removeMut.isPending}
                      >
                        <UserMinus className="w-3 h-3 mr-1" /> Retirer
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        style={{ background: "#D97706", color: "white", border: "none" }}
                        onClick={() => addMut.mutate(u.id)}
                        disabled={addMut.isPending}
                      >
                        <UserPlus className="w-3 h-3 mr-1" /> Ajouter
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — Membres actuels du Plan B
      ══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="font-bold text-sm mb-3 flex items-center gap-2">
            <Crown size={14} color="#D97706" /> Membres Plan B ({members.length})
          </p>

          {membersLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aucun membre pour l'instant. Utilisez la recherche ci-dessus pour en ajouter.
            </p>
          ) : (
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 12px", borderRadius: 8,
                  background: "#FFFBEB", border: "1px solid #FDE68A",
                }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>
                      <Crown size={12} color="#D97706" style={{ display: "inline", marginRight: 5 }} />
                      {m.full_name}
                    </p>
                    <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
                      📱 {m.phone} · 🌍 {m.country} · 💰 {parseFloat(m.balance).toLocaleString("fr-FR")} F
                    </p>
                    <p style={{ fontSize: 11, color: "#aaa", margin: 0 }}>
                      Ajouté le {fmtDate(m.added_at)}
                    </p>
                  </div>
                  <Button
                    size="sm" variant="outline"
                    className="text-destructive border-destructive/30"
                    onClick={() => removeMut.mutate(m.user_id)}
                    disabled={removeMut.isPending}
                  >
                    <UserMinus className="w-3 h-3 mr-1" /> Retirer
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — Matchs VIP (assignation)
      ══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="font-bold text-sm mb-1 flex items-center gap-2">
            <Shield size={14} color="#1D4ED8" /> Matchs exclusifs Plan B
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Activez le verrou <Lock size={10} className="inline" /> sur un match pour le rendre accessible uniquement aux membres Plan B.
            En cas de perte sur ces matchs, <strong>aucun remboursement</strong> même si le match est « Match du jour ».
          </p>

          {/* Match search */}
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={matchSearch}
              onChange={e => setMatchSearch(e.target.value)}
              placeholder="Rechercher match, ligue…"
              className="w-full pl-8 pr-7 py-1.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-yellow-200"
              style={{ borderColor: "#D1D5DB" }}
            />
            {matchSearch && (
              <button onClick={() => setMatchSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>

          {matchesLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : planBMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun match actif</p>
          ) : filteredMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun match ne correspond à la recherche</p>
          ) : (
            <div className="space-y-2">
              {filteredMatches.map(m => {
                const isFinishedOrCancelled = m.status === "finished" || m.status === "cancelled";
                return (
                  <div key={m.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", borderRadius: 8, gap: 8,
                    border: `1px solid ${m.isVipOnly ? "#FCD34D" : "#e5e7eb"}`,
                    background: m.isVipOnly ? "#FFFBEB" : "#fff",
                    opacity: isFinishedOrCancelled ? 0.55 : 1,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>
                          {m.homeFlag} {m.homeTeam} <span style={{ color: "#888" }}>vs</span> {m.awayFlag} {m.awayTeam}
                        </span>
                        {m.isVipOnly && (
                          <Badge style={{ background: "#D97706", color: "white", fontSize: 10 }}>
                            <Crown size={9} style={{ marginRight: 3 }} />VIP
                          </Badge>
                        )}
                        {m.isFeatured && (
                          <Badge style={{ background: "#FDE68A", color: "#92400E", fontSize: 10 }}>⭐ Jour</Badge>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: "#888", margin: 0 }}>
                        📅 {fmtDate(m.matchDate)}
                        {m.league ? ` · ${m.league}` : ""}
                        &nbsp;·&nbsp;
                        <span style={{ color: STATUS_COLOR[m.status] || "#888", fontWeight: 600 }}>
                          {m.status === "upcoming" ? "À venir" : m.status === "live" ? "En direct" : m.status === "finished" ? "Terminé" : "Annulé"}
                        </span>
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isFinishedOrCancelled || toggleMatchMut.isPending}
                      onClick={() => toggleMatchMut.mutate(m.id)}
                      style={{
                        borderColor: m.isVipOnly ? "#D97706" : "#D1D5DB",
                        color:       m.isVipOnly ? "#D97706" : "#6B7280",
                        flexShrink:  0,
                      }}
                    >
                      {m.isVipOnly
                        ? <><Unlock className="w-3 h-3 mr-1" /> Déverrouiller</>
                        : <><Lock   className="w-3 h-3 mr-1" /> Verrouiller</>
                      }
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
