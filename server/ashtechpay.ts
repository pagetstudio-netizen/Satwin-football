/**
 * AshtechPay API service
 * Base URL: https://ashtechpay.top
 * Auth: Bearer ACHPAY_API_KEY
 */

const ASHTECH_BASE = "https://ashtechpay.top";

function apiKey(): string {
  return process.env.ACHPAY_API_KEY || "";
}

function authHeaders() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
  };
}

// ── Currency map (country code → currency) ─────────────────────────────────
export const CURRENCY_MAP: Record<string, string> = {
  BJ: "XOF",
  BF: "XOF",
  CM: "XAF",
  CF: "XAF",
  CG: "XAF",
  CI: "XOF",
  GA: "XAF",
  GN: "GNF",
  GQ: "XAF",
  GW: "XOF",
  ML: "XOF",
  NE: "XOF",
  CD: "CDF",
  SN: "XOF",
  TD: "XAF",
  TG: "XOF",
};

export function getCurrency(countryCode: string): string {
  return CURRENCY_MAP[countryCode] || "XOF";
}

// ── Country operators ───────────────────────────────────────────────────────
export interface AshtechCountry {
  code: string;
  name: string;
  currency: string;
  operators: string[];
}

export async function getCountries(): Promise<AshtechCountry[]> {
  const res = await fetch(`${ASHTECH_BASE}/v1/countries`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`AshtechPay countries: ${res.status}`);
  return res.json();
}

export async function getOperatorsForCountry(countryCode: string): Promise<string[]> {
  const countries = await getCountries();
  const found = countries.find(c => c.code === countryCode);
  return found?.operators || [];
}

// ── Collect (Mobile Money) ──────────────────────────────────────────────────
export interface CollectParams {
  amount: number;
  currency: string;
  phone: string;
  operator: string;
  country_code: string;
  reference?: string;
  otp?: string;
  notify_url?: string;
}

export type CollectResult =
  | { type: "ussd_push"; transactionId: string; reference: string; creditedAmount: number }
  | { type: "wave"; transactionId: string; reference: string; waveUrl: string }
  | { type: "otp_ussd"; reference: string; ussdCode: string }
  | { type: "otp_sms"; reference: string };

export async function collect(params: CollectParams): Promise<CollectResult> {
  const res = await fetch(`${ASHTECH_BASE}/v1/collect`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  const data = await res.json();

  if (res.status === 202) {
    if (data.flow === "wave") {
      return { type: "wave", transactionId: data.transaction_id, reference: data.reference, waveUrl: data.wave_url };
    }
    return {
      type: "ussd_push",
      transactionId: data.transaction_id,
      reference: data.reference || params.reference || "",
      creditedAmount: data.credited_amount ?? params.amount,
    };
  }

  if (res.status === 400 && data.error === "otp_required") {
    if (data.ussd_code) {
      return { type: "otp_ussd", reference: data.reference, ussdCode: data.ussd_code };
    }
    return { type: "otp_sms", reference: data.reference };
  }

  throw new Error(data.message || `AshtechPay collect error ${res.status}`);
}

// ── Transaction status ──────────────────────────────────────────────────────
export interface TransactionStatus {
  transaction_id: string;
  reference: string;
  status: "pending" | "success" | "failed";
  amount: number;
  credited_amount: number;
  currency: string;
  phone?: string;
  confirmed_at?: string;
}

export async function getTransactionStatus(transactionId: string): Promise<TransactionStatus> {
  const res = await fetch(`${ASHTECH_BASE}/v1/transaction/${transactionId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `AshtechPay status error ${res.status}`);
  }
  return res.json();
}

// ── Crypto assets ───────────────────────────────────────────────────────────
export interface CryptoAsset {
  asset_code: string;
  coin: string;
  name: string;
  network: string;
  network_label: string;
  memo_required: boolean;
  memo_type: string | null;
  currency: string;
}

export async function getCryptoAssets(): Promise<CryptoAsset[]> {
  const res = await fetch(`${ASHTECH_BASE}/v1/crypto/assets`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`AshtechPay crypto assets: ${res.status}`);
  const data = await res.json();
  return data.assets || [];
}

// ── Crypto collect ──────────────────────────────────────────────────────────
export interface CryptoCollectParams {
  amount: number;
  currency: string;
  asset_code: string;
  reference?: string;
  notify_url?: string;
  customer?: { firstName?: string; lastName?: string; email?: string };
}

export interface CryptoCollectResult {
  transaction_id: string;
  reference: string;
  status: string;
  payment_method: string;
  asset_code: string;
  network: string;
  address: string;
  memo: string | null;
  memo_type: string | null;
  amount: number;
  currency: string;
  amount_usdt: number;
  credited_amount: number;
  fee_amount: number;
  expires_at: string;
}

export async function collectCrypto(params: CryptoCollectParams): Promise<CryptoCollectResult> {
  const res = await fetch(`${ASHTECH_BASE}/v1/crypto/collect`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `AshtechPay crypto error ${res.status}`);
  return data;
}
