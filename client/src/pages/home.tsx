import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCountryByCode } from "@/lib/countries";
import { Home, Volume2, ChevronDown, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ─── Types settings/links ──────────────────────────── */
interface LinkSettings {
  groupLink: string;
  groupType: string;
  groupLabel: string;
  groupEnabled: boolean;
  popupButtonLabel: string;
}

/* ─── Group Popup ────────────────────────────────────── */
function GroupPopup({ settings, onClose }: { settings: LinkSettings; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.52)",
        padding: "0 16px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
          overflow: "hidden",
          animation: "alertIn 0.2s ease",
        }}
      >
        {/* ── Body ── */}
        <div style={{ padding: "28px 20px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>

          {/* Red Info badge */}
          <img
            src="/info-badge.jpeg"
            alt="Info"
            style={{ width: 220, height: "auto", marginBottom: 22, display: "block" }}
          />

          {/* Main text */}
          <p style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#111",
            textAlign: "center",
            lineHeight: 1.65,
            margin: "0 0 18px",
          }}>
            SATWIN Football est une plateforme de paris inversés et d'investissement en ligne qui promet des retours sur investissement fiable. Elle fonctionne par le biais de recrutements de type marketing ou communautaire.
          </p>

          {/* Secondary text */}
          <p style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#111",
            textAlign: "center",
            lineHeight: 1.65,
            margin: 0,
          }}>
            Rejoindre notre communauté telgram pour suivre les matchs
          </p>
        </div>

        {/* ── Green separator ── */}
        <div style={{ height: 2, background: "#15803d", margin: "0 0 0 0" }} />

        {/* ── Buttons ── */}
        <div style={{ display: "flex" }}>
          {/* Fermer */}
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "18px 0",
              background: "#fff",
              border: "none",
              borderRight: "1px solid #e5e7eb",
              fontSize: 20,
              fontWeight: 900,
              color: "#111",
              cursor: "pointer",
              letterSpacing: 0.3,
            }}
          >
            Fermer
          </button>

          {/* Télégram */}
          <a
            href={settings.groupLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            style={{
              flex: 1,
              padding: "18px 0",
              background: "#1a3a6e",
              border: "none",
              fontSize: 20,
              fontWeight: 900,
              color: "#f59e0b",
              cursor: "pointer",
              textAlign: "center",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              letterSpacing: 0.3,
            }}
          >
            Télégram
          </a>
        </div>
      </div>

      <style>{`
        @keyframes alertIn {
          from { transform: scale(0.88); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ─── Design tokens ────────────────────────────────── */
const TEAL        = "#15803d";
const TEAL_DARK   = "#166534";
const ORANGE      = "#FF6B00";
const GREEN_BADGE = "#15803d";


/* ─── Hero Carousel ─────────────────────────────────── */
const SLIDES = [
  "/slide1.jpg",
  "/slide4.jpg",
  "/slide3.jpg",
  "/slide2.jpg",
  "/slide5.png",
  "/slide6.png",
];

function HeroCarousel() {
  const [current, setCurrent] = useState(0);
  const total = SLIDES.length;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setCurrent(c => (c + 1) % total), 4500);
  };

  useEffect(() => { startTimer(); return () => { if (timer.current) clearInterval(timer.current); }; }, []);

  const goTo = (i: number) => { setCurrent(i); startTimer(); };

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 14, background: "#000" }}>
      {/* Slides wrapper */}
      <div style={{
        display: "flex",
        transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1)",
        transform: `translateX(-${current * 100}%)`,
        willChange: "transform",
      }}>
        {SLIDES.map((src, i) => (
          <div key={i} style={{ minWidth: "100%", height: 190, position: "relative", overflow: "hidden" }}>
            <img
              src={src}
              alt={`Slide ${i + 1}`}
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                objectFit: "cover",
                objectPosition: "center",
              }}
            />
          </div>
        ))}
      </div>

      {/* Carousel dots */}
      <div style={{
        position: "absolute",
        bottom: 8,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
      }}>
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            style={{
              width:  i === current ? 18 : 6,
              height: 6,
              borderRadius: 3,
              background: i === current ? "white" : "rgba(255,255,255,0.55)",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "width 0.3s",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Ticker bar ────────────────────────────────────── */
function TickerBar({ text }: { text: string }) {
  const { toast } = useToast();
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      height: 42,
      background: "white",
      borderBottom: "1px solid #EBEBEB",
      borderTop:    "1px solid #EBEBEB",
      paddingLeft: 12,
      paddingRight: 12,
      gap: 8,
      overflow: "hidden",
    }}>
      {/* Speaker */}
      <Volume2 size={16} color="#888" style={{ flexShrink: 0 }} />

      {/* Scrolling text */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <div style={{
          whiteSpace: "nowrap",
          animation: "ticker 18s linear infinite",
          fontSize: 12,
          color: "#555",
          fontWeight: 400,
        }}>
          {text}
        </div>
      </div>

      {/* Language selector */}
      <button
        type="button"
        onClick={() => toast({ title: "Fonctionnalité en maintenance", description: "Cette fonctionnalité n'est pas disponible pour le moment. Réessayez plus tard.", variant: "destructive" })}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
          border: "1px solid #DDD",
          borderRadius: 6,
          padding: "3px 7px",
          background: "white",
          cursor: "pointer",
        }}>
        <span style={{ fontSize: 14 }}>🇫🇷</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#333" }}>FR</span>
        <ChevronDown size={11} color="#666" />
      </button>
    </div>
  );
}

/* ─── Countdown Timer ───────────────────────────────── */
function CountdownTimer({ upcomingDate }: { upcomingDate?: string }) {
  const [display, setDisplay] = useState("00:00");

  useEffect(() => {
    const update = () => {
      if (!upcomingDate) { setDisplay("00:00"); return; }
      const diff = new Date(upcomingDate).getTime() - Date.now();
      if (diff <= 0) { setDisplay("00:00"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setDisplay(h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [upcomingDate]);

  return (
    <div style={{
      background: ORANGE,
      borderRadius: 20,
      paddingLeft: 12,
      paddingRight: 12,
      paddingTop: 4,
      paddingBottom: 4,
      minWidth: 58,
      textAlign: "center",
    }}>
      <span style={{ color: "white", fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>
        {display}
      </span>
    </div>
  );
}

/* ─── Match Card ────────────────────────────────────── */
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
  liveScore: string | null;
}

function MatchCard({ match, onClick }: { match: Match; onClick: () => void }) {
  const d   = new Date(match.matchDate);
  const day = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const hm  = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      onClick={onClick}
      style={{
        background: "white",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
        cursor: "pointer",
        transition: "transform 0.12s, box-shadow 0.12s",
      }}
      onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = "scale(0.98)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"; }}
      onMouseUp={e   => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 6px rgba(0,0,0,0.08)"; }}
    >
      {/* Header */}
      <div style={{
        background: TEAL,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        height: 38,
      }}>
        <span style={{ color: "white", fontSize: 13, fontWeight: 600 }}>
          {match.league || "Football League"}
        </span>
        <div style={{
          background: GREEN_BADGE,
          borderRadius: 20,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 2,
          paddingBottom: 2,
        }}>
          <span style={{ color: "white", fontSize: 12, fontWeight: 700 }}>
            +{match.profitRate}%
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "10px 16px 14px" }}>
        {/* Live score OR date/time */}
        {match.status === "live" && match.liveScore ? (
          <div style={{ textAlign: "center", margin: "0 0 8px" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "#dc2626", color: "white",
              borderRadius: 20, padding: "2px 10px",
              fontSize: 12, fontWeight: 700,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", background: "white",
                display: "inline-block",
                animation: "pulse 1.4s infinite",
              }} />
              {match.liveScore}
            </span>
          </div>
        ) : (
          <p style={{
            textAlign: "center",
            fontSize: 12,
            color: "#888",
            margin: "0 0 8px",
            fontWeight: 500,
          }}>
            {day} {hm}
          </p>
        )}
        {/* Teams */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A", flex: 1 }}>
            {match.homeTeam}
          </span>
          <span style={{
            fontSize: 16,
            fontWeight: 900,
            color: TEAL,
            flex: 0,
            paddingLeft: 12,
            paddingRight: 12,
            letterSpacing: 1,
          }}>
            VS
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A", flex: 1, textAlign: "right" }}>
            {match.awayTeam}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Empty state ───────────────────────────────────── */
function EmptyState() {
  return (
    <div style={{
      background: "white",
      borderRadius: 8,
      boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
      padding: "32px 20px",
      textAlign: "center",
    }}>
      <p style={{ margin: 0, fontSize: 14, color: "#AAAAAA", fontWeight: 400 }}>
        Aucun match disponible pour le moment
      </p>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────── */
export default function HomePage() {
  const { user }       = useAuth();
  const [, navigate]   = useLocation();

  const { data: settings     } = useQuery<Record<string, string>>({ queryKey: ["/api/settings"] });
  const { data: linkSettings } = useQuery<LinkSettings>({ queryKey: ["/api/settings/links"] });
  const { data: matches      } = useQuery<Match[]>({ queryKey: ["/api/matches"] });

  /* Show popup once per session */
  const [showPopup, setShowPopup] = useState(false);
  useEffect(() => {
    if (!linkSettings) return;
    if (!linkSettings.groupLink) return;
    if (sessionStorage.getItem("groupPopupShown")) return;
    sessionStorage.setItem("groupPopupShown", "1");
    setShowPopup(true);
  }, [linkSettings]);

  if (!user) return null;

  const country  = getCountryByCode(user.country);
  const currency = country?.currency || "CFA";
  const balance  = parseFloat(user.balance || "0");
  const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* Masked name: first2 + "**" + last2 (e.g. "Boutak" → "Bo**ak") */
  const rawName = ((user as any).fullName || user.phone || "Utilisateur");
  const displayName = rawName.length > 4
    ? rawName.slice(0, 2) + "**" + rawName.slice(-2)
    : rawName.slice(0, 2) + "**";

  const tickerText = settings?.noticeText ||
    "Veuillez ne pas stocker vos identifiants sur des appareils partagés. Misez responsablement.";

  const upcomingMatches = (matches || []).filter(m => m.status === "upcoming" || m.status === "live");
  const nextMatchDate   = upcomingMatches.find(m => m.status === "upcoming")?.matchDate;

  return (
    <div style={{ background: "#F2F4F7", minHeight: "100vh" }}>

      {/* ── GROUP POPUP ── */}
      {showPopup && linkSettings && (
        <GroupPopup settings={linkSettings} onClose={() => setShowPopup(false)} />
      )}

      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(110%); }
          100% { transform: translateX(-110%); }
        }
      `}</style>

      {/* ── STICKY HEADER ── */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: TEAL,
        display: "flex",
        alignItems: "center",
        height: 52,
        paddingLeft: 14,
        paddingRight: 12,
        gap: 8,
      }}>
        {/* Left: icon + Bienvenu */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
          <Home size={20} color="white" strokeWidth={2} />
          <span style={{ color: "white", fontSize: 15, fontWeight: 700 }}>Bienvenu</span>
        </div>

        {/* Username pill */}
        <div style={{
          background: "white", borderRadius: 8,
          padding: "4px 10px", display: "flex", alignItems: "center", gap: 5,
        }}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="6.5" r="3.5" stroke="#15803d" strokeWidth="2"/>
            <path d="M2.5 18c0-4.1 3.4-6.5 7.5-6.5s7.5 2.4 7.5 6.5" stroke="#15803d" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={{ color: "#111827", fontSize: 12, fontWeight: 700 }}>{displayName}</span>
        </div>

        {/* Balance pill */}
        <div style={{
          background: "white", borderRadius: 8,
          padding: "4px 10px", display: "flex", alignItems: "center", gap: 5,
        }}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
            <ellipse cx="10" cy="13.5" rx="6" ry="5" stroke="#15803d" strokeWidth="1.8"/>
            <path d="M7.5 8.5 C7.5 7 8 6 10 6 C12 6 12.5 7 12.5 8.5" stroke="#15803d" strokeWidth="1.8" fill="none"/>
            <path d="M8.2 6.2 C8.8 4.8 11.2 4.8 11.8 6.2" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            <text x="10" y="15" textAnchor="middle" fontSize="4.5" fontWeight="bold" fill="#15803d" stroke="none" fontFamily="Arial,sans-serif">CFA</text>
          </svg>
          <span style={{ color: "#111827", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
            {fmt(balance)}
          </span>
        </div>
      </div>

      {/* ── HERO SECTION: green slab behind top half of carousel ── */}
      <div style={{ position: "relative" }}>
        {/* Green slab — absolute, covers only the top ~55% of the carousel area.
            Its rounded bottom sits in the middle of the carousel card. */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 112,          /* 8px gap + ~104px ≈ 57% of carousel (182px) */
          background: TEAL,
          borderRadius: "0 0 26px 26px",
          boxShadow: "0 6px 22px rgba(0,0,0,0.20)",
          zIndex: 1,
        }} />

        {/* Carousel card — sits on top of the green slab, extends below it */}
        <div style={{ position: "relative", zIndex: 2, padding: "8px 12px 12px" }}>
          <HeroCarousel />
        </div>
      </div>

      {/* ── TICKER ── */}
      <TickerBar text={tickerText} />

      {/* ── CE QUI EST CHAUD ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: 14,
        paddingRight: 14,
        paddingTop: 16,
        paddingBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Teal vertical bar */}
          <div style={{
            width: 4,
            height: 22,
            background: TEAL,
            borderRadius: 2,
          }} />
          <span style={{ fontSize: 16, fontWeight: 800, color: "#1A1A1A" }}>Ce qui est chaud</span>
        </div>
        <CountdownTimer upcomingDate={nextMatchDate} />
      </div>

      {/* ── MATCH LIST ── */}
      <div style={{ paddingLeft: 12, paddingRight: 12, paddingBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        {upcomingMatches.length === 0 ? (
          <EmptyState />
        ) : (
          upcomingMatches.map(match => (
            <MatchCard
              key={match.id}
              match={match}
              onClick={() => navigate("/match")}
            />
          ))
        )}
      </div>
    </div>
  );
}
