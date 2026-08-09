/**
 * WestPayReturnPage — Page de retour après paiement WestPay
 * WestPay redirige ici avec ?status=success&amount=X&ref=OP-xxx&depositId=Y
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const BG_BLUE  = "#1a3a5c";
const BG_GREEN = "#16a34a";
const BG_RED   = "#dc2626";

type ReturnStatus = "polling" | "success" | "pending" | "failed";

export default function WestPayReturnPage() {
  const { refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const params    = new URLSearchParams(window.location.search);
  const status    = params.get("status") || "";
  const ref       = params.get("ref") || "";
  const depositId = parseInt(params.get("depositId") || "0", 10);
  const amount    = params.get("amount") || "";

  const [page, setPage] = useState<ReturnStatus>("polling");

  useEffect(() => {
    // Si WestPay retourne status=success, on poll notre DB pour confirmation
    if (status === "success" && depositId) {
      let attempts = 0;
      const maxAttempts = 24; // 2 minutes (5s x 24)
      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch(`/api/deposits/${depositId}/westpay-status`, { credentials: "include" });
          const data = await res.json();
          if (data.status === "approved") {
            clearInterval(interval);
            refreshUser();
            qc.invalidateQueries({ queryKey: ["/api/deposits/history"] });
            setPage("success");
          } else if (data.status === "rejected" || data.status === "failed") {
            clearInterval(interval);
            setPage("failed");
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            setPage("pending"); // En attente de validation manuelle
          }
        } catch { /* ignore */ }
      }, 5000);
      return () => clearInterval(interval);
    } else if (status === "success") {
      setPage("pending");
    } else {
      setPage("failed");
    }
  }, [status, depositId]);

  const goHome = () => navigate("/");

  return (
    <div style={{ minHeight: "100vh", background: BG_BLUE, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "36px 28px", width: "100%", maxWidth: 380, textAlign: "center" }}>

        {page === "polling" && (
          <>
            <Loader2 style={{ width: 52, height: 52, color: BG_BLUE, margin: "0 auto 20px" }} className="animate-spin" />
            <p style={{ fontSize: 17, fontWeight: 700, color: "#1a3a5c", marginBottom: 8 }}>Confirmation en cours…</p>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
              Nous attendons la confirmation de votre paiement.
            </p>
            {ref && (
              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 16 }}>Réf : {ref}</p>
            )}
          </>
        )}

        {page === "success" && (
          <>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 36 }}>
              ✅
            </div>
            <p style={{ fontSize: 18, fontWeight: 800, color: BG_GREEN, marginBottom: 8 }}>Dépôt confirmé !</p>
            {amount && (
              <p style={{ fontSize: 22, fontWeight: 900, color: "#1a3a5c", marginBottom: 4 }}>
                {Number(amount).toLocaleString("fr-FR")} XOF
              </p>
            )}
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 28, lineHeight: 1.6 }}>
              Votre solde a été crédité avec succès.
            </p>
            <button onClick={goHome}
              style={{ width: "100%", padding: "14px 0", borderRadius: 10, background: BG_GREEN, color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
              Retour à l'accueil
            </button>
          </>
        )}

        {page === "pending" && (
          <>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 36 }}>
              ⏳
            </div>
            <p style={{ fontSize: 18, fontWeight: 800, color: "#d97706", marginBottom: 8 }}>Paiement en attente</p>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8, lineHeight: 1.6 }}>
              Votre paiement a été initié. La validation peut prendre quelques minutes.
            </p>
            {ref && (
              <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 24 }}>Réf : <strong>{ref}</strong></p>
            )}
            <button onClick={goHome}
              style={{ width: "100%", padding: "14px 0", borderRadius: 10, background: BG_BLUE, color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
              Retour à l'accueil
            </button>
          </>
        )}

        {page === "failed" && (
          <>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 36 }}>
              ❌
            </div>
            <p style={{ fontSize: 18, fontWeight: 800, color: BG_RED, marginBottom: 8 }}>Paiement annulé</p>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 28, lineHeight: 1.6 }}>
              Le paiement n'a pas abouti ou a été annulé. Aucun montant n'a été débité.
            </p>
            <button onClick={() => navigate("/depot-retrait")}
              style={{ width: "100%", padding: "14px 0", borderRadius: 10, background: BG_RED, color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
              ‹ Réessayer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
