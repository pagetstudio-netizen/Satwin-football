/**
 * WestPayPage — Initiation dépôt via WestPay (page de paiement hébergée)
 * Flow : créer dépôt → rediriger vers westpay.cfd/pay → retour sur /westpay-return
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

const BG_BLUE = "#1a3a5c";

export default function WestPayPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "redirecting" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const params  = new URLSearchParams(window.location.search);
  const amount  = parseFloat(params.get("amount") || "0");
  const country = params.get("country") || user?.country || "";

  useEffect(() => {
    if (!user || !amount || !country) {
      setStatus("error");
      setErrorMsg("Paramètres manquants");
      return;
    }

    const init = async () => {
      try {
        setStatus("loading");
        const baseUrl = window.location.origin;
        const res = await apiRequest("POST", "/api/westpay/create-deposit", {
          amount,
          country,
          baseUrl,
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.message || "Erreur création dépôt");
        }
        const data = await res.json();
        setStatus("redirecting");
        // Courte pause pour que l'utilisateur voit l'écran de redirection
        setTimeout(() => {
          window.location.href = data.payUrl;
        }, 800);
      } catch (e: any) {
        setStatus("error");
        setErrorMsg(e.message || "Erreur inattendue");
      }
    };

    init();
  }, [user, amount, country]);

  if (!user || !amount) return null;

  return (
    <div style={{ minHeight: "100vh", background: BG_BLUE, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      {/* Logo / Titre */}
      <div style={{ marginBottom: 40, textAlign: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 6 }}>Montant :</p>
        <p style={{ color: "#fff", fontSize: 42, fontWeight: 900, lineHeight: 1, margin: 0, letterSpacing: -1 }}>
          {Math.round(amount).toLocaleString("fr-FR")}
        </p>
        <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 18, fontWeight: 700, marginTop: 4 }}>XOF</p>
      </div>

      <div style={{ background: "#fff", borderRadius: 20, padding: "32px 28px", width: "100%", maxWidth: 380, textAlign: "center" }}>
        {status === "loading" && (
          <>
            <Loader2 style={{ width: 48, height: 48, color: BG_BLUE, margin: "0 auto 16px" }} className="animate-spin" />
            <p style={{ fontSize: 16, fontWeight: 700, color: "#1a3a5c", marginBottom: 8 }}>Préparation du paiement…</p>
            <p style={{ fontSize: 13, color: "#6b7280" }}>Veuillez patienter</p>
          </>
        )}

        {status === "redirecting" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#1a3a5c", marginBottom: 8 }}>Redirection vers WestPay…</p>
            <p style={{ fontSize: 13, color: "#6b7280" }}>Vous allez être redirigé vers la page de paiement sécurisée</p>
            <Loader2 style={{ width: 24, height: 24, color: "#6b7280", margin: "16px auto 0" }} className="animate-spin" />
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>Erreur</p>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>{errorMsg}</p>
            <button
              onClick={() => navigate("/depot-retrait")}
              style={{ width: "100%", padding: "14px 0", borderRadius: 10, background: BG_BLUE, color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
              ‹ Retour
            </button>
          </>
        )}
      </div>
    </div>
  );
}
