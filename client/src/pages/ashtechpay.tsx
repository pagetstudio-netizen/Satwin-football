/**
 * AshtechPayPage — Page de paiement AshtechPay Mobile Money
 * Flow: sélection opérateur → saisie téléphone → paiement → succès
 */
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { type ApiCountry, FALLBACK_COUNTRIES } from "@/lib/countries";
import { Loader2 } from "lucide-react";

/* ── Couleurs ──────────────────────────────────────────────────────────────── */
const BG_BLUE   = "#1a3a5c";
const BTN_BACK  = "#5b8ab5";
const BTN_NEXT  = "#1565C0";
const ORANGE_BG = "#FFF3CD";
const ORANGE_TX = "#E06500";

type AStep = "operators" | "phone" | "otp_ussd" | "otp_sms" | "wave" | "waiting" | "success" | "failed";

function getOperatorIcon(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("orange"))  return "/operators/orange.png";
  if (n.includes("mtn"))     return "/operators/mtn.png";
  if (n.includes("wave"))    return "/operators/wave.png";
  if (n.includes("moov") || n.includes("flooz")) return "/operators/moov.jpg";
  if (n.includes("airtel"))  return "/operators/airtel.png";
  if (n.includes("tmoney") || n.includes("t-money")) return "/operators/tmoney.png";
  if (n.includes("free"))    return "/operators/free.png";
  return null;
}

/** Code USSD à composer pour recevoir l'OTP, par opérateur / pays */
function getUssdCode(operatorName: string, country: string, amt?: number | string): string {
  const n = operatorName.toLowerCase();
  const c = country.toUpperCase();
  if (n.includes("orange")) {
    if (c === "ML") return "#144*77#";                              // Orange Mali
    if (c === "CI") return "#144*82#";                              // Orange Côte d'Ivoire
    if (c === "BF") return `*144*4*6*${amt || "MONTANT"}#`;        // Orange Burkina Faso
    if (c === "SN") return "#144#";                                 // Orange Sénégal
    if (c === "GN") return "#144#";                                 // Orange Guinée
    return "#144#";
  }
  return "";
}

/** Orange Money nécessite OTP avant appel API (USSD push ne fonctionne pas) */
function isOrangeOperator(name: string): boolean {
  return name.toLowerCase().includes("orange");
}

function AmountHeader({ amount, currency }: { amount: number; currency: string }) {
  const integer = Math.floor(amount).toLocaleString("fr-FR");
  const decimals = (amount % 1).toFixed(2).slice(1);
  return (
    <div style={{ padding: "36px 24px 28px" }}>
      <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, marginBottom: 2, fontStyle: "italic" }}>Montant:</p>
      <p style={{ color: "#fff", lineHeight: 1, margin: 0 }}>
        <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: -1 }}>{integer}{decimals}</span>
        {" "}<span style={{ fontSize: 20, fontWeight: 700 }}>{currency}</span>
      </p>
    </div>
  );
}

