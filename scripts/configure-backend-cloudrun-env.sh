#!/usr/bin/env bash
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# Configure backend Cloud Run runtime env + secret bindings.
#
# Usage:
#   ./scripts/configure-backend-cloudrun-env.sh
#   SERVICE=fueki-backend REGIONS=us-central1,europe-west1 ./scripts/configure-backend-cloudrun-env.sh

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required but not found in PATH."
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not found in PATH."
  echo "Install jq (e.g. 'brew install jq') and rerun."
  exit 1
fi

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
SERVICE="${SERVICE:-fueki-backend}"
REGIONS="${REGIONS:-us-central1}"

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "No active gcloud project configured."
  echo "Run: gcloud config set project <PROJECT_ID>"
  exit 1
fi

echo "Project: $PROJECT_ID"
echo "Service: $SERVICE"
echo "Regions: $REGIONS"

gcloud services enable run.googleapis.com secretmanager.googleapis.com --project="$PROJECT_ID" --quiet

require_secret() {
  local name="$1"
  if ! gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "Missing required secret: $name"
    echo "Create/upload it first, then rerun this script."
    exit 1
  fi
}

require_secret DATABASE_URL
require_secret JWT_ACCESS_SECRET
require_secret JWT_REFRESH_SECRET
require_secret ENCRYPTION_KEY
require_secret SMTP_PASS

remove_plain_env_for_secret_keys() {
  local region="$1"
  local env_json=""
  local remove_csv=""

  env_json="$(gcloud run services describe "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$region" \
    --format='json(spec.template.spec.containers[0].env)')"

  remove_csv="$(
    printf '%s' "$env_json" | jq -r '
      [ .spec.template.spec.containers[0].env[]?
        | select(.name as $n | ["DATABASE_URL","JWT_ACCESS_SECRET","JWT_REFRESH_SECRET","ENCRYPTION_KEY","SMTP_PASS"] | index($n))
        | select(has("value"))
        | .name
      ] | unique | join(",")
    '
  )"

  if [ -n "$remove_csv" ]; then
    echo "Removing plain env vars before secret binding in $region: $remove_csv"
    gcloud run services update "$SERVICE" \
      --project="$PROJECT_ID" \
      --region="$region" \
      --remove-env-vars "$remove_csv" \
      --quiet
  fi
}

read_with_default() {
  local prompt="$1"
  local default="$2"
  local outvar="$3"
  local value=""
  read -r -p "$prompt [$default]: " value
  if [ -z "$value" ]; then
    value="$default"
  fi
  printf -v "$outvar" '%s' "$value"
}

REGION_FIRST="${REGIONS%%,*}"
EXISTING_BACKEND_URL="$(gcloud run services describe "$SERVICE" --region "$REGION_FIRST" --project "$PROJECT_ID" --format='value(status.url)' 2>/dev/null || true)"

read_with_default "NODE_ENV" "production" NODE_ENV
read_with_default "AUTH_COOKIE_SAMESITE" "none" AUTH_COOKIE_SAMESITE
read_with_default "CORS_ORIGIN (comma-separated URLs)" "https://fueki-frontend-REPLACE_ME.run.app,https://fueki-REPLACE_ME.run.app,https://fueki-tech.com" CORS_ORIGIN
read_with_default "GCS_BUCKET" "fueki-kyc-documents" GCS_BUCKET
read_with_default "GCS_KEY_FILE (leave blank for ADC on Cloud Run)" "" GCS_KEY_FILE
read_with_default "SMTP_HOST" "smtp.ionos.com" SMTP_HOST
read_with_default "SMTP_PORT" "465" SMTP_PORT
read_with_default "SMTP_USER" "mark@fueki-tech.com" SMTP_USER
read_with_default "SMTP_FROM" "mark@fueki-tech.com" SMTP_FROM
read_with_default "ADMIN_EMAILS (comma-separated)" "mark@fueki-tech.com" ADMIN_EMAILS
read_with_default "FRONTEND_URL" "https://fueki-tech.com" FRONTEND_URL
read_with_default "BACKEND_URL" "${EXISTING_BACKEND_URL:-https://fueki-backend-REPLACE_ME.run.app}" BACKEND_URL
read_with_default "SUPPORT_EMAIL_TO" "mark@fueki-tech.com" SUPPORT_EMAIL_TO
read_with_default "MINT_APPROVAL_EMAIL_TO" "mark@fueki-tech.com" MINT_APPROVAL_EMAIL_TO
read_with_default "SECURITY_TOKEN_APPROVAL_EMAIL_TO" "mark@fueki-tech.com" SECURITY_TOKEN_APPROVAL_EMAIL_TO

SECRETS_SPEC="^|^DATABASE_URL=DATABASE_URL:latest|JWT_ACCESS_SECRET=JWT_ACCESS_SECRET:latest|JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest|ENCRYPTION_KEY=ENCRYPTION_KEY:latest|SMTP_PASS=SMTP_PASS:latest"
ENV_SPEC="^|^NODE_ENV=${NODE_ENV}|AUTH_COOKIE_SAMESITE=${AUTH_COOKIE_SAMESITE}|CORS_ORIGIN=${CORS_ORIGIN}|GCS_BUCKET=${GCS_BUCKET}|GCS_KEY_FILE=${GCS_KEY_FILE}|SMTP_HOST=${SMTP_HOST}|SMTP_PORT=${SMTP_PORT}|SMTP_USER=${SMTP_USER}|SMTP_FROM=${SMTP_FROM}|ADMIN_EMAILS=${ADMIN_EMAILS}|FRONTEND_URL=${FRONTEND_URL}|BACKEND_URL=${BACKEND_URL}|SUPPORT_EMAIL_TO=${SUPPORT_EMAIL_TO}|MINT_APPROVAL_EMAIL_TO=${MINT_APPROVAL_EMAIL_TO}|SECURITY_TOKEN_APPROVAL_EMAIL_TO=${SECURITY_TOKEN_APPROVAL_EMAIL_TO}"

IFS=',' read -r -a REGION_ARR <<< "$REGIONS"
for region in "${REGION_ARR[@]}"; do
  region="$(echo "$region" | xargs)"
  if [ -z "$region" ]; then
    continue
  fi

  remove_plain_env_for_secret_keys "$region"

  echo "Updating $SERVICE in $region..."
  gcloud run services update "$SERVICE" \
    --project="$PROJECT_ID" \
    --region="$region" \
    --set-secrets "$SECRETS_SPEC" \
    --update-env-vars "$ENV_SPEC" \
    --quiet
done

echo "Done."
