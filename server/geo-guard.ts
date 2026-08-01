/**
 * geo-guard.ts
 * Middleware that:
 *  1. Blocks known bots / crawlers (User-Agent check)
 *  2. Blocks VPN / proxy / hosting IPs (ip-api.com detection)
 *  3. Blocks IPs that are NOT from an African country
 *
 * Uses ip-api.com free tier (45 req/min).
 * Results are cached in memory for 2 hours to stay well under the rate limit.
 */

import { Request, Response, NextFunction } from "express";

// ── African ISO-3166-1 alpha-2 country codes ─────────────────────────────────
const AFRICA = new Set([
  "DZ","AO","BJ","BW","BF","BI","CM","CV","CF","TD","KM","CG","CD","CI",
  "DJ","EG","GQ","ER","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY",
  "MG","MW","ML","MR","MU","YT","MA","MZ","NA","NE","NG","RE","RW","SH",
  "ST","SN","SC","SL","SO","ZA","SS","SD","SZ","TZ","TG","TN","UG","EH",
  "ZM","ZW",
]);

// ── Bot User-Agent patterns ───────────────────────────────────────────────────
const BOT_UA = /bot|crawl|slurp|spider|mediapartners|facebookexternalhit|whatsapp|twitterbot|linkedinbot|googlebot|bingbot|yandexbot|baiduspider|duckduckbot|sogou|exabot|ia_archiver|semrush|ahrefsbot|mj12bot|dotbot|rogerbot|screaming|wget|curl|python-requests|go-http|java\/|okhttp|axios|libwww/i;

// ── IP result cache ───────────────────────────────────────────────────────────
interface CacheEntry { allowed: boolean; reason: string; ts: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

function getCached(ip: string): CacheEntry | null {
  const entry = cache.get(ip);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(ip); return null; }
  return entry;
}

function setCached(ip: string, allowed: boolean, reason: string) {
  cache.set(ip, { allowed, reason, ts: Date.now() });
  // Evict oldest entries when cache grows large
  if (cache.size > 5000) {
    const oldest = [...cache.entries()]
      .sort((a, b) => a[1].ts - b[1].ts)
      .slice(0, 1000)
      .map(([k]) => k);
    oldest.forEach(k => cache.delete(k));
  }
}

// ── ip-api.com lookup ─────────────────────────────────────────────────────────
interface IpApiResponse {
  status: string;
  countryCode: string;
  proxy: boolean;
  hosting: boolean;
}

async function lookupIp(ip: string): Promise<{ allowed: boolean; reason: string }> {
  try {
    const url = `http://ip-api.com/json/${ip}?fields=status,countryCode,proxy,hosting`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { allowed: true, reason: "lookup_failed" }; // fail open

    const data: IpApiResponse = await res.json();

    if (data.status !== "success") return { allowed: true, reason: "lookup_failed" };
    if (data.proxy || data.hosting) return { allowed: false, reason: "vpn_proxy" };
    if (!AFRICA.has(data.countryCode)) return { allowed: false, reason: `country_${data.countryCode}` };

    return { allowed: true, reason: "ok" };
  } catch {
    return { allowed: true, reason: "lookup_error" }; // fail open on timeout
  }
}

// ── Paths exempted from geo-check (webhooks, health) ─────────────────────────
const EXEMPT = ["/api/webhook", "/api/health", "/api/sendavapay", "/api/soleaspay", "/api/omnipay"];

function isExempt(path: string): boolean {
  return EXEMPT.some(p => path.startsWith(p));
}

// ── Private / loopback IPs (always allowed) ───────────────────────────────────
function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("::ffff:127.") ||
    ip.startsWith("::ffff:10.") ||
    ip.startsWith("::ffff:192.168.")
  );
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "";
}

// ── Exported middleware ───────────────────────────────────────────────────────
export async function geoGuard(req: Request, res: Response, next: NextFunction) {
  // Skip in development
  if (process.env.NODE_ENV !== "production") return next();

  // Skip webhook / health paths
  if (isExempt(req.path)) return next();

  // Block obvious bots immediately (no network call needed)
  const ua = req.headers["user-agent"] || "";
  if (BOT_UA.test(ua)) {
    return res.status(403).json({ message: "Accès refusé." });
  }

  const ip = getClientIp(req);
  if (!ip || isPrivateIp(ip)) return next();

  // Check cache
  const cached = getCached(ip);
  if (cached) {
    if (!cached.allowed) return res.status(403).json({ message: "Accès refusé." });
    return next();
  }

  // Live lookup
  const result = await lookupIp(ip);
  setCached(ip, result.allowed, result.reason);

  if (!result.allowed) {
    return res.status(403).json({ message: "Accès refusé." });
  }

  return next();
}
