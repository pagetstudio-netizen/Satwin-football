import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Eye, EyeOff, ChevronDown } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "Requis"),
  password: z.string().min(1, "Requis"),
  captcha:  z.string().min(1, "Saisissez le texte"),
});
type LoginForm = z.infer<typeof loginSchema>;

/* ── Captcha SVG ── */
function CaptchaImage({ code }: { code: string }) {
  return (
    <svg width="90" height="38" viewBox="0 0 90 38" xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}>
      <rect width="90" height="38" fill="#f5e6c8" rx="3" />
      {/* noise lines */}
      <line x1="0" y1="14" x2="90" y2="20" stroke="#d4b896" strokeWidth="1.2" />
      <line x1="0" y1="26" x2="90" y2="18" stroke="#cca87a" strokeWidth="0.8" />
      <line x1="10" y1="0" x2="15" y2="38" stroke="#d4b896" strokeWidth="0.7" />
      <line x1="60" y1="0" x2="55" y2="38" stroke="#cca87a" strokeWidth="0.6" />
      {/* digits */}
      {code.split("").map((ch, i) => (
        <text key={i}
          x={10 + i * 20}
          y={27 + (i % 2 === 0 ? -3 : 3)}
          fontSize="22"
          fontFamily="'Georgia', serif"
          fontWeight="bold"
          fill="#cc0000"
          transform={`rotate(${(i % 3 - 1) * 8}, ${18 + i * 20}, 20)`}
        >{ch}</text>
      ))}
    </svg>
  );
}

function genCaptcha() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaCode, setCaptchaCode] = useState(genCaptcha);
  const [rememberMe, setRememberMe] = useState(false);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "", captcha: "" },
  });

  const refreshCaptcha = useCallback(() => {
    setCaptchaCode(genCaptcha());
    form.setValue("captcha", "");
  }, [form]);

  async function onSubmit(data: LoginForm) {
    if (data.captcha !== captchaCode) {
      toast({ title: "Code incorrect", description: "Saisissez exactement le texte affiché", variant: "destructive" });
      refreshCaptcha();
      return;
    }
    setIsLoading(true);
    try {
      await login(data.username, data.password);
      navigate("/");
    } catch (error: any) {
      toast({ title: "Erreur de connexion", description: error.message || "Vérifiez vos informations", variant: "destructive" });
      refreshCaptcha();
    } finally {
      setIsLoading(false);
    }
  }

  const BTN_COLOR = "#7fa5b8";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f3f4f6" }}>
      {/* Green header */}
      <div style={{
        background: "#15803d",
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{ color: "white", fontWeight: 700, fontSize: 18 }}>Se connecter</span>
      </div>

      {/* White card */}
      <div style={{
        flex: 1,
        background: "white",
        borderRadius: "24px 24px 0 0",
        padding: "28px 24px 32px",
        overflowY: "auto",
      }}>

        <form onSubmit={form.handleSubmit(onSubmit)}>

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
          </div>

          {/* Mot de passe */}
          <div style={{ marginBottom: 28, position: "relative" }}>
            <input
              {...form.register("password")}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Mot de passe"
              style={{
                width: "100%", border: "none", borderBottom: "1px solid #333",
                outline: "none", fontSize: 15, color: "#222",
                paddingBottom: 8, background: "transparent",
                paddingRight: 32,
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              style={{
                position: "absolute", right: 0, top: 0,
                background: "none", border: "none", cursor: "pointer", padding: 0,
              }}
            >
              {showPassword
                ? <Eye size={20} color="#888" />
                : <EyeOff size={20} color="#888" />}
            </button>
          </div>

          {/* Captcha row */}
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
              <button type="button" onClick={refreshCaptcha} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                <CaptchaImage code={captchaCode} />
              </button>
            </div>
          </div>

          {/* Remember me toggle */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            marginBottom: 24,
          }}>
            <div
              onClick={() => setRememberMe(v => !v)}
              style={{
                width: 44, height: 24, borderRadius: 12,
                background: rememberMe ? "#15803d" : "#bbb",
                position: "relative", cursor: "pointer",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute",
                top: 2, left: rememberMe ? 22 : 2,
                width: 20, height: 20,
                borderRadius: "50%", background: "white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                transition: "left 0.2s",
              }} />
            </div>
            <span style={{ fontSize: 14, color: "#444" }}>Se souvenir de l'identifiant</span>
          </div>

          {/* SE CONNECTER */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: "100%", padding: "14px 0",
              background: BTN_COLOR, color: "white",
              fontWeight: 700, fontSize: 15,
              letterSpacing: 1, border: "none",
              borderRadius: 8, cursor: "pointer",
              marginBottom: 20,
            }}
          >
            {isLoading ? "Connexion..." : "SE CONNECTER"}
          </button>
        </form>

        {/* Bottom links */}
        <div style={{ display: "flex", justifyContent: "center", gap: 32 }}>
          <button
            type="button"
            onClick={() => navigate("/register")}
            style={{ background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 700, color: "#333", letterSpacing: 0.5 }}
          >
            POUR S'INSCRIRE
          </button>
          <button
            type="button"
            onClick={() => window.open("https://t.me/ahmed_satwinfoot", "_blank")}
            style={{ background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 700, color: "#333", letterSpacing: 0.5 }}
          >
            CONTACTEZ-NOUS
          </button>
        </div>
      </div>

    </div>
  );
}
