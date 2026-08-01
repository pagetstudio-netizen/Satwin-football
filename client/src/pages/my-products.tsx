import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatCurrency, getCountryByCode } from "@/lib/countries";
import { Loader2, AlertTriangle, Wind, Settings } from "lucide-react";
import { useLocation } from "wouter";
import type { Product } from "@shared/schema";

import vestasLogo from "@assets/6790d8bd04714fedd7593cb6_Doosan_Group_and_Corporation_-_Logo.s_1784561452870.png";
import emptyIllustration from "@assets/illustration-8_1784762965573.png";
import serviceIcon from "@assets/20260311_214852_1773265973964.png";
import btnOurProducts from "@assets/20260721_173328_1784656524037.png";
import btnMyProduct from "@assets/20260721_173249_1784656523987.png";

import productImg1 from "@assets/robot-humanoide_1784762709634.jpg";
import productImg2 from "@assets/ROBOTIQUE-ET-IA_1784762709736.jpg";
import productImg3 from "@assets/Liberer-le-potentiel-de-lintelligence-artificielle-dans-la-rob_1784762709762.png";
import productImg4 from "@assets/roboter-pyhsikalische-ki-Xpert.Digital-png_1784762709783.png";
import productImg5 from "@assets/71533_1784762709811.jpg";
import productImg6 from "@assets/images_(30)_1784762709837.jpeg";
import productImg7 from "@assets/images_(29)_1784762709868.jpeg";
import productImg8 from "@assets/photo-1737644467636-6b0053476bb2_1784762709899.jpeg";

const PRODUCT_IMAGES = [productImg1, productImg2, productImg3, productImg4, productImg5, productImg6, productImg7, productImg8];

interface ProductWithOwnership extends Product {
  isOwned: boolean;
  canClaimFree: boolean;
  ownedCount?: number;
}

