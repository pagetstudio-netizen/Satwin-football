/**
 * WestPay API service
 * Base URL: https://westpay.cfd
 * Flow: hosted payment page (redirect) — no direct API call for deposit
 * Webhook verification: HMAC-SHA256 via X-RobotPay-Signature header
 */
import crypto from "crypto";

const WESTPAY_BASE = "https://westpay.cfd";

/** Correspondance code ISO → nom pays attendu par WestPay */
export const WESTPAY_COUNTRY_NAMES: Record<string, string> = {
  TG: "Togo",
  BJ: "Benin",
  BF: "Burkina Faso",
  CI: "Cote d'Ivoire",
  SN: "Senegal",
  ML: "Mali",
  CM: "Cameroun",
  CG: "Congo Brazzaville",
  CD: "Congo RDC",
  GA: "Gabon",
  GN: "Guinée",
  NE: "Niger",
  KE: "Kenya",
  GH: "Ghana",
  NG: "Nigeria",
};

/**
 * Construit l'URL de la page de paiement hébergée WestPay.
 * Le client est redirigé vers cette URL pour effectuer son paiement.
 */
export function buildPayUrl(params: {
  merchantSlug: string;
  amount: number;
  countryCode: string;
  redirectUrl: string;
}): string {
  const url = new URL(`${WESTPAY_BASE}/pay`);
  url.searchParams.set("merchant", params.merchantSlug);
  url.searchParams.set("amount", String(Math.round(params.amount)));
  const countryName = WESTPAY_COUNTRY_NAMES[params.countryCode.toUpperCase()] || params.countryCode;
  url.searchParams.set("country", countryName);
  url.searchParams.set("redirect", params.redirectUrl);
  return url.toString();
}

/**
 * Vérifie la signature HMAC-SHA256 du webhook WestPay.
 * Header : X-RobotPay-Signature
 */
export function verifyWebhookSignature(
  body: object,
  signature: string,
  secret: string
): boolean {
  if (!secret || !signature) return false;
  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(body))
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}
