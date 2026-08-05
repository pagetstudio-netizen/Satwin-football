import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getCountryByCode } from "@/lib/countries";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChevronLeft, BarChart2, Settings } from "lucide-react";

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
  status: string;
  league: string;
  realScore?: string;
  result?: string;
  liveScore?: string | null;
  isVipOnly?: boolean;
  isFeatured?: boolean;
}

interface ScoreOption {
  score: string;
  chance: number;
  pool: number;
}

// Seeded pseudo-random number generator for consistent score options per match
function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateScoreOptions(match: Match): ScoreOption[] {
  const rand = seededRand(match.id * 7919 + 42);
  const scores = [
    "0-0","0-1","0-2","0-3","1-0","1-1","1-2","1-3",
    "2-0","2-1","2-2","2-3","3-0","3-1","3-2",
  ];
  // Shuffle deterministically and take 10
  const shuffled = [...scores].sort(() => rand() - 0.5);
  const chosen = shuffled.slice(0, 10);
  // Ensure predictedScore is included
  if (!chosen.includes(match.predictedScore)) {
    chosen[Math.floor(rand() * 10)] = match.predictedScore;
  }
  // Sort naturally
  chosen.sort((a, b) => {
    const [ah, aa] = a.split("-").map(Number);
    const [bh, ba] = b.split("-").map(Number);
    return ah !== bh ? ah - bh : aa - ba;
  });
  return chosen.map((score) => {
    const r1 = rand();
    const chance = parseFloat((1.5 + r1 * 10.5).toFixed(2));
    const pool = Math.floor((30 + rand() * 60) * 1e9);
    return { score, chance, pool };
  });
}

// Format CFA pool like screenshot
function formatPool(n: number) {
  return `CFA ${n.toLocaleString("fr-FR")}`;
}

