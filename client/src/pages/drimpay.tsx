/**
 * DrimpayPage — Page de paiement Drimpay (SendavaPay)
 * Design pixel-perfect basé sur les captures d'écran de référence.
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
const BG_BLUE   = "#5499D6"; // bleu principal du fond (d'après captures)
const BTN_BACK  = "#A8C8EE"; // bouton "Go Back"
const BTN_NEXT  = "#2B7FCC"; // bouton "Next Step"
const ORANGE_BG = "#FFF3CD"; // fond de l'avertissement orange
const ORANGE_TX = "#E06500"; // texte orange

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface SvOperator {
  id: string;
  name: string;
  requiresOtp: boolean;
  status: string;
}

type DStep = "operators" | "phone" | "waiting" | "otp" | "success" | "failed";

/* ── Helpers ─────────────────────────────────────────────────────────────────*/
function getOperatorIcon(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("orange"))  return "/operators/orange.png";
  if (n.includes("mtn"))     return "/operators/mtn.png";
  if (n.includes("wave"))    return "/operators/wave.png";
  if (n.includes("moov"))    return "/operators/moov.jpg";
  if (n.includes("airtel"))  return "/operators/airtel.png";
  if (n.includes("tmoney") || n.includes("t-money")) return "/operators/tmoney.png";
  return null;
}

/* ── Composant d'en-tête (montant) ─────────────────────────────────────────── */
function AmountHeader({ amount, currency }: { amount: number; currency: string }) {
  const integer = Math.floor(amount).toLocaleString("fr-FR");
  const decimals = (amount % 1).toFixed(2).slice(1); // ".00"
  return (
    <div style={{ padding: "36px 24px 28px" }}>
      <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, marginBottom: 2, fontStyle: "italic" }}>
        Montant:
      </p>
      <p style={{ color: "#fff", lineHeight: 1, margin: 0 }}>
        <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: -1 }}>{integer}{decimals}</span>
        {" "}
        <span style={{ fontSize: 20, fontWeight: 700 }}>{currency}</span>
      </p>
    </div>
  );
}

