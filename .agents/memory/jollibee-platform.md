---
name: Jollibee Platform
description: Key architecture decisions, country config, DB setup, and image asset conventions for the Jollibee investment platform.
---

## Countries
- Platform supports only TD (Tchad, XAF, +235) and NE (Niger, XOF, +227) — both with Airtel Money and Moov Money operators.
- Countries are stored in a `countries` DB table (admin-managed via /api/admin/countries).
- The `@assets` alias in Vite points to `attached_assets/`, NOT `client/src/assets/`. Always copy images there.
- Jollibee logo is at `attached_assets/jollibee_logo.png` (imported as `@assets/jollibee_logo.png`).

## Business Settings (current values in DB)
- signupBonus: 200 FCFA
- minDeposit: 2000 FCFA
- minWithdrawal: 1000 FCFA
- withdrawalFees: 18%
- withdrawalStartHour: 9, withdrawalEndHour: 17
- maxWithdrawalsPerDay: 1
- level1Commission: 17%, level2Commission: 2%, level3Commission: 1%
- All deposits are manual (soleaspayEnabled: false, omnipayEnabled: false)

## DB Schema Notes
- `countries` table was added manually via SQL (drizzle-kit push is interactive — use `node -e` with pg directly for non-interactive migrations).
- Signup bonus is fetched dynamically from settings.signupBonus in createUser.
- maxWithdrawalsPerDay is fetched from settings in withdrawal route.

## Admin Credentials
- Super Admin: phone 99935673, country TG, password pagetstudio, PIN 9993

## Admin Panel Tabs
dashboard | deposits | withdrawals | users | products | channels | countries (NEW) | giftcodes | settings
