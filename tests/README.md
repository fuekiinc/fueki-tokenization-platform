# Fueki Testing System

This directory contains the production test system for the Fueki tokenization platform across frontend, backend API, smart contracts, security, performance, and live integrations.

## Prerequisites

- Node.js `>=22.11.0` (the test/build wrappers will automatically use `22.12.0+` for Vite and `22.13.0+` for Artillery when needed)
- npm
- Optional: `forge`, `anvil`, `slither`, `myth`, `k6`
- Optional local Postgres test DB for DB integration tests

## Environment Setup

1. Copy `.env.test.example` to `.env.test`.
2. Set `DATABASE_URL` to a test database only (must include `test` in DB name).
3. Keep `FUEKI_ENABLE_LIVE_API=false` unless intentionally running live endpoint checks.

## Test Suites

### Unit + Components + Hooks + Stores (Vitest)

```bash
npm run test:vitest
npm run test:vitest:coverage
npm run test:vitest:typecheck
npm run test:vitest:coverage:strict
```

`test:vitest:coverage` always generates coverage artifacts.  
`test:vitest:coverage:strict` enforces the global thresholds (80/75/80/80).

### API Contract Tests (Vitest + HTTP contract runner)

```bash
npm run test:api
bash tests/api/run-newman-contract.sh
```

Contract-runner environment overrides:
- `FUEKI_API_URL` (default `https://fueki-backend-pojr5zp2oq-uc.a.run.app`)
- `FUEKI_API_PREFIX` (default `/api`)
- `FUEKI_EXPECT_UNAUTHORIZED_STATUS` (default `401`)
- `FUEKI_EXPECT_COMPILE_STATUS` (default `404` unless compile API is deployed)
- `FUEKI_EXPECT_GAS_STATUS` (default `404` unless gas API is deployed)

Live mode:

```bash
FUEKI_ENABLE_LIVE_API=true npm run test:api
```

Optional live API semantics controls:
- `FUEKI_API_PREFIX` (default `/api`)
- `FUEKI_EXPECT_CONTRACT_APIS` (`true` to require compile/gas endpoints)
- `FUEKI_EXPECT_COMPILE_STATUS` (default `404` unless contract APIs expected)
- `FUEKI_EXPECT_GAS_STATUS` (default `404` unless contract APIs expected)

### Backend Service Tests (backend/)

```bash
npm --prefix backend run test
npm --prefix backend run build
```

### Contracts

Hardhat integration:

```bash
npm run contracts:build
npm run test:contracts:hardhat
```

Foundry unit/fuzz/invariant:

```bash
npm run test:contracts:forge
npm run test:contracts:forge:fuzz
```

### Security

```bash
npm run test:security
```

Outputs:
- `tests/reports/security-findings.json`
- `tests/reports/npm-audit.json`
- `tests/reports/slither-findings.json` (if Slither installed)
- `tests/reports/mythril/*.json` (if Mythril installed)

### Performance

```bash
npm run test:performance
npm run test:lighthouse
```

Outputs:
- `tests/reports/api-load-report.json`
- `tests/reports/performance-report.json`
- `tests/reports/lighthouse/*.json`

### E2E (Playwright)

```bash
npm run test:e2e
npm run test:e2e:smoke
npm run test:e2e:a11y
```

## Database Safety Guard

DB integration tests enforce a hard safety check before connecting:

```bash
node tests/utils/check-test-db.mjs
```

If `DATABASE_URL` does not contain `test`, tests fail immediately.

## Master Runners

Full pipeline:

```bash
bash tests/run-all-tests.sh
```

Includes frontend lint/typecheck, Vitest suites, API contract checks, backend tests/build, smart-contract tests, e2e smoke, security, performance, and report generation.
Each full run also regenerates the human-readable Markdown summary at
`tests/reports/full-testing-suite-results.md`.

Quick smoke (<5 min target on local setup):

```bash
bash tests/quick-smoke-test.sh
```

## Reports

Generate summary index:

```bash
npm run test:reports
```

Generated files:
- `tests/reports/test-results.json`
- `tests/reports/full-testing-suite-results.md`
- `tests/reports/coverage-debt-report.json`
- `tests/reports/vitest-workspace-results.json`
- `tests/reports/vitest-api-results.json`
- `tests/reports/vitest-security-results.json`
- `tests/reports/backend-vitest-results.json`
- `tests/reports/gas-report.json`
- `tests/reports/security-findings.json`
- `tests/reports/api-load-report.json`
- `tests/reports/performance-report.json`
- `tests/reports/slither-findings.json`
- `tests/reports/mythril/*.json`
- `tests/reports/forge-gas-snapshot.txt`
- `tests/reports/wallet-simulation.json`
- `tests/reports/coverage-final.json` (copied from `coverage/coverage-final.json`)
