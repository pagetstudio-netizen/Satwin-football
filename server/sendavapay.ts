const SENDAVAPAY_API_BASE = "https://sendavapay.com/api/sdk/v1";

function getApiKey(): string {
  return process.env.SENDAVAPAY_API_KEY || "";
}

export const CURRENCY_MAP: Record<string, string> = {
  TG: "XOF",
  BJ: "XOF",
  SN: "XOF",
  CI: "XOF",
  ML: "XOF",
  BF: "XOF",
  CM: "XAF",
  GN: "GNF",
  COD: "CDF",
  COG: "XAF",
  // aliases used in this app
  CD: "CDF",
  CG: "XAF",
};

const PHONE_PREFIX_MAP: Record<string, string> = {
  TG: "228",
  BJ: "229",
  SN: "221",
  CI: "225",
  ML: "223",
  BF: "226",
  CM: "237",
  GN: "224",
  COD: "243",
  CD: "243",
  COG: "242",
  CG: "242",
};

// Map app country codes → SendavaPay country codes
export const COUNTRY_CODE_MAP: Record<string, string> = {
  CD: "COD",
  CG: "COG",
};

export function toSendavapayCountry(appCountry: string): string {
  return COUNTRY_CODE_MAP[appCountry] || appCountry;
}

export function formatPhone(phone: string, country: string): string {
  const cleaned = phone.replace(/[\s\-\+]/g, "");
  const appCountry = COUNTRY_CODE_MAP[country] ? country : country;
  const prefix = PHONE_PREFIX_MAP[appCountry] || PHONE_PREFIX_MAP[toSendavapayCountry(appCountry)];
  if (!prefix) return `+${cleaned}`;
  if (cleaned.startsWith(prefix)) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+${prefix}${cleaned.substring(1)}`;
  return `+${prefix}${cleaned}`;
}

export function getCurrency(country: string): string {
  return CURRENCY_MAP[country] || CURRENCY_MAP[toSendavapayCountry(country)] || "XOF";
}

// ── Backend API (requires SDK key) ─────────────────────────────────────────

interface CreatePaymentResponse {
  success: boolean;
  data?: {
    reference: string;
    paymentToken: string;
    expiresAt: string;
    amount: number;
    currency: string;
    status: string;
  };
  error?: string;
  code?: string;
}

export async function createPayment(params: {
  amount: number;
  currency: string;
  description?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  payerCountry: string;
  webhookUrl?: string;
  externalReference: string;
}): Promise<CreatePaymentResponse> {
  const body: Record<string, any> = {
    amount: params.amount,
    currency: params.currency,
    description: params.description || `Dépôt #${params.externalReference}`,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    payerCountry: params.payerCountry,
    externalReference: params.externalReference,
  };
  if (params.customerEmail) body.customerEmail = params.customerEmail;
  if (params.webhookUrl) body.webhookUrl = params.webhookUrl;

  const response = await fetch(`${SENDAVAPAY_API_BASE}/create-payment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return response.json() as Promise<CreatePaymentResponse>;
}

interface VerifyPaymentResponse {
  success: boolean;
  data?: {
    reference: string;
    externalReference: string;
    amount: string;
    fee: string;
    currency: string;
    status: string;
    customerPhone: string;
    customerName: string;
    paymentMethod: string;
    createdAt: string;
    completedAt: string | null;
  };
  error?: string;
}

export async function verifyPayment(reference: string): Promise<VerifyPaymentResponse> {
  const response = await fetch(`${SENDAVAPAY_API_BASE}/verify-payment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reference }),
  });

  return response.json() as Promise<VerifyPaymentResponse>;
}

export function mapSendavapayStatus(
  status: string | undefined
): "pending" | "approved" | "rejected" {
  if (!status) return "pending";
  switch (status.toLowerCase()) {
    case "completed":
      return "approved";
    case "failed":
    case "cancelled":
      return "rejected";
    default:
      return "pending";
  }
}

// ── Client/CORS API proxies (called from our backend on behalf of frontend) ─

// initiate-payment is a CLIENT (CORS) endpoint — authenticated by paymentToken only,
// no SDK key required. Three possible outcomes from the API:
//   1. requiresOtp: true  → Orange Money; user must enter SMS OTP
//   2. requiresRedirect: true → Wave etc.; user must open redirectUrl
//   3. success: true (neither) → push invite sent to phone; wait for webhook
interface InitiatePaymentResponse {
  success: boolean;
  requiresOtp?: boolean;
  otpToken?: string;
  ussdCode?: string;      // code à composer sur le téléphone pour recevoir l'OTP (ex: *144#)
  requiresRedirect?: boolean;
  redirectUrl?: string;
  reference?: string;
  message?: string;       // instruction lisible retournée par l'API
  error?: string;
  code?: string;
}

export async function initiatePayment(params: {
  paymentToken: string;
  payerName: string;
  payerPhone: string;
  payerCountry: string;
  operatorId: string;
  payerEmail?: string;
}): Promise<InitiatePaymentResponse> {
  const body: Record<string, any> = {
    paymentToken: params.paymentToken,
    payerName: params.payerName,
    payerPhone: params.payerPhone,
    payerCountry: params.payerCountry,
    operatorId: params.operatorId,
  };
  if (params.payerEmail) body.payerEmail = params.payerEmail;

  // No SDK key — this endpoint is CORS-enabled and authenticated via paymentToken
  const response = await fetch(`${SENDAVAPAY_API_BASE}/initiate-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.json() as Promise<InitiatePaymentResponse>;
}

interface SubmitOtpResponse {
  success: boolean;
  reference?: string;
  message?: string;
  error?: string;
}

export async function submitOtp(params: {
  otpToken: string;
  otp: string;
}): Promise<SubmitOtpResponse> {
  // CLIENT (CORS) endpoint — no SDK key, authenticated via otpToken
  const response = await fetch(`${SENDAVAPAY_API_BASE}/submit-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ otpToken: params.otpToken, otp: params.otp }),
  });

  return response.json() as Promise<SubmitOtpResponse>;
}

// Resets a failed payment back to pending so it can be re-initiated.
// CLIENT (CORS) endpoint — no SDK key, authenticated via paymentToken.
interface RetryPaymentResponse {
  success: boolean;
  reference?: string;
  status?: string;
  message?: string;
  error?: string;
}

export async function retryPayment(paymentToken: string): Promise<RetryPaymentResponse> {
  const response = await fetch(`${SENDAVAPAY_API_BASE}/retry-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentToken }),
  });
  return response.json() as Promise<RetryPaymentResponse>;
}

// ── Webhook signature verification ─────────────────────────────────────────

import crypto from "crypto";

export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  secret: string
): boolean {
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
