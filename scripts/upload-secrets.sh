#!/usr/bin/env bash
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# Upload runtime/deploy secrets to Google Secret Manager.
# Prereqs:
#   - gcloud auth login
#   - gcloud config set project <PROJECT_ID>
#   - roles/secretmanager.admin (or equivalent)
#
# Usage:
#   ./scripts/upload-secrets.sh

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required but not found in PATH."
  exit 1
fi

CURRENT_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [ -z "$CURRENT_PROJECT" ] || [ "$CURRENT_PROJECT" = "(unset)" ]; then
  echo "No active gcloud project configured."
  echo "Run: gcloud config set project <PROJECT_ID>"
  exit 1
fi

echo "Using gcloud project: $CURRENT_PROJECT"
echo "Ensuring Secret Manager API is enabled..."
gcloud services enable secretmanager.googleapis.com --quiet

ensure_secret_exists() {
  local name="$1"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    return 0
  fi

  gcloud secrets create "$name" --replication-policy="automatic" --quiet
  echo "Created secret: $name"
}

upsert_secret() {
  local name="$1"
  local value="$2"

  if [ -z "$value" ]; then
    echo "Skipping $name (empty)."
    return 0
  fi

  ensure_secret_exists "$name"
  printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --quiet
  echo "Uploaded version: $name"
}

prompt_secret() {
  local var_name="$1"
  local prompt="$2"
  local value=""
  read -r -s -p "$prompt" value
  echo
  upsert_secret "$var_name" "$value"
}

prompt_optional() {
  local var_name="$1"
  local value=""
  read -r -p "$var_name (Enter to skip): " value
  upsert_secret "$var_name" "$value"
}

# Required runtime values
prompt_secret "DATABASE_URL" "DATABASE_URL: "
prompt_secret "SMTP_PASS" "SMTP_PASS (leave empty if SMTP has no auth): "

# Auto-generate strong defaults for JWT + encryption
JWT_ACCESS_SECRET="$(openssl rand -hex 64)"
JWT_REFRESH_SECRET="$(openssl rand -hex 64)"
ENCRYPTION_KEY="$(openssl rand -hex 32)" # 64 hex chars (32 bytes)

upsert_secret "JWT_ACCESS_SECRET" "$JWT_ACCESS_SECRET"
upsert_secret "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET"
upsert_secret "ENCRYPTION_KEY" "$ENCRYPTION_KEY"

# Required deploy value
prompt_secret "DEPLOYER_PRIVATE_KEY" "DEPLOYER_PRIVATE_KEY (without 0x, leave empty if not deploying): "

# Optional values
OPTIONAL_SECRETS=(
  ETHERSCAN_API_KEY
  ARBISCAN_API_KEY
  POLYGONSCAN_API_KEY
  BASESCAN_API_KEY
  COINMARKETCAP_API_KEY
  MAINNET_RPC_URL
  HOLESKY_RPC_URL
  ARBITRUM_RPC_URL
  ARBITRUM_SEPOLIA_RPC_URL
  POLYGON_RPC_URL
  BASE_RPC_URL
  BASE_SEPOLIA_RPC_URL
  SEPOLIA_RPC_URL
  VITE_GOOGLE_MAPS_API_KEY
  VITE_DEMO_WALLET_KEY
  VITE_WALLETCONNECT_PROJECT_ID
  VITE_API_URL
  VITE_RPC_1_URLS
  VITE_RPC_137_URLS
  VITE_RPC_17000_URLS
  VITE_RPC_42161_URLS
  VITE_RPC_421614_URLS
  VITE_RPC_43114_URLS
  VITE_RPC_43113_URLS
  VITE_RPC_80002_URLS
  VITE_RPC_8453_URLS
  VITE_RPC_84532_URLS
  VITE_RPC_11155111_URLS
  VITE_DD_APPLICATION_ID
  VITE_DD_CLIENT_TOKEN
  VITE_DD_SITE
  VITE_DD_ENV
)

for s in "${OPTIONAL_SECRETS[@]}"; do
  prompt_optional "$s"
done

echo "Done. Secrets uploaded to project: $CURRENT_PROJECT"