/* ── Stepper ─────────────────────────────────────────────────────────────── */
function Stepper({ active }: { active: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Numéro de\ntéléphone" },
    { n: 2, label: "Informations de\nconfirmation" },
    { n: 3, label: "Paiement\nterminé" },
  ];
  return (
    <div style={{ marginBottom: 22 }}>
      {/* Circles + lines row */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ display: "contents" }}>
            <div style={{
              flexShrink: 0,
              width: 36, height: 36, borderRadius: "50%",
              background: s.n <= active ? BG_BLUE : "transparent",
              border: `2px solid ${s.n <= active ? BG_BLUE : "#C8C8C8"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: s.n <= active ? "#fff" : "#ACACAC",
              fontWeight: 700, fontSize: 15,
            }}>
              {s.n}
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: s.n < active ? BG_BLUE : "#D0D0D0" }} />
            )}
          </div>
        ))}
      </div>
      {/* Labels row */}
      <div style={{ display: "flex" }}>
        {steps.map((s) => (
          <div key={s.n} style={{ flex: 1, textAlign: "center", paddingRight: s.n < 3 ? 8 : 0 }}>
            <p style={{
              fontSize: 10, lineHeight: 1.35, margin: 0,
              color: s.n === active ? "#222" : "#ABABAB",
              whiteSpace: "pre-line",
            }}>
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
export default function DrimpayPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  /* ── Paramètres URL ──────────────────────────────────────────────────────── */
  const params  = new URLSearchParams(window.location.search);
  const amount  = parseFloat(params.get("amount") || "0");
  const country = params.get("country") || user?.country || "";

  /* ── Données pays ──────────────────────────────────────────────────────── */
  const { data: apiCountries = [] } = useQuery<ApiCountry[]>({ queryKey: ["/api/countries"] });

  const countryInfo = apiCountries.length > 0
    ? apiCountries.find(c => c.code === country && c.isActive)
    : FALLBACK_COUNTRIES.find(c => c.code === country);

  const currency    = countryInfo?.currency    || "FCFA";
  const phonePrefix = (countryInfo as any)?.phonePrefix || "";
  const countryName = countryInfo?.name        || country;

  /* ── État de l'écran ──────────────────────────────────────────────────── */
  const [step,         setStep]         = useState<DStep>("operators");
  const [selectedOp,   setSelectedOp]   = useState<SvOperator | null>(null);
  const [phone,        setPhone]        = useState("");
  const [depositId,    setDepositId]    = useState<number | null>(null);
  const [paymentToken, setPaymentToken] = useState("");
  const [otpToken,     setOtpToken]     = useState("");
  const [ussdCode,     setUssdCode]     = useState("");
  const [otp,          setOtp]          = useState("");
  const [polling,      setPolling]      = useState(false);
  const [txInfo,       setTxInfo]       = useState<Record<string, any> | null>(null);

  /* ── Opérateurs SendavaPay ────────────────────────────────────────────── */
  const { data: opsData, isLoading: opsLoading } = useQuery<{ success: boolean; data: SvOperator[] }>({
    queryKey: ["/api/sendavapay/operators", country],
    queryFn: async () => {
      const res = await fetch(`/api/sendavapay/operators/${country}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    enabled: !!country,
  });
  const operators = (opsData?.data || []).filter(op => op.status === "online");

  /* ── Polling statut dépôt ─────────────────────────────────────────────── */
  useEffect(() => {
    if (step !== "waiting" || !depositId || !polling) return;
    const interval = setInterval(async () => {
      try {
        const res  = await fetch(`/api/deposits/${depositId}/sendavapay-status`, { credentials: "include" });
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
  const initMut = useMutation({
    mutationFn: async () => {
      if (!selectedOp || !phone.trim()) throw new Error("Données manquantes");

      const createRes  = await apiRequest("POST", "/api/sendavapay/create", {
        amount, country,
        operatorId:   selectedOp.id,
        operatorName: selectedOp.name,
        payerPhone:   phone,
      });
      const createData = await createRes.json();
      setDepositId(createData.depositId);
      setPaymentToken(createData.paymentToken);

      const initRes  = await apiRequest("POST", "/api/sendavapay/initiate", {
        paymentToken:  createData.paymentToken,
        payerCountry:  country,
        operatorId:    selectedOp.id,
        depositId:     createData.depositId,
        payerPhone:    phone,
      });
      return initRes.json();
    },
    onSuccess: (data: any) => {
      if (data.requiresOtp && data.otpToken) {
        setOtpToken(data.otpToken);
        setUssdCode(data.ussdCode || "");
        setStep("otp");
      } else {
        setPolling(true);
        setStep("waiting");
      }
    },
    onError: (e: any) => toast({ title: "Erreur paiement", description: e.message, variant: "destructive" }),
  });

  /* ── Soumission OTP ──────────────────────────────────────────────────── */
  const otpMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sendavapay/submit-otp", { otpToken, otp });
      return res.json();
    },
    onSuccess: () => { setPolling(true); setStep("waiting"); },
    onError:   (e: any) => toast({ title: "Erreur OTP", description: e.message, variant: "destructive" }),
  });

  if (!user || !amount) return null;

  /* ════════════════════════════════════════════════════════════════════════
     ÉCRAN 1 — Sélection opérateur
  ════════════════════════════════════════════════════════════════════════ */
  if (step === "operators") return (
    <div style={{ minHeight: "100vh", background: BG_BLUE, display: "flex", flexDirection: "column" }}>
      <AmountHeader amount={amount} currency={currency} />

      <div style={{ padding: "0 18px", flex: 1 }}>
        <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 13, marginBottom: 14 }}>
          Sélectionnez le mode de paiement&nbsp;:
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
            const icon = getOperatorIcon(op.name);
            return (
              <button
                key={op.id}
                onClick={() => { setSelectedOp(op); setStep("phone"); }}
                style={{
                  background: "#fff",
                  border: "none",
                  borderRadius: 14,
                  padding: "18px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  width: "100%",
                  boxShadow: "0 1px 6px rgba(0,0,0,0.10)",
                  transition: "transform 0.1s, box-shadow 0.1s",
                }}
                onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)"; }}
                onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {icon && (
                    <img src={icon} alt={op.name}
                      style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 8 }} />
                  )}
                  <span style={{ fontSize: 19, fontWeight: 700, color: "#1A3870" }}>{op.name}</span>
                </div>
                <span style={{ fontSize: 22, color: "#1A3870", fontWeight: 600, lineHeight: 1 }}>›</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════════════════════════════
     ÉCRAN 2 — Saisie numéro de téléphone
  ════════════════════════════════════════════════════════════════════════ */
  if (step === "phone" && selectedOp) return (
    <div style={{ minHeight: "100vh", background: BG_BLUE, display: "flex", flexDirection: "column" }}>
      <AmountHeader amount={amount} currency={currency} />

      {/* Carte blanche */}
      <div style={{
        flex: 1,
        background: "#fff",
        borderRadius: "22px 22px 0 0",
        padding: "24px 20px 32px",
        marginTop: 4,
      }}>
        {/* Stepper */}
        <Stepper active={1} />

        {/* Avertissement orange */}
        <div style={{
          background: ORANGE_BG,
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 22,
          border: `1px solid rgba(224,101,0,0.25)`,
        }}>
          <p style={{ color: ORANGE_TX, fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            Veuillez sélectionner la même option que votre méthode de transfert.
          </p>
        </div>

        {/* Saisie téléphone */}
        <p style={{ fontSize: 13, color: "#444", marginBottom: 8 }}>
          Veuillez entrer votre numéro de téléphone:
        </p>
        <div style={{
          display: "flex",
          border: "1px solid #D8D8D8",
          borderRadius: 7,
          overflow: "hidden",
          marginBottom: 22,
        }}>
          {/* Indicatif pays */}
          <div style={{
            padding: "13px 14px",
            borderRight: "1px solid #D8D8D8",
            display: "flex", alignItems: "center", gap: 4,
            background: "#fff",
            color: "#D63030", fontWeight: 600, fontSize: 14,
            flexShrink: 0, userSelect: "none",
          }}>
            +{phonePrefix}&nbsp;▾
          </div>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder=""
            style={{
              flex: 1, border: "none", outline: "none",
              padding: "13px 14px", fontSize: 16, color: "#222",
              background: "#fff",
            }}
          />
        </div>

        {/* Méthode de transfert */}
        <p style={{ fontSize: 13, color: "#444", marginBottom: 10 }}>
          Choisissez la méthode de transfert:
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="radio" checked readOnly
            style={{ accentColor: BG_BLUE, width: 18, height: 18, flexShrink: 0 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {getOperatorIcon(selectedOp.name) && (
              <img src={getOperatorIcon(selectedOp.name)!} alt={selectedOp.name}
                style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4 }} />
            )}
            <span style={{ fontSize: 15, color: "#222" }}>{selectedOp.name}</span>
          </div>
        </label>

        {/* Boutons */}
        <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
          <button
            onClick={() => setStep("operators")}
            style={{
              flex: 1, padding: "14px 0", borderRadius: 8,
              background: BTN_BACK, color: "#fff", border: "none",
              cursor: "pointer", fontWeight: 600, fontSize: 14,
            }}
          >
            ‹ Go Back
          </button>
          <button
            onClick={() => {
              if (!phone.trim()) {
                toast({ title: "Numéro requis", description: "Entrez votre numéro Mobile Money", variant: "destructive" });
                return;
              }
              initMut.mutate();
            }}
            disabled={initMut.isPending}
            style={{
              flex: 1.6, padding: "14px 0", borderRadius: 8,
              background: BTN_NEXT, color: "#fff", border: "none",
              cursor: "pointer", fontWeight: 600, fontSize: 14,
              opacity: initMut.isPending ? 0.7 : 1,
            }}
          >
            {initMut.isPending
              ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> En cours...
                </span>
              : "Next Step ›"
            }
          </button>
        </div>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════════════════════════════
     ÉCRAN 3 — OTP (Orange Money)
  ════════════════════════════════════════════════════════════════════════ */
  if (step === "otp") return (
    <div style={{ minHeight: "100vh", background: BG_BLUE, display: "flex", flexDirection: "column" }}>
      <AmountHeader amount={amount} currency={currency} />

      <div style={{
        flex: 1, background: "#fff", borderRadius: "22px 22px 0 0",
        padding: "24px 20px 32px", marginTop: 4,
      }}>
        <Stepper active={2} />

        {ussdCode && (
          <div style={{ background: ORANGE_BG, borderRadius: 8, padding: "12px 16px", marginBottom: 20, border: `1px solid rgba(224,101,0,0.25)` }}>
            <p style={{ color: ORANGE_TX, fontWeight: 700, marginBottom: 6, margin: 0 }}>Composez ce code USSD&nbsp;:</p>
            <p style={{ color: "#1565C0", fontWeight: 900, fontSize: 22, marginTop: 6, fontFamily: "monospace" }}>{ussdCode}</p>
          </div>
        )}

        <p style={{ fontSize: 13, color: "#444", marginBottom: 8 }}>Entrez le code OTP reçu par SMS&nbsp;:</p>
        <input
          type="text" inputMode="numeric"
          value={otp}
          onChange={e => setOtp(e.target.value)}
          placeholder="Code OTP"
          style={{
            width: "100%", border: "1px solid #D8D8D8", borderRadius: 7,
            padding: "13px 14px", fontSize: 18, outline: "none",
            letterSpacing: 4, textAlign: "center", boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
          <button
            onClick={() => setStep("phone")}
            style={{ flex: 1, padding: "14px 0", borderRadius: 8, background: BTN_BACK, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14 }}
          >
            ‹ Go Back
          </button>
          <button
            onClick={() => { if (!otp.trim()) { toast({ title: "OTP requis", variant: "destructive" }); return; } otpMut.mutate(); }}
            disabled={otpMut.isPending}
            style={{ flex: 1.6, padding: "14px 0", borderRadius: 8, background: BTN_NEXT, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, opacity: otpMut.isPending ? 0.7 : 1 }}
          >
            {otpMut.isPending ? "Validation..." : "Valider ›"}
          </button>
        </div>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════════════════════════════
     ÉCRAN 4 — Attente confirmation
  ════════════════════════════════════════════════════════════════════════ */
  if (step === "waiting") return (
    <div style={{
      minHeight: "100vh", background: BG_BLUE,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 0,
    }}>
      <AmountHeader amount={amount} currency={currency} />
      <div style={{ textAlign: "center", padding: "0 24px" }}>
        <Loader2 style={{ color: "#fff", width: 52, height: 52, marginBottom: 20 }} className="animate-spin" />
        <p style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Traitement en cours…</p>
        <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 14, lineHeight: 1.6 }}>
          Veuillez confirmer le paiement sur votre téléphone.
          <br />Nous attendons la validation de la banque.
        </p>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════════════════════════════
     ÉCRAN 5 — Succès (fidèle à la capture screenshot 3)
  ════════════════════════════════════════════════════════════════════════ */
  if (step === "success") return (
    <div style={{ minHeight: "100vh", background: "#EBEBEB", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{
        background: "#fff", borderRadius: 16,
        width: "100%", maxWidth: 400,
        boxShadow: "0 2px 16px rgba(0,0,0,0.09)",
        overflow: "hidden",
      }}>
        {/* En-tête */}
        <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid #F0F0F0" }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "#333", marginBottom: 2 }}>
            Drimpay — {countryName}
          </p>
          <p style={{ fontWeight: 900, fontSize: 24, color: "#111", margin: 0 }}>
            {amount.toLocaleString("fr-FR")} {currency}
          </p>
        </div>

        {/* Checkmark */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 20px 20px" }}>
          <div style={{
            width: 76, height: 76, borderRadius: "50%",
            background: "#43A047",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 18,
            boxShadow: "0 4px 16px rgba(67,160,71,0.35)",
          }}>
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
              <polyline
                points="7,20 15,28 31,11"
                stroke="#fff" strokeWidth="4.5"
                strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </div>
          <p style={{ fontSize: 16, color: "#333", fontWeight: 500, margin: 0 }}>
            Votre paiement a été approuvé
          </p>
        </div>

        {/* Détails transaction */}
        <div style={{ margin: "0 20px 20px", background: "#F7F7F7", borderRadius: 10, padding: "14px 16px" }}>
          {(txInfo?.payerPhone || phone) && (
            <p style={{ fontSize: 13, color: "#444", marginBottom: 6, margin: "0 0 6px" }}>
              <strong>Payeur</strong> : {txInfo?.payerPhone || phone}
            </p>
          )}
          {txInfo?.externalId && (
            <p style={{ fontSize: 13, color: "#444", marginBottom: 6, margin: "0 0 6px" }}>
              <strong>ID Transaction</strong> : {txInfo.externalId}
            </p>
          )}
          <p style={{ fontSize: 13, color: "#444", margin: 0 }}>
            <strong>Date Paiement</strong> : {new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" })}
          </p>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "0 20px 28px", borderTop: "1px solid #F0F0F0" }}>
          <p style={{ fontSize: 13, color: "#999", marginTop: 20, marginBottom: 14 }}>
            🔒 Sécurisé par <strong style={{ color: BTN_NEXT }}>Drimpay</strong>
          </p>
          <button
            onClick={() => navigate("/")}
            style={{ fontSize: 13, color: BTN_NEXT, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Contacter le support
          </button>
        </div>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════════════════════════════
     ÉCRAN 6 — Échec
  ════════════════════════════════════════════════════════════════════════ */
  if (step === "failed") return (
    <div style={{ minHeight: "100vh", background: "#EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
      <div style={{
        background: "#fff", borderRadius: 16,
        width: "100%", maxWidth: 400, textAlign: "center",
        padding: "40px 24px", boxShadow: "0 2px 16px rgba(0,0,0,0.09)",
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%", background: "#E53935",
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
          boxShadow: "0 4px 16px rgba(229,57,53,0.3)",
        }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <line x1="10" y1="10" x2="26" y2="26" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
            <line x1="26" y1="10" x2="10" y2="26" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>
        <p style={{ fontSize: 16, color: "#333", marginBottom: 24 }}>
          Le paiement a été refusé ou annulé.
        </p>
        <button
          onClick={() => { setStep("operators"); setPhone(""); setOtp(""); }}
          style={{
            padding: "13px 36px", borderRadius: 9,
            background: BTN_NEXT, color: "#fff",
            border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15,
          }}
        >
          Réessayer
        </button>
        <br />
        <button
          onClick={() => navigate("/")}
          style={{ marginTop: 16, fontSize: 13, color: "#888", background: "none", border: "none", cursor: "pointer" }}
        >
          Retour à l'accueil
        </button>
      </div>
    </div>
  );

  return null;
}
