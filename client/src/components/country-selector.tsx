import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import { Search } from "lucide-react";
import { FALLBACK_COUNTRIES, type ApiCountry } from "@/lib/countries";

interface CountrySelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (countryCode: string) => void;
  currentCode?: string;
}

const ITEM_H = 54;        // px per row
const VISIBLE = 5;        // rows visible in the drum
const DRUM_H = ITEM_H * VISIBLE; // 270px

export function CountrySelector({ open, onClose, onSelect, currentCode }: CountrySelectorProps) {
  const [search, setSearch]     = useState("");
  const [centerIdx, setCenterIdx] = useState(0);
  const drumRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  /* ── data ── */
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

  /* ── scroll helpers ── */
  const scrollToIdx = useCallback((idx: number, smooth = true) => {
    if (!drumRef.current) return;
    drumRef.current.scrollTo({ top: idx * ITEM_H, behavior: smooth ? "smooth" : "instant" });
    setCenterIdx(idx);
  }, []);

  /* snap on scroll end */
  const handleScroll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!drumRef.current) return;
      const raw  = drumRef.current.scrollTop / ITEM_H;
      const idx  = Math.max(0, Math.min(Math.round(raw), filtered.length - 1));
      setCenterIdx(idx);
      /* snap to nearest row if not exact */
      if (Math.abs(raw - idx) > 0.02) {
        scrollingRef.current = true;
        drumRef.current.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
        setTimeout(() => { scrollingRef.current = false; }, 300);
      }
    });
  };

  /* reset when opening */
  useEffect(() => {
    if (!open) return;
    setSearch("");
    const startIdx = currentCode
      ? Math.max(0, allCountries.findIndex(c => c.code === currentCode))
      : 0;
    /* wait one frame for the DOM */
    requestAnimationFrame(() => scrollToIdx(startIdx, false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* when filtered list changes (typing), reset to 0 */
  useEffect(() => {
    setCenterIdx(0);
    requestAnimationFrame(() => scrollToIdx(0, false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, search]);

  if (!open) return null;

  const handleConfirm = () => {
    const country = filtered[centerIdx];
    if (country) { onSelect(country.code); }
    onClose();
  };

  return (
    /* Backdrop – no animation on click to avoid jitter */
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "flex-end",
      }}
      onClick={onClose}
    >
      {/* Sheet — slides up once, then stays still */}
      <div
        style={{
          width: "100%",
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          /* NO spring/bounce animation */
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
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "#d1d5db" }} />
        </div>

        {/* Search */}
        <div style={{ padding: "8px 16px 10px" }}>
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

        {/* ── Drum picker ── */}
        <div style={{ position: "relative", height: DRUM_H, overflow: "hidden" }}>

          {/* top fade */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0,
            height: ITEM_H * 2,
            background: "linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(255,255,255,0))",
            zIndex: 2, pointerEvents: "none",
          }} />

          {/* center highlight band */}
          <div style={{
            position: "absolute",
            top: ITEM_H * 2, height: ITEM_H,
            left: 0, right: 0,
            background: "#f3f4f6",
            borderTop: "1px solid #e5e7eb",
            borderBottom: "1px solid #e5e7eb",
            zIndex: 1, pointerEvents: "none",
          }} />

          {/* bottom fade */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: ITEM_H * 2,
            background: "linear-gradient(to top, rgba(255,255,255,0.95), rgba(255,255,255,0))",
            zIndex: 2, pointerEvents: "none",
          }} />

          {/* scrollable list */}
          <div
            ref={drumRef}
            onScroll={handleScroll}
            style={{
              height: "100%",
              overflowY: "scroll",
              scrollSnapType: "y mandatory",
              /* hide scrollbar */
              scrollbarWidth: "none",
            }}
          >
            <style>{`div::-webkit-scrollbar { display: none; }`}</style>

            {/* top padding so first item can reach center */}
            <div style={{ height: ITEM_H * 2 }} />

            {filtered.map((country, i) => {
              const dist = Math.abs(i - centerIdx);
              const isCenter = dist === 0;
              const opacity = dist === 0 ? 1 : dist === 1 ? 0.55 : dist === 2 ? 0.3 : 0.15;
              const fontSize = dist === 0 ? 17 : dist === 1 ? 15 : 13;
              const fontWeight = isCenter ? 800 : 400;
              const color = isCenter ? "#111827" : "#6b7280";

              return (
                <div
                  key={country.code}
                  onClick={() => scrollToIdx(i)}
                  style={{
                    height: ITEM_H,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    scrollSnapAlign: "center",
                    cursor: "pointer",
                    transition: "opacity 0.15s, font-size 0.15s, font-weight 0.15s",
                    opacity,
                    fontSize,
                    fontWeight,
                    color,
                    userSelect: "none",
                  }}
                >
                  {country.name}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div style={{
                height: ITEM_H, display: "flex",
                alignItems: "center", justifyContent: "center",
                color: "#9ca3af", fontSize: 14,
              }}>
                Aucun pays trouvé
              </div>
            )}

            {/* bottom padding so last item can reach center */}
            <div style={{ height: ITEM_H * 2 }} />
          </div>
        </div>

        {/* Actions */}
        <div style={{
          display: "flex", gap: 12, padding: "14px 16px",
          borderTop: "1px solid #f3f4f6", background: "#fff",
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
