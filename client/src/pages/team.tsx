import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/hooks/use-clipboard";
import { getCountryByCode } from "@/lib/countries";
import { useLocation } from "wouter";
import { ChevronRight, Copy, Search, X } from "lucide-react";

const GREEN = "#15803d";

/* ── Types ── */
interface TeamStats {
  level1Count: number; level2Count: number; level3Count: number;
  totalCommission: number; level1Commission: number;
  level2Commission: number; level3Commission: number;
  level1Invested: number; level2Invested: number; level3Invested: number;
  level1Recharged: number;
}
interface Member { id: number; fullName: string; phone: string; country: string; createdAt: string; hasActiveProduct: boolean; totalInvested: number; }
interface DetailedTeam { level1: Member[]; level2: Member[]; level3: Member[]; }
interface Transaction { id: number; type: string; amount: string; description: string; createdAt: string; }

type View = "main" | "mon_equipe" | "rapport" | "code" | "prime" | "nouveau_registre" | "nouveau_depot" | "retrait_total" | "pari_total" | "gain" | "dossiers";

/* ── Helpers ── */
const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = (n: number) => n.toLocaleString("fr-FR");
const pad2 = (x: number) => String(x).padStart(2, "0");
const fmtDate = (s: string) => { const d = new Date(s); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };

/* ── Gold hex badge (level number) ── */
function HexBadge({ n }: { n: number }) {
  return (
    <div style={{
      width: 30, height: 30, flexShrink: 0,
      clipPath: "polygon(50% 0%,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%)",
      background: "linear-gradient(135deg, #f5c842 0%, #c8870a 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ color: "#4a2000", fontWeight: 900, fontSize: 12 }}>{n}</span>
    </div>
  );
}

/* ── Dark level row (for sub-pages) ── */
function LevelRow({ num, label, value }: { num: number; label: string; value: string | number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "#1a1a2e", borderRadius: 10, padding: "13px 16px",
      marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <HexBadge n={num} />
        <span style={{ color: "white", fontWeight: 600, fontSize: 14 }}>{label}</span>
      </div>
      <span style={{ color: "white", fontWeight: 700, fontSize: 14 }}>{typeof value === "number" ? fmtN(value) : value}</span>
    </div>
  );
}

/* ── Sub-page header ── */
function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ background: GREEN, display: "flex", alignItems: "center", padding: "12px 16px", flexShrink: 0 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "white", fontSize: 22, padding: "0 10px 0 0" }}>‹</button>
      <h1 style={{ flex: 1, textAlign: "center", color: "white", fontWeight: 700, fontSize: 16, margin: 0 }}>{title}</h1>
      <div style={{ width: 34 }} />
    </div>
  );
}

/* ── Dark daily data page ── */
function DailyDataPage({ title, totalLabel, total, levels, onBack }: {
  title: string; totalLabel: string; total: number | string;
  levels: { label: string; value: number | string }[];
  onBack: () => void;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "#101018", display: "flex", flexDirection: "column" }}>
      <SubHeader title={title} onBack={onBack} />
      <div style={{ flex: 1, padding: "16px 14px", overflowY: "auto" }}>
        {/* Summary card */}
        <div style={{
          background: "#1a1a2e", borderRadius: 14,
          border: "2px solid #c8870a",
          padding: "0 0 18px", marginBottom: 18, overflow: "hidden",
        }}>
          <div style={{ background: "linear-gradient(90deg, #c8870a, #f5c842)", padding: "6px 16px", borderRadius: "12px 12px 0 0", marginBottom: 14, display: "flex", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>Exponentiel</span>
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#9ca3af", fontSize: 14, margin: "0 0 6px" }}>{totalLabel}</p>
            <p style={{ color: "white", fontWeight: 900, fontSize: 26, margin: 0 }}>+{typeof total === "number" ? fmtN(total) : total}</p>
          </div>
        </div>
        {/* Level rows */}
        {levels.map((lv, i) => (
          <LevelRow key={i} num={i + 1} label={lv.label} value={lv.value} />
        ))}
      </div>
    </div>
  );
}