export default function MyProductsPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"our" | "my">("our");
  const [confirmProduct, setConfirmProduct] = useState<ProductWithOwnership | null>(null);

  const { data: products, isLoading: loadingProducts } = useQuery<ProductWithOwnership[]>({
    queryKey: ["/api/products"],
    staleTime: 0,
  });

  const { data: userProducts, isLoading: loadingUserProducts } = useQuery<any[]>({
    queryKey: ["/api/user/products"],
    staleTime: 0,
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

  const balance = parseFloat(user.balance || "0");
  const country = getCountryByCode(user.country);
  const currency = country?.currency || "FCFA";
  const paidProducts = products?.filter(p => !p.isFree) || [];
  const allUserProducts = userProducts || [];

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  // Format date as "20 Jul 2026, 15:00"
  const formatPurchaseDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
  };

  return (
    <div className="flex flex-col min-h-full" style={{ background: "#f0f2f5" }}>

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shadow-sm shrink-0"
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

      {/* Tab toggle buttons */}
      <div className="flex gap-3 px-4 pt-4 pb-2 shrink-0">
        <button
          className="flex-1"
          style={{ height: 52 }}
          onClick={() => setActiveTab("our")}
          data-testid="tab-our-products"
        >
          <img
            src={btnOurProducts}
            alt="our products"
            className="w-full h-full object-contain"
            style={{ opacity: activeTab === "our" ? 1 : 0.45 }}
          />
        </button>
        <button
          className="flex-1"
          style={{ height: 52 }}
          onClick={() => setActiveTab("my")}
          data-testid="tab-my-product"
        >
          <img
            src={btnMyProduct}
            alt="my product"
            className="w-full h-full object-contain"
            style={{ opacity: activeTab === "my" ? 1 : 0.45 }}
          />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24 px-3 pt-1">

        {/* ── OUR PRODUCTS tab ── */}
        {activeTab === "our" && (
          <div className="space-y-3 mt-1">
            {loadingProducts ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1565C0" }} />
              </div>
            ) : paidProducts.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-2xl shadow-sm flex flex-col items-center gap-2">
                <img src={emptyIllustration} alt="Vide" className="w-40 h-40 object-contain opacity-90" />
                <p className="text-gray-400 font-medium">Aucun produit disponible</p>
              </div>
            ) : (
              paidProducts.map((product, idx) => {
                const img = PRODUCT_IMAGES[idx % PRODUCT_IMAGES.length];
                return (
                  <div
                    key={product.id}
                    className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-row"
                    data-testid={`product-card-${product.id}`}
                  >
                    {/* Left image */}
                    <div className="shrink-0" style={{ width: 130, height: 160 }}>
                      <img
                        src={img}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Right info */}
                    <div className="flex-1 flex flex-col justify-between px-3 py-3">
                      {/* Name + Acheter button row */}
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-bold text-gray-800 text-sm leading-tight">{product.name}</p>
                        <button
                          onClick={() => setConfirmProduct(product)}
                          className="px-3 py-1.5 rounded-full text-white text-xs font-bold shadow shrink-0 ml-2"
                          style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
                          data-testid={`button-purchase-${product.id}`}
                        >
                          Acheter
                        </button>
                      </div>

                      {/* Stats */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-[11px]">Prix unitaire</span>
                          <span className="font-bold text-[11px]" style={{ color: "#1565C0" }}>
                            {currency} {Number(product.price).toLocaleString("fr-FR")}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-[11px]">Validité</span>
                          <span className="font-bold text-[11px]" style={{ color: "#1565C0" }}>
                            {product.cycleDays} Jours
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-[11px]">Gains quotidiens</span>
                          <span className="font-bold text-[11px]" style={{ color: "#1565C0" }}>
                            {currency} {Number(product.dailyEarnings).toLocaleString("fr-FR")}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-[11px]">Revenu total</span>
                          <span className="font-bold text-[11px]" style={{ color: "#1565C0" }}>
                            {currency} {Number(product.totalReturn).toLocaleString("fr-FR")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── MY PRODUCT tab ── */}
        {activeTab === "my" && (
          <div className="mt-1">
            {/* Product list */}
            <div className="space-y-3">
              {loadingUserProducts ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#22c55e" }} />
                </div>
              ) : allUserProducts.length === 0 ? (
                <div className="text-center py-8 bg-white rounded-2xl shadow-sm flex flex-col items-center gap-2">
                  <img src={emptyIllustration} alt="Vide" className="w-40 h-40 object-contain opacity-90" />
                  <p className="text-gray-500 font-medium">Aucun produit Doosan</p>
                  <p className="text-gray-400 text-sm">Achetez des produits pour commencer à gagner</p>
                </div>
              ) : (
                allUserProducts.map((up: any, index: number) => {
                  const cycleDays = up.product?.cycleDays || 60;
                  const daysRemaining = up.daysRemaining || 0;
                  const daysCompleted = Math.max(0, cycleDays - daysRemaining);
                  const earnedSoFar = parseFloat(up.totalEarned || "0");

                  return (
                    <div
                      key={up.id}
                      className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-row"
                      data-testid={`my-product-card-${up.id}`}
                    >
                      {/* Left image */}
                      <div className="shrink-0" style={{ width: 120, height: 175 }}>
                        <img
                          src={PRODUCT_IMAGES[index % PRODUCT_IMAGES.length]}
                          alt={up.product?.name || "Produit"}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Right info */}
                      <div className="flex-1 px-3 py-3 space-y-1.5">
                        {/* Product name */}
                        <p className="font-bold text-gray-800 text-sm leading-tight mb-2">
                          {up.product?.name || "Produit"}
                        </p>

                        {/* Prix unitaire */}
                        <div className="flex justify-between items-start">
                          <span className="text-gray-500 text-[11px]">Prix unitaire</span>
                          <span className="font-bold text-[12px]" style={{ color: "#22c55e" }}>
                            {Number(up.product?.price || 0).toLocaleString("fr-FR")}
                          </span>
                        </div>

                        {/* Jours d'exécution */}
                        <div className="flex justify-between items-start">
                          <span className="text-gray-500 text-[11px]">Jours d'exécution</span>
                          <span className="font-bold text-[12px]" style={{ color: "#22c55e" }}>
                            {daysCompleted} / {cycleDays} Jours
                          </span>
                        </div>

                        {/* Revenu généré */}
                        <div className="flex justify-between items-start">
                          <span className="text-gray-500 text-[11px]">Revenu généré (Paid)</span>
                          <span className="font-bold text-[12px]" style={{ color: "#22c55e" }}>
                            {earnedSoFar.toLocaleString("fr-FR")}
                          </span>
                        </div>

                        {/* Revenu total attendu */}
                        <div className="flex justify-between items-start">
                          <span className="text-gray-500 text-[11px]">Revenu total attendu</span>
                          <span className="font-bold text-[12px]" style={{ color: "#22c55e" }}>
                            {Number(up.product?.totalReturn || 0).toLocaleString("fr-FR")}
                          </span>
                        </div>

                        {/* Date & heure */}
                        <div className="flex justify-between items-start">
                          <span className="text-gray-500 text-[11px]">Date &amp; heure</span>
                          <span className="font-bold text-[12px] text-right" style={{ color: "#22c55e" }}>
                            {formatPurchaseDate(up.purchasedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Purchase confirm modal */}
      {confirmProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-8 bg-black/50"
          onClick={() => setConfirmProduct(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl overflow-hidden shadow-2xl bg-white"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-5 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                Conseil
              </p>
              <p className="text-gray-800 font-semibold text-base leading-snug">
                Êtes-vous sûr de vouloir acheter ce produit ?
              </p>
              <p className="text-gray-500 text-sm mt-2 font-medium">
                {confirmProduct.name}
              </p>
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-100" />

            {/* Buttons */}
            <div className="flex">
              <button
                onClick={() => setConfirmProduct(null)}
                className="flex-1 py-4 font-semibold text-base text-gray-500 active:bg-gray-50 transition-colors"
                style={{ borderRight: "1px solid #f0f0f0" }}
                data-testid="button-cancel-purchase"
              >
                Non
              </button>
              <button
                onClick={() => purchaseMutation.mutate(confirmProduct.id)}
                disabled={purchaseMutation.isPending}
                className="flex-1 py-4 font-bold text-base text-white flex items-center justify-center gap-1.5 active:opacity-90 transition-opacity disabled:opacity-60"
                style={{ background: "#22c55e" }}
                data-testid="button-confirm-purchase"
              >
                {purchaseMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : "Oui"
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
