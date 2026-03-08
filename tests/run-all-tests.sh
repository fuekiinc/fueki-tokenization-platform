#!/usr/bin/env bash
set -u

mkdir -p tests/reports
rm -f \
  tests/reports/vitest-results.json \
  tests/reports/vitest-workspace-results.json \
  tests/reports/vitest-coverage-results.json \
  tests/reports/vitest-api-results.json \
  tests/reports/vitest-security-results.json \
  tests/reports/backend-vitest-results.json \
  tests/reports/backend-vitest-coverage-results.json \
  tests/reports/wallet-simulation.json \
  tests/reports/coverage-final.json \
  tests/reports/coverage-summary.json \
  tests/reports/full-testing-suite-results.md
rm -rf tests/reports/lighthouse tests/reports/mythril
rm -rf coverage backend/coverage

failures=0
run_step() {
  local name="$1"
  shift
  echo ""
  echo "==> ${name}"
  if "$@"; then
    echo "[PASS] ${name}"
  else
    echo "[FAIL] ${name}"
    failures=$((failures + 1))
  fi
}

run_step "Frontend lint" npm run lint
run_step "Frontend typecheck" npm run typecheck
run_step "Legacy unit tests" npm run test:unit
run_step "Vitest workspace" env VITEST_JSON_OUTPUT_FILE=./tests/reports/vitest-workspace-results.json npm run test:vitest
run_step "Vitest coverage" env VITEST_JSON_OUTPUT_FILE=./tests/reports/vitest-coverage-results.json npm run test:vitest:coverage
run_step "API contract tests" env VITEST_JSON_OUTPUT_FILE=./tests/reports/vitest-api-results.json npm run test:api
run_step "Newman API contract validation" bash tests/api/run-newman-contract.sh
run_step "Backend tests" env BACKEND_VITEST_JSON_OUTPUT_FILE=../tests/reports/backend-vitest-results.json npm --prefix backend run test
run_step "Backend coverage" env BACKEND_VITEST_JSON_OUTPUT_FILE=../tests/reports/backend-vitest-coverage-results.json npm --prefix backend run test -- --coverage
run_step "Merge frontend/backend coverage" node tests/reports/merge-coverage.mjs
run_step "Backend build" npm --prefix backend run build
run_step "Contracts compile" npm run contracts:build
run_step "Hardhat contract integration tests" npm run test:contracts:hardhat
run_step "Hardhat gas report" env REPORT_GAS=true CI=true npx hardhat test tests/contracts/hardhat/orbital.integration.test.js

if command -v forge >/dev/null 2>&1; then
  run_step "Foundry contract tests" npm run test:contracts:forge
  run_step "Foundry fuzz tests" npm run test:contracts:forge:fuzz
  run_step "Forge gas snapshot" forge snapshot --root . --match-path "tests/contracts/forge/OrbitalGasBench.t.sol" --snap tests/reports/forge-gas-snapshot.txt
else
  echo "[SKIP] Foundry not installed; skipping forge tests"
fi

run_step "Playwright smoke" npm run test:e2e:smoke
run_step "Security audit" npm run test:security

run_step "API load/performance" npm run test:performance
run_step "Lighthouse audit" npm run test:lighthouse
run_step "Wallet simulation" node tests/utils/wallet-simulation.mjs

run_step "Generate gas report" node tests/reports/generate-gas-report.mjs
run_step "Generate performance report" node tests/reports/generate-performance-report.mjs
run_step "Generate report index" node tests/reports/generate-report-index.mjs
run_step "Generate full testing report" node tests/reports/generate-full-testing-report.mjs

echo ""
echo "Total failed steps: ${failures}"
if [ "$failures" -gt 0 ]; then
  exit 1
fi
