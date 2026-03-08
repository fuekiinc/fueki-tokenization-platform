#!/usr/bin/env bash
set -euo pipefail

mkdir -p tests/reports

collection="tests/api/postman/fueki-api.postman_collection.json"
environment="tests/api/postman/fueki-api.postman_environment.json"
base_url="${FUEKI_API_URL:-https://fueki-backend-pojr5zp2oq-uc.a.run.app}"
api_prefix="${FUEKI_API_PREFIX:-/api}"
compile_path="${FUEKI_COMPILE_PATH:-${api_prefix}/contracts/compile}"
gas_path="${FUEKI_GAS_PATH:-${api_prefix}/gas/estimate}"
expected_unauthorized_status="${FUEKI_EXPECT_UNAUTHORIZED_STATUS:-401}"
expected_compile_status="${FUEKI_EXPECT_COMPILE_STATUS:-404}"
expected_gas_status="${FUEKI_EXPECT_GAS_STATUS:-404}"
max_attempts="${FUEKI_NEWMAN_MAX_ATTEMPTS:-3}"

if ! command -v newman >/dev/null 2>&1; then
  if [ -x "./node_modules/.bin/newman" ]; then
    runner="./node_modules/.bin/newman"
  else
    echo "[newman] Newman is not installed."
    exit 1
  fi
else
  runner="newman"
fi

attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  "$runner" run "$collection" \
    --environment "$environment" \
    --env-var "baseUrl=${base_url}" \
    --env-var "apiPrefix=${api_prefix}" \
    --env-var "compilePath=${compile_path}" \
    --env-var "gasPath=${gas_path}" \
    --env-var "expectedUnauthorizedStatus=${expected_unauthorized_status}" \
    --env-var "expectedCompileStatus=${expected_compile_status}" \
    --env-var "expectedGasStatus=${expected_gas_status}" \
    --reporters cli,json \
    --reporter-json-export tests/reports/newman-report.json

  has_429="$(jq -r '[.run.executions[].response.code] | any(. == 429)' tests/reports/newman-report.json)"
  if [ "$has_429" = "false" ]; then
    break
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "[newman] Received 429 responses after ${max_attempts} attempts; use a non-rate-limited base URL."
    exit 1
  fi

  sleep_seconds=$((attempt * 3))
  echo "[newman] Attempt ${attempt} saw 429 responses. Retrying in ${sleep_seconds}s..."
  sleep "$sleep_seconds"
  attempt=$((attempt + 1))
done
