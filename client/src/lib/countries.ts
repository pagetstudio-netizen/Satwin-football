// Fallback country data (used if API not available)
export const COUNTRIES = [
  { code: "TG", name: "Togo",           flag: "TG", currency: "XOF", paymentMethods: ["Flooz Togo", "T-Money Togo"] },
  { code: "CM", name: "Cameroun",        flag: "CM", currency: "XAF", paymentMethods: ["Orange Cameroun", "MTN Cameroun"] },
  { code: "CI", name: "Côte d'Ivoire",  flag: "CI", currency: "XOF", paymentMethods: ["Orange CI", "MTN CI", "Wave CI", "Moov CI"] },
  { code: "ML", name: "Mali",            flag: "ML", currency: "XOF", paymentMethods: ["Orange Mali", "Moov Mali"] },
  { code: "BF", name: "Burkina Faso",    flag: "BF", currency: "XOF", paymentMethods: ["Orange BF", "Moov BF"] },
  { code: "SN", name: "Sénégal",         flag: "SN", currency: "XOF", paymentMethods: ["Orange SN", "Free SN", "Wave SN"] },
  { code: "BJ", name: "Bénin",           flag: "BJ", currency: "XOF", paymentMethods: ["MTN Bénin", "Moov Bénin"] },
  { code: "NE", name: "Niger",           flag: "NE", currency: "XOF", paymentMethods: ["NITA TRANSFERT", "AMANA TRANSFERT"] },
  { code: "TD", name: "Tchad",           flag: "TD", currency: "XAF", paymentMethods: ["Airtel Tchad", "Moov Africa Tchad"] },
  { code: "CF", name: "Centrafrique",    flag: "CF", currency: "XAF", paymentMethods: ["Telecel Centrafrique", "Orange Centrafrique"] },
];

export const FALLBACK_COUNTRIES = [
  { code: "TG", name: "Togo",           currency: "XOF", phonePrefix: "228", operators: ["Flooz Togo", "T-Money Togo"] },
  { code: "CM", name: "Cameroun",        currency: "XAF", phonePrefix: "237", operators: ["Orange Cameroun", "MTN Cameroun"] },
  { code: "CI", name: "Côte d'Ivoire",  currency: "XOF", phonePrefix: "225", operators: ["Orange CI", "MTN CI", "Wave CI", "Moov CI"] },
  { code: "ML", name: "Mali",            currency: "XOF", phonePrefix: "223", operators: ["Orange Mali", "Moov Mali"] },
  { code: "BF", name: "Burkina Faso",    currency: "XOF", phonePrefix: "226", operators: ["Orange BF", "Moov BF"] },
  { code: "SN", name: "Sénégal",         currency: "XOF", phonePrefix: "221", operators: ["Orange SN", "Free SN", "Wave SN"] },
  { code: "BJ", name: "Bénin",           currency: "XOF", phonePrefix: "229", operators: ["MTN Bénin", "Moov Bénin"] },
  { code: "NE", name: "Niger",           currency: "XOF", phonePrefix: "227", operators: ["NITA TRANSFERT", "AMANA TRANSFERT"] },
  { code: "TD", name: "Tchad",           currency: "XAF", phonePrefix: "235", operators: ["Airtel Tchad", "Moov Africa Tchad"] },
  { code: "CF", name: "Centrafrique",    currency: "XAF", phonePrefix: "236", operators: ["Telecel Centrafrique", "Orange Centrafrique"] },
];

// Legacy compatibility - kept for places still using ELIGIBLE_COUNTRIES directly
export const ELIGIBLE_COUNTRIES = FALLBACK_COUNTRIES.map(c => ({
  code: c.code,
  name: c.name,
  flag: c.code,
  currency: c.currency,
  phonePrefix: c.phonePrefix,
  paymentMethods: c.operators,
})) as readonly { code: string; name: string; flag: string; currency: string; phonePrefix: string; paymentMethods: readonly string[] }[];

export type ApiCountry = {
  id: number;
  code: string;
  name: string;
  currency: string;
  phonePrefix: string;
  operators: string; // JSON string
  isActive: boolean;
};

export function parseOperators(operatorsJson: string): string[] {
  try {
    return JSON.parse(operatorsJson);
  } catch {
    return [];
  }
}

export function getCountryByCode(code: string, apiCountries?: ApiCountry[]) {
  if (apiCountries && apiCountries.length > 0) {
    // API data is loaded — only use it, never fall back to hardcoded data
    // This ensures disabled countries and updated operators are respected
    const c = apiCountries.find(c => c.code === code && c.isActive);
    if (!c) return undefined;
    return {
      code: c.code,
      name: c.name,
      currency: c.currency,
      phonePrefix: c.phonePrefix,
      paymentMethods: parseOperators(c.operators),
    };
  }
  // API not yet loaded — use hardcoded fallback temporarily
  const fallback = FALLBACK_COUNTRIES.find(c => c.code === code);
  if (!fallback) return undefined;
  return {
    code: fallback.code,
    name: fallback.name,
    currency: fallback.currency,
    phonePrefix: fallback.phonePrefix,
    paymentMethods: fallback.operators,
  };
}

export function getPaymentMethodsForCountry(code: string, apiCountries?: ApiCountry[]): string[] {
  const country = getCountryByCode(code, apiCountries);
  return country ? [...country.paymentMethods] : [];
}

export function formatCurrency(amount: number, countryCode: string, apiCountries?: ApiCountry[]): string {
  const country = getCountryByCode(countryCode, apiCountries);
  const currency = country?.currency || "FCFA";
  return `${amount.toLocaleString()} ${currency}`;
}
