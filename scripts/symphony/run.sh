#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKFLOW_PATH="$REPO_ROOT/config/symphony/WORKFLOW.md"
SYMPHONY_ELIXIR_DIR="$REPO_ROOT/tools/symphony/elixir"
SYMPHONY_BIN="$SYMPHONY_ELIXIR_DIR/bin/symphony"
LOGS_ROOT="${SYMPHONY_LOGS_ROOT:-${XDG_STATE_HOME:-$HOME/.local/state}/fueki-tokenization-platform/symphony}"
WORKSPACE_ROOT="${SYMPHONY_WORKSPACE_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/fueki-tokenization-platform/symphony-workspaces}"
PORT="${SYMPHONY_PORT:-4177}"
RUNTIME_WORKFLOW_PATH=""

render_runtime_workflow() {
  local runtime_workflow_path="$LOGS_ROOT/WORKFLOW.runtime.md"

  python3 - "$WORKFLOW_PATH" "$runtime_workflow_path" "$SYMPHONY_LINEAR_PROJECT_SLUG" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1])
target = Path(sys.argv[2])
slug = sys.argv[3]
content = source.read_text()
content = content.replace('$SYMPHONY_LINEAR_PROJECT_SLUG', slug)
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(content)
PY

  RUNTIME_WORKFLOW_PATH="$runtime_workflow_path"
}

if [ ! -x "$SYMPHONY_BIN" ]; then
  "$REPO_ROOT/scripts/symphony/setup.sh"
fi

if [ -z "${LINEAR_API_KEY:-}" ]; then
  printf 'LINEAR_API_KEY is required.\n' >&2
  exit 1
fi

if [ -z "${SYMPHONY_LINEAR_PROJECT_SLUG:-}" ]; then
  printf 'SYMPHONY_LINEAR_PROJECT_SLUG is required.\n' >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1 && [ -z "${CODEX_BIN:-}" ]; then
  printf 'codex is required. Install Codex or export CODEX_BIN.\n' >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
  printf 'gh with authenticated GitHub access is required for full Symphony PR automation.\n' >&2
  exit 1
fi

export CODEX_BIN="${CODEX_BIN:-$(command -v codex)}"
export SYMPHONY_REPO_ROOT="$REPO_ROOT"
export SYMPHONY_SOURCE_REPO_URL="${SYMPHONY_SOURCE_REPO_URL:-$REPO_ROOT}"
export SYMPHONY_WORKSPACE_ROOT="$WORKSPACE_ROOT"
export SYMPHONY_GITHUB_REPO="${SYMPHONY_GITHUB_REPO:-$(git -C "$REPO_ROOT" remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')}"

mkdir -p "$LOGS_ROOT" "$WORKSPACE_ROOT"
render_runtime_workflow

cd "$SYMPHONY_ELIXIR_DIR"
exec mise exec -- ./bin/symphony \
  --i-understand-that-this-will-be-running-without-the-usual-guardrails \
  --logs-root "$LOGS_ROOT" \
  --port "$PORT" \
  "$RUNTIME_WORKFLOW_PATH"
