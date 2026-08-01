---
name: SendavaPay integration
description: SendavaPay SDK v3 payin integration — correct auth split between backend and CORS endpoints.
---

# SendavaPay SDK v3 — Payin Integration

## Architecture
SDK v3 is `pure-api | no-widget | no-iframe | no-redirect | merchant-controls-frontend`.
Base URL: `https://sendavapay.com/api/sdk/v1`

## Critical auth split
**BACKEND endpoints** (server-side only) — require SDK key in `Authorization: Bearer sdk_xxx` header:
- `POST /create-payment` — creates transaction, returns `paymentToken` (valid 30 min) + `reference`
- `GET  /payment-status/:reference` — lightweight status poll
- `POST /verify-payment` — full details
- `GET  /balance`, `GET /transactions`, `POST /withdraw`, etc.

**CLIENT (CORS) endpoints** — NO SDK key; authenticate via `paymentToken` only; safe to proxy from backend without SDK key:
- `POST /initiate-payment` — triggers USSD push/SMS OTP/redirect to user's phone
- `POST /submit-otp` — Orange Money OTP submission
- `POST /retry-payment` — reset failed payment to pending for retry
- `GET  /payment-token/:token` — transaction info for frontend display
- `GET  /operators/:countryCode` — public, no auth at all
- `GET  /countries`, `GET /operators-status`, `GET /health` — public CORS

## Payin flow (3 possible paths after initiate-payment)
1. `requiresRedirect: true + redirectUrl` → Wave etc. — open redirectUrl in browser, then poll
2. `requiresOtp: true + otpToken` → Orange Money (BF, CI, GN, ML, SN) — user enters SMS OTP
3. `success: true` (neither above) → standard push — USSD invite sent to phone; wait for webhook

## Frontend steps
`amount → select → sv-operator → sv-waiting | sv-otp | sv-redirect`
- Failed payment screen has a Retry button that calls `POST /api/sendavapay/retry`

## Polling
Use `GET /payment-status/:reference` (lighter) instead of `POST /verify-payment` for the polling loop. 5s interval minimum per rate-limit docs.

## Webhook
- Header: `X-SendavaPay-Signature: sha256={hmac-sha256-hex}`, `X-SendavaPay-Event`, `X-SendavaPay-Timestamp`
- HMAC computed on raw Buffer body (not parsed JSON)
- Events: `payment.completed`, `payment.failed`, `payment.expired`
- Always check idempotence — SendavaPay retries up to 5 times (immediate, 1m, 5m, 30m, 2h)

## Key files
- `server/sendavapay.ts` — API functions (createPayment, initiatePayment, submitOtp, retryPayment, verifyPayment, verifyWebhookSignature, formatPhone, getCurrency, toSendavapayCountry)
- `client/src/pages/deposit.tsx` — deposit UI
- `shared/schema.ts` — deposits table: `sendavapayReference`, `sendavapayToken` columns
- `server/storage.ts` — `getDepositBySendavapayReference(reference)`

## Activation
1. Set env var `SENDAVAPAY_API_KEY` = SDK key (starts with `sdk_`)
2. Admin → Settings → SendavaPay: enable + optionally set webhook secret
3. SendavaPay dashboard: configure webhook URL → `<baseUrl>/api/webhooks/sendavapay`

## Country code mapping
App uses CD/CG; SendavaPay uses COD/COG. `toSendavapayCountry()` handles the mapping.

**Why:** initiate-payment and submit-otp are CLIENT CORS endpoints — they need NO SDK key (auth is the paymentToken). Adding the SDK key to them was incorrect. The redirect case (Wave) is real and must be handled.
