#!/usr/bin/env bash
set -euo pipefail

node tests/api/run-contract-validation.mjs "$@"
