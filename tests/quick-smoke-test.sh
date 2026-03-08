#!/usr/bin/env bash
set -euo pipefail

mkdir -p tests/reports

echo "==> Quick smoke: typecheck"
npm run typecheck

echo "==> Quick smoke: backend tests"
npm --prefix backend run test -- --reporter=default --reporter=json --outputFile=../tests/reports/backend-vitest-results.json

echo "==> Quick smoke: legacy unit tests"
npm run test:unit

echo "==> Quick smoke: vitest unit project"
VITEST_JSON_OUTPUT_FILE=./tests/reports/vitest-unit-smoke-results.json \
  npx vitest run --project unit --config vitest.config.ts

echo "==> Quick smoke: API non-destructive checks"
VITEST_JSON_OUTPUT_FILE=./tests/reports/vitest-api-smoke-results.json \
  npx vitest run --project api --config vitest.config.ts tests/api/contracts.api.test.ts tests/api/gas.api.test.ts

echo "==> Quick smoke: hardhat compile"
npm run contracts:build

echo "==> Quick smoke: hardhat integration tests"
npm run test:contracts:hardhat

echo "==> Quick smoke complete"
