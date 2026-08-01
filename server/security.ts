/**
 * security.ts
 * Couche de protection contre les attaques courantes :
 *  - Headers HTTP sécurisés (Helmet)
 *  - Rate limiting par endpoint sensible
 *  - Pollution des paramètres HTTP (HPP)
 *  - Détection SQL injection / XSS dans le body
 *  - Blocage des payloads trop volumineux / suspects
 */

import { Request, Response, NextFunction, Application } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import hpp from "hpp";

// ── 1. Headers de sécurité HTTP (Helmet) ─────────────────────────────────────
export const securityHeaders = helmet({
  contentSecurityPolicy: false, // géré par le frontend
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true },
  frameguard: { action: "deny" },           // anti-clickjacking
  noSniff: true,                             // anti MIME sniffing
  xssFilter: true,                           // filtre XSS basique navigateur
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hidePoweredBy: true,                       // masque X-Powered-By: Express
});

// ── 2. Rate limiters ──────────────────────────────────────────────────────────
const limiterConfig = (max: number, windowMin: number, message: string) =>
  rateLimit({
    windowMs: windowMin * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
      const forwarded = req.headers["x-forwarded-for"];
      return typeof forwarded === "string"
        ? forwarded.split(",")[0].trim()
        : req.socket.remoteAddress || "unknown";
    },
  });

// Connexion : 10 tentatives / 15 min
export const loginLimiter = limiterConfig(
  10, 15,
  "Trop de tentatives de connexion. Réessayez dans 15 minutes."
);

// Inscription : 5 comptes / 30 min par IP
export const registerLimiter = limiterConfig(
  5, 30,
  "Trop d'inscriptions depuis cette adresse. Réessayez plus tard."
);

// Dépôts / retraits : 20 req / 10 min
export const transactionLimiter = limiterConfig(
  20, 10,
  "Trop de requêtes financières. Réessayez dans 10 minutes."
);

// API générale : 200 req / min par IP
export const globalApiLimiter = limiterConfig(
  200, 1,
  "Trop de requêtes. Ralentissez."
);

// Admin : 30 req / min
export const adminLimiter = limiterConfig(
  30, 1,
  "Limite admin atteinte. Réessayez dans une minute."
);

// ── 3. HPP – déduplique les paramètres de query string ───────────────────────
export const hppProtection = hpp();

// ── 4. Détection SQL injection / XSS dans le body ────────────────────────────
const SQL_PATTERNS = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|UNION|EXEC|EXECUTE|CAST|CONVERT|DECLARE|WAITFOR)\b)|(-{2}|\/\*|\*\/|;--|xp_|0x[0-9a-f]+)/i;
const XSS_PATTERNS = /<script[\s\S]*?>[\s\S]*?<\/script>|javascript\s*:|on\w+\s*=|<\s*iframe|<\s*object|<\s*embed|<\s*svg/i;

function deepScan(value: unknown, depth = 0): boolean {
  if (depth > 5) return false;
  if (typeof value === "string") {
    return SQL_PATTERNS.test(value) || XSS_PATTERNS.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(v => deepScan(v, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(v => deepScan(v, depth + 1));
  }
  return false;
}

export function payloadSanitizer(req: Request, res: Response, next: NextFunction) {
  if (req.body && deepScan(req.body)) {
    return res.status(400).json({ message: "Requête invalide." });
  }
  if (req.query && deepScan(req.query)) {
    return res.status(400).json({ message: "Requête invalide." });
  }
  next();
}

// ── 5. Appliquer tout sur l'application ──────────────────────────────────────
export function applySecurity(app: Application) {
  app.use(securityHeaders);
  app.use(hppProtection);
  app.use("/api", globalApiLimiter);
  app.use("/api/auth/login", loginLimiter);
  app.use("/api/auth/register", registerLimiter);
  app.use("/api/deposits", transactionLimiter);
  app.use("/api/withdrawals", transactionLimiter);
  app.use("/api/admin", adminLimiter);
  app.use(payloadSanitizer);
}
