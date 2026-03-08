#!/usr/bin/env bash
set -euo pipefail

mkdir -p tests/reports

slither_status="skipped"
mythril_status="skipped"
npm_audit_status="unknown"
security_smoke_status="unknown"

bootstrap_security_tools="${FUEKI_BOOTSTRAP_SECURITY_TOOLS:-true}"

bootstrap_python=""
if command -v python3.11 >/dev/null 2>&1; then
  bootstrap_python="python3.11"
elif command -v python3 >/dev/null 2>&1; then
  bootstrap_python="python3"
fi

if [ "$bootstrap_security_tools" = "true" ] && [ -n "$bootstrap_python" ]; then
  if [ ! -x ".venv-slither/bin/slither" ]; then
    if "$bootstrap_python" -m venv .venv-slither >/dev/null 2>&1 \
      && .venv-slither/bin/pip install --upgrade pip >/dev/null 2>&1 \
      && .venv-slither/bin/pip install slither-analyzer >/dev/null 2>&1; then
      echo "[security] Bootstrapped .venv-slither"
    fi
  fi

  if [ ! -x ".venv-mythril/bin/myth" ]; then
    if "$bootstrap_python" -m venv .venv-mythril >/dev/null 2>&1 \
      && .venv-mythril/bin/pip install --upgrade pip >/dev/null 2>&1 \
      && .venv-mythril/bin/pip install 'mythril==0.24.8' >/dev/null 2>&1; then
      echo "[security] Bootstrapped .venv-mythril"
    fi
  fi
fi

# 1) Dependency audit (never fails the script by itself; findings are reported)
if npm audit --json > tests/reports/npm-audit.json 2>/dev/null; then
  npm_audit_status="ok"
else
  npm_audit_status="findings"
fi

# 2) Security smoke tests (sanitization + secret scanning checks)
if VITEST_JSON_OUTPUT_FILE=./tests/reports/vitest-security-results.json \
  npx vitest run --project security --config vitest.config.ts; then
  security_smoke_status="ok"
else
  security_smoke_status="failed"
fi

# 3) Slither static analysis (if available)
slither_bin=""
if command -v slither >/dev/null 2>&1; then
  slither_bin="$(command -v slither)"
elif [ -x ".venv-slither/bin/slither" ]; then
  slither_bin=".venv-slither/bin/slither"
fi

if [ -n "$slither_bin" ]; then
  if [ -x ".venv-slither/bin/solc-select" ]; then
    .venv-slither/bin/solc-select install 0.8.20 >/dev/null 2>&1 || true
    .venv-slither/bin/solc-select use 0.8.20 >/dev/null 2>&1 || true
    export PATH="$HOME/.solc-select/usr/bin:$PATH"
  fi

  if "$slither_bin" contracts --config-file tests/security/slither.config.json --json tests/reports/slither-findings.json > tests/reports/slither.stdout.log 2> tests/reports/slither.stderr.log; then
    slither_status="ok"
  else
    slither_status="findings"
  fi
else
  slither_status="unavailable"
fi

# 4) Mythril symbolic execution (if available)
myth_bin=""
if command -v myth >/dev/null 2>&1; then
  myth_bin="$(command -v myth)"
elif [ -x ".venv-mythril/bin/myth" ]; then
  myth_bin=".venv-mythril/bin/myth"
fi

if [ -n "$myth_bin" ]; then
  mkdir -p tests/reports/mythril
  rm -f tests/reports/mythril/solc-settings.json
  cat > tests/reports/mythril-solc-settings.json <<'JSON'
{"optimizer":{"enabled":true,"runs":200},"viaIR":true,"remappings":["@openzeppelin/=node_modules/@openzeppelin/"]}
JSON
  mythril_status="ok"
  while IFS= read -r target; do
    [ -z "$target" ] && continue
    file_path="${target%%:*}"
    contract_name="${target##*:}"
    myth_target="${file_path}:${contract_name}"
    out_file="tests/reports/mythril/${contract_name}.json"
    err_file="tests/reports/mythril/${contract_name}.stderr.log"
    set +e
    "$myth_bin" analyze "$myth_target" \
      --solv 0.8.20 \
      --solc-args "--base-path . --include-path node_modules --allow-paths .,node_modules" \
      --solc-json tests/reports/mythril-solc-settings.json \
      --execution-timeout 90 \
      -o json > "$out_file" 2> "$err_file"
    exit_code=$?
    set -e

    # Mythril exits non-zero when issues are found. Treat JSON success as a
    # completed analysis and classify findings separately.
    if jq -e '.success == true' "$out_file" >/dev/null 2>&1; then
      if jq -e '(.issues // [] | length) > 0' "$out_file" >/dev/null 2>&1; then
        mythril_status="findings"
      fi
      continue
    fi

    mythril_status="findings"
    if [ ! -s "$out_file" ] || ! jq -e '.' "$out_file" >/dev/null 2>&1; then
      cat > "$out_file" <<JSON
{"contract":"${contract_name}","file":"${file_path}","status":"analysis_failed","stderr":"${err_file}"}
JSON
    fi
  done < tests/security/mythril-targets.txt
