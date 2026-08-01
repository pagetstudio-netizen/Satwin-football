import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatCurrency, getCountryByCode } from "@/lib/countries";
import { Loader2, AlertTriangle } from "lucide-react";
import emptyIllustration from "@assets/illustration-8_1784762965573.png";
import { useLocation } from "wouter";
import type { Product } from "@shared/schema";

import vestasLogo  from "@assets/6790d8bd04714fedd7593cb6_Doosan_Group_and_Corporation_-_Logo.s_1784561452870.png";
import serviceIcon from "@assets/20260311_214852_1773265973964.png";
import productImg1 from "@assets/téléchargement_(16)_1784561452683.jpeg";
import productImg2 from "@assets/téléchargement_(20)_1784561452229.jpeg";
import productImg3 from "@assets/téléchargement_(19)_1784561452588.jpeg";
import productImg4 from "@assets/images_(50)_1783210180466.jpeg";
import productImg5 from "@assets/images_(41)_1783210181134.jpeg";
import productImg6 from "@assets/images_(49)_1783210181155.jpeg";
import productImg7 from "@assets/images_(40)_1783210181193.jpeg";
import productImg8 from "@assets/images_(39)_1783210181215.jpeg";

const PRODUCT_IMAGES = [
  productImg1, productImg2, productImg3, productImg4,
  productImg5, productImg6, productImg7, productImg8,
];

interface ProductWithOwnership extends Product {
  isOwned: boolean;
  canClaimFree: boolean;
  ownedCount?: number;
}

