/**
 * AshtechPayCryptoPage — Dépôt USDT via AshtechPay
 * Flow: sélection réseau → adresse de dépôt (QR + copie) → attente → succès
 */
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2, Copy, CheckCircle2 } from "lucide-react";

const BG = "#1a3a5c";
const BTN = "#1565C0";

interface CryptoAsset {
  asset_code: string;
  coin: string;
  name: string;
  network_label: string;
  memo_required: boolean;
  memo_type: string | null;
}

type CStep = "assets" | "waiting" | "success" | "failed";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy}
      style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: copied ? "#15803d" : BTN, fontSize: 12, fontWeight: 700, padding: "4px 0" }}>
      {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
      {copied ? "Copié !" : "Copier"}
    </button>
  );
}

export default function AshtechPayCryptoPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const params     = new URLSearchParams(window.location.search);
  const amountUsdt = parseFloat(params.get("amount") || "0");
  const currency   = params.get("currency") || "USDT";

  const [step,        setStep]        = useState<CStep>("assets");
  const [selectedAsset, setAsset]     = useState<CryptoAsset | null>(null);
  const [depositId,   setDepositId]   = useState<number | null>(null);
  const [address,     setAddress]     = useState("");
  const [memo,        setMemo]        = useState<string | null>(null);
  const [memoType,    setMemoType]    = useState<string | null>(null);
  const [amountInfo,  setAmountInfo]  = useState<{ amount: number; credited: number; fee: number } | null>(null);
  const [expiresAt,   setExpiresAt]   = useState<string | null>(null);
  const [polling,     setPolling]     = useState(false);

  /* ── Assets ─────────────────────────────────────────────────────────── */
  const { data: assetsData, isLoading: assetsLoading } = useQuery<{ assets: CryptoAsset[] }>({
    queryKey: ["/api/ashtechpay/crypto/assets"],
    queryFn: async () => {
      const res = await fetch("/api/ashtechpay/crypto/assets", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    staleTime: 60_000,
  });
  const assets = assetsData?.assets || [];

  /* ── Polling ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (step !== "waiting" || !depositId || !polling) return;
    const interval = setInterval(async () => {
      try {
        const res  = await fetch(`/api/deposits/${depositId}/ashtechpay-status`, { credentials: "include" });
        const data = await res.json();
        if (data.status === "approved") {
          clearInterval(interval);
          setPolling(false);
          setStep("success");
          refreshUser();
          qc.invalidateQueries({ queryKey: ["/api/deposits/history"] });
        } else if (data.status === "rejected" || data.status === "failed") {
          clearInterval(interval);
          setPolling(false);
          setStep("failed");
        }
      } catch { /* ignore */ }
    }, 8000);
    return () => clearInterval(interval);
  }, [step, depositId, polling]);

  /* ── Initier dépôt crypto ──────────────────────────────────────────── */
  const collectMut = useMutation({
    mutationFn: async (asset: CryptoAsset) => {
      const res = await apiRequest("POST", "/api/ashtechpay/crypto/collect", {
        amount: amountUsdt,
        currency,
        asset_code: asset.asset_code,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Erreur");
      return d;
    },
    onSuccess: (data: any) => {
      setAddress(data.address || "");
      setMemo(data.memo || null);
      setMemoType(data.memo_type || null);
      setDepositId(data.depositId || null);
      setAmountInfo({ amount: data.amount_usdt ?? amountUsdt, credited: data.credited_amount ?? amountUsdt, fee: data.fee_amount ?? 0 });
      setExpiresAt(data.expires_at || null);
      setPolling(true);
      setStep("waiting");
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  if (!user) return null;

  /* ══════════ ÉCRAN 1 — Sélection réseau ══════════ */
  if (step === "assets") return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "36px 24px 24px" }}>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, marginBottom: 2, fontStyle: "italic" }}>Dépôt Crypto :</p>
        <p style={{ color: "#fff", fontSize: 38, fontWeight: 900, margin: 0 }}>
          {amountUsdt} <span style={{ fontSize: 20 }}>{currency}</span>
        </p>
      </div>

      <div style={{ flex: 1, background: "#fff", borderRadius: "22px 22px 0 0", padding: "24px 20px 32px" }}>
        <p style={{ fontWeight: 700, fontSize: 15, color: "#1a3a5c", marginBottom: 4 }}>Choisissez le réseau</p>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>Sélectionnez le réseau pour recevoir l'adresse de dépôt.</p>

        {assetsLoading && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
            <Loader2 style={{ color: BG, width: 36, height: 36 }} className="animate-spin" />
          </div>
        )}
        {!assetsLoading && assets.length === 0 && (
          <div style={{ textAlign: "center", color: "#9ca3af", paddingTop: 40 }}>
            <p>Aucun réseau crypto disponible</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {assets.map(a => (
            <button key={a.asset_code}
              onClick={() => { setAsset(a); collectMut.mutate(a); }}
              disabled={collectMut.isPending}
              style={{ background: "#f9fafb", border: "1.5px solid #e5e7eb", borderRadius: 14, padding: "16px 20px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer", width: "100%", opacity: collectMut.isPending ? 0.6 : 1 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: "#1a3a5c" }}>{a.coin}</span>
                <span style={{ fontSize: 12, color: "#6b7280" }}>{a.network_label}</span>
              </div>
              {collectMut.isPending && selectedAsset?.asset_code === a.asset_code
                ? <Loader2 style={{ width: 20, height: 20, color: BTN }} className="animate-spin" />
                : <span style={{ fontSize: 20, color: BTN, fontWeight: 600 }}>›</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /* ══════════ ÉCRAN 2 — Adresse + QR ══════════ */
  if (step === "waiting" && address) return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", padding: "20px 16px 40px" }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", padding: "20px", maxWidth: 420, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <p style={{ fontWeight: 800, fontSize: 18, color: "#1a3a5c", margin: "0 0 4px" }}>
            RobotPay — Dépôt Crypto
          </p>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>
            {selectedAsset?.network_label || selectedAsset?.asset_code}
          </p>
        </div>

        {/* Montant */}
        <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#166534", fontSize: 13, fontWeight: 600 }}>Montant à envoyer</span>
          <span style={{ color: "#166534", fontSize: 16, fontWeight: 800 }}>{amountInfo?.amount ?? amountUsdt} USDT</span>
        </div>
        {amountInfo && amountInfo.fee > 0 && (
          <div style={{ background: "#fef9c3", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#713f12", fontSize: 12 }}>Frais ({((amountInfo.fee / amountInfo.amount) * 100).toFixed(1)}%)</span>
            <span style={{ color: "#713f12", fontSize: 12, fontWeight: 700 }}>−{amountInfo.fee.toFixed(4)} USDT</span>
          </div>
        )}

        {/* QR Code */}
        <div style={{ display: "flex", justifyContent: "center", margin: "16px 0" }}>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(address)}`}
            alt="QR Code"
            style={{ width: 180, height: 180, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
        </div>

        {/* Adresse */}
        <div style={{ marginBottom: 14 }}>
          <p style={{ color: "#6b7280", fontSize: 12, marginBottom: 4, fontWeight: 600 }}>ADRESSE DE DÉPÔT</p>
          <div style={{ background: "#f9fafb", border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "10px 12px" }}>
            <p style={{ fontFamily: "monospace", fontSize: 13, color: "#111827", wordBreak: "break-all", margin: "0 0 6px" }}>{address}</p>
            <CopyButton text={address} />
          </div>
        </div>

        {/* Memo si requis */}
        {memo && (
          <div style={{ marginBottom: 14, background: "#fef3c7", border: "1.5px solid #fcd34d", borderRadius: 8, padding: "10px 12px" }}>
            <p style={{ color: "#92400e", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              ⚠️ {memoType || "MEMO"} OBLIGATOIRE
            </p>
            <p style={{ fontFamily: "monospace", fontSize: 15, color: "#111827", fontWeight: 900, margin: "0 0 6px" }}>{memo}</p>
            <CopyButton text={memo} />
            <p style={{ color: "#92400e", fontSize: 11, margin: "4px 0 0" }}>
              Vous devez inclure ce memo lors de votre transfert, sinon les fonds ne seront pas crédités.
            </p>
          </div>
        )}

        {/* Expiration */}
        {expiresAt && (
          <p style={{ color: "#6b7280", fontSize: 12, textAlign: "center", marginBottom: 12 }}>
            ⏳ Expire le {new Date(expiresAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
          </p>
        )}

        {/* En attente */}
        <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Loader2 style={{ color: BTN, width: 28, height: 28 }} className="animate-spin" />
          <p style={{ color: "#374151", fontSize: 13, fontWeight: 600, margin: 0 }}>En attente de votre paiement…</p>
          <p style={{ color: "#9ca3af", fontSize: 12, margin: 0, textAlign: "center" }}>
            Envoyez exactement <strong>{amountInfo?.amount ?? amountUsdt} USDT</strong> à l'adresse ci-dessus.<br />
            La page se mettra à jour automatiquement.
          </p>
        </div>
      </div>
    </div>
  );

  /* ══════════ ÉCRAN 3 — Succès ══════════ */
  if (step === "success") return (
    <div style={{ minHeight: "100vh", background: "#EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 2px 16px rgba(0,0,0,0.09)", overflow: "hidden" }}>
        <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid #F0F0F0" }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "#333", marginBottom: 2 }}>RobotPay — Dépôt Crypto</p>
          <p style={{ fontWeight: 900, fontSize: 24, color: "#111", margin: 0 }}>{amountUsdt} {currency}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 20px 20px" }}>
          <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#43A047", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, boxShadow: "0 4px 16px rgba(67,160,71,0.35)" }}>
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
              <polyline points="7,20 15,28 31,11" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p style={{ fontSize: 16, color: "#333", fontWeight: 500, margin: 0 }}>Paiement crypto confirmé !</p>
        </div>
        <div style={{ textAlign: "center", padding: "0 20px 28px" }}>
          <button onClick={() => navigate("/")}
            style={{ padding: "13px 36px", borderRadius: 9, background: BTN, color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
            Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );

  /* ══════════ ÉCRAN 4 — Échec / délai ══════════ */
  if (step === "failed") return (
    <div style={{ minHeight: "100vh", background: "#EBEBEB", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, textAlign: "center", padding: "40px 24px", boxShadow: "0 2px 16px rgba(0,0,0,0.09)" }}>
        <p style={{ fontSize: 16, color: "#333", marginBottom: 24 }}>Paiement non confirmé ou expiré.</p>
        <button onClick={() => navigate("/")}
          style={{ padding: "13px 36px", borderRadius: 9, background: BTN, color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
          Retour à l'accueil
        </button>
      </div>
    </div>
  );

  /* Chargement initial (en attente de l'adresse après sélection du réseau) */
  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 style={{ color: "#fff", width: 48, height: 48 }} className="animate-spin" />
    </div>
  );
}
