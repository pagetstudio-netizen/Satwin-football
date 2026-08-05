import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { getCountryByCode } from "@/lib/countries";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

const GREEN     = "#15803d";
const DARK_TAB  = "#1e293b";   /* dark navy tab bar background */
const CHEVRON_C = "#15803d";   /* teal-green chevron */

/* ── Interfaces ── */
interface Deposit {
  id: number; userId: number; amount: string; status: string;
  paymentMethod: string; reference?: string;
  sendavapayReference?: string; soleaspayReference?: string;
  soleaspayOrderId?: string; omnipayId?: string; omnipayReference?: string;
  createdAt: string; processedAt?: string;
}
interface Withdrawal {
  id: number; userId: number; amount: string;
  netAmount: string; fees: string; status: string;
  paymentMethod: string; sendavapayReference?: string;
  omnipayId?: string; omnipayReference?: string;
  createdAt: string; processedAt?: string;
}

/* ── Helpers ── */
const pad2 = (n: number) => String(n).padStart(2, "0");

const fmtDT = (s: string) => {
  const d = new Date(s);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} `
       + `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

const makeRef = (prefix: "D"|"W", id: number, date: string) => {
  const d = new Date(date);
  const yy=String(d.getFullYear()).slice(2), mo=pad2(d.getMonth()+1), dd=pad2(d.getDate());
  const hh=pad2(d.getHours()), mm=pad2(d.getMinutes()), seq=String(id).padStart(4,"0");
  return `24${mo}${dd}${hh}${mm}${yy}${seq}${id*31+7}`.slice(0,22);
};

const getDepRef = (d: Deposit) =>
  d.sendavapayReference ?? d.omnipayReference ?? d.omnipayId ??
  d.soleaspayReference  ?? d.soleaspayOrderId ?? d.reference ?? makeRef("D",d.id,d.createdAt);

const getWdRef = (w: Withdrawal) =>
  w.sendavapayReference ?? w.omnipayReference ?? w.omnipayId ?? makeRef("W",w.id,w.createdAt);

const statusInfo = (s: string) => {
  if (s==="completed"||s==="approved") return { label:"Succès",       color: GREEN };
  if (s==="rejected")                  return { label:"Annuler",      color:"#ef4444" };
  if (s==="processing")                return { label:"En traitement",color:"#f59e0b" };
  return { label:"En attente", color:"#f59e0b" };
};

const remark = (s: string) =>
  s==="completed"||s==="approved" ? "PASS" : s==="rejected" ? "FAIL" : "EN COURS";

const fmtAmt = (v: number) => v.toLocaleString("fr-FR").replace(/\s/g,",");

/* ── Detail row ── */
function DetailRow({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <div style={{
      display:"flex", alignItems:"flex-start", justifyContent:"space-between",
      padding:"11px 16px",
      background: alt ? "#f7f8fa" : "#fff",
      borderTop:"1px solid #f0f0f0",
    }}>
      <span style={{ color:"#9ca3af", fontSize:13, lineHeight:1.4, maxWidth:"42%", flexShrink:0 }}>
        {label}
      </span>
      <span style={{ color:"#374151", fontSize:13, fontWeight:500,
        textAlign:"right", wordBreak:"break-all", marginLeft:8 }}>
        {value}
      </span>
    </div>
  );
}

/* ── Transaction row (deposit or withdrawal) ── */
function TxRow({ type, label, createdAt, amount, status, details }:{
  type:"deposit"|"withdrawal"; label:string; createdAt:string;
  amount:number; status:string;
  details: { appTime:string; revTime:string; ref:string; fees:string; note:string };
}) {
  const [open, setOpen] = useState(false);
  const { label:statusLabel, color:statusColor } = statusInfo(status);

  return (
    <div style={{ borderBottom:"1px solid #f0f0f0" }}>
      {/* Collapsed row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width:"100%", display:"flex", alignItems:"center",
          justifyContent:"space-between",
          padding:"14px 16px", background:"#fff",
          border:"none", cursor:"pointer", textAlign:"left",
        }}
      >
        <div>
          <p style={{ fontWeight:700, fontSize:15, color:"#111827", margin:0 }}>{label}</p>
          <p style={{ fontSize:12, color:"#9ca3af", marginTop:3 }}>{fmtDT(createdAt)}</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ textAlign:"right" }}>
            <p style={{ fontWeight:700, fontSize:15, color:"#111827", margin:0 }}>
              {fmtAmt(amount)}
            </p>
            <p style={{ fontSize:12, color:statusColor, fontWeight:600, marginTop:3 }}>
              {statusLabel}
            </p>
          </div>
          {open
            ? <ChevronUp  size={18} color={CHEVRON_C} />
            : <ChevronDown size={18} color={CHEVRON_C} />}
        </div>
      </button>

      {/* Expanded details */}
      {open && (
        <div>
          <DetailRow label="Temps d'application" value={details.appTime} alt={false} />
          <DetailRow label="Temps de révision"   value={details.revTime} alt={true}  />
          <DetailRow label="Numéro de commande"  value={details.ref}     alt={false} />
          <DetailRow label="Frais de gestion"    value={details.fees}    alt={true}  />
          <DetailRow label="Remarque"            value={details.note}    alt={false} />
        </div>
      )}
    </div>
  );
}

