import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { FALLBACK_COUNTRIES, type ApiCountry } from "@/lib/countries";

interface CountrySelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (countryCode: string) => void;
  currentCode?: string;
}

export function CountrySelector({ open, onClose, onSelect, currentCode }: CountrySelectorProps) {
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<string>(currentCode ?? "");

  const { data: apiCountries } = useQuery<ApiCountry[]>({
    queryKey: ["/api/countries"],
    enabled: open,
  });

  const allCountries = (apiCountries && apiCountries.length > 0)
    ? apiCountries.filter(c => c.isActive).map(c => ({ code: c.code, name: c.name }))
    : FALLBACK_COUNTRIES.map(c => ({ code: c.code, name: c.name }));

  const filtered = search.trim()
    ? allCountries.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : allCountries;

  /* reset on open */
  useEffect(() => {
    if (open) {
      setSearch("");
      setSelected(currentCode ?? allCountries[0]?.code ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    if (selected) onSelect(selected);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          display: "flex",
          flexDirection: "column",
          maxHeight: "70vh",
          animation: "slideUp 0.22s ease-out both",
        }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
          }
        `}</style>

        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px", flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "#d1d5db" }} />
        </div>

        {/* Search */}
        <div style={{ padding: "4px 16px 10px", flexShrink: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#f3f4f6", borderRadius: 12,
            padding: "10px 14px",
          }}>
            <Search size={16} color="#9ca3af" />
            <input
              autoFocus
              type="text"
              placeholder="Saisir le nom du pays"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, border: "none", outline: "none",
                background: "transparent", fontSize: 14, color: "#374151",
              }}
            />
          </div>
        </div>

        {/* Country list */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
          {filtered.length === 0 && (
            <p style={{ textAlign: "center", color: "#9ca3af", padding: "32px 0", fontSize: 14 }}>
              Aucun pays trouvé
            </p>
          )}
          {filtered.map(country => {
            const isSelected = country.code === selected;
            return (
              <div
                key={country.code}
                onClick={() => setSelected(country.code)}
                style={{
                  padding: "15px 0",
                  textAlign: "center",
                  fontSize: isSelected ? 16 : 15,
                  fontWeight: isSelected ? 800 : 400,
                  color: isSelected ? "#111827" : "#6b7280",
                  borderBottom: "1px solid #f3f4f6",
                  background: isSelected ? "#f9fafb" : "transparent",
                  cursor: "pointer",
                }}
              >
                {country.name}
              </div>
            );
          })}
        </div>

        {/* Buttons */}
        <div style={{
          display: "flex", gap: 12, padding: "14px 16px",
          borderTop: "1px solid #f3f4f6", background: "#fff", flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "13px 0", borderRadius: 10,
              border: "1.5px solid #d1d5db", background: "#f9fafb",
              fontSize: 15, fontWeight: 600, color: "#6b7280", cursor: "pointer",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex: 1, padding: "13px 0", borderRadius: 10,
              border: "none", background: "#1a2a44",
              fontSize: 15, fontWeight: 700, color: "#fff", cursor: "pointer",
            }}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
