import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { ChevronRight, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const GREEN = "#15803d";
const TEAL  = "#0d9488";

/* ── API mutation ── */
function useProfileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const r = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message || "Erreur");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });
}

/* ── Generic text modal ── */
function TextModal({
  title, placeholder, current, onClose, onSave, loading,
}: {
  title: string; placeholder?: string; current?: string;
  onClose: () => void; onSave: (v: string) => void; loading: boolean;
}) {
  const [val, setVal] = useState(current || "");
  return (
    <Overlay onClose={onClose}>
      <h3 style={{ margin: "0 0 16px", fontWeight: 700, fontSize: 15 }}>{title}</h3>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "11px 14px", border: "1px solid #d1d5db",
          borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
        }}
      />
      <button
        disabled={loading}
        onClick={() => onSave(val.trim())}
        style={{
          marginTop: 14, width: "100%", padding: "12px 0", background: GREEN,
          border: "none", borderRadius: 10, color: "white", fontWeight: 700,
          fontSize: 15, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Enregistrement…" : "Enregistrer"}
      </button>
    </Overlay>
  );
}

/* ── Security question modal (question + answer) ── */
const QUESTIONS = [
  "Nom de jeune fille de votre mère ?",
  "Nom de votre animal de compagnie ?",
  "Ville où vous êtes né(e) ?",
  "Nom de votre école primaire ?",
  "Surnom d'enfance ?",
];

function SecurityModal({ current, currentAnswer, onClose, onSave, loading }: {
  current?: string; currentAnswer?: string;
  onClose: () => void; onSave: (q: string, a: string) => void; loading: boolean;
}) {
  const [q, setQ] = useState(current || QUESTIONS[0]);
  const [a, setA] = useState(currentAnswer || "");
  return (
    <Overlay onClose={onClose}>
      <h3 style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 15 }}>Question de sécurité</h3>
      <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Question</label>
      <select
        value={q} onChange={e => setQ(e.target.value)}
        style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 13, marginBottom: 12, boxSizing: "border-box" }}
      >
        {QUESTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Réponse</label>
      <input
        value={a} onChange={e => setA(e.target.value)} placeholder="Votre réponse…"
        style={{ width: "100%", padding: "11px 14px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box" }}
      />
      <button
        disabled={loading || !a.trim()}
        onClick={() => onSave(q, a.trim())}
        style={{
          marginTop: 14, width: "100%", padding: "12px 0", background: GREEN,
          border: "none", borderRadius: 10, color: "white", fontWeight: 700,
          fontSize: 15, cursor: (loading || !a.trim()) ? "not-allowed" : "pointer", opacity: (loading || !a.trim()) ? 0.7 : 1,
        }}
      >
        {loading ? "Enregistrement…" : "Enregistrer"}
      </button>
    </Overlay>
  );
}

/* ── Shortcut amount modal ── */
function ShortcutModal({ current, onClose, onSave, loading }: {
  current: string; onClose: () => void; onSave: (v: string) => void; loading: boolean;
}) {
  const parts = current.split("/");
  const [a, setA] = useState(parts[0] || "3000");
  const [b, setB] = useState(parts[1] || "5000");
  const [c, setC] = useState(parts[2] || "10000");
  const inp = (label: string, val: string, set: (v: string) => void) => (
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>{label}</label>
      <input
        value={val} onChange={e => set(e.target.value.replace(/\D/g, ""))} type="tel"
        style={{ width: "100%", padding: "10px 10px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", textAlign: "center" }}
      />
    </div>
  );
  return (
    <Overlay onClose={onClose}>
      <h3 style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 15 }}>Raccourci montant</h3>
      <div style={{ display: "flex", gap: 8 }}>
        {inp("Montant 1", a, setA)}
        {inp("Montant 2", b, setB)}
        {inp("Montant 3", c, setC)}
      </div>
      <button
        disabled={loading}
        onClick={() => onSave(`${a}/${b}/${c}`)}
        style={{
          marginTop: 14, width: "100%", padding: "12px 0", background: GREEN,
          border: "none", borderRadius: 10, color: "white", fontWeight: 700,
          fontSize: 15, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Enregistrement…" : "Enregistrer"}
      </button>
    </Overlay>
  );
}

/* ── Auto-bet modal ── */
function AutoBetModal({ current, onClose, onSave, loading }: {
  current: boolean; onClose: () => void; onSave: (v: boolean) => void; loading: boolean;
}) {
  const [enabled, setEnabled] = useState(current);
  return (
    <Overlay onClose={onClose}>
      <h3 style={{ margin: "0 0 16px", fontWeight: 700, fontSize: 15 }}>Paris automatique</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[true, false].map(opt => (
          <button
            key={String(opt)}
            onClick={() => setEnabled(opt)}
            style={{
              padding: "13px 16px", borderRadius: 10, border: `2px solid ${enabled === opt ? GREEN : "#d1d5db"}`,
              background: enabled === opt ? "rgba(21,128,61,0.07)" : "white",
              cursor: "pointer", textAlign: "left", fontWeight: enabled === opt ? 700 : 400,
              color: enabled === opt ? GREEN : "#374151", fontSize: 14,
            }}
          >
            {opt ? "✅  Activé — les paris se placent automatiquement" : "❌  Désactivé"}
          </button>
        ))}
      </div>
      <button
        disabled={loading}
        onClick={() => onSave(enabled)}
        style={{
          marginTop: 14, width: "100%", padding: "12px 0", background: GREEN,
          border: "none", borderRadius: 10, color: "white", fontWeight: 700,
          fontSize: 15, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Enregistrement…" : "Enregistrer"}
      </button>
    </Overlay>
  );
}

/* ── Overlay wrapper ── */
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: "100%", background: "white", borderRadius: "20px 20px 0 0",
        padding: "24px 20px 36px", position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 16, background: "none",
          border: "none", cursor: "pointer", color: "#6b7280",
        }}>
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}

