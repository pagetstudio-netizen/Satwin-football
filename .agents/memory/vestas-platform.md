---
name: Doosan Platform Setup
description: Key decisions, branding, colors, assets, and DB quirks for this investment platform rebranded as Doosan.
---

## Brand Identity
- **Name**: Doosan (leader mondial de la robotique et industrie lourde)
- **Primary color**: `#1565C0` (Doosan vivid blue), darker variant `#0D47A1`
- **CSS HSL primary**: `211 78% 42%` (Doosan blue)
- **Theme-color meta**: `#1565C0`
- **Logo**: `attached_assets/6790d8bd04714fedd7593cb6_Doosan_Group_and_Corporation_-_Logo.s_1784561452870.png` (horizontal, blue on white)
- **Favicon**: `attached_assets/channels4_profile_1784561452890.jpg` (square, white DOOSAN on blue) → copied to `client/public/favicon.png`
- **@assets alias** resolves to `attached_assets/` (configured in vite.config.ts)

## Hero & Product Images (Doosan)
- Hero: `attached_assets/téléchargement_(16)_1784561452683.jpeg` (Doosan Robotics booth)
- Product images: `téléchargement_(13)` through `téléchargement_(20)` + doosan-dx-w-tractor + bundang-south-korea files

## Known DB Issues (pre-existing, unrelated to branding)
- Supabase replaced by Replit built-in PostgreSQL (`DATABASE_URL`)
- Settings (supportLink, etc.) in DB still showed vestasgroup after restart — updated directly via SQL

## Countries
- Defaults to TD (Tchad) and NE (Niger)

## Rebranding History
- Intel → Vestas (wind energy) → Doosan (robotics/heavy industry)
- All color references changed: `#003366` → `#1565C0`, `#002244` → `#0D47A1`
- Telegram fallback links: `vestasgroup` → `doosangroup`

**Why:** Platform rebranded to Doosan; all Vestas/wind energy references removed from user-visible UI.
