interface EmptyStateProps {
  message?: string;
}

export default function EmptyState({ message = "Aucune donnée disponible" }: EmptyStateProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "40px 24px", gap: 14,
    }}>
      <img
        src="/empty.png"
        alt="Vide"
        style={{ width: 160, height: "auto", opacity: 0.85 }}
      />
      <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", margin: 0 }}>{message}</p>
    </div>
  );
}
