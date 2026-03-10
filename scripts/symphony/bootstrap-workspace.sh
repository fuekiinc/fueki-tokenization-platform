#!/usr/bin/env bash
set -euo pipefail

copy_if_exists() {
  local source_path="$1"
  local destination_path="$2"
  if [ -e "$source_path" ]; then
    mkdir -p "$(dirname "$destination_path")"
    cp -R "$source_path" "$destination_path"
  fi
}

merge_dir_if_exists() {
  local source_dir="$1"
  local destination_dir="$2"
  if [ -d "$source_dir" ]; then
    mkdir -p "$destination_dir"
    cp -R "$source_dir/." "$destination_dir/"
  fi
}

if [ -d "${SYMPHONY_REPO_ROOT:-}/.codex" ]; then
  merge_dir_if_exists "${SYMPHONY_REPO_ROOT}/.codex" .codex
fi

if [ -f config/symphony/codex.config.toml ] && [ ! -f .codex/config.toml ]; then
  mkdir -p .codex
  cp config/symphony/codex.config.toml .codex/config.toml
fi

if [ -f "${SYMPHONY_REPO_ROOT:-}/AGENTS.override.md" ]; then
  copy_if_exists "${SYMPHONY_REPO_ROOT}/AGENTS.override.md" AGENTS.override.md
elif [ -f config/symphony/AGENTS.override.md ]; then
  copy_if_exists config/symphony/AGENTS.override.md AGENTS.override.md
fi

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

if [ -d backend ]; then
  (
    cd backend
    if [ -f package-lock.json ]; then
      npm ci
    else
      npm install
    fi
  )
fi
