import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { getCountryByCode } from "@/lib/countries";
import { Home, User, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState as useLocalState } from "react";

interface BetWithMatch {
  bet: {
    id: number;
    matchId: number;
    amount: string;
    status: string;
    profit: string | null;
    placedAt: string;
    settledAt: string | null;
    chosenScore?: string;
  };
  match: {
    homeTeam: string;
    awayTeam: string;
    homeFlag: string;
    awayFlag: string;
    predictedScore: string;
    profitRate: string;
    matchDate: string;
    status: string;
    realScore: string | null;
    result: string | null;
    league: string;
  } | null;
}

const GREEN   = "#15803d";
const TEAL    = "#00897b";

function maskName(name: string) {
  if (!name) return "Us*****";
  const parts = name.split("_");
  const n = parts[parts.length - 1] || name;
  if (n.length <= 4) return n.slice(0, 2) + "*".repeat(Math.max(2, n.length - 2));
  return n.slice(0, 2) + "*".repeat(n.length - 4) + n.slice(-2);
}

function fmtAmount(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${y}-${mo}-${day} ${hh}:${mm}:${ss}`;
  } catch { return iso; }
}

function fmtMatchDate(iso: string) {
  try {
    const d = new Date(iso);
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${mo}-${day} ${hh}:${mm}`;
  } catch { return iso; }
}

