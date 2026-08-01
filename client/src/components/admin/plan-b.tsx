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
import { Search, UserPlus, UserMinus, Crown, Shield, Lock, Unlock } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────────── */
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

  /* ── Search ── */
  const [searchQ,    setSearchQ]    = useState("");
  const [searchDone, setSearchDone] = useState(false);

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
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Crown size={22} color="#D97706" />
        <div>
          <h2 className="text-lg font-bold">Liste Plan B — Accès exclusif</h2>
          <p className="text-xs text-muted-foreground">
            Les membres de cette liste peuvent parier sur les matchs marqués « VIP ». En cas de perte sur ces matchs, aucun remboursement.
          </p>
        </div>
      </div>

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

          {matchesLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : planBMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun match actif</p>
          ) : (
            <div className="space-y-2">
              {planBMatches.map(m => {
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
