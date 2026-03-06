#!/usr/bin/env bash
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# Deploy frontend to Cloud Run from source.
# For Dockerfile-based source builds, build-env flags are not passed through as
# Docker build args. To ensure VITE_* values are available to `vite build`, this
# script generates a temporary shell env file (vite.build.env) in the source
# directory and Dockerfile sources it during `vite build`.
#
# Usage:
#   ./scripts/deploy-frontend-cloudrun.sh
#   PROJECT_ID=... REGION=us-central1 SERVICE=fueki-frontend ./scripts/deploy-frontend-cloudrun.sh
#   DRY_RUN=1 ./scripts/deploy-frontend-cloudrun.sh

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required but not found in PATH."
  exit 1
fi

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
SERVICE="${SERVICE:-fueki-frontend}"
REGION="${REGION:-us-central1}"
BACKEND_SERVICE="${BACKEND_SERVICE:-fueki-backend}"
SOURCE_DIR="${SOURCE_DIR:-.}"
ENV_FILE="${SOURCE_DIR%/}/vite.build.env"

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "No active gcloud project configured."
  echo "Run: gcloud config set project <PROJECT_ID>"
  exit 1
fi

secret_value() {
  local name="$1"
  gcloud secrets versions access latest \
    --secret="$name" \
    --project="$PROJECT_ID" \
    2>/dev/null || true
}

use_env_or_secret() {
  local key="$1"
  local current="${!key:-}"
  if [ -n "$current" ]; then
    printf '%s' "$current"
    return 0
  fi
  secret_value "$key"
}

shell_escape_single_quoted() {
  local value="$1"
  value="${value//\'/\'\"\'\"\'}"
  printf "'%s'" "$value"
}

EXISTING_BACKEND_URL="$(
  gcloud run services describe "$BACKEND_SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='value(status.url)' \
    2>/dev/null || true
)"

VITE_API_URL="$(use_env_or_secret VITE_API_URL)"
if [ -z "$VITE_API_URL" ]; then
  VITE_API_URL="$EXISTING_BACKEND_URL"
fi

if [ -z "$VITE_API_URL" ]; then
  echo "Missing VITE_API_URL and unable to infer backend URL from Cloud Run."
  echo "Set VITE_API_URL env var or create Secret Manager secret VITE_API_URL."
  exit 1
fi

VITE_GOOGLE_MAPS_API_KEY="$(use_env_or_secret VITE_GOOGLE_MAPS_API_KEY)"
VITE_DEMO_WALLET_KEY="$(use_env_or_secret VITE_DEMO_WALLET_KEY)"
VITE_WALLETCONNECT_PROJECT_ID="$(use_env_or_secret VITE_WALLETCONNECT_PROJECT_ID)"
VITE_THIRDWEB_CLIENT_ID="$(use_env_or_secret VITE_THIRDWEB_CLIENT_ID)"
VITE_ENABLE_WALLET_RPC_RECONFIG="$(use_env_or_secret VITE_ENABLE_WALLET_RPC_RECONFIG)"
VITE_THIRDWEB_SUPPRESS_OPTIONAL_REQUESTS="$(use_env_or_secret VITE_THIRDWEB_SUPPRESS_OPTIONAL_REQUESTS)"

VITE_RPC_1_URLS="$(use_env_or_secret VITE_RPC_1_URLS)"
VITE_RPC_137_URLS="$(use_env_or_secret VITE_RPC_137_URLS)"
VITE_RPC_17000_URLS="$(use_env_or_secret VITE_RPC_17000_URLS)"
VITE_RPC_42161_URLS="$(use_env_or_secret VITE_RPC_42161_URLS)"
VITE_RPC_421614_URLS="$(use_env_or_secret VITE_RPC_421614_URLS)"
VITE_RPC_8453_URLS="$(use_env_or_secret VITE_RPC_8453_URLS)"
VITE_RPC_84532_URLS="$(use_env_or_secret VITE_RPC_84532_URLS)"
VITE_RPC_11155111_URLS="$(use_env_or_secret VITE_RPC_11155111_URLS)"

