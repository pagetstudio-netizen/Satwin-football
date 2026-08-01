import { useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCountryByCode } from "@/lib/countries";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";

interface BonusStatus {
  canClaim: boolean;
  hoursRemaining: number;
  totalBonusClaimed: number;
  daysPointed: number;
}

export default function CheckinPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const pointerRef = useRef<HTMLDivElement>(null);

  const { data: bonusStatus } = useQuery<BonusStatus>({
    queryKey: ["/api/daily-bonus-status"],
    refetchInterval: 60000,
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/claim-daily-bonus", {});
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/daily-bonus-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: "Bonus reçu !", description: "50 FCFA ajoutés à votre solde" });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  if (!user) return null;

  const country = getCountryByCode(user.country);
  const currency = country?.currency || "FCFA";
  const totalBonusClaimed = bonusStatus?.totalBonusClaimed || 0;
  const daysPointed = bonusStatus?.daysPointed || 0;

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      <div className="flex-1 overflow-y-auto pb-24">

        {/* Header */}
        <header className="flex items-center px-4 py-3 bg-white border-b border-gray-100">
          <Link href="/">
            <button className="p-1">
              <ChevronLeft className="w-6 h-6 text-gray-700" />
            </button>
          </Link>
          <h1 className="flex-1 text-center text-base font-semibold text-gray-800 pr-7">Pointage</h1>
        </header>

        {/* Hero banner — Récompenses cumulées */}
        <div className="mx-4 mt-4 rounded-2xl overflow-hidden shadow-md" style={{ background: "linear-gradient(135deg, #1565C0 0%, #1976D2 50%, #42A5F5 100%)" }}>
          <div className="p-5 pb-6">
            <p className="text-white/90 text-base font-medium mb-1">Récompenses cumulées</p>
            <p className="text-white font-black text-4xl tracking-tight">
              {currency} {totalBonusClaimed.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Pointer card */}
        <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Top row */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <div>
              <p className="font-semibold text-gray-800 text-sm">Pointer maintenant</p>
              <p className="text-gray-400 text-xs mt-0.5">
                Pointage pendant {daysPointed} jours consécutifs
              </p>
            </div>
            <button
              onClick={() => claimMutation.mutate()}
              disabled={!bonusStatus?.canClaim || claimMutation.isPending}
              data-testid="button-pointer"
              className="px-5 py-2 rounded-full text-white font-bold text-sm shadow-sm disabled:opacity-50 transition-opacity"
              style={{ background: bonusStatus?.canClaim ? "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)" : "#9E9E9E" }}
            >
              {claimMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : bonusStatus?.canClaim ? (
                "Pointer"
              ) : (
                `${bonusStatus?.hoursRemaining || 0}h`
              )}
            </button>
          </div>

          {/* Reward amount box */}
          <div className="mx-4 mb-3">
            <div className="border-2 border-dashed border-gray-200 rounded-xl py-3 flex items-center justify-center">
              <p className="text-gray-800 font-bold text-lg">{currency} 50</p>
            </div>
          </div>

          {/* Subtitle */}
          <div className="px-4 pb-4 text-center">
            <p className="text-gray-500 text-xs">Pointez aujourd'hui et obtenez une récompense</p>
          </div>
        </div>

        {/* "Aller au pointage" banner */}
        <div
          ref={pointerRef}
          className="mx-4 mt-3 rounded-2xl overflow-hidden border-2 border-blue-400 shadow-sm cursor-pointer"
          style={{ background: "linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)" }}
          onClick={() => claimMutation.mutate()}
        >
          <div className="flex items-center gap-3 px-4 py-4">
            {/* Icon placeholder — VR headset style circle */}
            <div className="w-14 h-14 rounded-xl bg-white/70 flex items-center justify-center flex-shrink-0 shadow-sm">
              <img src="/topup-icon.png" alt="reward" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <p className="font-bold text-[#1565C0] text-base">Aller au pointage</p>
              <p className="text-blue-500 text-xs mt-0.5">Recevez vos récompenses quotidiennes</p>
            </div>
          </div>
        </div>

        {/* Rules */}
        <div className="mx-4 mt-5 space-y-2">
          <p className="text-gray-500 text-xs">1. Récompense de connexion quotidienne : 50 {currency}.</p>
          <p className="text-gray-500 text-xs">2. Connectez-vous une fois par jour.</p>
          <p className="text-gray-500 text-xs">3. Connectez-vous à nouveau après minuit chaque jour.</p>
        </div>

      </div>
    </div>
  );
}
