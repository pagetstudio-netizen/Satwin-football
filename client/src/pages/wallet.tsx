import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getPaymentMethodsForCountry, type ApiCountry } from "@/lib/countries";
import { Loader2, ChevronLeft, ChevronRight, Check, Eye, EyeOff } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import type { WithdrawalWallet } from "@shared/schema";

const GREEN = "#3d9e4e";
const MAX_CARDS = 2;

const walletSchema = z.object({
  accountName: z.string().min(2, "Nom du titulaire requis"),
  accountNumber: z.string().min(8, "Numéro requis"),
  paymentMethod: z.string().min(2, "Moyen de paiement requis"),
});
type WalletForm = z.infer<typeof walletSchema>;

/* Mask account number: **** **** **** XXXX */
const maskNumber = (num: string) => {
  const last4 = num.slice(-4).padStart(4, "0");
  return `**** **** **** ${last4}`;
};

export default function WalletPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const selectMode = params.get("from") === "withdrawal";
  const [showForm, setShowForm] = useState(false);
  const [showBankSheet, setShowBankSheet] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());

  const { data: wallets = [], isLoading } = useQuery<WithdrawalWallet[]>({
    queryKey: ["/api/wallets"],
  });

  const { data: apiCountries = [] } = useQuery<ApiCountry[]>({
    queryKey: ["/api/countries"],
  });

  const form = useForm<WalletForm>({
    resolver: zodResolver(walletSchema),
    defaultValues: { accountName: "", accountNumber: "", paymentMethod: "" },
  });

  const addMutation = useMutation({
    mutationFn: async (data: WalletForm) => {
      const response = await apiRequest("POST", "/api/wallets", {
        ...data,
        country: user!.country,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "Portefeuille ajouté !" });
      form.reset();
      setSelectedMethod("");
      setShowForm(false);
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (walletId: number) => {
      const response = await apiRequest("DELETE", `/api/wallets/${walletId}`, {});
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "Portefeuille supprimé !" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const handleSelectWallet = (wallet: WithdrawalWallet) => {
    if (selectMode) {
      localStorage.setItem("selectedWalletId", wallet.id.toString());
      navigate("/withdrawal");
    }
  };

  const handleChooseMethod = (method: string) => {
    setSelectedMethod(method);
    form.setValue("paymentMethod", method);
    setShowBankSheet(false);
  };

  const handleSubmit = () => {
    form.handleSubmit((data) => addMutation.mutate(data))();
  };

  const toggleReveal = (id: number) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!user) return null;

  const paymentMethods = getPaymentMethodsForCountry(user.country, apiCountries);
  const backLink = selectMode ? "/withdrawal" : "/account";
  const remaining = Math.max(0, MAX_CARDS - wallets.length);

  /* ─── ADD FORM VIEW ─── */
  if (showForm) {
    return (
      <div className="flex flex-col" style={{ background: "#f5f5f5", minHeight: "100vh" }}>

        {/* Header */}
        <div
          className="flex items-center px-4 py-4"
          style={{ background: GREEN }}
        >
          <button
            onClick={() => { setShowForm(false); form.reset(); setSelectedMethod(""); }}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.2)" }}
            data-testid="button-back-form"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="flex-1 text-center text-white font-bold text-base mr-9">
            Ajouter un compte bancaire
          </h1>
        </div>

        {/* Form card */}
        <div className="bg-white mt-3 mx-4 rounded-2xl shadow-sm overflow-hidden">

          {/* Bank selector */}
          <button
            type="button"
            onClick={() => setShowBankSheet(true)}
            className="w-full px-5 py-4 flex items-center justify-between border-b border-gray-100"
            data-testid="button-select-bank"
          >
            <div className="text-left">
              <p className="text-xs text-gray-400 mb-0.5">Banque</p>
              <p className={`text-sm font-medium ${selectedMethod ? "text-gray-800" : "text-gray-400"}`}>
                {selectedMethod || "Sélectionner une banque"}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>

          {/* Account name */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs text-gray-400 mb-1">Titulaire</p>
            <input
              {...form.register("accountName")}
              placeholder="Nom du titulaire"
              className="w-full text-sm text-gray-800 bg-transparent outline-none placeholder:text-gray-300"
              data-testid="input-wallet-name"
            />
            {form.formState.errors.accountName && (
              <p className="text-xs mt-1" style={{ color: GREEN }}>{form.formState.errors.accountName.message}</p>
            )}
          </div>

          {/* Account number */}
          <div className="px-5 py-4">
            <p className="text-xs text-gray-400 mb-1">Numéro de compte</p>
            <input
              {...form.register("accountNumber")}
              type="tel"
              placeholder="Numéro de compte"
              className="w-full text-sm text-gray-800 bg-transparent outline-none placeholder:text-gray-300"
              data-testid="input-wallet-number"
            />
            {form.formState.errors.accountNumber && (
              <p className="text-xs mt-1" style={{ color: GREEN }}>{form.formState.errors.accountNumber.message}</p>
            )}
          </div>
        </div>

        {/* Confirm button */}
        <div className="px-4 pt-4 pb-6">
          <button
            onClick={handleSubmit}
            disabled={addMutation.isPending}
            className="w-full py-4 rounded-full text-white font-bold text-base disabled:opacity-40 shadow-md"
            style={{ background: GREEN }}
            data-testid="button-confirm-wallet"
          >
            {addMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Enregistrement...
              </span>
            ) : "Confirmer"}
          </button>
        </div>

        {/* Bank bottom sheet */}
        {showBankSheet && (
          <div className="fixed inset-0 z-50" onClick={() => setShowBankSheet(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>
              <h2 className="text-center font-bold text-gray-800 text-base pt-3 pb-4 border-b border-gray-100">
                Choisir une banque
              </h2>
              <div className="pb-8">
                {paymentMethods.map((method) => (
                  <button
                    key={method}
                    onClick={() => handleChooseMethod(method)}
                    className="w-full py-4 px-5 flex items-center justify-between border-b border-gray-50 last:border-0"
                    data-testid={`button-bank-${method}`}
                  >
                    <span className="text-gray-700 font-medium text-sm">{method}</span>
                    {selectedMethod === method && (
                      <Check className="w-4 h-4" style={{ color: GREEN }} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── LIST VIEW ─── */
  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#f5f5f5" }}>

      {/* Header */}
      <div
        className="flex items-center px-4 py-4"
        style={{ background: GREEN }}
      >
        <Link href={backLink}>
          <button
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.2)" }}
            data-testid="button-back"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        </Link>
        <h1 className="flex-1 text-center text-white font-bold text-base">
          Ajouter une carte
        </h1>
        <div className="w-9" />
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-4 pb-6 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: GREEN }} />
          </div>
        ) : (
          <>
            {/* Wallet cards */}
            {wallets.map((wallet) => {
              const revealed = revealedIds.has(wallet.id);
              const displayNum = revealed
                ? wallet.accountNumber
                : maskNumber(wallet.accountNumber);

              return (
                <div
                  key={wallet.id}
                  onClick={() => selectMode && handleSelectWallet(wallet)}
                  className={`rounded-2xl px-4 py-4 shadow-sm ${selectMode ? "cursor-pointer active:opacity-80" : ""}`}
                  style={{ background: "#9ab8c2" }}
                  data-testid={`wallet-card-${wallet.id}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Football icon circle */}
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: "#fff" }}
                    >
                      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" stroke="#555" strokeWidth="1.5" fill="white" />
                        <polygon points="12,5 14.5,9 11,9.5 9.5,6.5" fill="#333" />
                        <polygon points="17,9 19,12 16.5,14 14.5,11" fill="#333" />
                        <polygon points="7,9 9.5,11 7.5,14 5,12" fill="#333" />
                        <polygon points="12,19 10,16 12,14 14,16" fill="#333" />
                      </svg>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm">{wallet.paymentMethod}</p>
                      <p className="text-gray-600 text-xs mt-0.5">Carte de débit</p>
                      <div className="flex items-center gap-2 mt-3">
                        <p className="text-gray-700 text-sm font-mono">{displayNum}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleReveal(wallet.id); }}
                          className="text-gray-500 flex-shrink-0"
                        >
                          {revealed
                            ? <Eye size={16} />
                            : <EyeOff size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Ajouter une banque row */}
            <div
              className="rounded-2xl shadow-sm overflow-hidden"
              style={{ background: "#fff" }}
            >
              <button
                onClick={() => remaining > 0 && setShowForm(true)}
                className="w-full flex items-center px-4 py-4"
                data-testid="button-add-wallet"
                disabled={remaining === 0}
                style={{ opacity: remaining === 0 ? 0.5 : 1, cursor: remaining === 0 ? "not-allowed" : "pointer" }}
              >
                <div className="flex-1 text-left">
                  <p className="font-bold text-gray-800 text-sm">Ajouter une banque</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Peut encore se lier{" "}
                    <span style={{ color: "#e63946", fontWeight: 700 }}>{remaining}</span>{" "}
                    cartes
                  </p>
                </div>
                <ChevronRight size={16} color={remaining === 0 ? "#ddd" : "#bbb"} />
              </button>
            </div>

            {/* Note */}
            <p className="text-gray-500 text-xs px-1">
              Rappel : jusqu'à {MAX_CARDS} cartes bancaires sont liées
            </p>

          </>
        )}
      </div>

      {/* Bank bottom sheet */}
      {showBankSheet && (
        <div className="fixed inset-0 z-50" onClick={() => setShowBankSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <h2 className="text-center font-bold text-gray-800 text-base pt-3 pb-4 border-b border-gray-100">
              Choisir une banque
            </h2>
            <div className="pb-8">
              {paymentMethods.map((method) => (
                <button
                  key={method}
                  onClick={() => handleChooseMethod(method)}
                  className="w-full py-4 px-5 flex items-center justify-between border-b border-gray-50 last:border-0"
                >
                  <span className="text-gray-700 font-medium text-sm">{method}</span>
                  {selectedMethod === method && (
                    <Check className="w-4 h-4" style={{ color: GREEN }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
