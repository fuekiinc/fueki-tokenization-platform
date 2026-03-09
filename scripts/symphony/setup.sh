#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SYMPHONY_ROOT="$REPO_ROOT/tools/symphony"
SYMPHONY_ELIXIR_DIR="$SYMPHONY_ROOT/elixir"
LOCAL_CODEX_DIR="$REPO_ROOT/.codex"
UPSTREAM_URL="${SYMPHONY_UPSTREAM_URL:-https://github.com/openai/symphony.git}"

log() {
  printf '[symphony:setup] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

install_with_brew_if_missing() {
  local cmd="$1"
  local formula="$2"

  if command -v "$cmd" >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v brew >/dev/null 2>&1; then
    printf '%s is not installed and Homebrew is unavailable. Install %s first.\n' "$cmd" "$formula" >&2
    exit 1
  fi

  log "Installing $formula via Homebrew"
  HOMEBREW_NO_AUTO_UPDATE=1 brew install "$formula"
}

sync_upstream_repo() {
  mkdir -p "$REPO_ROOT/tools"

  if [ -d "$SYMPHONY_ROOT/.git" ]; then
    log 'Updating existing Symphony checkout'
    git -C "$SYMPHONY_ROOT" fetch --depth 1 origin main
    git -C "$SYMPHONY_ROOT" reset --hard FETCH_HEAD
  else
    log 'Cloning Symphony upstream'
    git clone --depth 1 "$UPSTREAM_URL" "$SYMPHONY_ROOT"
  fi
}

trust_mise_config() {
  cd "$SYMPHONY_ELIXIR_DIR"

  if mise trust --help 2>/dev/null | grep -q -- '--yes'; then
    mise trust --yes
  else
    printf 'y\n' | mise trust >/dev/null 2>&1 || mise trust
  fi
}

setup_mise_runtime() {
  require_cmd mise
  cd "$SYMPHONY_ELIXIR_DIR"
  log 'Trusting Symphony mise config'
  trust_mise_config
  log 'Installing Elixir/Erlang toolchain via mise'
  mise install
}

build_symphony() {
  cd "$SYMPHONY_ELIXIR_DIR"
  log 'Fetching Elixir dependencies'
  mise exec -- mix setup
  log 'Building Symphony escript'
  mise exec -- mix build
}

install_local_codex_templates() {
  mkdir -p "$LOCAL_CODEX_DIR"

  if [ ! -f "$LOCAL_CODEX_DIR/config.toml" ]; then
    cp "$REPO_ROOT/config/symphony/codex.config.toml" "$LOCAL_CODEX_DIR/config.toml"
  fi
}

sync_local_codex_skills() {
  mkdir -p "$LOCAL_CODEX_DIR/skills"

  for skill in commit push pull land linear; do
    if [ -d "$SYMPHONY_ROOT/.codex/skills/$skill" ]; then
      rm -rf "$LOCAL_CODEX_DIR/skills/$skill"
      cp -R "$SYMPHONY_ROOT/.codex/skills/$skill" "$LOCAL_CODEX_DIR/skills/$skill"
    fi
  done
}

main() {
  require_cmd git
  require_cmd codex
  install_with_brew_if_missing mise mise
  install_with_brew_if_missing gh gh
  install_with_brew_if_missing jq jq
  sync_upstream_repo
  setup_mise_runtime
  build_symphony
  install_local_codex_templates
  sync_local_codex_skills

  log 'Ready'
  log "Workflow: $REPO_ROOT/config/symphony/WORKFLOW.md"
  log 'Doctor: npm run symphony:doctor'
  log 'Run: npm run symphony:run'
}

main "$@"