export default function InvestPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [confirmProduct, setConfirmProduct] = useState<ProductWithOwnership | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "mine">("all");

  const { data: products, isLoading } = useQuery<ProductWithOwnership[]>({
    queryKey: ["/api/products"],
  });

  const purchaseMutation = useMutation({
    mutationFn: async (productId: number) => {
      const response = await apiRequest("POST", `/api/products/${productId}/purchase`, {});
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/products"] });
      refreshUser();
      setConfirmProduct(null);
      toast({ title: "Produit acheté !", description: "Vous commencerez à recevoir des gains demain." });
    },
    onError: (error: any) => {
      setConfirmProduct(null);
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  if (!user) return null;

  const balance     = parseFloat(user.balance || "0");
  const country     = getCountryByCode(user.country);
  const currency    = country?.currency || "FCFA";
  const paidProducts = products?.filter(p => !p.isFree) || [];
  const myProducts   = paidProducts.filter(p => p.isOwned);
  const displayed    = activeTab === "all" ? paidProducts : myProducts;

  return (
    <div className="flex flex-col min-h-full" style={{ background: "#f0f2f5" }}>

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)" }}
      >
        <img
          src={vestasLogo}
          alt="Doosan"
          className="h-8 w-auto object-contain"
          style={{ filter: "brightness(0) invert(1)" }}
        />
        <button
          onClick={() => navigate("/service")}
          className="flex items-center justify-center"
          data-testid="button-service"
        >
          <img src={serviceIcon} alt="Service client" className="w-8 h-8 object-contain" />
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-3 px-4 pt-4 pb-2">
        <button
          onClick={() => setActiveTab("all")}
          className="px-5 py-2 rounded-full font-bold text-sm transition-all"
          style={{
            background: activeTab === "all"
              ? "linear-gradient(135deg, #16a34a, #22c55e)"
              : "linear-gradient(135deg, #bbf7d0, #86efac)",
            color: activeTab === "all" ? "#fff" : "#15803d",
          }}
        >
          our products
        </button>
        <button
          onClick={() => setActiveTab("mine")}
          className="px-5 py-2 rounded-full font-bold text-sm transition-all"
          style={{
            background: activeTab === "mine"
              ? "linear-gradient(135deg, #16a34a, #22c55e)"
              : "linear-gradient(135deg, #bbf7d0, #86efac)",
            color: activeTab === "mine" ? "#fff" : "#15803d",
          }}
        >
          my product
        </button>
      </div>

      {/* ── Product list ── */}
      <div className="flex-1 overflow-y-auto pb-24 px-3 space-y-3 pt-1">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)
        ) : displayed.length > 0 ? (
          displayed.map((product, idx) => {
            const img = PRODUCT_IMAGES[idx % PRODUCT_IMAGES.length];
            return (
              <div
                key={product.id}
                className="bg-white rounded-2xl shadow-sm overflow-hidden flex"
                data-testid={`product-card-${product.id}`}
              >
                {/* Left — product image */}
                <div className="shrink-0" style={{ width: 150, minHeight: 160 }}>
                  <img
                    src={img}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    style={{ minHeight: 160 }}
                  />
                </div>

                {/* Right — info */}
                <div className="flex-1 flex flex-col px-3 pt-3 pb-3 min-w-0">
                  {/* Name + Acheter */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-black text-gray-900 text-base leading-tight">{product.name}</p>
                    <button
                      onClick={() => setConfirmProduct(product)}
                      className="shrink-0 px-4 py-1.5 rounded-full text-white text-sm font-bold shadow"
                      style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)" }}
                      data-testid={`button-purchase-${product.id}`}
                    >
                      Acheter
                    </button>
                  </div>

                  {/* Stats */}
                  <div className="space-y-1 mt-auto">
                    {[
                      { label: "Prix unitaire",    value: `${currency} ${Number(product.price).toLocaleString("fr-FR")}` },
                      { label: "Validité",         value: `${product.cycleDays} Jours` },
                      { label: "Gains quotidiens", value: `${currency} ${Number(product.dailyEarnings).toLocaleString("fr-FR")}` },
                      { label: "Revenu total",     value: `${currency} ${Number(product.totalReturn).toLocaleString("fr-FR")}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-gray-400 text-[11px]">{label}</span>
                        <span className="font-bold text-[11px]" style={{ color: "#1565C0" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 flex flex-col items-center gap-2">
            <img src={emptyIllustration} alt="Vide" className="w-40 h-40 object-contain opacity-90" />
            <p className="text-gray-400 text-sm">
              {activeTab === "mine" ? "Vous n'avez aucun produit actif" : "Aucun produit disponible"}
            </p>
          </div>
        )}
      </div>

      {/* ── Purchase confirm modal ── */}
      {confirmProduct && (() => {
        const prodIdx   = (products?.findIndex(p => p.id === confirmProduct.id) ?? 0);
        const prodImg   = PRODUCT_IMAGES[prodIdx % PRODUCT_IMAGES.length];
        const shortage  = confirmProduct.price - balance;
        const daily     = Number(confirmProduct.dailyIncome  || 0);
        const total     = Number(confirmProduct.totalReturn  || daily * Number(confirmProduct.cycleDays || 90));
        const duration  = Number(confirmProduct.cycleDays || 90);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-black/60"
            onClick={() => setConfirmProduct(null)}
          >
            <div
              className="w-full max-w-xs rounded-3xl overflow-hidden shadow-2xl"
              style={{ background: "linear-gradient(160deg, #1a6fd4 0%, #1255a8 100%)" }}
              onClick={e => e.stopPropagation()}
            >
              {/* ── Title block ── */}
              <div className="px-5 pt-6 pb-4">
                <p className="text-white font-extrabold text-2xl leading-tight">
                  {confirmProduct.name}
                </p>
                <p className="text-white/70 text-sm mt-2 leading-relaxed">
                  Après l'achat du produit, vos gains seront crédités sur votre compte toutes les 24 heures.
                </p>
              </div>

              {/* ── Details row ── */}
              <div className="mx-5 mb-4 flex items-start gap-4">
                {/* Product image */}
                <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 border-2 border-white/20">
                  <img src={prodImg} alt={confirmProduct.name} className="w-full h-full object-cover" />
                </div>

                {/* Info list */}
                <div className="flex-1 space-y-2">
                  {[
                    { label: "Prix",              value: `${currency} ${Number(confirmProduct.price).toLocaleString("fr-FR")}` },
                    { label: "Revenu quotidien",  value: `${currency} ${daily.toLocaleString("fr-FR")}` },
                    { label: "Revenu total",      value: `${currency} ${total.toLocaleString("fr-FR")}` },
                    { label: "Période de validité", value: `${duration} jours` },
                  ].map(row => (
                    <div key={row.label}>
                      <p className="text-white/60 text-[10px] leading-none">{row.label}</p>
                      <p className="text-white font-bold text-[13px] leading-tight">{row.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Insufficient balance warning ── */}
              {shortage > 0 && (
                <div className="mx-5 mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(220,50,50,0.22)", border: "1px solid rgba(255,100,100,0.35)" }}>
                  <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />
                  <p className="text-red-200 text-xs leading-snug">
                    Solde insuffisant. Il vous manque {currency} {shortage.toLocaleString("fr-FR")}.
                  </p>
                </div>
              )}

              {/* ── Buttons ── */}
              <div className="flex gap-3 px-5 pb-6">
                <button
                  onClick={() => setConfirmProduct(null)}
                  className="flex-1 py-3 rounded-2xl font-semibold text-white/80 text-sm active:opacity-70 transition-opacity"
                  style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.25)" }}
                  data-testid="button-cancel-purchase"
                >
                  Annuler
                </button>
                <button
                  onClick={() => purchaseMutation.mutate(confirmProduct.id)}
                  disabled={purchaseMutation.isPending}
                  className="flex-1 py-3 rounded-2xl font-bold text-white/90 text-sm flex items-center justify-center gap-1.5 active:opacity-70 transition-opacity"
                  style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.25)" }}
                  data-testid="button-confirm-purchase"
                >
                  {purchaseMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : "Confirmer"
                  }
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
