# Fueki Tokenization Platform

A full-stack Web3 platform for tokenizing real-world assets on Ethereum. Users upload documents (invoices, contracts, deeds, etc.), the platform extracts and validates the data, and then mints ERC-20 tokens backed by those assets. Includes a built-in exchange, an advanced AMM protocol, and a security token framework with vesting and compliance controls.

The frontend is a React/TypeScript SPA. The backend is an Express API with Prisma/PostgreSQL. Smart contracts are written in Solidity and managed with Hardhat. Everything deploys to Google Cloud Run.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Frontend](#frontend)
- [Backend](#backend)
- [Smart Contracts](#smart-contracts)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Testing](#testing)
- [Project Structure](#project-structure)

---

## Architecture

```
                ┌──────────────┐
                │   Browser    │
                └──────┬───────┘
                       │
           ┌───────────┴───────────┐
           │                       │
    ┌──────▼──────┐        ┌───────▼───────┐
    │  Frontend   │        │  Ethereum     │
    │  (Vite/React)│       │  (ethers.js)  │
    │  Cloud Run  │        │  JSON-RPC     │
    └──────┬──────┘        └───────────────┘
           │
    ┌──────▼──────┐
    │  Backend    │
    │  (Express)  │
    │  Cloud Run  │
    └──────┬──────┘
           │
    ┌──────▼──────┐     ┌─────────────────┐
    │ PostgreSQL  │     │ Google Cloud     │
    │ (Cloud SQL) │     │ Storage (KYC)    │
    └─────────────┘     └─────────────────┘
```

The frontend talks to the backend over REST for auth, KYC, and admin operations. For on-chain actions (minting, trading, swaps), it connects directly to Ethereum via the user's wallet and ethers.js.

---

## Tech Stack

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, React Hook Form, Zod, ethers.js v6, Recharts, Lightweight Charts, Tesseract.js (OCR), React Router v6

**Backend:** Node.js, Express 5, Prisma ORM, PostgreSQL, JWT auth (access + refresh tokens), AES-256-GCM encryption for PII, Google Cloud Storage, Nodemailer, Helmet, rate limiting

**Contracts:** Solidity 0.8.20, Hardhat, OpenZeppelin 4.x, TypeChain

**Infrastructure:** Google Cloud Run, Cloud SQL, Docker

---

## Getting Started

### Prerequisites

- Node.js >= 20.19 (or >= 22.12)
- npm
- PostgreSQL (for backend, local dev)
- A browser wallet like MetaMask (for on-chain features)

### Install

```bash
# Clone the repo
git clone https://github.com/your-org/fueki-tokenization-platform.git
cd fueki-tokenization-platform

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### Run locally

```bash
# Terminal 1 -- backend
cd backend
cp .env.example .env    # fill in your values
npx prisma db push      # create tables
npm run dev              # starts on :8080

# Terminal 2 -- frontend
cp .env.example .env    # set VITE_API_URL=http://localhost:8080
npm run dev              # starts on :5173
```

Open http://localhost:5173 in your browser.

---

## Frontend

The frontend is a single-page app in `src/`. Pages are lazy-loaded via React Router.

### Key pages

| Route | Page | What it does |
|---|---|---|
| `/` | Dashboard | Portfolio overview, stats, recent activity |
| `/mint` | Mint | Upload a document, review extracted data, configure and mint a token |
| `/portfolio` | Portfolio | Holdings breakdown, performance metrics, transaction history |
| `/exchange` | Exchange | Order book trading for asset-backed tokens and ERC-20s |
| `/orbital` | Orbital AMM | Liquidity pools, swaps, multi-hop routing |
| `/explore` | Explore | Browse available tokenized assets |
| `/settings` | Settings | Account management |
| `/admin` | Admin | KYC review queue, user management (admin role only) |
| `/signup` | Signup | Multi-step registration with KYC (personal info, address, identity docs) |

### State management

Zustand stores in `src/store/` handle auth state, wallet connections, asset data, trade state, document uploads, and UI state. No Redux, no context spaghetti.

### Document parsing

The mint flow supports PDF, image (via Tesseract OCR), CSV, and XML uploads. The parsers live in `src/lib/parsers/` and extract structured data client-side before the user reviews and submits.

### Blockchain interaction

`src/lib/blockchain/` contains the contract service, Multicall3 batching for efficient RPC usage, Orbital AMM contract wrappers, and an RPC response cache to cut down on redundant calls.

---

## Backend

The backend lives in `backend/` and is a straightforward Express API.

### API routes

**Auth** (`/api/auth/`)
- `POST /register` -- create account with email/password
- `POST /login` -- returns access token in body, refresh token in httpOnly cookie
- `POST /refresh` -- rotate access token using refresh cookie
- `POST /logout` -- invalidate session
- `POST /forgot-password` -- send reset email
- `POST /reset-password` -- set new password with token

**KYC** (`/api/kyc/`)
- `POST /submit` -- submit KYC application (all PII is AES-256-GCM encrypted at rest)
- `POST /upload-document` -- upload identity document (stored encrypted in GCS)
- `GET /status` -- check KYC review status

**Admin** (`/api/admin/`)
- `GET /users` -- list users (admin only)
- `GET /users/:id` -- user detail with decrypted KYC data
- `POST /kyc/:id/approve` -- approve KYC
- `POST /kyc/:id/reject` -- reject KYC

**Health** -- `GET /health`

### Security

- All PII is encrypted with AES-256-GCM before it hits the database. The encryption key is a separate env var, not the JWT secret.
- Refresh tokens are stored in httpOnly cookies to prevent XSS from grabbing them.
- Rate limiting on all routes (100 req / 15 min general, 20 req / 15 min on auth endpoints).
- Helmet sets security headers. CORS is locked to configured origins.
- KYC documents go to Google Cloud Storage, encrypted.
- Admin actions (approve/reject) use one-time tokens sent via email.

### Database

Prisma with PostgreSQL. Models: `User`, `KYCData`, `Session`, `PasswordResetToken`, `AdminActionToken`. Schema is in `backend/prisma/schema.prisma`.

```bash
# Common Prisma commands
cd backend
npx prisma db push        # sync schema to db
npx prisma migrate dev    # create migration
npx prisma generate       # regenerate client
npx prisma studio         # visual db browser
```

---

## Smart Contracts

All contracts are in `contracts/` and compile with Hardhat. Solidity 0.8.20, optimizer enabled.

### Core -- Asset tokenization

- **WrappedAsset.sol** -- ERC-20 token representing a wrapped real-world asset. Stores a document hash, document type, and original value as immutable metadata. Only the factory can mint.
- **WrappedAssetFactory.sol** -- Deploys WrappedAsset instances and maintains a registry of all created tokens.
- **AssetBackedExchange.sol** -- On-chain exchange with limit orders, partial fills, order expiry, and support for ETH/WETH/WBTC/ERC-20 pairs. Pausable with timelocked emergency withdrawals.

### Orbital Protocol -- Advanced AMM

A custom AMM that supports pools with 2-8 tokens using a superellipse invariant (`sum(xi^p) = K`) for tunable liquidity concentration.

- **OrbitalPool.sol** -- The pool itself. Handles swaps, proportional add/remove liquidity, mints LP tokens, and maintains a TWAP oracle.
- **OrbitalFactory.sol** -- Creates pools and manages the pool registry.
- **OrbitalRouter.sol** -- High-level entry point for swaps and multi-hop routing (up to 4 hops).
- **OrbitalMath.sol** -- Math library for the superellipse invariant. WAD-normalized (1e18).

### Security Token Framework

For issuing tokens with transfer restrictions, vesting schedules, and regulatory compliance (ERC-1404).

- **RestrictedLockupToken.sol** -- ERC-20 with per-beneficiary vesting schedules, lockup periods, snapshots, and burn.
- **TransferRules.sol** -- Pluggable compliance engine that enforces transfer restrictions.
- **RestrictedSwap.sol** -- Compliance-aware token swaps.
- **Dividends.sol** -- On-chain dividend distribution.
- **EasyAccessControl.sol** -- Gas-optimized role-based access.
- **SecurityTokenFactory.sol** / **SecurityTokenDeployer.sol** -- Factory pattern for deploying the full security token stack.

### Compiling and deploying

```bash
# Compile
npx hardhat compile

# Deploy to Holesky testnet
npx hardhat run scripts/deploy-holesky.cjs --network holesky

# Deploy to Arbitrum Sepolia testnet
npx hardhat run scripts/deploy-holesky.cjs --network arbitrumSepolia

# Deploy to mainnet
npx hardhat run scripts/deploy-mainnet.cjs --network mainnet

# Deploy Orbital protocol (Holesky)
npx hardhat run scripts/deploy-orbital.cjs --network holesky

# Deploy Orbital protocol (Arbitrum Sepolia)
npx hardhat run scripts/deploy-orbital.cjs --network arbitrumSepolia

# Verify on Etherscan
npx hardhat run scripts/verify-wrapped-asset-factory.cjs --network holesky
```

---

## Environment Variables

### Frontend (`.env`)

```
VITE_API_URL=http://localhost:8080          # backend URL
VITE_GOOGLE_MAPS_API_KEY=                   # for address autocomplete
VITE_THIRDWEB_CLIENT_ID=                    # required for wallet connectivity

# Optional RPC pools (comma-separated, primary first)
VITE_RPC_1_URLS=https://<primary>,https://ethereum-rpc.publicnode.com
VITE_RPC_17000_URLS=https://<primary>,https://holesky.drpc.org
VITE_RPC_42161_URLS=https://<primary>,https://arb1.arbitrum.io/rpc
VITE_RPC_421614_URLS=https://<primary>,https://sepolia-rollup.arbitrum.io/rpc
VITE_RPC_8453_URLS=https://<primary>,https://mainnet.base.org
VITE_RPC_84532_URLS=https://<primary>,https://sepolia.base.org
```

### Backend (`backend/.env`)

```
DATABASE_URL=postgresql://user:pass@localhost:5432/fueki

JWT_ACCESS_SECRET=                          # 32+ byte hex string
JWT_REFRESH_SECRET=                         # 32+ byte hex string (different from above)
ENCRYPTION_KEY=                             # 32-byte hex string for AES-256-GCM

CORS_ORIGIN=http://localhost:5173
PORT=8080
NODE_ENV=development
AUTH_COOKIE_SAMESITE=lax                     # use "none" for cross-domain prod frontend/backend

GCS_BUCKET=                                 # Google Cloud Storage bucket for KYC docs
GCS_KEY_FILE=                               # path to GCS service account key (optional in Cloud Run)

SMTP_HOST=                                  # e.g. smtp.gmail.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

ADMIN_EMAILS=                               # comma-separated, receives KYC notifications
BACKEND_URL=http://localhost:8080           # used in email links
```

### Contracts (root `.env`)

```
DEPLOYER_PRIVATE_KEY=                       # without 0x prefix
MAINNET_RPC_URL=                            # optional, defaults in hardhat config
HOLESKY_RPC_URL=
ARBITRUM_SEPOLIA_RPC_URL=
ETHERSCAN_API_KEY=                          # for contract verification
```

---

## Deployment

Both the frontend and backend have Dockerfiles and deploy to Google Cloud Run.

```bash
# Frontend
gcloud run deploy fueki --source . --region europe-west1 \
  --set-build-env-vars \
VITE_API_URL=https://<your-backend-domain>,\
VITE_THIRDWEB_CLIENT_ID=<your-thirdweb-client-id>,\
VITE_RPC_421614_URLS=https://sepolia-rollup.arbitrum.io/rpc

# Backend
cd backend
gcloud run deploy fueki-backend --source . --region us-central1 \
  --set-env-vars AUTH_COOKIE_SAMESITE=none
```

The frontend Dockerfile builds with Vite and serves static files. The backend Dockerfile compiles TypeScript, generates the Prisma client, and runs the Express server. Both run as non-root users.

The database is a Cloud SQL PostgreSQL instance. Connect from Cloud Run using the Cloud SQL connector or a private IP.

---

## Testing

### E2E tests (Playwright)

```bash
# Install browsers (first time)
npx playwright install

# Run tests
npx playwright test

# Run with UI
npx playwright test --ui

# View report
npx playwright show-report
```

Tests run against Chromium, Firefox, and mobile Chrome. Playwright starts the Vite dev server automatically.

### Contract tests

```bash
npx hardhat test
```

### Linting

```bash
npm run lint
```

---

## Project Structure

```
.
├── backend/                # Express API
│   ├── prisma/             #   Prisma schema and migrations
│   └── src/
│       ├── middleware/      #   Auth, RBAC, upload middleware
│       ├── routes/          #   auth, kyc, admin routes
│       └── services/        #   Business logic (auth, kyc, email, encryption, storage)
├── contracts/              # Solidity smart contracts
│   ├── orbital/            #   Orbital AMM protocol
│   └── security-token/     #   Security token framework
├── scripts/                # Hardhat deployment and verification scripts
├── src/                    # React frontend
│   ├── components/         #   UI components by domain
│   ├── hooks/              #   Custom React hooks
│   ├── lib/                #   Utilities, blockchain, parsers, API client
│   ├── pages/              #   Route-level page components
│   ├── store/              #   Zustand stores
│   └── types/              #   TypeScript types
├── tests/                  # Playwright E2E tests
├── artifacts/              # Compiled contract ABIs (generated)
├── typechain-types/        # TypeScript contract bindings (generated)
├── hardhat.config.cts      # Hardhat configuration
├── vite.config.ts          # Vite configuration
├── playwright.config.ts    # Playwright configuration
└── Dockerfile              # Frontend Docker build
```

---

## License

Proprietary. All rights reserved. Fueki Inc.
