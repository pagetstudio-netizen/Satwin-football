import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCountryByCode } from "@/lib/countries";
import { Loader2, ChevronRight, Shield, Info, Pencil, CreditCard, HeadphonesIcon, Lock, FolderOpen, BookOpen } from "lucide-react";
import satwinLogo from "@assets/satwin-logo.jpg";

const GREEN = "#3d9e4e";

export default function AccountPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showPinModal, setShowPinModal] = useState(false);
  const [adminPin, setAdminPin] = useState("");

  const verifyPinMutation = useMutation({
    mutationFn: async (pin: string) => {
      const res = await apiRequest("POST", "/api/admin/verify-pin", { pin });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Code PIN incorrect"); }
      return res.json() as Promise<{ success: boolean; path: string }>;
    },
    onSuccess: (data) => {
      setShowPinModal(false); setAdminPin(""); navigate(data.path);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleAdminClick = async () => {
    if (user?.isAdminPasswordRequired === false) {
      // Fetch path from server directly
      const res = await apiRequest("POST", "/api/admin/verify-pin", { pin: "" });
      if (res.ok) { const d = await res.json(); navigate(d.path); }
      return;
    }
    setShowPinModal(true);
  };
  const handleLogout = async () => { await logout(); navigate("/login"); };

  if (!user) return null;

  const { data: betStats } = useQuery<{ pendingAmount: number; totalVolume: number }>({
    queryKey: ["/api/user/bet-stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user/bet-stats");
      return res.json();
    },
  });

  const balance  = parseFloat(user.balance || "0");
  const country  = getCountryByCode(user.country);
  const currency = country?.currency || "FCFA";
  const fmt = (n: number) =>
    n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#f5f5f5" }}>

      {/* ── Header ── */}
      <div
        className="px-4 pt-5 pb-4 flex items-center"
        style={{ background: GREEN }}
      >
        <div className="w-8" />
        <h1 className="flex-1 text-center text-white font-bold text-base">
          Centre personnel
        </h1>
        <div className="w-8" />
      </div>

      {/* ── User row ── */}
      <div
        className="flex items-center px-4 py-3 gap-3"
        style={{ background: GREEN }}
      >
        {/* Avatar */}
        <div
          className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.4)" }}
        >
          <img src={satwinLogo} alt="logo" className="w-full h-full object-cover" />
        </div>

        {/* Name + VIP */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate">{user.phone}</p>
          <p className="text-white/70 text-xs mt-0.5">VIP 0</p>
        </div>

        {/* Se déconnecter */}
        <button
          onClick={handleLogout}
          className="text-white text-xs font-medium px-3 py-1.5 rounded-full"
          style={{ background: "rgba(255,255,255,0.18)" }}
        >
          Se déconnecter
        </button>
      </div>

      {/* ── Stats card ── */}
      <div className="mx-4 mt-3 rounded-xl overflow-hidden shadow-sm"
        style={{ background: "#fff" }}>
        <div className="flex">
          {/* Solde */}
          <div className="flex-1 flex flex-col items-center justify-center py-4 px-2"
            style={{ borderRight: "1px solid #f0f0f0" }}>
            <p className="font-extrabold text-base" style={{ color: GREEN }}>
              {fmt(balance)}
            </p>
            <p className="text-gray-500 text-xs mt-1 text-center">Solde</p>
          </div>

          {/* Commerce en suspens */}
          <div className="flex-1 flex flex-col items-center justify-center py-4 px-2"
            style={{ borderRight: "1px solid #f0f0f0" }}>
            <p className="font-extrabold text-base text-gray-800">
              {fmt(betStats?.pendingAmount ?? 0)}
            </p>
            <p className="text-gray-500 text-xs mt-1 text-center">Commerce en suspens</p>
          </div>

          {/* Volume */}
          <div className="flex-1 flex flex-col items-center justify-center py-4 px-2">
            <p className="font-extrabold text-base text-gray-800">
              {fmt(betStats?.totalVolume ?? 0)}
            </p>
            <p className="text-gray-500 text-xs mt-1 text-center">Volume</p>
          </div>
        </div>
      </div>

      {/* ── Depot / Retrait buttons ── */}
      <div className="mx-4 mt-3 rounded-xl overflow-hidden shadow-sm"
        style={{ background: "#fff" }}>
        <div className="flex">
          <button
            onClick={() => navigate("/depot-retrait?tab=depot")}
            className="flex-1 flex items-center justify-center gap-2 py-4"
            style={{ borderRight: "1px solid #f0f0f0" }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(61,158,78,0.15)" }}
            >
              <span className="text-base font-black" style={{ color: GREEN }}>$</span>
            </div>
            <span className="font-bold text-sm text-gray-800">Depot</span>
          </button>

          <button
            onClick={() => navigate("/depot-retrait?tab=retrait")}
            className="flex-1 flex items-center justify-center gap-2 py-4"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(61,158,78,0.15)" }}
            >
              <span className="text-base font-black" style={{ color: GREEN }}>$</span>
            </div>
            <span className="font-bold text-sm text-gray-800">Retrait</span>
          </button>
        </div>
      </div>

      {/* ── Menu card ── */}
      <div className="mx-4 mt-3 rounded-xl overflow-hidden shadow-sm mb-4"
        style={{ background: "#fff" }}>

        {/* Sécurité */}
        <MenuItem
          label="Sécurité"
          onClick={() => navigate("/change-password")}
          icon={<Lock size={16} color="#3d9e4e" />}
          iconBg="rgba(61,158,78,0.12)"
        />

        <div style={{ height: 1, background: "#f0f0f0", marginLeft: 56 }} />

        {/* Infos */}
        <MenuItem
          label="Infos"
          onClick={() => navigate("/infos")}
          icon={<Info size={16} color="#3b82f6" />}
          iconBg="rgba(59,130,246,0.12)"
        />

        <div style={{ height: 1, background: "#f0f0f0", marginLeft: 56 }} />

        {/* Dossiers */}
        <MenuItem
          label="Dossiers"
          onClick={() => navigate("/history")}
          icon={<FolderOpen size={16} color="#f59e0b" />}
          iconBg="rgba(245,158,11,0.12)"
        />

        <div style={{ height: 1, background: "#f0f0f0", marginLeft: 56 }} />

        {/* Ajouter une carte */}
        <MenuItem
          label="Ajouter une carte"
          onClick={() => navigate("/wallet")}
          icon={<CreditCard size={16} color="#8b5cf6" />}
          iconBg="rgba(139,92,246,0.12)"
        />

        <div style={{ height: 1, background: "#f0f0f0", marginLeft: 56 }} />

        {/* Histoire */}
        <MenuItem
          label="Histoire"
          onClick={() => navigate("/about")}
          icon={<BookOpen size={16} color="#06b6d4" />}
          iconBg="rgba(6,182,212,0.12)"
        />

        <div style={{ height: 1, background: "#f0f0f0", marginLeft: 56 }} />

        {/* CS */}
        <MenuItem
          label="CS"
          onClick={() => navigate("/service")}
          icon={<HeadphonesIcon size={16} color="#ec4899" />}
          iconBg="rgba(236,72,153,0.12)"
          isLast
        />
      </div>

      {/* Admin button */}
      {user.isAdmin && (
        <div className="mx-4 mb-4">
          <button
            onClick={handleAdminClick}
            className="w-full flex items-center gap-3 px-4 py-4 rounded-xl"
            style={{ background: "rgba(61,158,78,0.08)", border: "1px solid rgba(61,158,78,0.2)" }}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(61,158,78,0.15)" }}>
              <Shield size={16} color={GREEN} />
            </div>
            <span className="flex-1 font-bold text-sm" style={{ color: GREEN }}>Panneau d'administration</span>
            <ChevronRight size={16} color={GREEN} />
          </button>
        </div>
      )}

      {/* Admin PIN modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-xl"
            style={{ background: "#fff" }}>
            <h3 className="font-black text-lg mb-4 text-center text-gray-800">🔐 Code PIN Admin</h3>
            <input
              type="password"
              value={adminPin}
              onChange={e => setAdminPin(e.target.value)}
              placeholder="Entrez votre code PIN"
              className="w-full h-12 rounded-xl px-4 text-gray-800 text-center text-xl tracking-widest outline-none mb-4"
              style={{ background: "#f5f5f5", border: "1px solid #e5e5e5" }}
              onKeyDown={e => e.key === "Enter" && verifyPinMutation.mutate(adminPin)}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowPinModal(false); setAdminPin(""); }}
                className="flex-1 h-11 rounded-xl text-gray-500 font-medium text-sm"
                style={{ background: "#f5f5f5" }}
              >
                Annuler
              </button>
              <button
                onClick={() => verifyPinMutation.mutate(adminPin)}
                disabled={verifyPinMutation.isPending || !adminPin}
                className="flex-1 h-11 rounded-xl text-white font-bold text-sm"
                style={{ background: GREEN }}
              >
                {verifyPinMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── MenuItem helper ── */
function MenuItem({
  label,
  onClick,
  icon,
  iconBg,
  rightExtra,
  isLast,
}: {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  iconBg?: string;
  rightExtra?: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center px-4 py-3.5 text-left active:bg-gray-50 gap-3"
    >
      {icon && (
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg || "rgba(61,158,78,0.12)" }}
        >
          {icon}
        </div>
      )}
      <span className="flex-1 text-gray-800 font-medium text-sm">{label}</span>
      {rightExtra && <span className="mr-1">{rightExtra}</span>}
      <ChevronRight size={16} color="#bbb" />
    </button>
  );
}
