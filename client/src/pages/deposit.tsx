import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/hooks/use-clipboard";
import {
  ChevronLeft, Info, Copy, CheckCircle, Upload, Phone, Loader2,
  ImageIcon, ArrowRight, Zap, RefreshCw, ExternalLink,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { COUNTRIES, type ApiCountry } from "@/lib/countries";
import type { PaymentNumber } from "@shared/schema";

type Step =
  | "amount"
  | "select"
  | "form"
  | "sv-operator"
  | "sv-waiting"
  | "sv-otp"
  | "sv-redirect";

interface SvOperator {
  id: string;
  name: string;
  requiresOtp: boolean;
  status: string;
}

export default function DepositPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>("amount");
  const [selectedNumber, setSelectedNumber] = useState<PaymentNumber | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [amount, setAmount] = useState<number | "">("");
  const [senderPhone, setSenderPhone] = useState(user?.phone || "");
  const [screenshot, setScreenshot] = useState<string>("");
  const [screenshotName, setScreenshotName] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [reference, setReference] = useState("");

  // SendavaPay state
  const [svCountry, setSvCountry] = useState(user?.country || "");
  const [svPhone, setSvPhone] = useState("");
  const [svOperator, setSvOperator] = useState<SvOperator | null>(null);
  const [svDepositId, setSvDepositId] = useState<number | null>(null);
  const [svPaymentToken, setSvPaymentToken] = useState<string>("");
  const [svOtpToken, setSvOtpToken] = useState<string>("");
  const [svOtp, setSvOtp] = useState<string>("");
  const [svUssdCode, setSvUssdCode] = useState<string>("");
  const [svOtpMessage, setSvOtpMessage] = useState<string>("");
  const [svRedirectUrl, setSvRedirectUrl] = useState<string>("");
  const [svStatus, setSvStatus] = useState<string>("");
  const [svPolling, setSvPolling] = useState(false);

  const country = user?.country || "";

  const { data: apiCountries = [] } = useQuery<ApiCountry[]>({
    queryKey: ["/api/countries"],
  });

  const countryInfo = apiCountries.length > 0
    ? apiCountries.find(c => c.code === country && c.isActive)
    : COUNTRIES.find(c => c.code === country);
  const currency = countryInfo?.currency || "FCFA";

  const { data: platformSettings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });
  const MIN_DEPOSIT = parseInt(platformSettings?.minDeposit || "4000");
  const sendavapayEnabled = platformSettings?.sendavapayEnabled === "true";
  const sendavapayChannelName = platformSettings?.sendavapayChannelName || "SendavaPay";

  const { data: paymentNumbersList = [], isLoading: numbersLoading } = useQuery<PaymentNumber[]>({
    queryKey: ["/api/payment-numbers", country],
    queryFn: async () => {
      const res = await fetch(`/api/payment-numbers?country=${country}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    enabled: !!country,
  });

  // SendavaPay: load operators for selected country
  const { data: svOperatorsData, isLoading: svOperatorsLoading } = useQuery<{ success: boolean; data: SvOperator[] }>({
    queryKey: ["/api/sendavapay/operators", svCountry],
    queryFn: async () => {
      const res = await fetch(`/api/sendavapay/operators/${svCountry}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    enabled: step === "sv-operator" && !!svCountry,
  });
  const svOperators = (svOperatorsData?.data || []).filter(op => op.status === "online");

  // Poll deposit status
  useEffect(() => {
    if (step !== "sv-waiting" || !svDepositId || !svPolling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/deposits/${svDepositId}/sendavapay-status`, { credentials: "include" });
        const data = await res.json();
        setSvStatus(data.status);
        if (data.status === "approved") {
          clearInterval(interval);
          setSvPolling(false);
          toast({ title: "Paiement confirmé !", description: "Votre solde a été crédité." });
          refreshUser();
          queryClient.invalidateQueries({ queryKey: ["/api/deposits/history"] });
          // reset
          setStep("amount");
          setAmount("");
          setSvOperator(null);
          setSvDepositId(null);
          setSvPaymentToken("");
          setSvOtpToken("");
          setSvOtp("");
          setSvStatus("");
        } else if (data.status === "rejected") {
          clearInterval(interval);
          setSvPolling(false);
          toast({ title: "Paiement échoué", description: "Le paiement a été refusé ou annulé.", variant: "destructive" });
          setStep("sv-operator");
        }
      } catch (e) {
        // ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [step, svDepositId, svPolling]);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const copyPhone = async (number: PaymentNumber) => {
    setCopiedId(number.id);
    setTimeout(() => setCopiedId(null), 2000);
    await copyToClipboard(number.phone, "Numéro copié !");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Fichier trop grand", description: "Maximum 5 Mo", variant: "destructive" });
      return;
    }
    setScreenshotName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshot(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const depositMutation = useMutation({
    mutationFn: async () => {
      if (!selectedNumber) throw new Error("Aucun numéro sélectionné");
      const res = await apiRequest("POST", "/api/deposits", {
        amount: Number(amount),
        accountName: user?.fullName || "",
        accountNumber: senderPhone,
        paymentMethod: selectedNumber.operatorName,
        country,
        paymentNumberId: selectedNumber.id,
        channelName: `${selectedNumber.operatorName} - ${selectedNumber.phone}`,
        screenshot: screenshot || null,
        paymentMessage: paymentMessage || null,
        reference: reference || null,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Erreur");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Demande envoyée !", description: "Votre dépôt est en attente de validation" });
      queryClient.invalidateQueries({ queryKey: ["/api/deposits/history"] });
      refreshUser();
      setStep("amount");
      setSelectedNumber(null);
      setAmount("");
      setSenderPhone(user?.phone || "");
      setScreenshot("");
      setScreenshotName("");
      setPaymentMessage("");
      setReference("");
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // SendavaPay: create + initiate
  const svInitiateMutation = useMutation({
    mutationFn: async () => {
      if (!svOperator) throw new Error("Sélectionnez un opérateur");
      // Step 1: create payment on backend
      const createRes = await apiRequest("POST", "/api/sendavapay/create", {
        amount: Number(amount),
        country: svCountry,
        operatorId: svOperator.id,
        operatorName: svOperator.name,
        payerPhone: svPhone,
      });
      if (!createRes.ok) {
        const d = await createRes.json();
        throw new Error(d.message || "Erreur création paiement");
      }
      const createData = await createRes.json();
      setSvDepositId(createData.depositId);
      setSvPaymentToken(createData.paymentToken);

      // Step 2: initiate payment
      const initRes = await apiRequest("POST", "/api/sendavapay/initiate", {
        paymentToken: createData.paymentToken,
        payerCountry: svCountry,
        operatorId: svOperator.id,
        depositId: createData.depositId,
        payerPhone: svPhone,
      });
      if (!initRes.ok) {
        const d = await initRes.json();
        throw new Error(d.message || "Erreur initiation paiement");
      }
      return initRes.json();
    },
    onSuccess: (data: any) => {
      const isWave = svOperator?.name?.toLowerCase().includes("wave");
      if (data.requiresRedirect && data.redirectUrl && isWave) {
        // Seul Wave nécessite une redirection vers une page externe
        setSvRedirectUrl(data.redirectUrl);
        setStep("sv-redirect");
      } else if (data.requiresRedirect && !isWave) {
        // Les autres opérateurs (MTN, Moov, etc.) envoient un push USSD directement
        // sur le téléphone — pas besoin de redirection, on attend juste le webhook
        setSvPolling(true);
        setStep("sv-waiting");
      } else if (data.requiresOtp && data.otpToken) {
        // Orange Money (BF, CI, GN, ML, SN) — user must dial USSD then enter OTP
        setSvOtpToken(data.otpToken);
        const ussd = data.ussdCode || getUssdCode(svOperator?.name || "", svCountry);
        setSvUssdCode(ussd);
        setSvOtpMessage(data.message || "");
        setStep("sv-otp");
      } else if (data.success) {
        // Standard push: invite sent directly to phone — wait for webhook
        setSvPolling(true);
        setStep("sv-waiting");
      } else {
        toast({ title: "Erreur", description: data.error || data.message || "Erreur paiement", variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // SendavaPay: retry failed payment
  const svRetryMutation = useMutation({
    mutationFn: async () => {
      if (!svPaymentToken) throw new Error("Token de paiement manquant");
      const res = await apiRequest("POST", "/api/sendavapay/retry", {
        paymentToken: svPaymentToken,
        depositId: svDepositId,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Erreur retry");
      }
      return res.json();
    },
    onSuccess: () => {
      // Reset to operator selection to re-initiate
      setSvOtp("");
      setSvOtpToken("");
      setSvStatus("");
      setSvPolling(false);
      setStep("sv-operator");
      toast({ title: "Prêt à réessayer", description: "Sélectionnez un opérateur et relancez le paiement." });
    },
    onError: (e: any) => toast({ title: "Erreur retry", description: e.message, variant: "destructive" }),
  });

  // SendavaPay: submit OTP
  const svOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sendavapay/submit-otp", {
        otpToken: svOtpToken,
        otp: svOtp,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Erreur OTP");
      }
      return res.json();
    },
    onSuccess: () => {
      setSvPolling(true);
      setStep("sv-waiting");
    },
    onError: (e: any) => toast({ title: "Erreur OTP", description: e.message, variant: "destructive" }),
  });

  const handleAmountNext = () => {
    if (!amount || Number(amount) < MIN_DEPOSIT) {
      toast({
        title: "Montant invalide",
        description: `Le minimum est de ${MIN_DEPOSIT.toLocaleString()} ${currency}`,
        variant: "destructive",
      });
      return;
    }
    // Redirect to Drimpay payment page
    navigate(`/drimpay?amount=${Number(amount)}`);
  };

  const getOperatorIcon = (name: string): string | null => {
    const n = name.toLowerCase();
    if (n.includes("tmoney") || n.includes("t-money")) return "/operators/tmoney.png";
    if (n.includes("moov")) return "/operators/moov.jpg";
    if (n.includes("orange")) return "/operators/orange.png";
    if (n.includes("mtn")) return "/operators/mtn.png";
    if (n.includes("airtel")) return "/operators/airtel.png";
    if (n.includes("wave")) return "/operators/wave.png";
    return null;
  };

  /** Code USSD à composer pour recevoir l'OTP, par opérateur / pays */
  const getUssdCode = (operatorName: string, country: string): string => {
    const n = operatorName.toLowerCase();
    const c = country.toUpperCase();
    if (n.includes("orange")) {
      if (c === "ML") return "#144*77#";   // Orange Mali
      if (c === "CI") return "#144*82#";   // Orange Côte d'Ivoire
      if (c === "BF") return "#144*4#";    // Orange Burkina Faso
      if (c === "SN") return "#144#";      // Orange Sénégal
      if (c === "GN") return "#144#";      // Orange Guinée
      return "#144#";                      // Orange générique
    }
    return "";
  };

  const handleSubmit = () => {
    if (!senderPhone.trim()) {
      toast({ title: "Numéro requis", description: "Entrez le numéro depuis lequel vous avez payé", variant: "destructive" });
      return;
    }
    if (!screenshot) {
      toast({ title: "Capture requise", description: "Veuillez joindre la capture d'écran du paiement", variant: "destructive" });
      return;
    }
    depositMutation.mutate();
  };

  if (!user) return null;

  // ── STEP 1: Amount ─────────────────────────────────────────────────────────
  if (step === "amount") return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <Link href="/account">
          <button className="flex items-center gap-1 text-gray-800">
            <ChevronLeft className="w-5 h-5" />
            <span className="font-semibold text-base">Recharger</span>
          </button>
        </Link>
        <button className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
          <Info className="w-5 h-5 text-gray-600" />
        </button>
      </header>

      <div className="px-4 pt-6 pb-10 space-y-6">
        {/* Country display (auto from profile) */}
        {countryInfo && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-xl">
              🌍
            </div>
            <div>
              <p className="text-xs text-gray-400">Pays sélectionné</p>
              <p className="font-bold text-gray-800">{countryInfo.name} — {currency}</p>
            </div>
          </div>
        )}

        <div>
          <p className="text-gray-900 font-semibold text-sm mb-4">
            Montant de la recharge{" "}
            <span className="text-gray-500 font-normal">(Minimum {MIN_DEPOSIT.toLocaleString()} {currency})</span>
          </p>
          <div className="border border-gray-300 rounded-md flex items-center overflow-hidden">
            <span className="px-4 py-4 text-gray-800 font-semibold text-sm border-r border-gray-300 bg-white">{currency}</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
              placeholder="Veuillez saisir le montant de la recharge"
              className="flex-1 px-4 py-4 text-sm text-gray-400 outline-none bg-white placeholder:text-gray-400"
            />
          </div>
        </div>

        <button
          onClick={handleAmountNext}
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg"
          style={{ background: "linear-gradient(135deg, #1565C0 0%, #0D47A1 50%, #0a2e6e 100%)" }}
        >
          Procéder au paiement
        </button>

        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>Les services de dépôt sont disponibles 24h/24 et 7j/7. Le dépôt minimum est de <strong>{MIN_DEPOSIT.toLocaleString()} francs CFA</strong>.</p>
          <p>1. Le dépôt minimum est de {MIN_DEPOSIT.toLocaleString()} francs CFA.</p>
          <p>2. Vérifiez attentivement les informations de votre compte avant d'effectuer un transfert.</p>
        </div>
      </div>
    </div>
  );

  // ── STEP 2: Select payment method ──────────────────────────────────────────
  if (step === "select") return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <button className="flex items-center gap-1 text-gray-800" onClick={() => setStep("amount")}>
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-base">Choisir un opérateur</span>
        </button>
        <a href="https://yellowmtncm.site/history">
          <button className="text-xs text-[#003366] font-semibold px-3 py-1.5 rounded-full border border-[#003366]">Historique</button>
        </a>
      </header>

      <div className="mx-4 mt-4 rounded-xl p-4 border border-blue-100 bg-blue-50 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">Montant à déposer</p>
          <p className="text-xl font-bold text-[#003366]">{Number(amount).toLocaleString()} {currency}</p>
        </div>
        <button onClick={() => setStep("amount")} className="text-xs text-[#003366] underline">Modifier</button>
      </div>

      <div className="p-4 space-y-3 pb-10">
        {/* SendavaPay automatic option */}
        {sendavapayEnabled && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Paiement automatique</p>
            <div
              className="bg-white rounded-2xl border-2 border-blue-500 shadow-sm overflow-hidden cursor-pointer"
              onClick={() => { setSvCountry(country); setStep("sv-operator"); }}
            >
              <div className="p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <img src="/topup-icon.png" className="w-8 h-8 object-contain" alt="topup" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{sendavapayChannelName}</p>
                  <p className="text-blue-500 text-xs font-medium">Mobile Money automatique</p>
                  <p className="text-gray-400 text-xs">Validation instantanée</p>
                </div>
                <ArrowRight className="w-5 h-5 text-blue-500 flex-shrink-0" />
              </div>
            </div>
          </div>
        )}

        {/* Manual payment numbers */}
        {paymentNumbersList.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 mt-4">Paiement manuel</p>
            <p className="text-sm font-semibold text-gray-700 mb-2">Sélectionnez un numéro de paiement</p>
            {paymentNumbersList.map((num) => (
              <div key={num.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-3">
                <div className="p-4 flex items-center gap-3">
                  {num.logoUrl ? (
                    <img src={num.logoUrl} alt={num.operatorName} className="w-12 h-12 rounded-xl object-contain border border-gray-100" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                      <Phone className="w-6 h-6 text-[#003366]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{num.operatorName}</p>
                    <p className="text-[#003366] font-mono font-bold text-lg">{num.phone}</p>
                    <p className="text-gray-500 text-xs">{num.ownerName}</p>
                  </div>
                  <button onClick={() => copyPhone(num)} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                    {copiedId === num.id ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-[#003366]" />}
                  </button>
                </div>
                <button
                  onClick={() => { setSelectedNumber(num); setStep("form"); }}
                  className="w-full py-3.5 font-bold text-sm text-white flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)" }}
                >
                  J'ai envoyé l'argent sur ce numéro <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {numbersLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#003366]" />
          </div>
        )}

        {!numbersLoading && paymentNumbersList.length === 0 && !sendavapayEnabled && (
          <div className="text-center py-14 text-gray-400">
            <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucun numéro disponible pour votre pays</p>
            <p className="text-xs mt-1">Contactez le support</p>
          </div>
        )}
      </div>
    </div>
  );

  // ── STEP 3: Manual deposit form ────────────────────────────────────────────
  if (step === "form" && selectedNumber) return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <button className="flex items-center gap-1 text-gray-800" onClick={() => setStep("select")}>
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-base">Confirmer le paiement</span>
        </button>
      </header>

      <div className="p-4 space-y-4 pb-10">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 flex items-center gap-3">
          {selectedNumber.logoUrl ? (
            <img src={selectedNumber.logoUrl} alt={selectedNumber.operatorName} className="w-10 h-10 rounded-lg object-contain" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center border border-blue-100">
              <Phone className="w-5 h-5 text-[#003366]" />
            </div>
          )}
          <div className="flex-1">
            <p className="text-xs text-gray-500">Numéro destinataire</p>
            <p className="font-bold text-[#003366] text-sm">{selectedNumber.operatorName} — {selectedNumber.phone}</p>
            <p className="text-xs text-gray-500">{selectedNumber.ownerName}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Montant</p>
            <p className="font-bold text-gray-800">{Number(amount).toLocaleString()} {currency}</p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Votre numéro payeur</p>
          <div className="border border-gray-300 rounded-md flex items-center overflow-hidden bg-white">
            <Phone className="w-4 h-4 text-gray-400 ml-4" />
            <input
              type="tel"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
              placeholder="Numéro depuis lequel vous avez payé"
              className="flex-1 px-3 py-4 text-sm text-gray-700 outline-none bg-transparent"
            />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Référence / ID transaction <span className="text-gray-400 font-normal">(optionnel)</span></p>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Numéro de référence de la transaction"
            className="w-full border border-gray-300 rounded-md px-4 py-4 text-sm text-gray-700 outline-none bg-white"
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Message reçu après paiement <span className="text-gray-400 font-normal">(optionnel)</span></p>
          <textarea
            value={paymentMessage}
            onChange={(e) => setPaymentMessage(e.target.value)}
            placeholder="Collez ici le SMS ou message de confirmation reçu..."
            rows={3}
            className="w-full border border-gray-300 rounded-md px-4 py-3 text-sm text-gray-700 outline-none bg-white resize-none"
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Capture d'écran du paiement <span className="text-red-500">*</span></p>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`w-full border-2 border-dashed rounded-xl py-7 flex flex-col items-center gap-2 transition-colors ${
              screenshot ? "border-green-400 bg-green-50" : "border-gray-300 bg-gray-50 hover:border-[#003366] hover:bg-blue-50"
            }`}
          >
            {screenshot ? (
              <><CheckCircle className="w-8 h-8 text-green-500" /><p className="text-sm font-medium text-green-600">{screenshotName}</p><p className="text-xs text-gray-400">Appuyez pour changer</p></>
            ) : (
              <><ImageIcon className="w-8 h-8 text-gray-400" /><p className="text-sm font-medium text-gray-600">Appuyez pour ajouter la capture</p><p className="text-xs text-gray-400">JPG, PNG — max 5 Mo</p></>
            )}
          </button>
          {screenshot && (
            <div className="mt-3 rounded-xl overflow-hidden border border-gray-100">
              <img src={screenshot} alt="Capture" className="w-full max-h-52 object-contain bg-gray-50" />
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={depositMutation.isPending}
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #1565C0 0%, #0D47A1 50%, #0a2e6e 100%)" }}
        >
          {depositMutation.isPending ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Envoi en cours...</span>
          ) : (
            <span className="flex items-center justify-center gap-2"><Upload className="w-5 h-5" /> Soumettre ma demande</span>
          )}
        </button>
      </div>
    </div>
  );

  // ── SENDAVAPAY: Select country + operator ──────────────────────────────────
  if (step === "sv-operator") return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <button className="flex items-center gap-1 text-gray-800" onClick={() => setStep("amount")}>
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-base">Top up</span>
        </button>
        <a href="https://yellowmtncm.site/history">
          <button className="text-xs text-[#003366] font-semibold px-3 py-1.5 rounded-full border border-[#003366]">Historique</button>
        </a>
      </header>

      {/* Amount recap */}
      <div className="mx-4 mt-4 rounded-xl p-4 border border-blue-100 bg-blue-50 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">Montant à déposer</p>
          <p className="text-xl font-bold text-[#003366]">{Number(amount).toLocaleString()} {currency}</p>
        </div>
        <button onClick={() => setStep("amount")} className="text-xs text-[#003366] underline">Modifier</button>
      </div>

      <div className="p-4 space-y-4 pb-10">
        {/* Country selector */}
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Pays</p>
          <select
            value={svCountry}
            onChange={(e) => { setSvCountry(e.target.value); setSvOperator(null); }}
            className="w-full border border-gray-300 rounded-md px-4 py-4 text-sm text-gray-700 outline-none bg-white appearance-none"
          >
            {(apiCountries.length > 0 ? apiCountries.filter(c => c.isActive) : COUNTRIES).map((c: any) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Phone number */}
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Numéro Mobile Money</p>
          <div className="border border-gray-300 rounded-md flex items-center overflow-hidden bg-white">
            <Phone className="w-4 h-4 text-gray-400 ml-4 flex-shrink-0" />
            <input
              type="tel"
              inputMode="numeric"
              value={svPhone}
              onChange={(e) => setSvPhone(e.target.value)}
              placeholder="Numéro sur lequel envoyer la demande"
              className="flex-1 px-3 py-4 text-sm text-gray-700 outline-none bg-transparent"
            />
          </div>
        </div>

        {/* Operator selector */}
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Opérateur Mobile Money</p>
          {svOperatorsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#003366]" />
            </div>
          ) : svOperators.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">Aucun opérateur disponible pour ce pays</p>
            </div>
          ) : (
            <div className="space-y-2">
              {svOperators.map((op) => {
                const icon = getOperatorIcon(op.name);
                return (
                  <button
                    key={op.id}
                    onClick={() => setSvOperator(op)}
                    className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border-2 transition-all ${
                      svOperator?.id === op.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white hover:border-blue-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {icon ? (
                        <img src={icon} alt={op.name} className="w-10 h-10 rounded-full object-cover border border-gray-100" />
                      ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          svOperator?.id === op.id ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"
                        }`}>
                          {op.name.charAt(0)}
                        </div>
                      )}
                      <div className="text-left">
                        <p className="font-semibold text-gray-900 text-sm">{op.name}</p>
                        {op.requiresOtp && <p className="text-xs text-orange-500">Code OTP requis</p>}
                      </div>
                    </div>
                    {svOperator?.id === op.id && <CheckCircle className="w-5 h-5 text-blue-500" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => svInitiateMutation.mutate()}
          disabled={!svOperator || svInitiateMutation.isPending}
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #1565C0 0%, #0D47A1 50%, #0a2e6e 100%)" }}
        >
          {svInitiateMutation.isPending ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Initiation en cours...</span>
          ) : (
            <span className="flex items-center justify-center gap-2"><img src="/topup-icon.png" className="w-6 h-6 object-contain" alt="topup" /> Initier le paiement</span>
          )}
        </button>
      </div>
    </div>
  );

  // ── SENDAVAPAY: OTP screen ─────────────────────────────────────────────────
  if (step === "sv-otp") return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center gap-2 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => setStep("sv-operator")} className="flex items-center gap-1 text-gray-800">
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-base">Code OTP</span>
        </button>
      </header>

      <div className="p-4 space-y-5 pb-10">

        {/* Step 1 — Dial USSD code */}
        <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">1</span>
            </div>
            <p className="font-bold text-gray-900 text-sm">Composez ce code sur votre téléphone</p>
          </div>
          {(() => {
            const displayCode = svUssdCode || getUssdCode(svOperator?.name || "", svCountry);
            return displayCode ? (
              <div className="bg-white rounded-xl border border-orange-200 px-4 py-3 text-center">
                <p className="font-mono font-black text-2xl text-orange-600 tracking-widest">{displayCode}</p>
                <p className="text-xs text-gray-400 mt-1">Composez ce code USSD sur votre téléphone</p>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                Composez le code USSD de votre opérateur sur votre téléphone pour recevoir le code OTP par SMS.
              </p>
            );
          })()}
        </div>

        {/* Step 2 — Enter OTP */}
        <div className="rounded-2xl border-2 border-blue-100 bg-blue-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-[#003366] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">2</span>
            </div>
            <p className="font-bold text-gray-900 text-sm">Entrez le code OTP reçu par SMS</p>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Après avoir composé le code, vous recevrez un SMS avec un code OTP. Saisissez-le ci-dessous pour confirmer le paiement de <strong>{Number(amount).toLocaleString()} {currency}</strong>.
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={svOtp}
            onChange={(e) => setSvOtp(e.target.value)}
            placeholder="Code OTP reçu par SMS"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-4 text-center text-2xl tracking-widest font-black text-gray-800 outline-none bg-white focus:border-blue-400"
            maxLength={8}
          />
        </div>

        <button
          onClick={() => svOtpMutation.mutate()}
          disabled={!svOtp.trim() || svOtpMutation.isPending}
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #1565C0 0%, #0D47A1 50%, #0a2e6e 100%)" }}
        >
          {svOtpMutation.isPending ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Vérification...</span>
          ) : "Valider le code OTP"}
        </button>
      </div>
    </div>
  );

  // ── SENDAVAPAY: Redirect screen (Wave, etc.) ──────────────────────────────
  if (step === "sv-redirect") return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center gap-2 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => setStep("sv-operator")} className="flex items-center gap-1 text-gray-800">
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-base">Finaliser le paiement</span>
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
          <ExternalLink className="w-10 h-10 text-blue-500" />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-xl mb-2">Finaliser sur l'application</p>
          <p className="text-sm text-gray-500">
            Appuyez sur le bouton ci-dessous pour ouvrir la page de paiement de l'opérateur
            et confirmer votre dépôt de <strong>{Number(amount).toLocaleString()} {currency}</strong>.
          </p>
        </div>
        <a
          href={svRedirectUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #1565C0 0%, #0D47A1 50%, #0a2e6e 100%)" }}
          onClick={() => { setSvPolling(true); setStep("sv-waiting"); }}
        >
          <ExternalLink className="w-5 h-5" /> Ouvrir la page de paiement
        </a>
      </div>
    </div>
  );

  // ── SENDAVAPAY: Waiting / polling screen ────────────────────────────────────
  if (step === "sv-waiting") return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center gap-2 px-4 py-4 bg-white border-b border-gray-100">
        <span className="font-semibold text-base text-gray-800">Paiement en cours</span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
        {svStatus === "approved" ? (
          <>
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-xl">Paiement confirmé !</p>
              <p className="text-sm text-gray-500 mt-1">Votre solde a été crédité de <strong>{Number(amount).toLocaleString()} {currency}</strong></p>
            </div>
          </>
        ) : svStatus === "rejected" ? (
          <>
            <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
              <RefreshCw className="w-10 h-10 text-red-400" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-xl">Paiement échoué</p>
              <p className="text-sm text-gray-500 mt-1">Le paiement a été refusé ou annulé.</p>
            </div>
            <div className="flex gap-3 w-full">
              {svPaymentToken && (
                <button
                  onClick={() => svRetryMutation.mutate()}
                  disabled={svRetryMutation.isPending}
                  className="flex-1 py-3 rounded-full text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)" }}
                >
                  {svRetryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Réessayer
                </button>
              )}
              <button
                onClick={() => { setStep("amount"); setAmount(""); setSvOperator(null); setSvDepositId(null); setSvPaymentToken(""); setSvPolling(false); setSvStatus(""); }}
                className="flex-1 py-3 rounded-full bg-gray-100 text-gray-600 font-semibold text-sm"
              >
                Nouvelle recharge
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
              <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" style={{ animationDuration: "2s" }} />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-xl">En attente de confirmation</p>
              <p className="text-sm text-gray-500 mt-2">
                Une demande de paiement de <strong>{Number(amount).toLocaleString()} {currency}</strong> a été envoyée sur votre téléphone.<br />
                Acceptez-la sur votre téléphone. Cette page se met à jour automatiquement.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <a href="https://yellowmtncm.site/history" className="flex-1">
                <button className="w-full py-3 rounded-full border border-[#003366] text-[#003366] font-semibold text-sm">
                  Voir l'historique
                </button>
              </a>
              <button
                onClick={() => { setStep("amount"); setAmount(""); setSvOperator(null); setSvDepositId(null); setSvPaymentToken(""); setSvPolling(false); setSvStatus(""); }}
                className="flex-1 py-3 rounded-full bg-gray-100 text-gray-600 font-semibold text-sm"
              >
                Nouvelle recharge
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return null;
}
