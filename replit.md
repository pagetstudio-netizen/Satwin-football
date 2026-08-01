# SATWIN FOOT — Plateforme de Paris Renversé

## Overview

SATWIN FOOT est une plateforme mobile-first de **paris renversés** ciblant les pays francophones d'Afrique. Chaque jour, un ou plusieurs matchs de football sont proposés avec un **score prévisionnel** et un **taux de profit** (1,5 % à 10 %). L'utilisateur mise un montant avant le début du match :

- ✅ Si le score réel correspond au score prévu → l'utilisateur reçoit son profit.
- ❌ Si le score ne correspond pas → la mise est automatiquement remboursée.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter — 5 onglets principaux : Accueil (`/`), Match (`/match`), Billet (`/billet`), Équipe (`/team`), Compte (`/account`)
- **State Management**: TanStack React Query for server state, React Context for auth state
- **UI Components**: shadcn/ui built on Radix UI primitives
- **Styling**: Tailwind CSS — dark navy theme (#0B1929 bg, #E63946 red, #1B3A6B navy)
- **Build Tool**: Vite

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ESM modules)
- **Session Management**: express-session with connect-pg-simple
- **Authentication**: Session-based auth with bcrypt
- **API Design**: RESTful JSON API under `/api` prefix

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts`
- **Key Tables**: users, matches, bets, deposits, withdrawals, withdrawalWallets, paymentChannels, transactions, platformSettings, referralCommissions, countries

### Core Features — Paris Renversé
- **Matches** (`/api/matches`): L'admin crée des matchs avec score prévu + taux de profit. Endpoint public.
- **Bets** (`POST /api/bets`): L'utilisateur mise sur un match. La mise est débitée immédiatement.
- **Settlement** (`POST /api/admin/matches/:id/settle`): L'admin entre le score réel. Le système compare et crédite automatiquement les gagnants (mise + profit) ou rembourse.

### Admin System
- Accessible via le chemin secret `VITE_ADMIN_SECRET_PATH` (défini dans `.replit` comme `/mgmt-1np5g23g12`)
- Protégé par PIN admin (`ADMIN_PASSWORD` env var pour le premier admin)
- Gestion des matchs via `/api/admin/matches` (CRUD + settle)

### Authentication
- Phone number + country + password
- Session server-side avec cookies httpOnly
- Roles: utilisateur régulier, admin, super admin, banker

### Project Structure
```
├── client/src/
│   ├── pages/
│   │   ├── home.tsx       — Accueil : solde, match vedette, derniers billets
│   │   ├── match.tsx      — Liste des matchs + modal de mise
│   │   ├── billet.tsx     — Historique des paris de l'utilisateur
│   │   ├── team.tsx       — Parrainage / équipe
│   │   ├── account.tsx    — Profil, dépôt, retrait, paramètres
│   │   ├── login.tsx      — Connexion (SATWIN FOOT thème)
│   │   └── register.tsx   — Inscription
│   ├── components/
│   │   ├── bottom-nav.tsx — 5 onglets : Home/Trophy/Ticket/Users/User
│   │   └── ...
│   └── index.css          — Dark navy theme CSS variables
├── server/
│   ├── routes.ts          — Toutes les routes API (inclus /api/matches, /api/bets)
│   ├── db.ts              — Connexion PostgreSQL
│   └── storage.ts         — Couche d'accès données
└── shared/
    └── schema.ts          — Tables Drizzle (dont matches + bets)
```

## Running the App

```bash
npm run dev       # Démarrage développement (port 5000)
npm run build     # Build production
npm run db:push   # Mettre à jour le schéma DB
```

## Assets
- Logo SATWIN FOOT : `attached_assets/satwin-logo.jpg`
- Alias Vite : `@assets` → `attached_assets/`
