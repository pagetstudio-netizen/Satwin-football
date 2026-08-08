import { useState, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { FALLBACK_COUNTRIES, type ApiCountry } from "@/lib/countries";
import { ChevronLeft, X, ChevronDown } from "lucide-react";
import { CountrySelector } from "@/components/country-selector";

const registerSchema = z.object({
  username:        z.string().min(3, "Au moins 3 caractères"),
  phone:           z.string().min(6, "Numéro invalide"),
  country:         z.string().min(2, "Sélectionnez un pays"),
  password:        z.string().min(6, "Au moins 6 caractères"),
  confirmPassword: z.string().min(1, "Requis"),
  invitationCode:  z.string().optional(),
  captcha:         z.string().min(1, "Requis"),
}).refine(d => d.password === d.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});
type RegisterForm = z.infer<typeof registerSchema>;

/* ── Country code → flag emoji ── */
function codeToFlag(code: string) {
  if (!code || code.length < 2) return "🏳";
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

/* ── Captcha SVG ── */
function CaptchaImage({ code, onClick }: { code: string; onClick: () => void }) {
  return (
    <svg onClick={onClick} width="90" height="38" viewBox="0 0 90 38"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, cursor: "pointer" }}>
      <rect width="90" height="38" fill="#f5e6c8" rx="3" />
      <line x1="0" y1="14" x2="90" y2="20" stroke="#d4b896" strokeWidth="1.2" />
      <line x1="0" y1="26" x2="90" y2="18" stroke="#cca87a" strokeWidth="0.8" />
      <line x1="10" y1="0" x2="15" y2="38" stroke="#d4b896" strokeWidth="0.7" />
      <line x1="60" y1="0" x2="55" y2="38" stroke="#cca87a" strokeWidth="0.6" />
      {code.split("").map((ch, i) => (
        <text key={i}
          x={10 + i * 20} y={27 + (i % 2 === 0 ? -3 : 3)}
          fontSize="22" fontFamily="'Georgia', serif" fontWeight="bold" fill="#cc0000"
          transform={`rotate(${(i % 3 - 1) * 8}, ${18 + i * 20}, 20)`}
        >{ch}</text>
      ))}
    </svg>
  );
}

function genCaptcha() { return String(Math.floor(1000 + Math.random() * 9000)); }

