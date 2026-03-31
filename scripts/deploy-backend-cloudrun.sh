#!/usr/bin/env bash
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/cloudrun-deploy-helpers.sh"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required but not found in PATH."
  exit 1
fi

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
SERVICE="${SERVICE:-fueki-backend}"
REGION="${REGION:-us-central1}"
SOURCE_DIR="${SOURCE_DIR:-backend}"
PORT="${PORT:-8080}"
ENV_VARS_FILE="${ENV_VARS_FILE:-backend/cloudrun.env.yaml}"
CLOUDSQL_INSTANCE="${CLOUDSQL_INSTANCE:-extreme-lodge-463919-d9:us-central1:fueki-db}"
PROMOTE_TRAFFIC="${PROMOTE_TRAFFIC:-1}"

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "No active gcloud project configured."
  echo "Run: gcloud config set project <PROJECT_ID>"
  exit 1
fi

echo "Building backend before deploy."
(
  cd "$REPO_ROOT/$SOURCE_DIR"
  npm run build
)

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1 set; skipping deploy."
  exit 0
fi

PREVIOUS_CREATED_REVISION="$(
  cloudrun_service_value "$SERVICE" "$PROJECT_ID" "$REGION" "status.latestCreatedRevisionName" \
    2>/dev/null || true
)"

echo "Deploying $SERVICE to $REGION (project: $PROJECT_ID)."
gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source "$REPO_ROOT/$SOURCE_DIR" \
  --port "$PORT" \
  --env-vars-file "$REPO_ROOT/$ENV_VARS_FILE" \
  --add-cloudsql-instances "$CLOUDSQL_INSTANCE" \
  --quiet

if [ "$PROMOTE_TRAFFIC" = "1" ]; then
  NEW_REVISION="$(
    wait_for_new_revision "$SERVICE" "$PROJECT_ID" "$REGION" "$PREVIOUS_CREATED_REVISION"
  )"

  echo "Waiting for revision $NEW_REVISION to become ready."
  wait_for_revision_ready "$NEW_REVISION" "$PROJECT_ID" "$REGION"

  echo "Promoting revision $NEW_REVISION to 100% traffic."
  promote_revision_to_full_traffic "$SERVICE" "$NEW_REVISION" "$PROJECT_ID" "$REGION"
  verify_full_traffic_revision "$SERVICE" "$NEW_REVISION" "$PROJECT_ID" "$REGION"

  echo "Current traffic:"
  gcloud run services describe "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='table(status.traffic.revisionName,status.traffic.percent)'
else
  echo "PROMOTE_TRAFFIC=0 set; keeping the existing traffic split."
fi