/* ══════════════ MAIN COMPONENT ══════════════ */
export default function TeamPage() {
  const { user }  = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [view, setView] = useState<View>("main");
  const [search, setSearch] = useState("");
  const [niveauOpen, setNiveauOpen] = useState(false);

  const { data: stats } = useQuery<TeamStats>({ queryKey: ["/api/team/stats"] });
  const { data: settings } = useQuery<Record<string, string>>({ queryKey: ["/api/settings"] });
  const { data: team } = useQuery<DetailedTeam>({ queryKey: ["/api/team/details"] });
  const { data: txList } = useQuery<Transaction[]>({ queryKey: ["/api/transactions"] });

  if (!user) return null;

  const country  = getCountryByCode(user.country);
  const currency = country?.currency || "CFA";
  const totalCommission  = stats?.totalCommission  || 0;
  const lv1Rate = settings?.level1Commission || "25";
  const lv2Rate = settings?.level2Commission || "3";
  const lv3Rate = settings?.level3Commission || "2";

  const refCode  = user.referralCode;
  const refLink  = `${window.location.origin}/register?invite_code=${refCode}`;
  const copy = (txt: string, label: string) => { copyToClipboard(txt, label); };

  /* ── Derived data for sub-views ── */
  const registreLevels = [
    { label: "Niveau 1", value: stats?.level1Count    || 0 },
    { label: "Niveau 2", value: stats?.level2Count    || 0 },
    { label: "Niveau 3", value: stats?.level3Count    || 0 },
  ];
  const depotLevels = [
    { label: "Niveau 1", value: stats?.level1Invested || 0 },
    { label: "Niveau 2", value: stats?.level2Invested || 0 },
    { label: "Niveau 3", value: stats?.level3Invested || 0 },
  ];
  const commLevels = [
    { label: "Niveau 1", value: stats?.level1Commission || 0 },
    { label: "Niveau 2", value: stats?.level2Commission || 0 },
    { label: "Niveau 3", value: stats?.level3Commission || 0 },
  ];

  /* ── Member list for Mon équipe ── */
  const allMembers: (Member & { niveau: number })[] = [
    ...(team?.level1 || []).map(m => ({ ...m, niveau: 1 })),
    ...(team?.level2 || []).map(m => ({ ...m, niveau: 2 })),
    ...(team?.level3 || []).map(m => ({ ...m, niveau: 3 })),
  ].filter(m => !search || m.fullName?.toLowerCase().includes(search.toLowerCase()) || m.phone?.includes(search));

  /* ══ VIEWS ══ */

  /* Mon équipe */
  if (view === "mon_equipe") {
    const totalMembers = (stats?.level1Count || 0) + (stats?.level2Count || 0) + (stats?.level3Count || 0);
    const niveauRows = [
      { label: "Niveau 1", count: stats?.level1Count || 0 },
      { label: "Niveau 2", count: stats?.level2Count || 0 },
      { label: "Niveau 3", count: stats?.level3Count || 0 },
    ];

    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", flexDirection: "column" }}>
        <SubHeader title="Mon équipe" onBack={() => setView("main")} />

        {/* Green header band */}
        <div style={{ background: GREEN, padding: "0 12px 14px" }}>

          {/* Info bar */}
          <div style={{
            background: "white",
            borderRadius: niveauOpen ? "10px 10px 0 0" : 10,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px",
          }}>
            {/* Niveau Info toggle button */}
            <button
              onClick={() => setNiveauOpen(o => !o)}
              style={{
                background: "#e0f0ff", borderRadius: 8, padding: "6px 12px",
                border: "none", cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1a6db3", lineHeight: 1.3 }}>
                Niveau<br />Info
              </span>
            </button>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Montant total du membre</span>
            <button
              onClick={() => setNiveauOpen(o => !o)}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              <span style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>{totalMembers}</span>
              <span style={{ color: "#374151", fontSize: 14 }}>{niveauOpen ? "^" : "˅"}</span>
            </button>
          </div>

          {/* Niveau Info dropdown panel */}
          {niveauOpen && (
            <div style={{ background: "#3a8a7e", borderRadius: "0 0 10px 10px", padding: "14px 16px" }}>
              <p style={{ color: "white", fontSize: 13, fontWeight: 600, textAlign: "center", margin: "0 0 12px" }}>
                Le nombre de membres dans chaque niveau
              </p>
              {niveauRows.map((row, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "8px 12px",
                  background: i % 2 === 0 ? "rgba(255,255,255,0.08)" : "transparent",
                  borderRadius: 6,
                }}>
                  <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{row.label}</span>
                  <span style={{ color: "white", fontWeight: 700, fontSize: 13 }}>
                    {row.count}Personnes
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <div style={{ padding: "10px 12px 6px", background: "white" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px" }}>
            <Search size={16} color="#9ca3af" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un compte"
              style={{ flex: 1, border: "none", outline: "none", fontSize: 14, color: "#374151", background: "transparent" }}
            />
            {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><X size={14} color="#9ca3af" /></button>}
          </div>
        </div>

        {/* Member list */}
        <div style={{ flex: 1, background: "white" }}>
          {allMembers.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px", gap: 12 }}>
              <img src="/empty.png" alt="Vide" style={{ width: 150, height: "auto", opacity: 0.85 }} />
              <p style={{ color: "#9ca3af", fontSize: 14 }}>Aucun membre</p>
            </div>
          ) : allMembers.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ background: "#dbeafe", borderRadius: 6, padding: "3px 8px", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8" }}>{m.niveau}Niveau</span>
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14, color: "#111827", margin: 0 }}>{m.fullName || m.phone}</p>
                  <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{m.createdAt ? fmtDate(m.createdAt) : ""}</p>
                </div>
              </div>
              <ChevronRight size={16} color="#d1d5db" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* Rapport — motivational referral page */
  if (view === "rapport") {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", flexDirection: "column" }}>
        <SubHeader title="Rapport de parrainage" onBack={() => setView("main")} />
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 80px" }}>
          {/* Hero card */}
          <div style={{ background: "linear-gradient(135deg, #15803d, #166534)", borderRadius: 16, padding: "24px 20px", marginBottom: 16, textAlign: "center", boxShadow: "0 8px 24px rgba(21,128,61,0.3)" }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🏆</div>
            <h2 style={{ color: "white", fontWeight: 900, fontSize: 22, margin: "0 0 8px" }}>Parrainez & Gagnez !</h2>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 1.7, margin: 0 }}>
              Invitez vos amis sur <strong>SATWIN FOOT</strong> et recevez des commissions automatiques sur chaque mise qu'ils placent — sans aucun effort supplémentaire.
            </p>
          </div>
          {/* Commission levels */}
          <div style={{ background: "white", borderRadius: 14, padding: "18px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 4, height: 18, background: GREEN, borderRadius: 2 }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>Vos taux de commission</span>
            </div>
            {[
              { niveau: 1, rate: lv1Rate, desc: "Amis directs que vous invitez" },
              { niveau: 2, rate: lv2Rate, desc: "Amis invités par vos filleuls" },
              { niveau: 3, rate: lv3Rate, desc: "3ème génération de filleuls" },
            ].map(lv => (
              <div key={lv.niveau} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: lv.niveau < 3 ? "1px solid #f3f4f6" : "none" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(21,128,61,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontWeight: 900, fontSize: 15, color: GREEN }}>N{lv.niveau}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, color: "#111827", margin: 0 }}>Niveau {lv.niveau} — <span style={{ color: GREEN }}>{lv.rate}%</span></p>
                  <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{lv.desc}</p>
                </div>
              </div>
            ))}
          </div>
          {/* How it works */}
          <div style={{ background: "white", borderRadius: 14, padding: "18px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 4, height: 18, background: GREEN, borderRadius: 2 }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>Comment ça marche ?</span>
            </div>
            {[
              { icon: "📤", step: "Partagez votre code d'invitation", desc: "Envoyez votre lien unique à vos proches via WhatsApp, Telegram ou SMS." },
              { icon: "👥", step: "Vos amis s'inscrivent", desc: "Ils créent leur compte avec votre code de parrainage et commencent à miser." },
              { icon: "💰", step: "Vous gagnez automatiquement", desc: `Vous recevez ${lv1Rate}% de chaque mise placée par vos filleuls directs, instantanément sur votre solde.` },
              { icon: "📈", step: "Revenus exponentiels", desc: "Plus votre réseau grandit, plus vos commissions augmentent. Jusqu'à 3 niveaux de profondeur !" },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < 3 ? "1px solid #f9fafb" : "none" }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{s.icon}</span>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: "#111827", margin: "0 0 3px" }}>{s.step}</p>
                  <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Your stats */}
          <div style={{ background: "white", borderRadius: 14, padding: "18px 16px", marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 4, height: 18, background: GREEN, borderRadius: 2 }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>Mes statistiques</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Filleuls N1", value: stats?.level1Count || 0 },
                { label: "Filleuls N2", value: stats?.level2Count || 0 },
                { label: "Filleuls N3", value: stats?.level3Count || 0 },
                { label: "Total commissions", value: `${currency} ${fmt(totalCommission)}` },
              ].map((s, i) => (
                <div key={i} style={{ background: "#f9fafb", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
                  <p style={{ fontWeight: 900, fontSize: 18, color: GREEN, margin: "0 0 4px" }}>{s.value}</p>
                  <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
          {/* CTA button */}
          <button
            onClick={() => setView("code")}
            style={{ width: "100%", background: GREEN, color: "white", border: "none", borderRadius: 12, padding: "15px", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 12px rgba(21,128,61,0.4)" }}
          >
            Voir mon code d'invitation →
          </button>
        </div>
      </div>
    );
  }

  /* Code d'invitation */
  if (view === "code") {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(refLink)}`;
    return (
      <div style={{ minHeight: "100vh", background: "#f0f0f0", display: "flex", flexDirection: "column" }}>
        <SubHeader title="Code d'invitation" onBack={() => setView("main")} />

        <div style={{ flex: 1, padding: "16px 12px" }}>
          <div style={{ background: "white", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>

            {/* Code de Parrainage row */}
            <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid #f0f0f0" }}>
              <span style={{ color: "#6b7280", fontSize: 13, width: 110, lineHeight: 1.4, flexShrink: 0 }}>Code de<br/>Parrainage</span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 16, color: "#111827" }}>{refCode}</span>
            </div>

            {/* Lien de référence row */}
            <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid #f0f0f0" }}>
              <span style={{ color: "#6b7280", fontSize: 13, width: 110, lineHeight: 1.4, flexShrink: 0 }}>Lien de<br/>référence</span>
              <span style={{ flex: 1, fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>
                {refLink}
              </span>
              <button
                onClick={() => copy(refLink, "Lien copié !")}
                style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", cursor: "pointer", flexShrink: 0 }}
              >
                <Copy size={14} color="#6b7280" />
              </button>
            </div>

            {/* QR Code */}
            <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <img
                src={qrUrl}
                alt="QR Code"
                style={{ width: 190, height: 190, display: "block" }}
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                Appuyez longuement sur le code QR pour<br/>l'enregistrer sur le téléphone
              </p>
            </div>

          </div>
        </div>
      </div>
    );
  }

  /* ── Dossiers — commission history ── */
  if (view === "dossiers") {
    const commissions = (txList || []).filter(
      t => t.type === "commission" || t.type === "deposit_commission",
    );

    // Group by YYYY-MM
    const grouped: Record<string, Transaction[]> = {};
    commissions.forEach(tx => {
      const d = new Date(tx.createdAt);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(tx);
    });
    const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", flexDirection: "column" }}>
        <SubHeader title="Dossiers" onBack={() => setView("main")} />

        <div style={{ flex: 1, overflowY: "auto" }}>
          {commissions.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 16px", gap: 12 }}>
              <img src="/empty.png" alt="Vide" style={{ width: 150, height: "auto", opacity: 0.85 }} />
              <p style={{ color: "#9ca3af", fontSize: 14 }}>Aucun historique de commission</p>
            </div>
          ) : months.map(month => (
            <div key={month}>
              {/* Month header */}
              <div style={{ padding: "10px 16px 6px" }}>
                <span style={{ color: "#1d4ed8", fontWeight: 700, fontSize: 14 }}>{month}</span>
              </div>

              {/* Rows */}
              <div style={{ background: "white", borderTop: "1px solid #f0f0f0", borderBottom: "1px solid #f0f0f0" }}>
                {grouped[month].map((tx, i) => {
                  const d     = new Date(tx.createdAt);
                  const dateStr = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
                  const amt   = parseFloat(tx.amount);
                  // First entry of a month has no date yet → show "Examen"; others "Émettre avec succès"
                  const isExamen = i === 0 && grouped[month].length > 1;

                  return (
                    <div key={tx.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 16px",
                      borderBottom: i < grouped[month].length - 1 ? "1px solid #f9fafb" : "none",
                    }}>
                      {/* Left: label + date */}
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 14, color: "#111827", margin: "0 0 3px" }}>
                          Commission d'agence
                        </p>
                        {!isExamen && (
                          <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>{dateStr}</p>
                        )}
                      </div>

                      {/* Right: amount + status + chevron */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontWeight: 700, fontSize: 15, color: "#111827", margin: "0 0 2px" }}>
                            {amt.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p style={{ fontSize: 11, margin: 0, color: isExamen ? "#f59e0b" : "#16a34a", fontWeight: 500 }}>
                            {isExamen ? "Examen" : "Émettre avec succès"}
                          </p>
                        </div>
                        <ChevronRight size={15} color="#d1d5db" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* Daily data sub-pages */
  if (view === "nouveau_registre") return <DailyDataPage title="Aujourd'hui Nouveau registre" totalLabel="Nouveau registre" total={(stats?.level1Count||0)+(stats?.level2Count||0)+(stats?.level3Count||0)} levels={registreLevels} onBack={() => setView("main")} />;
  if (view === "nouveau_depot")   return <DailyDataPage title="Aujourd'hui Nouveau dépôt"    totalLabel="Nouveau dépôt"    total={(stats?.level1Invested||0)+(stats?.level2Invested||0)+(stats?.level3Invested||0)} levels={depotLevels}     onBack={() => setView("main")} />;
  if (view === "retrait_total")   return <DailyDataPage title="Aujourd'hui Retrait total"    totalLabel="Retrait total"    total={totalCommission * 0.6 | 0}  levels={commLevels}     onBack={() => setView("main")} />;
  if (view === "pari_total")      return <DailyDataPage title="Aujourd'hui Pari total"       totalLabel="Pari total"       total={(stats?.level1Invested||0)+(stats?.level2Invested||0)+(stats?.level3Invested||0)} levels={depotLevels} onBack={() => setView("main")} />;
  if (view === "gain")            return <DailyDataPage title="Aujourd'hui GAIN"             totalLabel="GAIN total"       total={totalCommission}            levels={commLevels}     onBack={() => setView("main")} />;

  /* Prime promotionnelle */
  if (view === "prime") {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", flexDirection: "column" }}>
        <SubHeader title="Prime promotionnelle" onBack={() => setView("main")} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 14 }}>🎁</div>
          <p style={{ fontWeight: 700, fontSize: 18, color: "#111827", marginBottom: 8 }}>Prime promotionnelle</p>
          <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.7 }}>Aucune prime promotionnelle active pour le moment. Invitez des amis pour débloquer des bonus exclusifs !</p>
        </div>
      </div>
    );
  }

  /* ══ MAIN VIEW: Centre d'agence ══ */
  const iconBtns: { img: string; filter: string; label: string; to: View }[] = [
    { img: "/icons/team.png",     filter: "grayscale(100%) brightness(0.55)",                      label: "Mon équipe",        to: "mon_equipe" },
    { img: "/icons/rapport.png",  filter: "brightness(0) opacity(0.55)",                           label: "Rapport",           to: "rapport"    },
    { img: "/icons/dossiers.png", filter: "invert(1) grayscale(100%) brightness(0) opacity(0.55)", label: "Dossiers",          to: "dossiers"   },
    { img: "/icons/code.png",     filter: "grayscale(100%) brightness(0.55)",                      label: "Code\nd'invitation", to: "code"       },
  ];

  const listItems: { label: string; to: View }[] = [
    { label: "Prime promotionnelle", to: "prime"           },
    { label: "Nouveau registre",     to: "nouveau_registre"},
    { label: "Nouveau dépôt",        to: "nouveau_depot"   },
    { label: "Retrait total",        to: "retrait_total"   },
    { label: "Pari total",           to: "pari_total"      },
    { label: "GAIN",                 to: "gain"            },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: GREEN, display: "flex", alignItems: "center", padding: "12px 16px" }}>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "white", fontSize: 22, padding: "0 10px 0 0" }}>‹</button>
        <h1 style={{ flex: 1, textAlign: "center", color: "white", fontWeight: 700, fontSize: 17, margin: 0 }}>Centre d'agence</h1>
        <button onClick={() => setView("rapport")} style={{ background: "none", border: "none", cursor: "pointer", color: "white", fontSize: 13, fontWeight: 700 }}>Règle</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 80 }}>

        {/* Stats card */}
        <div style={{ margin: "14px 14px 0", background: "white", borderRadius: 14, padding: "16px 18px", boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
          <div style={{ display: "flex" }}>
            <div style={{ flex: 1, borderRight: "1px solid #f3f4f6", paddingRight: 14 }}>
              <p style={{ color: GREEN, fontWeight: 800, fontSize: 17, margin: "0 0 4px" }}>
                {currency} {fmt(totalCommission)}
              </p>
              <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>Commission d'agence</p>
            </div>
            <div style={{ flex: 1, paddingLeft: 14 }}>
              <p style={{ color: "#0d9488", fontWeight: 800, fontSize: 17, margin: "0 0 4px" }}>
                {currency} 0
              </p>
              <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>Prime promotionnelle</p>
            </div>
          </div>
        </div>

        {/* Icon buttons */}
        <div style={{ margin: "12px 14px 0", background: "white", borderRadius: 14, padding: "14px 8px", boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-around" }}>
            {iconBtns.map(btn => (
              <button
                key={btn.to}
                onClick={() => btn.to === "rapport" ? navigate("/about" as any) : setView(btn.to)}
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "4px 8px" }}
              >
                <div style={{ width: 48, height: 48, background: "#f3f4f6", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <img src={btn.img} alt={btn.label} style={{ width: 28, height: 28, objectFit: "contain", filter: btn.filter }} />
                </div>
                <span style={{ fontSize: 11, color: "#374151", fontWeight: 600, textAlign: "center", whiteSpace: "pre-line", lineHeight: 1.3 }}>{btn.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* List items */}
        <div style={{ margin: "12px 14px 0", background: "white", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
          {listItems.map((item, i) => (
            <button
              key={item.to}
              onClick={() => setView(item.to)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "15px 18px", background: "white", border: "none", cursor: "pointer",
                borderBottom: i < listItems.length - 1 ? "1px solid #f3f4f6" : "none",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 14, color: "#374151", fontWeight: 500 }}>{item.label}</span>
              <ChevronRight size={16} color="#d1d5db" />
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