/** Generate a long commercial ID from bet id + timestamp */
function commercialId(betId: number, placedAt: string) {
  const ts = new Date(placedAt).getTime();
  return `0${betId}${ts}${betId * 31 + 7}`.slice(0, 22).padEnd(22, "0");
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

export default function BilletPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useLocalState<number | null>(null);

  const country  = getCountryByCode(user?.country || "");
  const currency = country?.currency || "XOF";
  const balance  = parseFloat((user as any)?.balance || "0");
  const masked   = maskName((user as any)?.fullName || "");

  const { data: bets = [], isLoading } = useQuery<BetWithMatch[]>({ queryKey: ["/api/bets"] });

  const copyId = (id: string, betId: number) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id).catch(() => {});
    } else {
      const el = document.createElement("textarea");
      el.value = id;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedId(betId);
    toast({ title: "Identifiant copié", description: "Transmettez-le à l'administrateur pour demander une annulation." });
    setTimeout(() => setCopiedId(null), 2500);
  };

  /* Stats */
  const totalVolume = bets.reduce((s, { bet }) => s + parseFloat(bet.amount), 0);
  const totalGain   = bets.reduce((s, { bet, match: m }) => {
    if (bet.status === "won" && bet.profit) return s + parseFloat(bet.profit);
    if (bet.status === "pending" && m) return s + parseFloat(bet.amount) * parseFloat(m.profitRate) / 100;
    return s;
  }, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", flexDirection: "column" }}>

      {/* ── Green top header ── */}
      <div style={{
        background: GREEN, padding: "10px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <button onClick={() => navigate("/")}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <Home size={22} color="white" />
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {/* User badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: "4px 10px",
          }}>
            <User size={14} color="white" />
            <span style={{ color: "white", fontSize: 12, fontWeight: 600 }}>{masked}</span>
          </div>
          {/* Balance badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: "4px 10px",
          }}>
            <span style={{ color: "white", fontSize: 10, fontWeight: 700 }}>{currency}</span>
            <span style={{ color: "white", fontSize: 12, fontWeight: 600 }}>
              {fmtAmount(balance)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Liste des transactions header ── */}
      <div style={{
        background: "#f0f0f0", padding: "8px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid #e0e0e0",
      }}>
        <span style={{ color: TEAL, fontSize: 14, fontWeight: 700 }}>Liste des transactions</span>
        <span style={{ color: TEAL, fontSize: 13, fontWeight: 600 }}>Plus</span>
      </div>

      {/* ── Stats row ── */}
      <div style={{
        background: "#f5e6c8",
        display: "grid", gridTemplateColumns: "1fr 1fr",
        padding: "10px 16px", gap: 0,
        borderBottom: "1px solid #e8d5a8",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>Volume</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEAL }}>
            {currency} {fmtAmount(totalVolume)}
          </div>
        </div>
        <div style={{ borderLeft: "1px solid #e0c89a", paddingLeft: 16 }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>Gagner</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>
            {fmtAmount(totalGain)}
          </div>
        </div>
      </div>

      {/* ── Bet list ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 80px" }}>

        {isLoading && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#aaa" }}>
            Chargement...
          </div>
        )}

        {!isLoading && bets.length === 0 && (
          <div style={{
            textAlign: "center", padding: "32px 16px",
            background: "white", borderRadius: 12,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          }}>
            <img src="/empty.png" alt="Vide" style={{ width: 160, height: "auto", opacity: 0.85 }} />
            <p style={{ fontWeight: 700, color: "#555", marginBottom: 2 }}>Aucun billet</p>
            <p style={{ fontSize: 12, color: "#aaa" }}>Placez votre premier pari sur la page Matchs</p>
          </div>
        )}

        {bets.map(({ bet, match: m }) => {
          const amount  = parseFloat(bet.amount);
          const profit  = bet.profit ? parseFloat(bet.profit)
            : m ? amount * parseFloat(m.profitRate) / 100 : 0;
          const cid     = commercialId(bet.id, bet.placedAt);
          const isPending = bet.status === "pending";
          const score   = (bet as any).chosenScore || m?.predictedScore || "?-?";

          return (
            <div key={bet.id} style={{ marginBottom: 16 }}>

              {/* ── Ticket card ── */}
              <div style={{
                background: "white",
                borderRadius: 10,
                overflow: "visible",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                position: "relative",
              }}>
                {/* League ribbon */}
                <div style={{
                  background: GREEN,
                  padding: "7px 20px",
                  textAlign: "center",
                  borderRadius: "10px 10px 0 0",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  {/* diagonal stripe decorations */}
                  <div style={{
                    position: "absolute", top: 0, left: -10, width: 20, height: "100%",
                    background: "rgba(255,255,255,0.1)", transform: "skewX(-20deg)",
                  }} />
                  <div style={{
                    position: "absolute", top: 0, right: -10, width: 20, height: "100%",
                    background: "rgba(255,255,255,0.1)", transform: "skewX(-20deg)",
                  }} />
                  <span style={{ color: "white", fontWeight: 700, fontSize: 14, position: "relative" }}>
                    {m?.league || "—"}
                  </span>
                </div>

                <div style={{ padding: "12px 14px" }}>
                  {/* Match date */}
                  {m && (
                    <div style={{ textAlign: "center", fontSize: 12, color: "#888", marginBottom: 8 }}>
                      {fmtMatchDate(m.matchDate)}
                    </div>
                  )}

                  {/* Teams row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#222", maxWidth: "35%" }}>
                      {truncate(m?.homeTeam || "—", 8)}
                    </span>
                    <span style={{ fontWeight: 900, fontSize: 14, color: "#333", letterSpacing: 1 }}>CONTRE</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#222", maxWidth: "35%", textAlign: "right" }}>
                      {truncate(m?.awayTeam || "—", 8)}
                    </span>
                  </div>

                  {/* Score line */}
                  {m && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6,
                      marginTop: 8, flexWrap: "wrap",
                    }}>
                      <span style={{ fontSize: 12, color: "#888" }}>Score</span>
                      <span style={{ fontSize: 12, color: "#1565c0", fontWeight: 700 }}>
                        [{score}]
                      </span>
                      <span style={{ fontSize: 12, color: "#e53935", fontWeight: 600 }}>
                        @ {m.profitRate} %
                      </span>
                      <span style={{ fontSize: 12, color: "#e53935" }}>
                        VIP + 0,02 %
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Details block ── */}
              <div style={{
                background: "white", marginTop: 2,
                padding: "10px 14px 12px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                borderRadius: "0 0 10px 10px",
              }}>

                {/* Identifiant commercial */}
                <div style={{ paddingBottom: 10, borderBottom: "1px solid #f0f0f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 11, color: "#888", lineHeight: 1.4, flexShrink: 0 }}>
                      Identifiant<br />commercial
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end", minWidth: 0 }}>
                      <span style={{
                        fontSize: 11, color: "#333", fontFamily: "monospace",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        maxWidth: "62%",
                      }}>
                        {cid}
                      </span>
                      <button
                        onClick={() => copyId(cid, bet.id)}
                        title="Copier l'identifiant"
                        style={{
                          background: copiedId === bet.id ? "#43a047" : "#1565C0",
                          color: "white", border: "none", borderRadius: 4,
                          padding: "4px 9px", fontSize: 11,
                          display: "flex", alignItems: "center", gap: 3,
                          cursor: "pointer", flexShrink: 0, transition: "background 0.2s",
                        }}
                      >
                        {copiedId === bet.id
                          ? <><Check size={11} /> Copié</>
                          : <><Copy size={11} /> Copier</>
                        }
                      </button>
                    </div>
                  </div>
                  {isPending && (
                    <p style={{
                      fontSize: 10, color: "#888", marginTop: 5, marginBottom: 0,
                      lineHeight: 1.4,
                    }}>
                      Pour demander une annulation, transmettez cet identifiant à l'administrateur.
                    </p>
                  )}
                </div>

                {/* Temps de négociation */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  paddingTop: 8, paddingBottom: 8, borderBottom: "1px solid #f0f0f0",
                }}>
                  <div style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>
                    Temps de<br />négociation
                  </div>
                  <span style={{ fontSize: 12, color: "#333" }}>
                    {fmtDate(bet.placedAt)}
                  </span>
                </div>

                {/* Montant */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  paddingTop: 8, paddingBottom: 6, borderBottom: "1px solid #f0f0f0",
                }}>
                  <span style={{ fontSize: 13, color: TEAL, fontWeight: 700 }}>Montant</span>
                  <span style={{ fontSize: 14, color: "#222", fontWeight: 600 }}>
                    {fmtAmount(amount)}
                  </span>
                </div>

                {/* Gagner */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  paddingTop: 8,
                }}>
                  <span style={{ fontSize: 13, color: GREEN, fontWeight: 700 }}>Gagner</span>
                  <span style={{ fontSize: 14, color: "#222", fontWeight: 600 }}>
                    {fmtAmount(profit)}
                  </span>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
