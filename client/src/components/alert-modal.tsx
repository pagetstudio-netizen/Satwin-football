/**
 * AlertModal — remplace le Toaster shadcn.
 * Lit le même état useToast() et affiche un modal centré style screenshot.
 * Aucun changement nécessaire dans les composants existants.
 */
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

const GREEN  = "#15803d";
const RED    = "#dc2626";
const ORANGE = "#f59e0b";

type Variant = "default" | "destructive" | "success" | "warning" | (string & {});

function iconFor(variant: Variant | undefined) {
  if (variant === "destructive") {
    return (
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
        <circle cx="26" cy="26" r="24" stroke={RED} strokeWidth="3" fill="none" />
        <line x1="16" y1="16" x2="36" y2="36" stroke={RED} strokeWidth="3.5" strokeLinecap="round" />
        <line x1="36" y1="16" x2="16" y2="36" stroke={RED} strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (variant === "warning") {
    return (
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
        <circle cx="26" cy="26" r="24" stroke={ORANGE} strokeWidth="3" fill="none" />
        <line x1="26" y1="15" x2="26" y2="30" stroke={ORANGE} strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="26" cy="37" r="2.5" fill={ORANGE} />
      </svg>
    );
  }
  // default / success
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
      <circle cx="26" cy="26" r="24" stroke={GREEN} strokeWidth="3" fill="none" />
      <polyline points="15,27 23,35 37,19" stroke={GREEN} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function titleColor(variant: Variant | undefined) {
  if (variant === "destructive") return RED;
  if (variant === "warning") return ORANGE;
  return GREEN;
}

function titleFor(variant: Variant | undefined, title?: React.ReactNode) {
  if (title) return String(title);
  if (variant === "destructive") return "Échec de la soumission";
  if (variant === "warning") return "Attention";
  return "Succès";
}

export function AlertModal() {
  const { toasts, dismiss } = useToast();
  const visible = toasts.find(t => t.open !== false);

  // Auto-dismiss success/info after 3 s (errors stay until user confirms)
  useEffect(() => {
    if (!visible) return;
    if (visible.variant !== "destructive" && visible.variant !== "warning") {
      const t = setTimeout(() => dismiss(visible.id), 3000);
      return () => clearTimeout(t);
    }
  }, [visible?.id]);

  if (!visible) return null;

  const { id, title, description, variant } = visible;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
        padding: "0 20px",
      }}
      onClick={() => dismiss(id)}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: "32px 24px 24px",
          maxWidth: 340,
          width: "100%",
          boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 0,
          animation: "alertIn 0.18s ease",
        }}
      >
        {/* Icon */}
        <div style={{ marginBottom: 14 }}>
          {iconFor(variant)}
        </div>

        {/* Title */}
        <p style={{
          fontWeight: 700, fontSize: 16,
          color: titleColor(variant),
          textAlign: "center", margin: "0 0 12px",
          lineHeight: 1.4,
        }}>
          {titleFor(variant, title)}
        </p>

        {/* Body */}
        {description && (
          <p style={{
            fontSize: 14, color: "#374151",
            textAlign: "center", lineHeight: 1.7,
            margin: "0 0 22px",
          }}>
            {String(description)}
          </p>
        )}
        {!description && title && variant !== "destructive" && variant !== "warning" && (
          <p style={{ fontSize: 14, color: "#374151", textAlign: "center", lineHeight: 1.7, margin: "0 0 22px" }}>
            {String(title)}
          </p>
        )}

        {/* Button */}
        <button
          onClick={() => dismiss(id)}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 10,
            background: GREEN,
            color: "#fff",
            fontWeight: 700, fontSize: 15,
            border: "none", cursor: "pointer",
            letterSpacing: 1,
          }}
        >
          CONFIRMER
        </button>
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
