import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";
import { ChevronRight, Loader2, Info } from "lucide-react";
import { COUNTRIES, type ApiCountry } from "@/lib/countries";

/* ── constants ── */
const GREEN = "#15803d";
const DARK  = "#1a2a44";
const QUICK_AMOUNTS = [3000, 5000, 10000, 20000, 100000];

interface WalletData {
  id: number; userId: number; accountName: string; accountNumber: string;
  paymentMethod: string; country: string; isDefault: boolean;
}

/* ── tiny helpers ── */
const fmtBal = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function InfoRow({ label, value, red }: { label: string; value: React.ReactNode; red?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.5, maxWidth: "45%" }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 14, color: red ? "#dc2626" : "#111827", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function QuickBtn({ val, selected, onSelect }: { val: number; selected: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} style={{
      padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
      border: selected ? `1.5px solid ${GREEN}` : "1.5px solid #d1d5db",
      background: selected ? "rgba(21,128,61,0.07)" : "white",
      color: selected ? GREEN : "#374151",
    }}>{val.toLocaleString("fr-FR")}</button>
  );
}

/* ════════════════ DEPOT FORM ════════════════ */
function DepotForm({ currency, minDeposit }: { currency: string; minDeposit: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [method, setMethod] = useState<"xof" | "usdt">("xof");
  const [amount, setAmount] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState(user?.country || "");

  const { data: apiCountries = [] } = useQuery<ApiCountry[]>({ queryKey: ["/api/countries"] });
  const countryInfo = apiCountries.find((c: any) => c.code === selectedCountry);

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* Sub-method buttons */}
      <div style={{ padding: "14px 14px 10px", display: "flex", gap: 8 }}>
        {(["xof", "usdt"] as const).map(m => (
          <button key={m} onClick={() => setMethod(m)} style={{
            padding: "8px 18px", borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: "pointer",
            background: method === m ? GREEN : "transparent",
            color: method === m ? "white" : "#374151",
            border: method === m ? "none" : "1.5px solid #d1d5db",
          }}>
            {m === "xof" ? "XOF" : "USDT-OFFLINE"}
          </button>
        ))}
      </div>

      {method === "xof" ? (
        <div style={{ padding: "0 14px" }}>
          {/* Country selector */}
          <div style={{ marginBottom: 12, marginTop: 4 }}>
            <div style={{ color: "#374151", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Pays</div>
            <select
              value={selectedCountry}
              onChange={e => setSelectedCountry(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                border: "1.5px solid #d1d5db", borderRadius: 6,
                padding: "10px 12px", fontSize: 14, color: "#111827",
                background: "white", outline: "none", cursor: "pointer",
              }}
            >
              <option value="">-- Choisir un pays --</option>
              {apiCountries.map((c: any) => (
                <option key={c.code} value={c.code}>
                  {c.name} {c.currency ? `(${c.currency})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Amount input */}
          <div style={{ margin: "8px 0" }}>
            <input
              type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0"
              style={{
                width: "100%", boxSizing: "border-box", border: "1.5px solid #059669",
                borderRadius: 6, padding: "10px 14px", fontSize: 18, fontWeight: 700,
                color: "#111827", outline: "none",
              }}
            />
          </div>

          {/* Quick amounts */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#374151", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Montant du dépôt</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {QUICK_AMOUNTS.map(v => (
                <QuickBtn key={v} val={v} selected={String(v) === amount} onSelect={() => setAmount(String(v))} />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 10, padding: "4px 0" }}>
            <span style={{ color: "#dc2626", fontSize: 12 }}>
              Minimum unique {minDeposit.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {currency} Pour 500,000.00 {currency}
            </span>
          </div>

          {/* Procéder au paiement → Drimpay */}
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            <button
              onClick={() => {
                if (!selectedCountry)
                  return toast({ title: "Pays requis", description: "Veuillez choisir votre pays", variant: "destructive" });
                if (!amount || Number(amount) < minDeposit)
                  return toast({ title: "Montant invalide", description: `Minimum ${minDeposit.toLocaleString()} ${currency}`, variant: "destructive" });
                navigate(`/drimpay?amount=${Number(amount)}&country=${selectedCountry}`);
              }}
              style={{
                width: "100%", background: GREEN,
                color: "white", border: "none", borderRadius: 10,
                padding: "16px", fontWeight: 800, fontSize: 16, cursor: "pointer",
                letterSpacing: 0.5,
              }}
            >
              Procéder au paiement
            </button>
          </div>
        </div>
      ) : (
        /* USDT-OFFLINE */
        <div style={{ padding: "0 14px" }}>
          <div style={{ borderBottom: "1px solid #f3f4f6", padding: "12px 0" }}>
            <button style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#6b7280", fontSize: 13 }}>SÉLECTIONNER USDT</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#9ca3af", fontSize: 13 }}>Sélectionner</span>
                <ChevronRight size={15} color="#9ca3af" />
              </div>
            </button>
          </div>
          <div style={{ borderBottom: "1px solid #f3f4f6", padding: "12px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#6b7280", fontSize: 13 }}>Délai de dépôt</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{new Date().toISOString().slice(0, 19).replace("T", " ")}</span>
              <ChevronRight size={15} color="#9ca3af" />
            </div>
          </div>

          <div style={{ margin: "12px 0" }}>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
              style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #059669", borderRadius: 6, padding: "10px 14px", fontSize: 18, fontWeight: 700, outline: "none" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#374151", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Montant du dépôt(USDT)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {QUICK_AMOUNTS.map(v => (
                <QuickBtn key={v} val={v} selected={String(v) === amount} onSelect={() => setAmount(String(v))} />
              ))}
            </div>
          </div>
          <p style={{ color: "#dc2626", fontSize: 12, textAlign: "right", marginBottom: 6 }}>
            ≈ {amount ? Math.round(Number(amount) * 650).toLocaleString("fr-FR") : 0} {currency}
          </p>
          <p style={{ color: "#dc2626", fontSize: 12, marginBottom: 14 }}>
            (Reference exchange rate: 1 USDT ≈ 650 {currency})
          </p>
          <p style={{ color: "#6b7280", fontSize: 12, marginBottom: 20, lineHeight: 1.6 }}>
            Veuillez lire le <span style={{ color: GREEN, textDecoration: "underline" }}>Règles de recharge</span>recharge.readRuleBehind
          </p>
          <button
            onClick={() => alert("La crypto monnaie sera bientôt disponible")}
            style={{ width: "100%", background: GREEN, color: "white", border: "none", borderRadius: 8, padding: "15px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
            SOUMETTRE
          </button>
        </div>
      )}
    </div>
  );
}

/* ════════════════ RETRAIT FORM ════════════════ */
function RetraitForm({ balance, currency, minWithdrawal, withdrawalFee, maxWithdrawalsPerDay }: {
  balance: number; currency: string; minWithdrawal: number; withdrawalFee: number; maxWithdrawalsPerDay: number;
}) {
  const { refreshUser } = useAuth();
  const { toast }       = useToast();
  const qc              = useQueryClient();
  const [, navigate]    = useLocation();

  const { data: eligibility } = useQuery<{ eligible: boolean; unlocked: boolean; days: number; needed: number }>({
    queryKey: ["/api/withdrawal/eligibility"],
    staleTime: 30_000,
  });
  const [method, setMethod] = useState<"local" | "transfert">("local");
  const [amount, setAmount] = useState<string>("");
  const [showWallets, setShowWallets] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);

  const { data: wallets = [] } = useQuery<WalletData[]>({ queryKey: ["/api/wallets"] });
  useEffect(() => {
    if (!selectedWallet && wallets.length > 0) {
      const def = wallets.find(w => w.isDefault) || wallets[0];
      if (def) setSelectedWallet(def);
    }
  }, [wallets, selectedWallet]);

  const amountAfterFees = amount ? Math.floor(Number(amount) * (1 + withdrawalFee / 100)) : 0;

  const withdrawMut = useMutation({
    mutationFn: async () => {
      if (!selectedWallet) throw new Error("Veuillez sélectionner un compte bancaire");
      const r = await apiRequest("POST", "/api/withdrawals", { amount: Number(amount), walletId: selectedWallet.id });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Demande envoyée", description: "Votre demande de retrait est en cours." });
      refreshUser();
      qc.invalidateQueries({ queryKey: ["/api/withdrawals"] });
      setAmount("");
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!amount || Number(amount) < minWithdrawal)
      return toast({ title: "Montant invalide", description: `Minimum ${minWithdrawal.toLocaleString()} ${currency}`, variant: "destructive" });
    if (!selectedWallet)
      return toast({ title: "Compte requis", description: "Sélectionnez un compte bancaire", variant: "destructive" });
    withdrawMut.mutate();
  };

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* Sub-method buttons */}
      <div style={{ padding: "14px 14px 10px", display: "flex", gap: 8, overflowX: "auto" }}>
        {(["local", "transfert"] as const).map(m => (
          <button key={m} onClick={() => setMethod(m)} style={{
            padding: "8px 14px", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
            background: method === m ? GREEN : "transparent",
            color: method === m ? "white" : "#374151",
            border: method === m ? "none" : "1.5px solid #d1d5db",
          }}>
            {m === "local" ? "VIREMENT BANCAIRE LOCAL" : "TRANSFERT USDT"}
          </button>
        ))}
      </div>

      {method === "transfert" && (
        <div style={{ margin: "32px 14px", textAlign: "center", padding: "28px 20px", background: "#f9fafb", borderRadius: 12, border: "1.5px dashed #d1d5db" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🪙</div>
          <p style={{ fontWeight: 800, fontSize: 15, color: "#111827", marginBottom: 6 }}>
            Crypto monnaie (USDT)
          </p>
          <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
            La crypto monnaie sera bientôt disponible.
          </p>
        </div>
      )}

      {method === "local" && <div style={{ padding: "0 14px" }}>

        {/* Volume d'échange */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
          <span style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>Volume<br/>d'échange valide</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: GREEN }}>{fmtBal(balance)}/{fmtBal(balance)}</span>
            <ChevronRight size={14} color="#9ca3af" />
          </div>
        </div>

        {/* Instructions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
          <span style={{ color: GREEN, fontWeight: 600, fontSize: 13 }}>Instructions</span>
          <Info size={14} color="#9ca3af" />
          <div style={{ flex: 1, height: 6, background: "#e5e7eb", borderRadius: 4 }}>
            <div style={{ width: "85%", height: 6, background: "#3b82f6", borderRadius: 4 }} />
          </div>
        </div>

        {/* Bank selector */}
        <div style={{ borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "12px 0" }}>
            <span style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>Banque</span>
            <button onClick={() => setShowWallets(!showWallets)} style={{
              background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>
                {selectedWallet
                  ? `${selectedWallet.accountName} (${selectedWallet.accountNumber})`
                  : "Sélectionner"}
              </span>
              <span style={{ fontSize: 18, color: "#374151" }}>⌄</span>
            </button>
          </div>
          {showWallets && (
            <div style={{ paddingBottom: 8 }}>
              {wallets.length === 0 ? (
                <button onClick={() => navigate("/wallet")} style={{ background: GREEN, color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
                  + Ajouter un compte bancaire
                </button>
              ) : wallets.map(w => (
                <button key={w.id} onClick={() => { setSelectedWallet(w); setShowWallets(false); }} style={{
                  width: "100%", textAlign: "left", background: selectedWallet?.id === w.id ? "rgba(21,128,61,0.07)" : "none",
                  border: "none", borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "#111827",
                }}>
                  {w.accountName} · {w.accountNumber} · {w.paymentMethod}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Solde */}
        <InfoRow label="Solde" value={fmtBal(balance)} />

        {/* Regular label */}
        <div style={{ textAlign: "center", padding: "10px 0", color: "#9ca3af", fontSize: 14 }}>Regular</div>

        {/* Amount input */}
        <div style={{ marginBottom: 12 }}>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder=""
            style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: "1.5px solid #d1d5db", padding: "10px 0", fontSize: 20, fontWeight: 700, outline: "none", textAlign: "center" }} />
        </div>

        {/* Quick amounts */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "#374151", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Montant de retrait</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {QUICK_AMOUNTS.map(v => (
              <QuickBtn key={v} val={v} selected={String(v) === amount} onSelect={() => setAmount(String(v))} />
            ))}
          </div>
        </div>

        <InfoRow label={`Frais de retrait(%)`} value={`${withdrawalFee}%`} />
        <InfoRow label="Montant réel de la transaction" value={amountAfterFees > 0 ? fmtBal(amountAfterFees) : "—"} />
        <InfoRow
          label="Fourchette de montant"
          value={`${minWithdrawal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}-500,000.00`}
          red
        />
        <InfoRow label="Temps restant pour le retrait" value={<span style={{ color: "#dc2626" }}>{maxWithdrawalsPerDay}</span>} />

        {/* Notes */}
        <p style={{ color: "#9ca3af", fontSize: 12, lineHeight: 1.7, margin: "12px 0 4px" }}>
          Frais de retrait = Montant facturé comme frais de traitement
        </p>
        <p style={{ color: "#9ca3af", fontSize: 12, lineHeight: 1.7, marginBottom: 20 }}>
          *Remarque : Le montant réel de la transaction peut toujours être soumis à des frais bancaires..
        </p>

        {/* SOUMETTRE */}
        <button onClick={handleSubmit} disabled={withdrawMut.isPending} style={{
          width: "100%", background: GREEN, color: "white", border: "none", borderRadius: 8,
          padding: "15px", fontWeight: 800, fontSize: 16, cursor: "pointer",
          opacity: withdrawMut.isPending ? 0.7 : 1,
        }}>
          {withdrawMut.isPending ? "En cours..." : "SOUMETTRE"}
        </button>
      </div>}
    </div>
  );
}

/* ════════════════ MAIN PAGE ════════════════ */
export default function DepotRetraitPage() {
  const { user }     = useAuth();
  const [, navigate] = useLocation();
  const search       = useSearch();
  const initTab      = new URLSearchParams(search).get("tab") === "retrait" ? "retrait" : "depot";
  const [tab, setTab] = useState<"depot" | "retrait">(initTab as any);

  const { data: settings } = useQuery<Record<string, string>>({ queryKey: ["/api/settings"] });
  const { data: wSettings } = useQuery<{
    withdrawalFees: number; withdrawalStartHour: number; withdrawalEndHour: number;
    maxWithdrawalsPerDay: number; minWithdrawal: number;
  }>({ queryKey: ["/api/settings/withdrawal"] });

  const { data: apiCountries = [] } = useQuery<ApiCountry[]>({ queryKey: ["/api/countries"] });
  const country = user?.country || "";
  const countryInfo = apiCountries.find(c => c.code === country) || COUNTRIES.find(c => c.code === country);
  const currency = (countryInfo as any)?.currency || "CFA";

  const minDeposit         = parseInt(settings?.minDeposit || "1000");
  const minWithdrawal      = wSettings?.minWithdrawal      ?? 1000;
  const withdrawalFee      = wSettings?.withdrawalFees     ?? 18;
  const maxWithdrawalsPerDay = wSettings?.maxWithdrawalsPerDay ?? 1;
  const balance            = parseFloat(user?.balance || "0");

  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", flexDirection: "column" }}>

      {/* ── Header ── */}
      <div style={{ background: GREEN, flexShrink: 0 }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px" }}>
          <button onClick={() => navigate("/account")} style={{ background: "none", border: "none", cursor: "pointer", color: "white", fontSize: 22, padding: "0 10px 0 0" }}>‹</button>
          <h1 style={{ flex: 1, textAlign: "center", color: "white", fontWeight: 700, fontSize: 17, margin: 0 }}>Dépôt et retrait</h1>
          <button
            onClick={() => navigate(tab === "depot" ? "/deposit-history" : "/withdrawal-history")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "white", fontSize: 14, fontWeight: 700 }}
          >
            Dossiers
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ padding: "0 14px" }}>
          <div style={{ background: DARK, borderRadius: "10px 10px 0 0", display: "flex", overflow: "hidden" }}>
            {(["depot", "retrait"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: "13px 0", fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer",
                background: tab === t ? "white" : "transparent",
                color: tab === t ? "#111827" : "rgba(255,255,255,0.7)",
                borderRadius: tab === t ? (t === "depot" ? "10px 0 0 0" : "0 10px 0 0") : 0,
              }}>
                {t === "depot" ? "Dépôt" : "Retrait"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, background: "white", overflowY: "auto", paddingBottom: 80 }}>
        {tab === "depot" ? (
          <DepotForm currency={currency} minDeposit={minDeposit} />
        ) : (
          <RetraitForm
            balance={balance} currency={currency}
            minWithdrawal={minWithdrawal} withdrawalFee={withdrawalFee}
            maxWithdrawalsPerDay={maxWithdrawalsPerDay}
          />
        )}
      </div>

    </div>
  );
}
