import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Info, Loader2, Plus } from "lucide-react";
import { Link, useLocation } from "wouter";
import { getCountryByCode } from "@/lib/countries";

interface WalletData {
  id: number;
  userId: number;
  accountName: string;
  accountNumber: string;
  paymentMethod: string;
  country: string;
  isDefault: boolean;
}

interface UserProduct {
  id: number;
  status: string;
}

export default function WithdrawalPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<number | "">("");
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);
  const [, navigate] = useLocation();

  const countryInfo = user ? getCountryByCode(user.country) : null;
  const currency = countryInfo?.currency || "FCFA";

  const { data: withdrawalSettings } = useQuery<{
    withdrawalFees: number;
    withdrawalStartHour: number;
    withdrawalEndHour: number;
    maxWithdrawalsPerDay: number;
    minWithdrawal: number;
  }>({
    queryKey: ["/api/settings/withdrawal"],
    staleTime: 0,
    refetchOnMount: true,
  });

  const minWithdrawal = withdrawalSettings?.minWithdrawal ?? 1500;
  const withdrawalFee = withdrawalSettings?.withdrawalFees ?? 18;
  const withdrawalStartHour = withdrawalSettings?.withdrawalStartHour ?? 9;
  const withdrawalEndHour = withdrawalSettings?.withdrawalEndHour ?? 17;

  const amountAfterFees = amount ? Math.floor(Number(amount) * (1 - withdrawalFee / 100)) : 0;
  const currentHour = new Date().getHours();
  const isWithinWithdrawalHours = currentHour >= withdrawalStartHour && currentHour < withdrawalEndHour;

  const { data: wallets = [], isLoading: walletsLoading } = useQuery<WalletData[]>({
    queryKey: ["/api/wallets"],
    refetchOnWindowFocus: true,
  });

  const { data: userProducts = [] } = useQuery<UserProduct[]>({
    queryKey: ["/api/user/products"],
  });

  const hasActiveProduct = userProducts.some((p) => p.status === "active");

  useEffect(() => {
    const savedWalletId = localStorage.getItem("selectedWalletId");
    if (savedWalletId && wallets.length > 0) {
      const wallet = wallets.find(w => w.id === parseInt(savedWalletId));
      if (wallet) setSelectedWallet(wallet);
      localStorage.removeItem("selectedWalletId");
    }
  }, [wallets]);

  useEffect(() => {
    if (!selectedWallet && wallets.length > 0) {
      const defaultWallet = wallets.find(w => w.isDefault);
      if (defaultWallet) setSelectedWallet(defaultWallet);
    }
  }, [wallets, selectedWallet]);

  const withdrawMutation = useMutation({
    mutationFn: async (data: { amount: number; walletId: number }) => {
      const res = await apiRequest("POST", "/api/withdrawals", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Demande envoyée", description: "Votre demande de retrait a été envoyée." });
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/withdrawals"] });
      setAmount("");
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!isWithinWithdrawalHours) {
      toast({ title: "Horaires de retrait", description: `Les retraits sont disponibles de ${withdrawalStartHour}h à ${withdrawalEndHour}h`, variant: "destructive" });
      return;
    }
    if (!hasActiveProduct) {
      toast({ title: "Produit requis", description: "Vous devez avoir un produit actif pour effectuer un retrait", variant: "destructive" });
      return;
    }
    if (!amount || amount < minWithdrawal) {
      toast({ title: "Montant invalide", description: `Le montant minimum est de ${minWithdrawal} ${currency}`, variant: "destructive" });
      return;
    }
    if (!selectedWallet) {
      toast({ title: "Compte requis", description: "Veuillez sélectionner un compte bancaire", variant: "destructive" });
      return;
    }
    withdrawMutation.mutate({ amount: Number(amount), walletId: selectedWallet.id });
  };

  if (walletsLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1565C0]" />
      </div>
    );
  }

  if (!user) return null;

  const balance = parseFloat(user?.balance || "0");
  const hasWallets = wallets.length > 0;

  return (
    <div className="min-h-screen bg-white">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <Link href="/account">
          <button className="flex items-center gap-1 text-gray-800" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
            <span className="font-semibold text-base">Retrait</span>
          </button>
        </Link>
        <button
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
          data-testid="button-info"
        >
          <Info className="w-5 h-5 text-gray-600" />
        </button>
      </header>

      {/* ── Banner with balance ── */}
      <div className="relative w-full" style={{ height: "180px" }}>
        <img
          src="/withdrawal-banner.png"
          alt="Retrait"
          className="w-full h-full object-cover"
        />
        {/* Dark overlay */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to right, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0.1))" }}
        />
        {/* Balance text */}
        <div className="absolute bottom-4 left-4">
          <p className="text-white font-bold text-2xl" data-testid="text-balance">
            <span className="text-sm font-semibold mr-1">{currency}</span>
            {balance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-white/80 text-xs mt-0.5">Solde du compte</p>
        </div>
      </div>

      <div className="px-4 pt-5 pb-10 space-y-5">

        {/* ── Wallet selector ── */}
        <div>
          <p className="text-gray-900 font-semibold text-sm mb-2">Compte de retrait</p>
          <button
            onClick={() => {
              if (!hasWallets) {
                navigate("/wallet");
              } else {
                navigate("/wallet?from=withdrawal");
              }
            }}
            className="w-full border border-gray-300 rounded-md bg-white px-4 py-4 flex items-center justify-between"
            data-testid="button-select-wallet"
          >
            <span className="text-sm text-gray-500">
              {selectedWallet
                ? `${selectedWallet.accountName} · ${selectedWallet.accountNumber} · ${selectedWallet.paymentMethod}`
                : hasWallets
                  ? "Sélectionner un compte bancaire"
                  : (
                    <span className="flex items-center gap-2 text-[#1565C0]">
                      <Plus className="w-4 h-4" /> Ajouter un portefeuille de retrait
                    </span>
                  )
              }
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </button>
        </div>

        {/* ── Amount section ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-900 font-semibold text-sm">Montant du retrait</p>
            <p className="text-gray-500 text-sm">Impôt: {withdrawalFee}%</p>
          </div>

          <div className="border border-gray-300 rounded-md flex items-center overflow-hidden bg-white">
            <span className="px-4 py-4 text-gray-800 font-semibold text-sm border-r border-gray-300 bg-white">
              {currency}
            </span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
              placeholder="Veuillez sélectionner le montant du retrait"
              className="flex-1 px-4 py-4 text-sm text-gray-400 outline-none bg-white placeholder:text-gray-400"
              data-testid="input-withdrawal-amount"
            />
          </div>

          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-gray-600 text-xs">
              Montant reçu:{" "}
              <span className="font-semibold">{currency} {amountAfterFees.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</span>
            </p>
          </div>
          <p className="text-right text-xs mt-1 px-1" style={{ color: "#ff6b00" }}>
            (Minimum {minWithdrawal.toLocaleString()} {currency})
          </p>
        </div>


        {/* ── CTA Button ── */}
        <button
          onClick={handleSubmit}
          disabled={withdrawMutation.isPending}
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #1565C0 0%, #0D47A1 50%, #0a2e6e 100%)",
          }}
          data-testid="button-submit-withdrawal"
        >
          {withdrawMutation.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Envoi en cours...
            </span>
          ) : (
            "Retirez votre argent maintenant"
          )}
        </button>

        {/* ── Instructions (texte existant conservé) ── */}
        <div className="pt-2 pb-6">
          <p className="font-bold text-[#1565C0] text-sm mb-3">Instructions de retrait</p>
          <div className="space-y-2.5 text-sm text-gray-600 leading-relaxed">
            <p>1. Le montant minimum de retrait est de {minWithdrawal.toLocaleString()} {currency}.</p>
            <p>2. Il n'y a pas de limite de temps pour les retraits, mais une limite de trois retraits par jour est autorisée.</p>
            <p>3. Des frais de traitement de {withdrawalFee}% seront appliqués sur chaque retrait.</p>
            <p>4. Les retraits seront disponibles sous 2 heures, et exceptionnellement sous 24 heures.</p>
            <p>5. Si le retrait échoue, vérifiez que vos informations bancaires sont correctes, puis soumettez à nouveau la demande.</p>
            <p>6. Effectuez votre première recharge et achetez des produits Doosan pour activer la fonction de retrait.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