/* ── Main page ── */
export default function HistoryPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const initTab = new URLSearchParams(window.location.search).get("tab") === "withdrawals" ? "withdrawals" : "deposits";
  const [activeTab, setActiveTab] = useState<"deposits"|"withdrawals">(initTab);

  const countryInfo = user ? getCountryByCode(user.country) : null;
  const currency = countryInfo?.currency || "FCFA";

  const { data: deposits=[], isLoading: depLoad } =
    useQuery<Deposit[]>({ queryKey:["/api/deposits/history"] });

  const { data: withdrawals=[], isLoading: wdLoad } =
    useQuery<Withdrawal[]>({ queryKey:["/api/withdrawals/history"] });

  if (!user) return null;

  const isLoading = activeTab==="deposits" ? depLoad : wdLoad;

  return (
    <div style={{ minHeight:"100vh", background:"#f5f5f5", display:"flex", flexDirection:"column" }}>

      {/* ── Header ── */}
      <div style={{
        background: GREEN, display:"flex", alignItems:"center",
        padding:"12px 16px", flexShrink:0,
      }}>
        <button
          onClick={() => navigate("/" as any)}
          style={{ background:"none", border:"none", cursor:"pointer",
            color:"white", fontSize:22, lineHeight:1, padding:"0 8px 0 0" }}
        >
          ‹
        </button>
        <h1 style={{ flex:1, textAlign:"center", color:"white",
          fontWeight:700, fontSize:17, margin:0 }}>
          Dossiers
        </h1>
        <div style={{ width:32 }} />
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        background: DARK_TAB,
        display:"flex", flexShrink:0,
        padding:"8px 8px 0",
      }}>
        {[
          { key:"deposits",    label:"Dépôt"   },
          { key:"withdrawals", label:"Retrait"  },
        ].map(({ key, label }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              style={{
                flex:1, padding:"11px 0", border:"none", cursor:"pointer",
                fontWeight:700, fontSize:15,
                background: active ? "#fff" : "transparent",
                color:      active ? "#111827" : "rgba(255,255,255,0.6)",
                borderRadius: active ? "10px 10px 0 0" : 0,
                transition:"all 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ flex:1, background:"#fff" }}>

        {isLoading && (
          <div style={{ display:"flex", justifyContent:"center", padding:64 }}>
            <Loader2 className="animate-spin" style={{ color:GREEN, width:32, height:32 }} />
          </div>
        )}

        {!isLoading && activeTab==="deposits" && deposits.length===0 && (
          <EmptyState />
        )}
        {!isLoading && activeTab==="withdrawals" && withdrawals.length===0 && (
          <EmptyState />
        )}

        {!isLoading && activeTab==="deposits" && (deposits as Deposit[]).map(d => (
          <TxRow key={d.id}
            type="deposit" label="Dépôt"
            createdAt={d.createdAt}
            amount={parseFloat(d.amount)}
            status={d.status}
            details={{
              appTime: fmtDT(d.createdAt),
              revTime: d.processedAt ? fmtDT(d.processedAt) : "—",
              ref:     getDepRef(d),
              fees:    "0",
              note:    remark(d.status),
            }}
          />
        ))}

        {!isLoading && activeTab==="withdrawals" && (withdrawals as Withdrawal[]).map(w => (
          <TxRow key={w.id}
            type="withdrawal" label="Retrait"
            createdAt={w.createdAt}
            amount={parseFloat(w.amount)}
            status={w.status}
            details={{
              appTime: fmtDT(w.createdAt),
              revTime: w.processedAt ? fmtDT(w.processedAt) : "—",
              ref:     getWdRef(w),
              fees:    parseFloat(w.fees || "0").toLocaleString("fr-FR"),
              note:    remark(w.status),
            }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:"48px 0", gap:12,
    }}>
      <img src="/empty.png" alt="Vide" style={{ width:160, height:"auto", opacity:0.85 }} />
      <p style={{ color:"#9ca3af", fontSize:14 }}>Aucune donnée</p>
    </div>
  );
}