VITE_DD_APPLICATION_ID="$(use_env_or_secret VITE_DD_APPLICATION_ID)"
VITE_DD_CLIENT_TOKEN="$(use_env_or_secret VITE_DD_CLIENT_TOKEN)"
VITE_DD_SITE="$(use_env_or_secret VITE_DD_SITE)"
VITE_DD_ENV="$(use_env_or_secret VITE_DD_ENV)"

PAIRS=()
add_pair() {
  local key="$1"
  local value="$2"
  if [ -n "$value" ]; then
    PAIRS+=("${key}=${value}")
  fi
}

add_pair VITE_API_URL "$VITE_API_URL"
add_pair VITE_GOOGLE_MAPS_API_KEY "$VITE_GOOGLE_MAPS_API_KEY"
add_pair VITE_DEMO_WALLET_KEY "$VITE_DEMO_WALLET_KEY"
add_pair VITE_WALLETCONNECT_PROJECT_ID "$VITE_WALLETCONNECT_PROJECT_ID"
add_pair VITE_THIRDWEB_CLIENT_ID "$VITE_THIRDWEB_CLIENT_ID"
add_pair VITE_ENABLE_WALLET_RPC_RECONFIG "$VITE_ENABLE_WALLET_RPC_RECONFIG"
add_pair VITE_THIRDWEB_SUPPRESS_OPTIONAL_REQUESTS "$VITE_THIRDWEB_SUPPRESS_OPTIONAL_REQUESTS"
add_pair VITE_RPC_1_URLS "$VITE_RPC_1_URLS"
add_pair VITE_RPC_137_URLS "$VITE_RPC_137_URLS"
add_pair VITE_RPC_17000_URLS "$VITE_RPC_17000_URLS"
add_pair VITE_RPC_42161_URLS "$VITE_RPC_42161_URLS"
add_pair VITE_RPC_421614_URLS "$VITE_RPC_421614_URLS"
add_pair VITE_RPC_8453_URLS "$VITE_RPC_8453_URLS"
add_pair VITE_RPC_84532_URLS "$VITE_RPC_84532_URLS"
add_pair VITE_RPC_11155111_URLS "$VITE_RPC_11155111_URLS"
add_pair VITE_DD_APPLICATION_ID "$VITE_DD_APPLICATION_ID"
add_pair VITE_DD_CLIENT_TOKEN "$VITE_DD_CLIENT_TOKEN"
add_pair VITE_DD_SITE "$VITE_DD_SITE"
add_pair VITE_DD_ENV "$VITE_DD_ENV"

if [ "${#PAIRS[@]}" -eq 0 ]; then
  echo "No frontend VITE_* values resolved; refusing to deploy."
  exit 1
fi

if [ -z "$VITE_GOOGLE_MAPS_API_KEY" ]; then
  echo "WARNING: VITE_GOOGLE_MAPS_API_KEY is empty; address autocomplete will be disabled."
fi

TMP_BACKUP=''
if [ -f "$ENV_FILE" ]; then
  TMP_BACKUP="$(mktemp)"
  cp "$ENV_FILE" "$TMP_BACKUP"
fi

cleanup() {
  if [ -n "$TMP_BACKUP" ] && [ -f "$TMP_BACKUP" ]; then
    mv "$TMP_BACKUP" "$ENV_FILE"
  else
    rm -f "$ENV_FILE"
  fi
}
trap cleanup EXIT

{
  printf '# Auto-generated by scripts/deploy-frontend-cloudrun.sh\n'
  printf '# Do not commit this file.\n'
  for pair in "${PAIRS[@]}"; do
    key="${pair%%=*}"
    value="${pair#*=}"
    printf 'export %s=%s\n' "$key" "$(shell_escape_single_quoted "$value")"
  done
} > "$ENV_FILE"

echo "Deploying $SERVICE to $REGION (project: $PROJECT_ID) with ${#PAIRS[@]} VITE vars."
echo "Configured keys:"
for pair in "${PAIRS[@]}"; do
  printf '  - %s\n' "${pair%%=*}"
done

RUNTIME_ENV_VARS="$(IFS='|'; printf '%s' "${PAIRS[*]}")"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1 set; skipping deploy."
  exit 0
fi

gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source "$SOURCE_DIR" \
  --set-env-vars "^|^${RUNTIME_ENV_VARS}" \
  --quiet
