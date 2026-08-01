import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Gift, Tag } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import jollibeeNight from "@assets/téléchargement_(20)_1784561452229.jpeg";

export default function GiftCodePage() {
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = useState("");

  const claimMutation = useMutation({
    mutationFn: async (giftCode: string) => {
      const response = await apiRequest("POST", "/api/gift-codes/claim", { code: giftCode });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: (data) => {
      refreshUser();
      setCode("");
      toast({
        title: "Félicitations !",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!code.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez saisir un code",
        variant: "destructive",
      });
      return;
    }
    claimMutation.mutate(code.trim());
  };

  return (
    <div className="flex flex-col min-h-full bg-gray-100">

      {/* Hero image with red overlay + header */}
      <div className="relative">
        <img
          src={jollibeeNight}
          alt="Doosan"
          className="w-full h-52 object-cover"
          data-testid="img-gift-banner"
        />
        {/* Red gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(0,113,197,0.65) 0%, rgba(0,90,158,0.85) 100%)" }}
        />

        {/* Header over image */}
        <div className="absolute top-0 left-0 right-0 flex items-center px-4 py-3">
          <Link href="/account">
            <button className="p-1.5 rounded-full bg-white/20" data-testid="button-back">
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
          </Link>
          <h1 className="flex-1 text-center text-base font-bold text-white pr-8">
            Code Bonus
          </h1>
        </div>

        {/* Icon badge */}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full flex items-center justify-center shadow-lg border-2 border-white"
          style={{ background: "linear-gradient(135deg, #1565C0, #0D47A1)" }}>
          <Gift className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-10 pb-24 space-y-4">

        {/* Info card */}
        <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
          <p className="text-gray-700 text-sm font-medium">
            Entrez votre code bonus pour recevoir votre récompense instantanément
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Les codes sont disponibles chaque soir à 17h GMT
          </p>
        </div>

        {/* Input card */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Tag className="w-4 h-4" style={{ color: "#1565C0" }} />
            <span className="text-gray-800 font-semibold text-sm">Code cadeau</span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Saisir le code ici"
              className="w-full px-4 py-3 rounded-xl border-2 text-center text-sm font-mono tracking-widest outline-none transition-colors"
              style={{
                borderColor: code ? "#1565C0" : "#e5e7eb",
                color: "#1f2937",
              }}
              data-testid="input-gift-code"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={claimMutation.isPending}
            className="w-full py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-opacity active:opacity-80"
            style={{ background: "linear-gradient(135deg, #1565C0, #0D47A1)" }}
            data-testid="button-submit-code"
          >
            {claimMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Gift className="w-4 h-4" />
                Recevoir ma récompense
              </>
            )}
          </button>
        </div>

        {/* How to get codes */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-gray-800 font-semibold text-sm mb-2">Comment obtenir des codes ?</p>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-white text-[10px] font-bold"
                style={{ backgroundColor: "#1565C0" }}>1</div>
              <p className="text-gray-500 text-xs">Rejoignez notre canal Telegram officiel</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-white text-[10px] font-bold"
                style={{ backgroundColor: "#1565C0" }}>2</div>
              <p className="text-gray-500 text-xs">Suivez les annonces chaque soir à 17h GMT</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-white text-[10px] font-bold"
                style={{ backgroundColor: "#1565C0" }}>3</div>
              <p className="text-gray-500 text-xs">Copiez le code et collez-le ici avant expiration</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
