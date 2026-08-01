import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function ChangePasswordPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/change-password", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur lors du changement de mot de passe");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Succès", description: "Mot de passe modifié avec succès" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      navigate("/account");
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: "Champs requis", description: "Veuillez remplir tous les champs", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Mot de passe trop court", description: "Minimum 6 caractères requis", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Erreur", description: "Les nouveaux mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">

      {/* ── Blue header ── */}
      <header
        className="flex items-center px-4 py-4"
        style={{ background: "#15803d" }}
      >
        <button
          onClick={() => navigate("/account")}
          className="flex items-center gap-1 text-white mr-4"
          data-testid="button-back"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Retour</span>
        </button>
        <h1 className="flex-1 text-center text-white font-bold text-base pr-16">
          Changer le mot de passe
        </h1>
      </header>

      {/* ── White form card ── */}
      <div className="flex-1 px-4 pt-6">
        <div className="bg-white rounded-2xl shadow-sm px-5 py-6 space-y-5">

          {/* Ancien mot de passe */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Ancien mot de passe
            </label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-4 text-sm text-gray-800 outline-none focus:border-blue-400 bg-white pr-11"
                data-testid="input-current-password"
              />
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                onClick={() => setShowCurrent(!showCurrent)}
              >
                {showCurrent ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Nouveau mot de passe */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-4 text-sm text-gray-800 outline-none focus:border-blue-400 bg-white pr-11"
                data-testid="input-new-password"
              />
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Re-mot de passe */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Re-mot de passe
            </label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-4 text-sm text-gray-800 outline-none focus:border-blue-400 bg-white pr-11"
                data-testid="input-confirm-password"
              />
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Confirmer button */}
          <button
            onClick={handleSubmit}
            disabled={changePasswordMutation.isPending}
            className="w-full py-4 rounded-xl text-white font-bold text-base disabled:opacity-50 mt-2"
            style={{ background: "#15803d" }}
            data-testid="button-change-password-submit"
          >
            {changePasswordMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Modification...
              </span>
            ) : (
              "Confirmer"
            )}
          </button>

        </div>
      </div>

    </div>
  );
}