function Stepper({ active }: { active: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Numéro de\ntéléphone" },
    { n: 2, label: "Confirmation\nOTP" },
    { n: 3, label: "Paiement\nterminé" },
  ];
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ display: "contents" }}>
            <div style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: "50%",
              background: s.n <= active ? BG_BLUE : "transparent",
              border: `2px solid ${s.n <= active ? BG_BLUE : "#C8C8C8"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: s.n <= active ? "#fff" : "#ACACAC", fontWeight: 700, fontSize: 15,
            }}>{s.n}</div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: s.n < active ? BG_BLUE : "#D0D0D0" }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex" }}>
        {steps.map((s) => (
          <div key={s.n} style={{ flex: 1, textAlign: "center", paddingRight: s.n < 3 ? 8 : 0 }}>
            <p style={{ fontSize: 10, lineHeight: 1.35, margin: 0, color: s.n === active ? "#222" : "#ABABAB", whiteSpace: "pre-line" }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   PAGE PRINCIPALE
══════════════════════════════════════════════════════════════════════════════ */
export default function AshtechPayPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const params  = new URLSearchParams(window.location.search);
  const amount  = parseFloat(params.get("amount") || "0");
  const country = params.get("country") || user?.country || "";

  const { data: apiCountries = [] } = useQuery<ApiCountry[]>({ queryKey: ["/api/countries"] });
  const countryInfo = apiCountries.length > 0
    ? apiCountries.find(c => c.code === country && c.isActive)
    : FALLBACK_COUNTRIES.find(c => c.code === country);

  const currency    = countryInfo?.currency    || "FCFA";
  const phonePrefix = (countryInfo as any)?.phonePrefix || "";
  const countryName = countryInfo?.name        || country;

  const [step,        setStep]        = useState<AStep>("operators");
  const [selectedOp,  setSelectedOp]  = useState<string | null>(null);
  const [phone,       setPhone]       = useState("");
  const [depositId,   setDepositId]   = useState<number | null>(null);
  const [reference,   setReference]   = useState("");
  const [ussdCode,    setUssdCode]    = useState("");
  const [waveUrl,     setWaveUrl]     = useState("");
  const [otp,         setOtp]         = useState("");
  const [polling,     setPolling]     = useState(false);
  const [txInfo,      setTxInfo]      = useState<Record<string, any> | null>(null);

  /* ── Opérateurs AshtechPay ───────────────────────────────────────────── */
  const { data: operators = [], isLoading: opsLoading } = useQuery<string[]>({
    queryKey: ["/api/ashtechpay/operators", country],
    queryFn: async () => {
      const res = await fetch(`/api/ashtechpay/operators/${country}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      const d = await res.json();
      return d.operators || [];
    },
    enabled: !!country,
  });

  /* ── Polling statut dépôt ─────────────────────────────────────────────── */
  useEffect(() => {
    if (step !== "waiting" || !depositId || !polling) return;
    const interval = setInterval(async () => {
      try {
        const res  = await fetch(`/api/deposits/${depositId}/ashtechpay-status`, { credentials: "include" });
        const data = await res.json();
        if (data.status === "approved") {
          clearInterval(interval);
          setPolling(false);
          setTxInfo(data);
          setStep("success");
          refreshUser();
          qc.invalidateQueries({ queryKey: ["/api/deposits/history"] });
        } else if (data.status === "rejected" || data.status === "failed") {
          clearInterval(interval);
          setPolling(false);
          setStep("failed");
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [step, depositId, polling]);

  /* ── Initiation paiement ─────────────────────────────────────────────── */
  const collectMut = useMutation({
    mutationFn: async (params?: { otp?: string; reference?: string }) => {
      if (!selectedOp || !phone.trim()) throw new Error("Données manquantes");
      const res = await apiRequest("POST", "/api/ashtechpay/collect", {
        amount, country, phone, operator: selectedOp,
        otp: params?.otp,
        reference: params?.reference,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.depositId) setDepositId(data.depositId);
      if (data.type === "otp_ussd") {
        setReference(data.reference);
        setUssdCode(data.ussdCode || getUssdCode(selectedOp || "", country, amount));
        setStep("otp_ussd");
      } else if (data.type === "otp_sms") {
        setReference(data.reference);
        setStep("otp_sms");
      } else if (data.type === "wave") {
        setWaveUrl(data.waveUrl || "");
        setStep("wave");
        setPolling(true);
      } else {
        // ussd_push — aller sur waiting et démarrer le polling
        setStep("waiting");
        setPolling(true);
      }
    },
    onError: (e: any) => {
      // reste sur phone en cas d'erreur
      toast({ title: "Erreur paiement", description: e.message, variant: "destructive" });
    },
  });

  /* ── Soumission OTP ──────────────────────────────────────────────────── */
  const otpMut = useMutation({
    mutationFn: async () => {
      if (!selectedOp || !phone.trim() || !otp.trim() || !reference) throw new Error("Données manquantes");
      const res = await apiRequest("POST", "/api/ashtechpay/collect", {
        amount, country, phone, operator: selectedOp, otp: otp.trim(), reference,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.depositId) setDepositId(data.depositId);
      setPolling(true);
      setStep("waiting");
    },
    onError: (e: any) => {
      const msg: string = e.message || "";
      // L'API demande de relancer sans OTP pour créer une nouvelle session
      if (msg.toLowerCase().includes("expir") || msg.toLowerCase().includes("introuvable") || msg.toLowerCase().includes("session otp")) {
        toast({ title: "Code OTP expiré", description: "Un nouveau code va être envoyé sur votre téléphone.", variant: "destructive" });
        setOtp("");
        // Relancer la session OTP sans le champ otp
        collectMut.mutate(undefined);
      } else {
        toast({ title: "Erreur OTP", description: msg, variant: "destructive" });
      }
    },
  });

  if (!user || !amount) return null;

  /* ══════════ ÉCRAN 1 — Sélection opérateur ══════════ */
  if (step === "operators") return (
    <div style={{ minHeight: "100vh", background: BG_BLUE, display: "flex", flexDirection: "column" }}>
      <AmountHeader amount={amount} currency={currency} />
      <div style={{ padding: "0 18px", flex: 1 }}>
        <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 13, marginBottom: 14 }}>
          Sélectionnez le mode de paiement :
        </p>
        {opsLoading && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 48 }}>
            <Loader2 style={{ color: "#fff", width: 40, height: 40 }} className="animate-spin" />
          </div>
        )}
        {!opsLoading && operators.length === 0 && (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.75)", paddingTop: 48 }}>
            <p style={{ fontSize: 15 }}>Aucun opérateur disponible pour votre pays</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>Contactez le support</p>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {operators.map(op => {
            const icon = getOperatorIcon(op);
            return (
              <button key={op} onClick={() => { setSelectedOp(op); setStep("phone"); }}
                style={{ background: "#fff", border: "none", borderRadius: 14, padding: "18px 20px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer", width: "100%", boxShadow: "0 1px 6px rgba(0,0,0,0.10)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {icon && <img src={icon} alt={op} style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 8 }} />}
                  <span style={{ fontSize: 19, fontWeight: 700, color: "#1A3870" }}>{op}</span>
                </div>
                <span style={{ fontSize: 22, color: "#1A3870", fontWeight: 600 }}>›</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  /* ══════════ ÉCRAN 2 — Saisie téléphone ══════════ */
  if (step === "phone" && selectedOp) return (
    <div style={{ minHeight: "100vh", background: BG_BLUE, display: "flex", flexDirection: "column" }}>
      <AmountHeader amount={amount} currency={currency} />
      <div style={{ flex: 1, background: "#fff", borderRadius: "22px 22px 0 0", padding: "24px 20px 32px", marginTop: 4 }}>
        <Stepper active={1} />
        <div style={{ background: ORANGE_BG, borderRadius: 8, padding: "12px 16px", marginBottom: 22, border: `1px solid rgba(224,101,0,0.25)` }}>
          <p style={{ color: ORANGE_TX, fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            Veuillez utiliser le numéro associé à votre compte Mobile Money.
          </p>
        </div>
        <p style={{ fontSize: 13, color: "#444", marginBottom: 8 }}>Votre numéro de téléphone :</p>
        <div style={{ display: "flex", border: "1px solid #D8D8D8", borderRadius: 7, overflow: "hidden", marginBottom: 22 }}>
          <div style={{ padding: "13px 14px", borderRight: "1px solid #D8D8D8", display: "flex", alignItems: "center", gap: 4, background: "#fff", color: "#D63030", fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
            +{phonePrefix}&nbsp;▾
          </div>
          <input type="tel" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value)} placeholder=""
            style={{ flex: 1, border: "none", outline: "none", padding: "13px 14px", fontSize: 16, color: "#222", background: "#fff" }} />
        </div>
        <p style={{ fontSize: 13, color: "#444", marginBottom: 10 }}>Opérateur sélectionné :</p>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="radio" checked readOnly style={{ accentColor: BG_BLUE, width: 18, height: 18 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {getOperatorIcon(selectedOp) && <img src={getOperatorIcon(selectedOp)!} alt={selectedOp} style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4 }} />}
            <span style={{ fontSize: 15, color: "#222" }}>{selectedOp}</span>
          </div>
        </label>
        <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
          <button onClick={() => setStep("operators")}
            style={{ flex: 1, padding: "14px 0", borderRadius: 8, background: BTN_BACK, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
            ‹ Retour
          </button>
          <button onClick={() => {
              if (!phone.trim()) { toast({ title: "Numéro requis", variant: "destructive" }); return; }
              if (selectedOp && isOrangeOperator(selectedOp)) {
                // Orange : afficher OTP d'abord, puis appeler l'API avec l'OTP
                const ref = `${Date.now()}-${user.id}`;
                setReference(ref);
                setUssdCode(getUssdCode(selectedOp, country, amount));
                setOtp("");
                setStep("otp_ussd");
              } else {
                collectMut.mutate();
              }
            }}
            disabled={collectMut.isPending}
            style={{ flex: 1.6, padding: "14px 0", borderRadius: 8, background: BTN_NEXT, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, opacity: collectMut.isPending ? 0.7 : 1 }}>
            {collectMut.isPending
              ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> En cours...</span>
              : "Suivant ›"
            }
          </button>
        </div>
      </div>
    </div>
  );

  /* ══════════ ÉCRAN 3a — OTP USSD ══════════ */
  if (step === "otp_ussd") return (
    <div style={{ minHeight: "100vh", background: BG_BLUE, display: "flex", flexDirection: "column" }}>
      <AmountHeader amount={amount} currency={currency} />
      <div style={{ flex: 1, background: "#fff", borderRadius: "22px 22px 0 0", padding: "24px 20px 32px", marginTop: 4 }}>
        <Stepper active={2} />
        <div style={{ background: ORANGE_BG, borderRadius: 8, padding: "12px 16px", marginBottom: 20, border: `1px solid rgba(224,101,0,0.25)` }}>
          <p style={{ color: ORANGE_TX, fontWeight: 700, marginBottom: 4, margin: 0 }}>Composez ce code USSD sur votre téléphone :</p>
          {ussdCode ? (
            <p style={{ color: "#1565C0", fontWeight: 900, fontSize: 24, marginTop: 8, fontFamily: "monospace" }}>{ussdCode}</p>
          ) : (
            <p style={{ color: "#1565C0", fontWeight: 900, fontSize: 20, marginTop: 8, fontFamily: "monospace" }}>
              {getUssdCode(selectedOp || "", country, amount) || "Code USSD de votre opérateur"}
            </p>
          )}
          <p style={{ color: ORANGE_TX, fontSize: 12, marginTop: 6, margin: "6px 0 0" }}>L'OTP s'affichera dans le menu USSD</p>
        </div>
        <p style={{ fontSize: 13, color: "#444", marginBottom: 8 }}>Entrez le code OTP reçu :</p>
        <input type="text" inputMode="numeric" value={otp} onChange={e => setOtp(e.target.value)} placeholder="Code OTP"
          style={{ width: "100%", border: "1px solid #D8D8D8", borderRadius: 7, padding: "13px 14px", fontSize: 18, outline: "none", letterSpacing: 4, textAlign: "center", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button onClick={() => setStep("phone")}
            style={{ flex: 1, padding: "14px 0", borderRadius: 8, background: BTN_BACK, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
            ‹ Retour
          </button>
          <button onClick={() => { if (!otp.trim()) { toast({ title: "OTP requis", variant: "destructive" }); return; } otpMut.mutate(); }}
            disabled={otpMut.isPending}
            style={{ flex: 1.6, padding: "14px 0", borderRadius: 8, background: BTN_NEXT, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, opacity: otpMut.isPending ? 0.7 : 1 }}>
            {otpMut.isPending ? "Validation..." : "Valider ›"}
          </button>
        </div>
        <button
          onClick={() => { setOtp(""); collectMut.mutate(undefined); }}
          disabled={collectMut.isPending}
          style={{ width: "100%", marginTop: 12, padding: "11px 0", borderRadius: 8, background: "transparent", color: "#1565C0", border: "1px solid #1565C0", cursor: "pointer", fontWeight: 600, fontSize: 13, opacity: collectMut.isPending ? 0.6 : 1 }}>
          {collectMut.isPending ? "Envoi en cours..." : "🔄 Renvoyer un nouveau code OTP"}
        </button>
      </div>
    </div>
  );

  /* ══════════ ÉCRAN 3b — OTP SMS ══════════ */
  if (step === "otp_sms") return (
    <div style={{ minHeight: "100vh", background: BG_BLUE, display: "flex", flexDirection: "column" }}>
      <AmountHeader amount={amount} currency={currency} />
      <div style={{ flex: 1, background: "#fff", borderRadius: "22px 22px 0 0", padding: "24px 20px 32px", marginTop: 4 }}>
        <Stepper active={2} />
        <div style={{ background: "#e8f5e9", borderRadius: 8, padding: "12px 16px", marginBottom: 20, border: "1px solid #c8e6c9" }}>
          <p style={{ color: "#2e7d32", fontWeight: 600, fontSize: 13, margin: 0 }}>
            ✓ Un SMS avec votre code OTP a été envoyé automatiquement sur votre téléphone
          </p>
        </div>
        <p style={{ fontSize: 13, color: "#444", marginBottom: 8 }}>Entrez le code OTP reçu par SMS :</p>
        <input type="text" inputMode="numeric" value={otp} onChange={e => setOtp(e.target.value)} placeholder="Code OTP"
          style={{ width: "100%", border: "1px solid #D8D8D8", borderRadius: 7, padding: "13px 14px", fontSize: 18, outline: "none", letterSpacing: 4, textAlign: "center", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button onClick={() => setStep("phone")}
            style={{ flex: 1, padding: "14px 0", borderRadius: 8, background: BTN_BACK, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
            ‹ Retour
          </button>
          <button onClick={() => { if (!otp.trim()) { toast({ title: "OTP requis", variant: "destructive" }); return; } otpMut.mutate(); }}
            disabled={otpMut.isPending}
            style={{ flex: 1.6, padding: "14px 0", borderRadius: 8, background: BTN_NEXT, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, opacity: otpMut.isPending ? 0.7 : 1 }}>
            {otpMut.isPending ? "Validation..." : "Valider ›"}
          </button>
        </div>
        <button
          onClick={() => { setOtp(""); collectMut.mutate(undefined); }}
          disabled={collectMut.isPending}
          style={{ width: "100%", marginTop: 12, padding: "11px 0", borderRadius: 8, background: "transparent", color: "#1565C0", border: "1px solid #1565C0", cursor: "pointer", fontWeight: 600, fontSize: 13, opacity: collectMut.isPending ? 0.6 : 1 }}>
          {collectMut.isPending ? "Envoi en cours..." : "🔄 Renvoyer un nouveau code OTP"}
        </button>
      </div>
    </div>
  );

  /* ══════════ ÉCRAN 3c — Wave ══════════ */
  if (step === "wave") return (
    <div style={{ minHeight: "100vh", background: BG_BLUE, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <AmountHeader amount={amount} currency={currency} />
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 24px", margin: "0 16px", width: "100%", maxWidth: 380, textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🌊</div>
        <p style={{ fontWeight: 700, fontSize: 18, color: "#1a3a5c", marginBottom: 8 }}>Paiement Wave</p>
        <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          Cliquez sur le bouton ci-dessous pour finaliser votre paiement via l'application Wave.
        </p>
        <a href={waveUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", background: BTN_NEXT, color: "#fff", borderRadius: 10, padding: "15px 0", fontWeight: 700, fontSize: 16, textDecoration: "none", marginBottom: 12 }}>
          Ouvrir Wave ›
        </a>
        <p style={{ color: "#888", fontSize: 12 }}>En attente de confirmation…</p>
        <Loader2 style={{ color: BTN_NEXT, width: 28, height: 28, margin: "8px auto 0" }} className="animate-spin" />
      </div>
    </div>
  );

  /* ══════════ ÉCRAN 4 — Attente ══════════ */
  if (step === "waiting") return (
    <div style={{ minHeight: "100vh", background: BG_BLUE, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <AmountHeader amount={amount} currency={currency} />
      <div style={{ textAlign: "center", padding: "0 24px" }}>
        <Loader2 style={{ color: "#fff", width: 52, height: 52, marginBottom: 20 }} className="animate-spin" />
        <p style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Traitement en cours…</p>
        <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 14, lineHeight: 1.6 }}>
          Veuillez confirmer le paiement sur votre téléphone.<br />Nous attendons la validation de l'opérateur.
        </p>
      </div>
    </div>
  );

  /* ══════════ ÉCRAN 5 — Succès ══════════ */
  if (step === "success") return (
    <div style={{ minHeight: "100vh", background: "#EBEBEB", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 2px 16px rgba(0,0,0,0.09)", overflow: "hidden" }}>
        <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid #F0F0F0" }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "#333", marginBottom: 2 }}>RobotPay — {countryName}</p>
          <p style={{ fontWeight: 900, fontSize: 24, color: "#111", margin: 0 }}>{amount.toLocaleString("fr-FR")} {currency}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 20px 20px" }}>
          <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#43A047", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, boxShadow: "0 4px 16px rgba(67,160,71,0.35)" }}>
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
              <polyline points="7,20 15,28 31,11" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p style={{ fontSize: 16, color: "#333", fontWeight: 500, margin: 0 }}>Votre paiement a été approuvé</p>
        </div>
        <div style={{ margin: "0 20px 20px", background: "#F7F7F7", borderRadius: 10, padding: "14px 16px" }}>
          {phone && <p style={{ fontSize: 13, color: "#444", marginBottom: 6, margin: "0 0 6px" }}><strong>Payeur</strong> : {phone}</p>}
          <p style={{ fontSize: 13, color: "#444", margin: 0 }}><strong>Date</strong> : {new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" })}</p>
        </div>
        <div style={{ textAlign: "center", padding: "0 20px 28px", borderTop: "1px solid #F0F0F0" }}>
          <button onClick={() => navigate("/")}
            style={{ marginTop: 20, padding: "13px 36px", borderRadius: 9, background: BTN_NEXT, color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
            Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );

  /* ══════════ ÉCRAN 6 — Échec ══════════ */
  if (step === "failed") return (
    <div style={{ minHeight: "100vh", background: "#EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, textAlign: "center", padding: "40px 24px", boxShadow: "0 2px 16px rgba(0,0,0,0.09)" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#E53935", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", boxShadow: "0 4px 16px rgba(229,57,53,0.3)" }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <line x1="10" y1="10" x2="26" y2="26" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
            <line x1="26" y1="10" x2="10" y2="26" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>
        <p style={{ fontSize: 16, color: "#333", marginBottom: 24 }}>Le paiement a été refusé ou annulé.</p>
        <button onClick={() => { setStep("operators"); setPhone(""); setOtp(""); }}
          style={{ padding: "13px 36px", borderRadius: 9, background: BTN_NEXT, color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
          Réessayer
        </button>
        <br />
        <button onClick={() => navigate("/")}
          style={{ marginTop: 16, fontSize: 13, color: "#888", background: "none", border: "none", cursor: "pointer" }}>
          Retour à l'accueil
        </button>
      </div>
    </div>
  );

  return null;
}
