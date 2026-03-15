# Fueki Platform Architecture

## System Overview

Fueki is a full-stack Web3 tokenization platform with three main subsystems:

1. **On-Chain Exchange** — Limit order book + AMM pools for tokenized assets
2. **Token Lifecycle** — ERC-20 creation, ERC-1404 security tokens, mint/burn
3. **Compliance** — KYC/AML verification, transfer restrictions, admin workflows

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │walletStore│ │authStore │ │exchangeStore│ │tradeStore │ │
│  └─────┬────┘ └────┬─────┘ └─────┬──────┘ └─────┬─────┘ │
│        │           │              │               │       │
│  ┌─────▼───────────▼──────────────▼───────────────▼────┐ │
│  │          lib/blockchain (ethers.js v6)               │ │
│  │  txExecution │ rpcCache │ multicall │ contracts      │ │
│  └──────────────┬──────────────────────────────────────┘ │
└─────────────────┼───────────────────────────────────────┘
                  │
    ┌─────────────▼─────────────┐
    │    11 EVM Chain RPCs      │
    │  (health tracked,         │
    │   3-strike failover)      │
    └─────────────┬─────────────┘
                  │
    ┌─────────────▼─────────────┐
    │   Smart Contracts          │
    │  AssetBackedExchange       │
    │  LiquidityPoolAMM          │
    │  OrbitalPool               │
    │  WrappedAssetFactory       │
    └───────────────────────────┘

    ┌───────────────────────────┐
    │   Express Backend          │
    │  JWT Auth + Refresh Rotate │
    │  KYC (AES-256-GCM PII)    │
    │  Prisma → PostgreSQL       │
    │  Cloud Run deployment      │
    └───────────────────────────┘
```

## Key Design Decisions

### State Management: Zustand v5
- 10 stores with clear boundaries (wallet, auth, exchange, trade, etc.)
- No module-level mutable state for user data
- Chain-specific data reset on chain switch
- Persisted state uses localStorage with validation + TTL

### RPC Infrastructure
- 11 EVM chains supported (mainnet + testnets)
- 3-strike failure model with 20s cooldown per endpoint
- `Promise.any()` parallel probing for healthy endpoint selection
- 500-entry LRU cache with TTL tiers: 30s (balance), 60s (pool), 300s (metadata)

### Smart Contract Patterns
- Manual reentrancy guard (not OZ library — inline implementation)
- SafeERC20 via low-level `call` with `abi.encodeWithSelector`
- Pull-based ETH withdrawal (ethBalances mapping)
- CEI pattern (Checks-Effects-Interactions) enforced manually
- 48-hour timelock on emergency admin withdrawals

### Authentication
- JWT access tokens (15 min) + refresh tokens (7 day, httpOnly cookie)
- bcrypt password hashing (12 rounds)
- Refresh token rotation on each use
- KYC status: `not_started` → `pending` → `approved` | `rejected`

### PII Protection
- AES-256-GCM encryption at rest for SSN, government ID, addresses
- Single encryption key (rotation procedure needed)
- SSN masked in API responses (last 4 digits only)
- PII never in email bodies or logs — admin panel links only

## ADR Index

| ADR | Decision | Status |
|-----|----------|--------|
| [ADR-001](ADR-001-safeERC20.md) | SafeERC20 via inline low-level call pattern | Implemented |
| [ADR-002](ADR-002-rpc-health.md) | 3-strike RPC health model with parallel probing | Implemented |
| [ADR-003](ADR-003-kyc-status.md) | Exact-match KYC status normalization | Implemented |
| [ADR-004](ADR-004-pii-handling.md) | PII encryption at rest, masked in transit | Implemented |

## Security Audit
See `docs/SECURITY_AUDIT_REPORT.md` for the full 84-finding audit report.
