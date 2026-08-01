import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import satwinLogo from "@/assets/satwin-logo.jpg";

const GREEN = "#15803d";
const GRAY  = "#9E9E9E";

/* CSS filter to tint a black PNG to the target colour */
const filterGreen = "invert(35%) sepia(77%) saturate(800%) hue-rotate(97deg) brightness(85%) contrast(110%)";
const filterGray  = "invert(65%) sepia(0%) saturate(0%) brightness(95%)";

interface NavItem {
  path: string;
  label: string;
  icon: string;        // public path
  invertFirst?: boolean; // true for white-on-black source images
}

const leftItems: NavItem[] = [
  { path: "/",      label: "Accueil", icon: "/icon-home.png",  invertFirst: true },
  { path: "/match", label: "Matchs",  icon: "/icon-match.png", invertFirst: false },
];
const rightItems: NavItem[] = [
  { path: "/team",    label: "Équipe",  icon: "/icon-equipe.png", invertFirst: false },
  { path: "/account", label: "Ma page", icon: "/icon-compte.png", invertFirst: true },
];

const menuItems = [
  { label: "Liste des événements",    path: "/match",      icon: "⚽" },
  { label: "Détails de l'échange",    path: "/billet",     icon: "📋" },
  { label: "Histoire",                path: "/about",      icon: "📊" },
  { label: "Résultat du jeu",         path: "/results",    icon: "🏆" },
  { label: "Centre personnel",        path: "/account",    icon: "👤" },
  { label: "Centre d'agence",         path: "/team",       icon: "👥" },
  { label: "Promotions",              path: "/promotions", icon: "🎁" },
  { label: "Annonce",                 path: "/annonce",    icon: "📢" },
  { label: "Description de la règle", path: "/service",    icon: "📜" },
];

function NavIcon({ item, active }: { item: NavItem; active: boolean }) {
  /* white-on-black images need invert(1) first, then the colour filter */
  const base   = item.invertFirst ? "invert(1) " : "";
  const colour = active ? filterGreen : filterGray;
  return (
    <img
      src={item.icon}
      alt={item.label}
      style={{
        width: 24,
        height: 24,
        objectFit: "contain",
        filter: base + colour,
        transition: "filter 0.15s",
      }}
    />
  );
}

export default function BottomNav() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);

  const handleMenuItem = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <>
      <nav
        style={{
          position:      "fixed",
          bottom:        0,
          left:          0,
          right:         0,
          zIndex:        50,
          background:    "white",
          borderTop:     "1px solid #E8E8E8",
          height:        60,
          display:       "flex",
          alignItems:    "flex-end",
          paddingBottom: "env(safe-area-inset-bottom, 4px)",
          boxShadow:     "0 -2px 10px rgba(0,0,0,0.06)",
        }}
      >
        {/* Left items */}
        {leftItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              style={{ flex: 1, height: 60, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 2,
                background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              <NavIcon item={item} active={active} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500,
                color: active ? GREEN : GRAY, lineHeight: 1 }}>
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Center Billets button */}
        <button
          onClick={() => navigate("/billet")}
          style={{ flex: 1, height: 60, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "flex-start", background: "transparent",
            border: "none", cursor: "pointer", padding: 0, position: "relative" }}
        >
          <div style={{
            position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)",
            width: 56, height: 56, borderRadius: "50%",
            background: GREEN,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(21,128,61,0.45), 0 2px 6px rgba(0,0,0,0.15)",
            border: "3px solid white", overflow: "hidden",
          }}>
            <img src={satwinLogo} alt="billets"
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{ position: "absolute", bottom: 6, fontSize: 10,
            fontWeight: 700, color: GREEN }}>
            Billets
          </span>
        </button>

        {/* Right items */}
        {rightItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              style={{ flex: 1, height: 60, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 2,
                background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              <NavIcon item={item} active={active} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500,
                color: active ? GREEN : GRAY, lineHeight: 1 }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Menu bottom sheet */}
      {menuOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end" }}
          onClick={() => setMenuOpen(false)}
        >
          <div
            style={{ width: "100%", background: "white", borderRadius: "20px 20px 0 0",
              paddingBottom: "env(safe-area-inset-bottom, 16px)", maxHeight: "90vh",
              overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: 40, height: 4, background: GREEN, borderRadius: 2 }} />
            </div>

            {/* Logo */}
            <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 12px" }}>
              <img src={satwinLogo} alt="SATWIN FOOT"
                style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} />
            </div>

            {/* Menu items */}
            <div style={{ borderTop: "1px solid #f0f0f0" }}>
              {menuItems.map((item, i) => (
                <button
                  key={item.path}
                  onClick={() => handleMenuItem(item.path)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center",
                    padding: "14px 20px",
                    borderBottom: i < menuItems.length - 1 ? "1px solid #f5f5f5" : "none",
                    background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 20, marginRight: 14, width: 28, textAlign: "center" }}>
                    {item.icon}
                  </span>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: GREEN }}>
                    {item.label}
                  </span>
                  <ChevronRight size={16} color="#bbb" />
                </button>
              ))}
            </div>

            {/* Bottom buttons */}
            <div style={{ display: "flex", gap: 12, padding: "16px 20px 20px" }}>
              <button
                onClick={() => handleMenuItem("/depot-retrait")}
                style={{ flex: 1, padding: "13px 0", background: GREEN,
                  color: "white", fontWeight: 700, fontSize: 14,
                  border: "none", borderRadius: 8, cursor: "pointer",
                  letterSpacing: 0.5 }}>
                DÉP &amp; W/J
              </button>
              <button
                onClick={() => handleMenuItem("/service")}
                style={{ flex: 1, padding: "13px 0", background: GREEN,
                  color: "white", fontWeight: 700, fontSize: 14,
                  border: "none", borderRadius: 8, cursor: "pointer",
                  letterSpacing: 0.5 }}>
                SERVICE CLIENTS
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