else
  mythril_status="unavailable"
fi

NPM_AUDIT_STATUS="$npm_audit_status" \
SECURITY_SMOKE_STATUS="$security_smoke_status" \
SLITHER_STATUS="$slither_status" \
MYTHRIL_STATUS="$mythril_status" \
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function summarizeNpmAudit(filePath) {
  const data = readJson(filePath);
  if (!data) {
    return { available: false };
  }
  const vulnerabilities = data.metadata?.vulnerabilities ?? {};
  return {
    available: true,
    totals: {
      info: Number(vulnerabilities.info ?? 0),
      low: Number(vulnerabilities.low ?? 0),
      moderate: Number(vulnerabilities.moderate ?? 0),
      high: Number(vulnerabilities.high ?? 0),
      critical: Number(vulnerabilities.critical ?? 0),
      total: Number(vulnerabilities.total ?? 0),
    },
  };
}

function summarizeSlither(filePath) {
  const data = readJson(filePath);
  if (!data) {
    return { available: false };
  }
  const detectors = Array.isArray(data.results?.detectors)
    ? data.results.detectors
    : [];
  const byImpact = {};
  const byConfidence = {};
  for (const detector of detectors) {
    const impact = detector.impact || 'Unknown';
    const confidence = detector.confidence || 'Unknown';
    byImpact[impact] = Number(byImpact[impact] ?? 0) + 1;
    byConfidence[confidence] = Number(byConfidence[confidence] ?? 0) + 1;
  }
  return {
    available: true,
    totalFindings: detectors.length,
    byImpact,
    byConfidence,
  };
}

function summarizeMythril(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { available: false, contracts: [] };
  }
  const files = fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith('.json'))
    .filter((file) => file !== 'solc-settings.json');
  const contracts = [];
  let completed = 0;
  let failed = 0;
  let parseErrors = 0;
  let issueCount = 0;
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const data = readJson(fullPath);
    if (!data) {
      parseErrors += 1;
      failed += 1;
      contracts.push({
        contract: file.replace(/\.json$/i, ''),
        file: fullPath,
        status: 'parse_error',
        issues: 0,
      });
      continue;
    }
    const issues = Array.isArray(data.issues) ? data.issues.length : 0;
    issueCount += issues;
    const success = data.success === true;
    const status = success ? (issues > 0 ? 'issues' : 'ok') : 'analysis_failed';
    if (success) {
      completed += 1;
    } else {
      failed += 1;
    }
    contracts.push({
      contract: data.contract ?? file.replace(/\.json$/i, ''),
      file: fullPath,
      status,
      issues,
      error: success ? null : (typeof data.error === 'string' ? data.error : null),
    });
  }

  return {
    available: true,
    totalContracts: files.length,
    completedContracts: completed,
    failedContracts: failed,
    parseErrors,
    totalIssues: issueCount,
    contracts,
  };
}

const npmAuditFile = 'tests/reports/npm-audit.json';
const slitherFile = 'tests/reports/slither-findings.json';
const mythrilDir = 'tests/reports/mythril';

const npmAuditSummary = summarizeNpmAudit(npmAuditFile);
const slitherSummary = summarizeSlither(slitherFile);
const mythrilSummary = summarizeMythril(mythrilDir);

const report = {
  generatedAt: new Date().toISOString(),
  npmAuditStatus: process.env.NPM_AUDIT_STATUS,
  securitySmokeStatus: process.env.SECURITY_SMOKE_STATUS,
  slitherStatus: process.env.SLITHER_STATUS,
  mythrilStatus: process.env.MYTHRIL_STATUS,
  summaries: {
    npmAudit: npmAuditSummary,
    slither: slitherSummary,
    mythril: mythrilSummary,
  },
  files: {
    npmAudit: fs.existsSync(npmAuditFile) ? npmAuditFile : null,
    slitherJson: fs.existsSync(slitherFile) ? slitherFile : null,
    mythrilDir: fs.existsSync(mythrilDir) ? mythrilDir : null,
  },
};

fs.writeFileSync('tests/reports/security-findings.json', JSON.stringify(report, null, 2));
console.log('[security] Wrote tests/reports/security-findings.json');
NODE

if [ "$security_smoke_status" = "failed" ]; then
  echo "[security] security smoke checks failed"
  exit 1
fi
