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

const ITEM_H  = 48;   // height per row  (px)
const VISIBLE = 7;    // total rows shown in the drum window
const SIDE    = Math.floor(VISIBLE / 2); // 3 rows above/below center
const DRUM_H  = ITEM_H * VISIBLE;        // 336 px

export function CountrySelector({ open, onClose, onSelect, currentCode }: CountrySelectorProps) {
  const [search,    setSearch]    = useState("");
  const [centerIdx, setCenterIdx] = useState(0);
  const scrollEl   = useRef<HTMLDivElement>(null);
  const snapTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /* ── scroll to index (no snap CSS — pure JS) ── */
  const goTo = useCallback((idx: number, smooth = true) => {
    const el = scrollEl.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(idx, filtered.length - 1));
    el.scrollTo({ top: clamped * ITEM_H, behavior: smooth ? "smooth" : "instant" });
    setCenterIdx(clamped);
  }, [filtered.length]);

  /* ── snap after user stops scrolling ── */
  const onScroll = () => {
    if (!scrollEl.current) return;
    const raw = scrollEl.current.scrollTop / ITEM_H;
    const idx = Math.max(0, Math.min(Math.round(raw), filtered.length - 1));
    setCenterIdx(idx);                       // live bold update while scrolling

    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {   // snap 120ms after scroll stops
      goTo(idx, true);
    }, 120);
  };

  /* ── reset when modal opens ── */
  useEffect(() => {
    if (!open) return;
    setSearch("");
    const startIdx = currentCode
      ? Math.max(0, allCountries.findIndex(c => c.code === currentCode))
      : 0;
    // two rAF so the DOM is ready
    requestAnimationFrame(() => requestAnimationFrame(() => goTo(startIdx, false)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ── reset to top when search changes ── */
  useEffect(() => {
    setCenterIdx(0);
    requestAnimationFrame(() => requestAnimationFrame(() => goTo(0, false)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (!open) return null;

  const handleConfirm = () => {
    const c = filtered[centerIdx];
    if (c) onSelect(c.code);
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
          width: "100%", background: "#fff",
          borderRadius: "20px 20px 0 0",
          display: "flex", flexDirection: "column",
          animation: "slideUp 0.22s ease-out both",
        }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to   { transform: translateY(0%); }
          }
          .drum-scroll::-webkit-scrollbar { display: none; }
          .drum-scroll { scrollbar-width: none; }
        `}</style>

        {/* Drag handle */}
        <div style={{ display:"flex", justifyContent:"center", padding:"10px 0 6px", flexShrink:0 }}>
          <div style={{ width:40, height:4, borderRadius:2, background:"#d1d5db" }} />
        </div>

        {/* Search bar */}
        <div style={{ padding:"4px 16px 12px", flexShrink:0 }}>
          <div style={{
            display:"flex", alignItems:"center", gap:8,
            background:"#f3f4f6", borderRadius:12, padding:"10px 14px",
          }}>
            <Search size={16} color="#9ca3af" />
            <input
              autoFocus
              type="text"
              placeholder="Saisir le nom du pays"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex:1, border:"none", outline:"none",
                background:"transparent", fontSize:14, color:"#374151",
              }}
            />
          </div>
        </div>

        {/* ── Drum wheel ── */}
        <div style={{
          position: "relative",
          height: DRUM_H,
          overflow: "hidden",
          flexShrink: 0,
        }}>
          {/* ① Center selection band — sits BEHIND the text (z-index 0) */}
          <div style={{
            position: "absolute",
            top:  SIDE * ITEM_H,
            height: ITEM_H,
            left: 0, right: 0,
            background: "#f0f0f0",
            borderTop: "1.5px solid #d1d5db",
            borderBottom: "1.5px solid #d1d5db",
            zIndex: 0,
            pointerEvents: "none",
          }} />

          {/* ② Top fade — sits ABOVE text to fade items at edge */}
          <div style={{
            position:"absolute", top:0, left:0, right:0,
            height: SIDE * ITEM_H,
            background:"linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)",
            zIndex: 2, pointerEvents:"none",
          }} />

          {/* ③ Bottom fade */}
          <div style={{
            position:"absolute", bottom:0, left:0, right:0,
            height: SIDE * ITEM_H,
            background:"linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)",
            zIndex: 2, pointerEvents:"none",
          }} />

          {/* ④ Scrollable list — z-index 1 so text is above the band */}
          <div
            ref={scrollEl}
            className="drum-scroll"
            onScroll={onScroll}
            style={{
              position: "relative",
              zIndex: 1,
              height: "100%",
              overflowY: "scroll",
              overflowX: "hidden",
            }}
          >
            {/* top spacer: SIDE rows so first item can reach center */}
            <div style={{ height: SIDE * ITEM_H }} />

            {filtered.length === 0 ? (
              <div style={{
                height: ITEM_H, display:"flex",
                alignItems:"center", justifyContent:"center",
                color:"#9ca3af", fontSize:14,
              }}>
                Aucun pays trouvé
              </div>
            ) : filtered.map((country, i) => {
              const dist = Math.abs(i - centerIdx);
              const isCenter = dist === 0;
              return (
                <div
                  key={country.code}
                  onClick={() => goTo(i)}
                  style={{
                    height: ITEM_H,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    userSelect: "none",
                    fontSize: isCenter ? 17 : dist === 1 ? 15 : 14,
                    fontWeight: isCenter ? 800 : 400,
                    color: isCenter ? "#111827"
                         : dist === 1 ? "#6b7280"
                         : "#b0b0b0",
                    transition: "font-size 0.1s, color 0.1s, font-weight 0.1s",
                  }}
                >
                  {country.name}
                </div>
              );
            })}

            {/* bottom spacer */}
            <div style={{ height: SIDE * ITEM_H }} />
          </div>
        </div>

        {/* Buttons */}
        <div style={{
          display:"flex", gap:12, padding:"14px 16px",
          borderTop:"1px solid #f3f4f6", background:"#fff", flexShrink:0,
        }}>
          <button
            onClick={onClose}
            style={{
              flex:1, padding:"13px 0", borderRadius:10,
              border:"1.5px solid #d1d5db", background:"#f9fafb",
              fontSize:15, fontWeight:600, color:"#6b7280", cursor:"pointer",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex:1, padding:"13px 0", borderRadius:10,
              border:"none", background:"#1a2a44",
              fontSize:15, fontWeight:700, color:"#fff", cursor:"pointer",
            }}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
