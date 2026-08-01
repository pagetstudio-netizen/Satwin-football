import crypto from "crypto";

const OMNIPAY_API_URL = "https://omnipay.webtechci.com/interface/api2";
const OMNIPAY_API_KEY = process.env.OMNIPAY_API_KEY || "";

const COUNTRY_PREFIXES: Record<string, string> = {
  CI: "225",
  TG: "228",
  BF: "226",
  SN: "221",
  BJ: "229",
  CM: "237",
  CG: "242",
};

function formatMsisdn(phone: string, country: string): string {
  const prefix = COUNTRY_PREFIXES[country] || "";

  // Step 1: remove all non-digit characters (+, spaces, dashes, etc.)
  let digits = phone.replace(/\D/g, "");

  // Step 2: remove the international double-zero prefix only (e.g. 0022899935673 → 22899935673)
  // We do NOT strip a single leading zero — in many West-African countries (e.g. Benin)
  // the local 0 is part of the subscriber number and must be kept.
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Step 3: if the number already starts with the country code, return as-is
  if (prefix && digits.startsWith(prefix)) {
    return digits;
  }

  // Step 4: the number is in local format — prepend the country code as-is
  // (the local leading 0, if any, is kept because it is part of the number)
  return prefix ? prefix + digits : digits;
}

function getOmnipayOperator(paymentMethod: string): string | undefined {
  const m = paymentMethod.toLowerCase();
  if (m.includes("wave")) return "wave";
  if (m.includes("mixx")) return "mixx";
  if (m.includes("orange")) return "orange";
  return undefined;
}

export async function initiatePayment(params: {
  phone: string;
  country: string;
  amount: number;
  reference: string;
  firstName: string;
  lastName: string;
  paymentMethod: string;
  returnUrl?: string;
  otpCode?: string;
}) {
  const msisdn = formatMsisdn(params.phone, params.country);
  const operator = getOmnipayOperator(params.paymentMethod);
  const isOrange = params.paymentMethod.toLowerCase().includes("orange");

  const body: Record<string, string> = {
    action: "paymentrequest",
    apikey: OMNIPAY_API_KEY,
    msisdn,
    amount: params.amount.toString(),
    reference: params.reference,
    first_name: params.firstName,
    last_name: params.lastName || params.firstName,
  };

  if (operator) {
    body.operator = operator;
    if (operator === "wave" && params.returnUrl) {
      body.return_url = params.returnUrl;
    }
  }

  if (isOrange) {
    if (params.otpCode) {
      // CI and BF: user-provided OTP
      body.otp = params.otpCode;
    } else if (params.country === "CM") {
      // Cameroun: Orange does not require OTP — send a random 6-digit filler
      body.otp = Math.floor(100000 + Math.random() * 900000).toString();
    }
  }

  console.log("[omnipay] initiatePayment →", { msisdn, amount: params.amount, reference: params.reference });

  const res = await fetch(OMNIPAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  console.log("[omnipay] initiatePayment ←", data);
  return data;
}

export async function initiateTransfer(params: {
  phone: string;
  country: string;
  amount: number;
  reference: string;
  firstName: string;
  lastName: string;
  paymentMethod: string;
}) {
  const msisdn = formatMsisdn(params.phone, params.country);
  const operator = getOmnipayOperator(params.paymentMethod);

  const body: Record<string, string> = {
    action: "transfer",
    apikey: OMNIPAY_API_KEY,
    msisdn,
    amount: params.amount.toString(),
    reference: params.reference,
    first_name: params.firstName,
    last_name: params.lastName || params.firstName,
  };

  if (operator === "wave") {
    body.operator = "wave";
  }

  console.log("[omnipay] initiateTransfer →", { msisdn, amount: params.amount, reference: params.reference });

  const res = await fetch(OMNIPAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  console.log("[omnipay] initiateTransfer ←", data);
  return data;
}

export async function getTransactionStatus(reference: string) {
  const body = {
    action: "getstatus",
    apikey: OMNIPAY_API_KEY,
    reference,
  };

  const res = await fetch(OMNIPAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return res.json();
}

export async function getOmnipayBalance() {
  const body = {
    action: "getbalance",
    apikey: OMNIPAY_API_KEY,
  };

  const res = await fetch(OMNIPAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return res.json();
}

export function mapOmnipayStatus(status: number | string): "pending" | "processing" | "approved" | "rejected" {
  const s = parseInt(status.toString());
  switch (s) {
    case 1: return "processing";
    case 2: return "processing";
    case 3: return "approved";
    case 4: return "rejected";
    default: return "pending";
  }
}

export function verifyOmnipaySignature(data: any, callbackKey: string): boolean {
  if (!callbackKey) return true;
  try {
    const concat = `${data.id}|${data.type}|${data.reference}|${data.msisdn}|${data.amount}|${data.fees}|${data.status}|${data.message}`;
    const expected = crypto.createHmac("sha3-512", callbackKey).update(concat).digest("hex");
    return expected === data.signature;
  } catch {
    return true;
  }
}

export function isOmnipaySupported(country: string): boolean {
  return Object.keys(COUNTRY_PREFIXES).includes(country);
}