/* ── Row component ── */
function Row({
  label, value, teal, chevron, onClick, separator = true,
}: {
  label: string; value?: React.ReactNode; teal?: boolean; chevron?: boolean;
  onClick?: () => void; separator?: boolean;
}) {
  const inner = (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "15px 18px",
      borderBottom: separator ? "1px solid #f3f4f6" : "none",
    }}>
      <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          fontSize: 13, fontWeight: teal ? 600 : 400,
          color: teal ? TEAL : "#374151",
          textAlign: "right", maxWidth: 190,
          wordBreak: "break-all",
        }}>
          {value ?? (teal ? "Configurez maintenant" : "")}
        </span>
        {chevron && <ChevronRight size={15} color="#9ca3af" />}
      </div>
    </div>
  );
  if (onClick) {
    return (
      <button onClick={onClick} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, display: "block" }}>
        {inner}
      </button>
    );
  }
  return inner;
}

/* ── Main page ── */
type Modal = "whatsapp" | "telegram" | "withdrawalCode" | "security" | "shortcuts" | "autoBet" | null;

export default function InfosPage() {
  const { user }     = useAuth();
  const [, navigate] = useLocation();
  const mutation     = useProfileMutation();
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError]  = useState("");

  if (!user) return null;

  const u = user as any;

  async function save(data: Record<string, any>) {
    setError("");
    try {
      await mutation.mutateAsync(data);
      setModal(null);
    } catch (e: any) {
      setError(e.message || "Erreur");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: GREEN, display: "flex", alignItems: "center", padding: "12px 16px" }}>
        <button onClick={() => navigate("/account")} style={{ background: "none", border: "none", cursor: "pointer", color: "white", fontSize: 22, padding: "0 10px 0 0" }}>‹</button>
        <h1 style={{ flex: 1, textAlign: "center", color: "white", fontWeight: 700, fontSize: 17, margin: 0 }}>Bienvenu</h1>
        <div style={{ width: 34 }} />
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: "#fef2f2", borderLeft: "4px solid #ef4444", padding: "10px 16px", fontSize: 13, color: "#dc2626" }}>
          {error}
        </div>
      )}

      {/* Card */}
      <div style={{ margin: "14px 12px", background: "white", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>

        <Row label="Vrai nom" value={u.fullName || "—"} />

        <Row
          label="WhatsApp"
          value={u.whatsapp || undefined}
          teal={!u.whatsapp}
          onClick={() => setModal("whatsapp")}
        />

        <Row
          label="Télégramme"
          value={u.telegram || undefined}
          teal={!u.telegram}
          onClick={() => setModal("telegram")}
        />

        <Row label="Numéro de téléphone" value={u.phone || "—"} />

        <Row label="E-mail" value={u.email || "—"} />

        <Row
          label="Mot de passe"
          value="*******"
          chevron
          onClick={() => navigate("/change-password")}
        />

        <Row
          label="questions de sécurité"
          value={u.securityQuestion || undefined}
          teal={!u.securityQuestion}
          onClick={() => setModal("security")}
        />

        {/* Spacer */}
        <div style={{ height: 14, background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }} />

        <Row
          label="Raccourci montant"
          value={u.amountShortcuts || "3000/5000/10000"}
          chevron
          onClick={() => setModal("shortcuts")}
        />

        <Row
          label="Paris automatique"
          value={u.autoBetEnabled ? "Activé" : undefined}
          teal={!u.autoBetEnabled}
          separator={false}
          onClick={() => setModal("autoBet")}
        />

      </div>

      {/* Modals */}
      {modal === "whatsapp" && (
        <TextModal
          title="Numéro WhatsApp"
          placeholder="+225 00 00 00 00 00"
          current={u.whatsapp}
          onClose={() => setModal(null)}
          onSave={v => save({ whatsapp: v })}
          loading={mutation.isPending}
        />
      )}
      {modal === "telegram" && (
        <TextModal
          title="Identifiant Télégramme"
          placeholder="@username ou numéro"
          current={u.telegram}
          onClose={() => setModal(null)}
          onSave={v => save({ telegram: v })}
          loading={mutation.isPending}
        />
      )}
      {modal === "security" && (
        <SecurityModal
          current={u.securityQuestion}
          currentAnswer=""
          onClose={() => setModal(null)}
          onSave={(q, a) => save({ securityQuestion: q, securityAnswer: a })}
          loading={mutation.isPending}
        />
      )}
      {modal === "shortcuts" && (
        <ShortcutModal
          current={u.amountShortcuts || "3000/5000/10000"}
          onClose={() => setModal(null)}
          onSave={v => save({ amountShortcuts: v })}
          loading={mutation.isPending}
        />
      )}
      {modal === "autoBet" && (
        <AutoBetModal
          current={!!u.autoBetEnabled}
          onClose={() => setModal(null)}
          onSave={v => save({ autoBetEnabled: v })}
          loading={mutation.isPending}
        />
      )}
    </div>
  );
}