const BTN_COLOR = "#7fa5b8";

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { register: authRegister } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [captchaCode, setCaptchaCode] = useState(genCaptcha);

  const params = new URLSearchParams(searchString);
  const refCode = params.get("invite_code") || params.get("money") || params.get("reg") || "";

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", phone: "", country: "CI", password: "", confirmPassword: "", invitationCode: refCode, captcha: "" },
  });

  const { data: apiCountries } = useQuery<ApiCountry[]>({ queryKey: ["/api/countries"] });
  const selectedCountry = form.watch("country");

  useEffect(() => {
    if (!apiCountries?.length) return;
    const isValid = apiCountries.some(ac => ac.code === selectedCountry && ac.isActive);
    if (!isValid) {
      const first = apiCountries.find(ac => ac.isActive);
      if (first) form.setValue("country", first.code);
    }
  }, [apiCountries, selectedCountry, form]);

  const countries = apiCountries?.filter(ac => ac.isActive).length
    ? apiCountries.filter(ac => ac.isActive)
    : FALLBACK_COUNTRIES;

  const selectedC = countries.find((c: any) => c.code === selectedCountry);
  const prefix = selectedC ? `+${(selectedC as any).phonePrefix}` : "+--";
  const flag   = codeToFlag(selectedCountry);

  const refreshCaptcha = useCallback(() => {
    setCaptchaCode(genCaptcha());
    form.setValue("captcha", "");
  }, [form]);

  async function onSubmit(data: RegisterForm) {
    if (data.captcha !== captchaCode) {
      toast({ title: "Code incorrect", description: "Saisissez exactement le texte affiché", variant: "destructive" });
      refreshCaptcha();
      return;
    }
    setIsLoading(true);
    try {
      await authRegister({
        fullName: data.username,
        phone: data.phone,
        country: data.country,
        password: data.password,
        invitationCode: data.invitationCode,
      });
      toast({ title: "Inscription réussie !", description: "Bienvenue sur SATWIN FOOT !" });
      navigate("/");
    } catch (error: any) {
      toast({ title: "Erreur d'inscription", description: error.message || "Une erreur est survenue", variant: "destructive" });
      refreshCaptcha();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f3f4f6" }}>

      {/* Green header */}
      <div style={{
        background: "#15803d", height: 56, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px",
      }}>
        <button onClick={() => navigate("/login")}
          style={{ background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4, color: "white" }}>
          <ChevronLeft size={20} color="white" />
          <span style={{ fontSize: 14, fontWeight: 500 }}>Retour à la page de connexion</span>
        </button>
        <button onClick={() => navigate("/login")}
          style={{ background: "none", border: "none", cursor: "pointer" }}>
          <X size={20} color="white" />
        </button>
      </div>

      {/* White card */}
      <div style={{
        flex: 1, background: "white",
        borderRadius: "24px 24px 0 0",
        padding: "28px 24px 40px",
        overflowY: "auto",
      }}>

        {/* Language selector */}
        <div style={{ position: "relative", display: "inline-block", marginBottom: 28 }}>
          <button type="button" onClick={() => setLangOpen(v => !v)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              border: "1px solid #ccc", borderRadius: 6,
              padding: "6px 10px", background: "white", cursor: "pointer",
            }}>
            <span style={{ fontSize: 18 }}>🇫🇷</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>FR</span>
            <ChevronDown size={13} color="#555" />
          </button>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)}>
          <input type="hidden" {...form.register("country")} />

          {/* Nom d'utilisateur */}
          <div style={{ marginBottom: 28 }}>
            <input
              {...form.register("username")}
              type="text"
              autoComplete="username"
              placeholder="Nom d'utilisateur"
              style={{
                width: "100%", border: "none", borderBottom: "1px solid #333",
                outline: "none", fontSize: 15, color: "#222",
                paddingBottom: 8, background: "transparent",
              }}
            />
            {form.formState.errors.username && (
              <p style={{ color: "#e63946", fontSize: 11, marginTop: 4 }}>
                {form.formState.errors.username.message}
              </p>
            )}
          </div>

          {/* Mot de passe */}
          <div style={{ marginBottom: 28 }}>
            <input
              {...form.register("password")}
              type="password"
              autoComplete="new-password"
              placeholder="Mot de passe"
              style={{
                width: "100%", border: "none", borderBottom: "1px solid #333",
                outline: "none", fontSize: 15, color: "#222",
                paddingBottom: 8, background: "transparent",
              }}
            />
            {form.formState.errors.password && (
              <p style={{ color: "#e63946", fontSize: 11, marginTop: 4 }}>
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          {/* Confirmez le mot de passe */}
          <div style={{ marginBottom: 28 }}>
            <input
              {...form.register("confirmPassword")}
              type="password"
              autoComplete="new-password"
              placeholder="Confirmez le mot de passe"
              style={{
                width: "100%", border: "none", borderBottom: "1px solid #333",
                outline: "none", fontSize: 15, color: "#222",
                paddingBottom: 8, background: "transparent",
              }}
            />
            {form.formState.errors.confirmPassword && (
              <p style={{ color: "#e63946", fontSize: 11, marginTop: 4 }}>
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          {/* Code d'invitation */}
          <div style={{ marginBottom: 28 }}>
            <input
              {...form.register("invitationCode")}
              type="text"
              placeholder="Code d'invitation"
              style={{
                width: "100%", border: "none", borderBottom: "1px solid #333",
                outline: "none", fontSize: 15, color: "#222",
                paddingBottom: 8, background: "transparent",
              }}
            />
          </div>

          {/* Country selector + Phone */}
          <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-end", gap: 10 }}>
            {/* Country button → opens modal */}
            <button
              type="button"
              onClick={() => setCountryModalOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                border: "none", borderBottom: "1px solid #333",
                background: "transparent", cursor: "pointer",
                paddingBottom: 8, minWidth: 90, flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 14, color: "#555" }}>{prefix}</span>
              <ChevronDown size={13} color="#555" />
            </button>

            {/* Phone number */}
            <div style={{ flex: 1 }}>
              <input
                {...form.register("phone")}
                type="tel"
                autoComplete="tel"
                placeholder="Numéro de téléphone"
                style={{
                  width: "100%", border: "none", borderBottom: "1px solid #333",
                  outline: "none", fontSize: 15, color: "#222",
                  paddingBottom: 8, background: "transparent",
                }}
              />
              {form.formState.errors.phone && (
                <p style={{ color: "#e63946", fontSize: 11, marginTop: 4 }}>
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>
          </div>

          {/* Captcha */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
              <input
                {...form.register("captcha")}
                type="text"
                inputMode="numeric"
                placeholder="Saisissez le texte"
                style={{
                  flex: 1, border: "none", borderBottom: "1px solid #333",
                  outline: "none", fontSize: 15, color: "#222",
                  paddingBottom: 8, background: "transparent",
                }}
              />
              <CaptchaImage code={captchaCode} onClick={refreshCaptcha} />
            </div>
          </div>

          {/* S'INSCRIRE */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: "100%", padding: "14px 0",
              background: BTN_COLOR, color: "white",
              fontWeight: 700, fontSize: 15,
              letterSpacing: 1, border: "none",
              borderRadius: 8, cursor: "pointer",
            }}
          >
            {isLoading ? "Inscription..." : "S'INSCRIRE"}
          </button>
        </form>
      </div>

      <CountrySelector
        open={countryModalOpen}
        onClose={() => setCountryModalOpen(false)}
        onSelect={(code) => form.setValue("country", code, { shouldValidate: true })}
        currentCode={selectedCountry}
      />
    </div>
  );
}
