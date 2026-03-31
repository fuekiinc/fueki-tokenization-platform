#!/usr/bin/env bash

cloudrun_service_value() {
  local service="$1"
  local project_id="$2"
  local region="$3"
  local field="$4"

  gcloud run services describe "$service" \
    --project "$project_id" \
    --region "$region" \
    --format="value(${field})"
}

cloudrun_revision_ready_field() {
  local revision="$1"
  local project_id="$2"
  local region="$3"
  local field="$4"

  if command -v jq >/dev/null 2>&1; then
    gcloud run revisions describe "$revision" \
      --project "$project_id" \
      --region "$region" \
      --format=json | jq -r --arg field "$field" '
        .status.conditions[]
        | select(.type == "Ready")
        | .[$field] // empty
      ' | head -n 1
    return 0
  fi

  gcloud run revisions describe "$revision" \
    --project "$project_id" \
    --region "$region" \
    --format="value(status.conditions[0].${field})"
}

cloudrun_revision_ready_status() {
  local revision="$1"
  local project_id="$2"
  local region="$3"

  cloudrun_revision_ready_field "$revision" "$project_id" "$region" "status"
}

cloudrun_revision_ready_message() {
  local revision="$1"
  local project_id="$2"
  local region="$3"

  cloudrun_revision_ready_field "$revision" "$project_id" "$region" "message"
}

wait_for_new_revision() {
  local service="$1"
  local project_id="$2"
  local region="$3"
  local previous_revision="$4"
  local timeout_seconds="${5:-900}"
  local poll_seconds="${6:-5}"

  local started_at
  started_at="$(date +%s)"

  while true; do
    local current_revision
    current_revision="$(
      cloudrun_service_value "$service" "$project_id" "$region" "status.latestCreatedRevisionName" \
        2>/dev/null || true
    )"

    if [ -n "$current_revision" ] && [ "$current_revision" != "$previous_revision" ]; then
      printf '%s\n' "$current_revision"
      return 0
    fi

    local now
    now="$(date +%s)"
    if [ $((now - started_at)) -ge "$timeout_seconds" ]; then
      echo "Timed out waiting for a new revision for service $service." >&2
      return 1
    fi

    sleep "$poll_seconds"
  done
}

wait_for_revision_ready() {
  local revision="$1"
  local project_id="$2"
  local region="$3"
  local timeout_seconds="${4:-900}"
  local poll_seconds="${5:-5}"

  if [ -z "$revision" ]; then
    echo "wait_for_revision_ready requires a revision name." >&2
    return 1
  fi

  local started_at
  started_at="$(date +%s)"

  while true; do
    local ready_status
    ready_status="$(
      cloudrun_revision_ready_status "$revision" "$project_id" "$region" \
        2>/dev/null || true
    )"

    if [ "$ready_status" = "True" ]; then
      return 0
    fi

    if [ "$ready_status" = "False" ]; then
      local failure_message
      failure_message="$(
        cloudrun_revision_ready_message "$revision" "$project_id" "$region" \
          2>/dev/null || true
      )"
      echo "Revision $revision failed to become ready: ${failure_message:-unknown error}" >&2
      return 1
    fi

    local now
    now="$(date +%s)"
    if [ $((now - started_at)) -ge "$timeout_seconds" ]; then
      local last_message
      last_message="$(
        cloudrun_revision_ready_message "$revision" "$project_id" "$region" \
          2>/dev/null || true
      )"
      echo "Timed out waiting for revision $revision to become ready: ${last_message:-no status message}" >&2
      return 1
    fi

    sleep "$poll_seconds"
  done
}

promote_revision_to_full_traffic() {
  local service="$1"
  local revision="$2"
  local project_id="$3"
  local region="$4"

  gcloud run services update-traffic "$service" \
    --project "$project_id" \
    --region "$region" \
    --to-revisions "${revision}=100" \
    --quiet
}

verify_full_traffic_revision() {
  local service="$1"
  local revision="$2"
  local project_id="$3"
  local region="$4"

  local traffic_revision
  traffic_revision="$(
    cloudrun_service_value "$service" "$project_id" "$region" "status.traffic[0].revisionName"
  )"
  local traffic_percent
  traffic_percent="$(
    cloudrun_service_value "$service" "$project_id" "$region" "status.traffic[0].percent"
  )"

  if [ "$traffic_revision" != "$revision" ] || [ "$traffic_percent" != "100" ]; then
    echo "Traffic verification failed for $service: expected ${revision}=100, got ${traffic_revision:-<none>}=${traffic_percent:-<none>}." >&2
    return 1
  fi

  return 0
}