// Format match date like "01-10 17:00"
function fmtDate(iso: string) {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm} ${hh}:${mi}`;
}

function Countdown({ matchDate }: { matchDate: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = new Date(matchDate).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("En cours"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(h > 0 ? `Fini dans ${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `Fini dans 0:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [matchDate]);
  return <span>{timeLeft}</span>;
}

// ─── SUCCESS MODAL ────────────────────────────────────────────────────────────
function SuccessModal({
  score, match, amount, gain, exchangeId, currency, onClose, onViewList
}: {
  score: string; match: Match; amount: number; gain: number;
  exchangeId: string; currency: string;
  onClose: () => void; onViewList: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="w-full max-w-lg bg-white rounded-t-3xl pb-6 pt-4 px-4">
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-4" />

        {/* Title */}
        <p className="text-center font-black text-lg mb-1" style={{ color: "#16a34a" }}>
          Succès de la transaction
        </p>

        {/* Score */}
        <p className="text-center font-black text-base text-gray-900 mb-1">
          Contre Score {score.replace("-", " - ")}
        </p>

        {/* League + Teams */}
        <p className="text-center text-sm text-gray-500 mb-0.5">[{match.league}]</p>
        <div className="flex justify-center items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-gray-800">{match.homeTeam}</span>
          <span className="text-sm font-bold text-gray-500 px-1">VS</span>
          <span className="text-sm font-semibold text-gray-800">{match.awayTeam}</span>
        </div>
        <p className="text-center text-xs text-gray-400 mb-3">{fmtDate(match.matchDate).replace(" ", " ").replace("-", "-")}</p>

        <div className="border-t border-gray-100 my-2" />

        {/* Details */}
        <div className="space-y-2 mt-2">
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-gray-500">Montant</span>
            <span className="text-sm font-semibold text-gray-900">{currency} {amount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-gray-500">Gain</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">{currency} {gain.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</span>
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none"><path d="M2 7h14M10 2l6 5-6 5" stroke="#E63946" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-gray-500">ID de l'échange</span>
            <span className="text-xs text-gray-700 font-medium">{exchangeId}</span>
          </div>
        </div>

        <div className="border-t border-gray-100 my-3" />

        {/* Buttons */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-lg font-semibold text-sm text-gray-600"
            style={{ background: "#f3f4f6" }}>
            Fermer
          </button>
          <button
            onClick={onViewList}
            className="flex-1 py-3 rounded-lg font-semibold text-sm text-white"
            style={{ background: "#3b82f6" }}>
            Vers la liste d'échange
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BET MODAL ────────────────────────────────────────────────────────────────
function BetModal({
  match, scoreOption, onClose,
  onSuccess,
}: {
  match: Match; scoreOption: ScoreOption;
  onClose: () => void;
  onSuccess: (amount: number, gain: number, exchangeId: string) => void;
}) {
  const { user, refreshUser } = useAuth() as any;
  const { toast } = useToast();
  const qc = useQueryClient();
  const country = getCountryByCode(user?.country || "");
  const currency = country?.currency || "CFA";
  const balance = parseFloat(user?.balance || "0");
  const [amount, setAmount] = useState("");
  const amountNum = parseFloat(amount) || 0;
  // Gain = amount × profitRate/100 (matches backend settlement exactly)
  const gain = amountNum > 0 ? amountNum * (parseFloat(match.profitRate) || scoreOption.chance) / 100 : 0;

  const betMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bets", { matchId: match.id, amount: amountNum });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/bets"] });
      if (refreshUser) refreshUser();
      const exchangeId = `No.${Date.now()}${data.id || Math.floor(Math.random() * 9999)}`;
      onSuccess(amountNum, gain, exchangeId);
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const quickAmounts = [3000, 5000, 10000];

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-3xl pb-6 pt-4 px-4"
        onClick={e => e.stopPropagation()}>

        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-3" />

        {/* "Tu es" label */}
        <p className="text-center text-xs text-gray-400 mb-1">Tu es</p>

        {/* Score title */}
        <p className="text-center font-black text-lg mb-1" style={{ color: "#16a34a" }}>
          Contre Score {scoreOption.score.replace("-", " - ")}
        </p>

        {/* League */}
        <p className="text-center text-xs text-gray-500 mb-0.5">[{match.league}]</p>

        {/* Teams */}
        <div className="flex justify-center items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-gray-800">{match.homeTeam}</span>
          <span className="text-sm font-bold text-gray-400 px-1">VS</span>
          <span className="text-sm font-semibold text-gray-800">{match.awayTeam}</span>
          <span className="text-xs text-gray-400">(Maison)</span>
        </div>

        {/* Date */}
        <p className="text-center text-xs text-gray-400 mb-3">{fmtDate(match.matchDate)}</p>

        <div className="border-t border-gray-100 mb-3" />

        {/* Headers */}
        <div className="flex justify-between text-xs text-gray-500 mb-1 px-1">
          <span>Montant</span>
          <span>CHANCE</span>
          <span>Gain</span>
        </div>

        {/* Input row */}
        <div className="flex items-center gap-2 mb-1">
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="Merci de rem..."
            className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-800 outline-none"
            style={{ minWidth: 0 }}
          />
          <div className="text-center text-xs text-gray-500 whitespace-nowrap px-1">
            <div style={{ color: "#16a34a" }}>× {scoreOption.chance.toFixed(2)}%</div>
            <div className="text-gray-400" style={{ fontSize: 10 }}>vip · 0.01%</div>
          </div>
          <div className="text-sm font-semibold text-gray-800 whitespace-nowrap">
            {currency} {gain > 0 ? gain.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : 0}
          </div>
        </div>

        {/* Fee note */}
        <p className="text-right text-xs text-gray-400 mb-3">(Frais de gestion-5%)</p>

        {/* Quick amounts */}
        <div className="flex gap-2 mb-3">
          {quickAmounts.map(v => (
            <button key={v} onClick={() => setAmount(v.toString())}
              className="flex-1 py-2 rounded-md text-sm font-semibold border transition-all"
              style={{
                background: amount === v.toString() ? "#e0f2fe" : "#f9fafb",
                borderColor: amount === v.toString() ? "#3b82f6" : "#e5e7eb",
                color: amount === v.toString() ? "#3b82f6" : "#374151",
              }}>
              +{v.toLocaleString("fr-FR")}
            </button>
          ))}
          <button onClick={() => setAmount(String(Math.floor(balance)))}
            className="px-3 py-2 rounded-md text-sm font-semibold border"
            style={{
              background: "#f9fafb", borderColor: "#e5e7eb", color: "#374151",
            }}>
            TOUT
          </button>
          <button className="w-9 h-9 flex items-center justify-center rounded-md border border-gray-200">
            <Settings size={15} color="#9ca3af" />
          </button>
        </div>

        {/* Balance */}
        <div className="flex items-center gap-1 mb-3">
          <span className="text-sm text-gray-500">Solde</span>
          <span className="text-sm font-bold text-gray-900 ml-1">
            {currency} {balance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="border-t border-gray-100 mb-3" />

        {/* Action buttons */}
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-lg font-semibold text-sm text-gray-600"
            style={{ background: "#f3f4f6" }}>
            Annuler
          </button>
          <button
            onClick={() => betMutation.mutate()}
            disabled={betMutation.isPending || amountNum <= 0}
            className="flex-1 py-3 rounded-lg font-semibold text-sm text-white"
            style={{
              background: betMutation.isPending || amountNum <= 0 ? "#93c5fd" : "#3b82f6"
            }}>
            {betMutation.isPending ? "Traitement..." : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MATCH DETAIL VIEW ────────────────────────────────────────────────────────
function MatchDetail({
  match, onBack, user,
}: {
  match: Match; onBack: () => void; user: any;
}) {
  const country = getCountryByCode(user?.country || "");
  const currency = country?.currency || "CFA";
  const balance = parseFloat(user?.balance || "0");
  const scoreOptions = useMemo(() => generateScoreOptions(match), [match.id]);
  const [selectedScore, setSelectedScore] = useState<ScoreOption | null>(null);
  const [successData, setSuccessData] = useState<{ amount: number; gain: number; exchangeId: string } | null>(null);
  const { data: userBets } = useQuery<any[]>({ queryKey: ["/api/bets"] });
  const alreadyBet = (userBets || []).some(b => b.bet?.matchId === match.id); // kept for "Misé" badge only

  const now = new Date();
  const fmtNow = () => {
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    return `${dd}-${mm} ${hh}:${mi}`;
  };

  const rawName = user?.fullName || "Utilisateur";
  const maskedName = rawName.length > 4
    ? rawName.slice(0, 2) + "**" + rawName.slice(-2)
    : rawName.slice(0, 2) + "**";
  const fmtBal = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2 });

  return (
    <div className="flex flex-col" style={{ background: "#f3f4f6", minHeight: "100vh" }}>
      {/* Top header bar */}
      <div style={{ background: "#15803d", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px" }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
          <ChevronLeft size={18} color="white" />
          <span style={{ color:"white", fontSize:13, fontWeight:500 }}>Détail du marché</span>
        </button>
        <div style={{ display:"flex", gap:8 }}>
          {/* Username pill */}
          <div style={{ background:"white", borderRadius:20, padding:"4px 10px", display:"flex", alignItems:"center", gap:4 }}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="6.5" r="3.5" stroke="#15803d" strokeWidth="2"/>
              <path d="M2.5 18c0-4.1 3.4-6.5 7.5-6.5s7.5 2.4 7.5 6.5" stroke="#15803d" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span style={{ color:"#111827", fontSize:11, fontWeight:700 }}>{maskedName}</span>
          </div>
          {/* Balance pill */}
          <div style={{ background:"white", borderRadius:20, padding:"4px 10px", display:"flex", alignItems:"center", gap:4 }}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <ellipse cx="10" cy="13.5" rx="6" ry="5" stroke="#15803d" strokeWidth="1.8"/>
              <path d="M7.5 8.5 C7.5 7 8 6 10 6 C12 6 12.5 7 12.5 8.5" stroke="#15803d" strokeWidth="1.8" fill="none"/>
              <path d="M8.2 6.2 C8.8 4.8 11.2 4.8 11.8 6.2" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <text x="10" y="15" textAnchor="middle" fontSize="4.5" fontWeight="bold" fill="#15803d" stroke="none" fontFamily="Arial,sans-serif">CFA</text>
            </svg>
            <span style={{ color:"#111827", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{fmtBal(balance)}</span>
          </div>
        </div>
      </div>

      {/* Green match info banner */}
      <div className="relative" style={{ background: "#15803d" }}>
        <div className="text-center py-3 pb-6">
          <p className="text-white font-bold text-sm">{match.league}</p>
          <p className="text-white/80 text-xs mt-0.5">
            {fmtDate(match.matchDate)} · <Countdown matchDate={match.matchDate} />
          </p>
          <div className="flex items-center justify-center gap-3 mt-2">
            <span className="text-white font-semibold text-sm">{match.homeTeam}</span>
            {match.status === "live" && match.liveScore ? (
              <span className="flex items-center gap-1 bg-red-600 text-white text-sm font-black px-3 py-0.5 rounded-full">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse inline-block" />
                {match.liveScore}
              </span>
            ) : (
              <span className="text-white font-black text-base px-2">VS</span>
            )}
            <span className="text-white font-semibold text-sm">{match.awayTeam}</span>
          </div>
        </div>
        {/* Curved bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-white" style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }} />
      </div>

      {/* White content area */}
      <div className="flex-1 bg-white px-4 pt-2 pb-4">
        {/* Section title */}
        <p className="text-center text-xs font-bold text-gray-500 tracking-widest my-3">À TEMPS PLEIN</p>

        {/* Score prédit + Taux de profit — uniquement pour les matchs du jour (isFeatured) */}
        {match.isFeatured && (
          <div className="rounded-xl mb-3 px-4 py-3 flex items-center justify-between"
            style={{ background: "linear-gradient(90deg,#14532d 0%,#15803d 100%)", boxShadow: "0 2px 8px #15803d33" }}>
            <div className="flex flex-col items-center flex-1">
              <span className="text-white/70 text-[10px] font-semibold tracking-widest uppercase mb-0.5">Score prédit</span>
              <span className="text-white font-black text-xl tracking-widest">{match.predictedScore}</span>
            </div>
            <div className="w-px h-10 bg-white/20 mx-2" />
            <div className="flex flex-col items-center flex-1">
              <span className="text-white/70 text-[10px] font-semibold tracking-widest uppercase mb-0.5">Taux de profit</span>
              <span className="text-white font-black text-xl">+{match.profitRate}%</span>
            </div>
          </div>
        )}

        {/* Update row */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">{fmtNow()} Mise à jour</span>
          <BarChart2 size={16} color="#9ca3af" />
        </div>

        <div className="border-t border-gray-100 mb-2" />

        {/* Table header */}
        <div className="grid grid-cols-3 gap-2 mb-2 px-1">
          <span className="text-xs font-semibold text-gray-500">Article</span>
          <span className="text-xs font-semibold text-gray-500 text-center">CHANCE</span>
          <span className="text-xs font-semibold text-gray-500 text-right">Quantité</span>
        </div>

        {/* Score rows */}
        <div className="space-y-0 divide-y divide-gray-50">
          {scoreOptions.map((opt) => (
            <div key={opt.score} className="grid grid-cols-3 gap-2 items-center py-2 px-1">
              <span className="text-sm font-medium text-gray-700">{opt.score}</span>
              <span className="text-sm text-center" style={{ color: "#15803d" }}>{opt.chance.toFixed(2)}%</span>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-gray-700">{formatPool(opt.pool)}</span>
                {alreadyBet && (
                  <span className="px-2 py-1 rounded text-xs font-bold text-green-700 bg-green-50">Misé</span>
                )}
                {(match.status === "upcoming" || match.status === "live") ? (
                  <button
                    onClick={() => setSelectedScore(opt)}
                    className="px-4 py-1 rounded text-xs font-bold text-white"
                    style={{ background: match.status === "live" ? "#dc2626" : "#15803d", minWidth: 52 }}>
                    {match.status === "live" ? "LIVE" : "PARI"}
                  </button>
                ) : (
                  <span className="px-2 py-1 rounded text-xs text-gray-400 bg-gray-100">Fermé</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bet modal */}
      {selectedScore && !successData && (
        <BetModal
          match={match}
          scoreOption={selectedScore}
          onClose={() => setSelectedScore(null)}
          onSuccess={(amount, gain, exchangeId) => {
            setSelectedScore(null);
            setSuccessData({ amount, gain, exchangeId });
          }}
        />
      )}

      {/* Success modal */}
      {successData && (
        <SuccessModal
          score={selectedScore?.score || match.predictedScore}
          match={match}
          amount={successData.amount}
          gain={successData.gain}
          exchangeId={successData.exchangeId}
          currency={currency}
          onClose={() => { setSuccessData(null); onBack(); }}
          onViewList={() => { setSuccessData(null); onBack(); }}
        />
      )}
    </div>
  );
}

// ─── MATCH LIST PAGE ──────────────────────────────────────────────────────────
export default function MatchPage() {
  const { user } = useAuth() as any;
  const [filter, setFilter] = useState<"all" | "today" | "tomorrow">("all");
  const [search, setSearch] = useState("");
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const { data: matches, isLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const country = getCountryByCode(user?.country || "");
  const currency = country?.currency || "CFA";
  const balance = parseFloat(user?.balance || "0");

  const rawNameList = user?.fullName || "Utilisateur";
  const maskedName = rawNameList.length > 4
    ? rawNameList.slice(0, 2) + "**" + rawNameList.slice(-2)
    : rawNameList.slice(0, 2) + "**";
  const fmtBal2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2 });

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  // Only show active (upcoming/live) matches — never show finished or cancelled results here
  const allMatches = (matches || []).filter(m => m.status === "upcoming" || m.status === "live");

  const todayMatches = allMatches.filter(m => isSameDay(new Date(m.matchDate), today));
  const tomorrowMatches = allMatches.filter(m => isSameDay(new Date(m.matchDate), tomorrow));

  const filtered = allMatches.filter(m => {
    if (filter === "today" && !isSameDay(new Date(m.matchDate), today)) return false;
    if (filter === "tomorrow" && !isSameDay(new Date(m.matchDate), tomorrow)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return m.homeTeam.toLowerCase().includes(q) || m.awayTeam.toLowerCase().includes(q) || m.league.toLowerCase().includes(q);
    }
    return true;
  });

  // Group by league
  const groups: Record<string, Match[]> = {};
  filtered.forEach(m => {
    const key = m.league || "Football";
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });

  if (selectedMatch) {
    return <MatchDetail match={selectedMatch} onBack={() => setSelectedMatch(null)} user={user} />;
  }

  return (
    <div className="flex flex-col" style={{ background: "#f3f4f6", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ background:"#15803d", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <ChevronLeft size={18} color="white" />
          <span style={{ color:"white", fontSize:13, fontWeight:500 }}>Liste des événements</span>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {/* Username pill */}
          <div style={{ background:"white", borderRadius:20, padding:"4px 10px", display:"flex", alignItems:"center", gap:4 }}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="6.5" r="3.5" stroke="#15803d" strokeWidth="2"/>
              <path d="M2.5 18c0-4.1 3.4-6.5 7.5-6.5s7.5 2.4 7.5 6.5" stroke="#15803d" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span style={{ color:"#111827", fontSize:11, fontWeight:700 }}>{maskedName}</span>
          </div>
          {/* Balance pill */}
          <div style={{ background:"white", borderRadius:20, padding:"4px 10px", display:"flex", alignItems:"center", gap:4 }}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <ellipse cx="10" cy="13.5" rx="6" ry="5" stroke="#15803d" strokeWidth="1.8"/>
              <path d="M7.5 8.5 C7.5 7 8 6 10 6 C12 6 12.5 7 12.5 8.5" stroke="#15803d" strokeWidth="1.8" fill="none"/>
              <path d="M8.2 6.2 C8.8 4.8 11.2 4.8 11.8 6.2" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <text x="10" y="15" textAnchor="middle" fontSize="4.5" fontWeight="bold" fill="#15803d" stroke="none" fontFamily="Arial,sans-serif">CFA</text>
            </svg>
            <span style={{ color:"#111827", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{fmtBal2(balance)}</span>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {[
          { key: "all",      label: `TOUT${allMatches.length}` },
          { key: "today",    label: `AUJOURD'HUI${todayMatches.length}` },
          { key: "tomorrow", label: `DEMAIN${tomorrowMatches.length}` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key as any)}
            className="flex-1 py-2.5 text-xs font-bold transition-all relative"
            style={{ color: filter === key ? "#15803d" : "#6b7280" }}>
            {label}
            {filter === key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ background: "#15803d" }} />
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-3 py-2 bg-white border-b border-gray-100">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Veuillez entrer l'événement que vous recherchez"
          className="w-full text-xs text-gray-500 py-1.5 outline-none"
          style={{ background: "transparent" }}
        />
      </div>

      {/* Match list */}
      <div className="flex-1 overflow-auto px-2 pt-2 pb-4 space-y-2">
        {isLoading && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">Chargement des matchs...</p>
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-8 bg-white rounded-xl mx-1 flex flex-col items-center gap-2">
            <img src="/empty.png" alt="Vide" className="w-40 h-auto opacity-85" />
            <p className="text-gray-500 text-sm font-medium">Aucun match disponible</p>
          </div>
        )}

        {Object.entries(groups).map(([league, leagueMatches]) => (
          <div key={league} className="space-y-2">
            {leagueMatches.map(match => (
              <div key={match.id}
                className="bg-white rounded-lg overflow-hidden shadow-sm"
                onClick={() => setSelectedMatch(match)}
                style={{ cursor: "pointer" }}>
                {/* League banner */}
                <div className="px-3 py-1.5 text-center" style={{ background: "#15803d" }}>
                  <span className="text-white text-xs font-bold">{league}</span>
                </div>
                {/* Date row */}
                <div className="text-center py-1">
                  <span className="text-gray-400 text-xs">{fmtDate(match.matchDate)}</span>
                </div>
                {/* Teams row */}
                <div className="flex items-center justify-between px-4 pb-4 pt-1">
                  <span className="text-sm font-semibold text-gray-800 flex-1 text-left">{match.homeTeam}</span>
                  <span className="text-base font-black text-gray-700 px-4">VS</span>
                  <span className="text-sm font-semibold text-gray-800 flex-1 text-right">{match.awayTeam}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
