#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKFLOW_PATH="$REPO_ROOT/config/symphony/WORKFLOW.md"
BOOTSTRAP_SCRIPT="$REPO_ROOT/scripts/symphony/bootstrap-workspace.sh"
CODEX_TEMPLATE="$REPO_ROOT/config/symphony/codex.config.toml"
AGENTS_TEMPLATE="$REPO_ROOT/config/symphony/AGENTS.override.md"
SYMPHONY_BIN="$REPO_ROOT/tools/symphony/elixir/bin/symphony"
CODEX_BIN="${CODEX_BIN:-$(command -v codex 2>/dev/null || true)}"
SOURCE_REPO="${SYMPHONY_SOURCE_REPO_URL:-$REPO_ROOT}"
WORKSPACE_ROOT="${SYMPHONY_WORKSPACE_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/fueki-tokenization-platform/symphony-workspaces}"
LOGS_ROOT="${SYMPHONY_LOGS_ROOT:-${XDG_STATE_HOME:-$HOME/.local/state}/fueki-tokenization-platform/symphony}"
PORT="${SYMPHONY_PORT:-4177}"
status=0

ok() {
  printf '[ok] %s\n' "$1"
}

missing() {
  printf '[missing] %s\n' "$1"
  status=1
}

check_cmd() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    ok "$name: $(command -v "$name")"
  else
    missing "$name"
  fi
}

check_path() {
  local label="$1"
  local path="$2"
  if [ -e "$path" ]; then
    ok "$label: $path"
  else
    missing "$label: $path"
  fi
}

check_value() {
  local label="$1"
  local value="$2"
  if [ -n "$value" ]; then
    ok "$label: $value"
  else
    missing "$label"
  fi
}

printf 'Symphony doctor for %s\n' "$REPO_ROOT"
check_cmd git
check_cmd gh
check_cmd jq
check_cmd mise
check_value 'codex binary' "$CODEX_BIN"
check_path 'workflow file' "$WORKFLOW_PATH"
check_path 'bootstrap script' "$BOOTSTRAP_SCRIPT"
check_path 'codex template' "$CODEX_TEMPLATE"
check_path 'agents override template' "$AGENTS_TEMPLATE"
check_path 'symphony binary' "$SYMPHONY_BIN"
check_value 'LINEAR_API_KEY' "${LINEAR_API_KEY:+set}"
check_value 'SYMPHONY_LINEAR_PROJECT_SLUG' "${SYMPHONY_LINEAR_PROJECT_SLUG:-}"
check_value 'SYMPHONY_SOURCE_REPO_URL' "$SOURCE_REPO"
check_value 'SYMPHONY_WORKSPACE_ROOT' "$WORKSPACE_ROOT"
check_value 'SYMPHONY_LOGS_ROOT' "$LOGS_ROOT"
check_value 'SYMPHONY_PORT' "$PORT"

if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    ok 'gh auth status'
  else
    missing 'gh auth status'
  fi
fi

if [ "$status" -ne 0 ]; then
  printf '\nDoctor failed. Run `npm run symphony:setup`, then export/auth the missing dependencies.\n' >&2
  exit "$status"
fi

printf '\nDoctor passed. Symphony is ready to start.\n'
