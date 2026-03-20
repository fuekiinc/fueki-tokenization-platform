#!/usr/bin/env bash
set -euo pipefail

mkdir -p tests/reports

slither_status="skipped"
mythril_status="skipped"
npm_audit_status="unknown"
security_smoke_status="unknown"

bootstrap_security_tools="${FUEKI_BOOTSTRAP_SECURITY_TOOLS:-true}"

bootstrap_python=""
if command -v python3.13 >/dev/null 2>&1; then
  bootstrap_python="python3.13"
elif command -v python3.12 >/dev/null 2>&1; then
  bootstrap_python="python3.12"
elif command -v python3.11 >/dev/null 2>&1; then
  bootstrap_python="python3.11"
elif command -v python3 >/dev/null 2>&1; then
  bootstrap_python="python3"
fi

timeout_bin=""
for candidate in timeout gtimeout /opt/homebrew/bin/timeout /opt/homebrew/bin/gtimeout; do
  if command -v "$candidate" >/dev/null 2>&1; then
    timeout_bin="$(command -v "$candidate")"
    break
  fi
done

ensure_python_tool_venv() {
  local venv_dir="$1"
  local entrypoint="$2"
  shift 2
  local install_args=("$@")
  local entry="${venv_dir}/bin/${entrypoint}"
  local python_bin="${venv_dir}/bin/python"
  local needs_bootstrap="false"

  if [ ! -x "$entry" ] || [ ! -x "$python_bin" ]; then
    needs_bootstrap="true"
  elif ! "$entry" --version >/dev/null 2>&1; then
    needs_bootstrap="true"
  fi

  if [ "$needs_bootstrap" = "true" ]; then
    rm -rf "$venv_dir"
    if "$bootstrap_python" -m venv "$venv_dir" >/dev/null 2>&1 \
      && "$python_bin" -m pip install --upgrade pip >/dev/null 2>&1 \
      && "$python_bin" -m pip install "setuptools<81" >/dev/null 2>&1 \
      && "$python_bin" -m pip install "${install_args[@]}" >/dev/null 2>&1; then
      echo "[security] Bootstrapped ${venv_dir}"
    else
      echo "[security] Failed to bootstrap ${venv_dir}" >&2
    fi
  fi
}

if [ "$bootstrap_security_tools" = "true" ] && [ -n "$bootstrap_python" ]; then
  ensure_python_tool_venv ".venv-slither" "slither" "slither-analyzer"
  ensure_python_tool_venv ".venv-mythril" "myth" "mythril==0.24.8"
fi

# 1) Dependency audit (never fails the script by itself; findings are reported)
if npm audit --json > tests/reports/npm-audit.json 2>/dev/null; then
  npm_audit_status="ok"
else
  npm_audit_status="findings"
fi

npm_audit_runtime_status="unknown"
if npm audit --omit=dev --json > tests/reports/npm-audit-runtime.json 2>/dev/null; then
  npm_audit_runtime_status="ok"
else
  npm_audit_runtime_status="findings"
fi

backend_npm_audit_runtime_status="unknown"
if npm --prefix backend audit --omit=dev --json > tests/reports/backend-npm-audit-runtime.json 2>/dev/null; then
  backend_npm_audit_runtime_status="ok"
else
  backend_npm_audit_runtime_status="findings"
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
  rm -f tests/reports/mythril/*.json tests/reports/mythril/*.stderr.log
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
    mythril_timeout="${FUEKI_MYTHRIL_WALL_TIMEOUT:-120s}"
    set +e
    if [ -n "$timeout_bin" ]; then
      "$timeout_bin" "$mythril_timeout" \
        "$myth_bin" analyze "$myth_target" \
          --solv 0.8.20 \
          --solc-args "--base-path . --include-path node_modules --allow-paths .,node_modules" \
          --solc-json tests/reports/mythril-solc-settings.json \
          --execution-timeout 90 \
          -t 1 \
          -b 2 \
          --max-depth 16 \
          -o json > "$out_file" 2> "$err_file"
    else
      "$myth_bin" analyze "$myth_target" \
        --solv 0.8.20 \
        --solc-args "--base-path . --include-path node_modules --allow-paths .,node_modules" \
        --solc-json tests/reports/mythril-solc-settings.json \
        --execution-timeout 90 \
        -t 1 \
        -b 2 \
        --max-depth 16 \
        -o json > "$out_file" 2> "$err_file"
    fi
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
      failure_reason="analysis_failed"
      if [ "$exit_code" -eq 124 ] || [ "$exit_code" -eq 137 ]; then
        failure_reason="timed_out"
      fi
      cat > "$out_file" <<JSON
{"contract":"${contract_name}","file":"${file_path}","status":"analysis_failed","error":"${failure_reason}","stderr":"${err_file}"}
JSON
    fi
  done < tests/security/mythril-targets.txt
else
  mythril_status="unavailable"
fi

NPM_AUDIT_STATUS="$npm_audit_status" \
NPM_AUDIT_RUNTIME_STATUS="$npm_audit_runtime_status" \
BACKEND_NPM_AUDIT_RUNTIME_STATUS="$backend_npm_audit_runtime_status" \
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

function summarizeSlither(filePath, reviewConfig) {
  const data = readJson(filePath);
  if (!data) {
    return { available: false };
  }
  const detectors = Array.isArray(data.results?.detectors)
    ? data.results.detectors
    : [];
  const byImpact = {};
  const byConfidence = {};
  const reviewedFindings = [];
  const productionFindings = [];
  const productionContracts = new Set(
    Array.isArray(reviewConfig?.productionContracts)
      ? reviewConfig.productionContracts
      : [],
  );
  const reviewedEntries = Array.isArray(reviewConfig?.reviewedFindings)
    ? reviewConfig.reviewedFindings
    : [];

  function toFindingSummary(detector, reason = null) {
    const element = detector.elements?.[0]?.source_mapping ?? {};
    return {
      check: detector.check ?? 'unknown',
      impact: detector.impact ?? 'Unknown',
      confidence: detector.confidence ?? 'Unknown',
      file: element.filename_relative ?? 'unknown',
      line: Number(element.lines?.[0] ?? 0),
      description: typeof detector.description === 'string' ? detector.description : '',
      reason,
    };
  }

  function matchReviewedFinding(detector) {
    const element = detector.elements?.[0]?.source_mapping ?? {};
    const file = element.filename_relative ?? 'unknown';
    const line = Number(element.lines?.[0] ?? 0);
    const check = detector.check ?? 'unknown';

    return reviewedEntries.find((entry) => (
      entry &&
      entry.check === check &&
      entry.file === file &&
      Number(entry.line ?? 0) === line
    )) ?? null;
  }

  for (const detector of detectors) {
    const impact = detector.impact || 'Unknown';
    const confidence = detector.confidence || 'Unknown';
    byImpact[impact] = Number(byImpact[impact] ?? 0) + 1;
    byConfidence[confidence] = Number(byConfidence[confidence] ?? 0) + 1;

    const file = detector.elements?.[0]?.source_mapping?.filename_relative ?? 'unknown';
    const reviewed = matchReviewedFinding(detector);
    if (reviewed) {
      reviewedFindings.push(toFindingSummary(detector, reviewed.reason ?? null));
    }
    if (productionContracts.has(file)) {
      productionFindings.push({
        detector,
        reviewed: Boolean(reviewed),
      });
    }
  }

  const productionByImpact = {};
  const unresolvedProductionByImpact = {};
  const unresolvedProductionHighFindings = [];

  for (const entry of productionFindings) {
    const impact = entry.detector.impact || 'Unknown';
    productionByImpact[impact] = Number(productionByImpact[impact] ?? 0) + 1;
    if (entry.reviewed) {
      continue;
    }
    unresolvedProductionByImpact[impact] =
      Number(unresolvedProductionByImpact[impact] ?? 0) + 1;
    if (impact === 'High') {
      unresolvedProductionHighFindings.push(toFindingSummary(entry.detector));
    }
  }

  return {
    available: true,
    totalFindings: detectors.length,
    byImpact,
    byConfidence,
    reviewedFindings,
    productionContracts: {
      totalFindings: productionFindings.length,
      byImpact: productionByImpact,
      reviewedFindings: reviewedFindings.filter((finding) =>
        productionContracts.has(finding.file),
      ),
      unresolvedByImpact: unresolvedProductionByImpact,
      unresolvedHighFindings: unresolvedProductionHighFindings,
    },
  };
}

function summarizeMythril(dirPath, reviewConfig) {
  if (!fs.existsSync(dirPath)) {
    return { available: false, contracts: [] };
  }
  const files = fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith('.json'))
    .filter((file) => file !== 'solc-settings.json');
  const reviewedEntries = Array.isArray(reviewConfig?.reviewedFindings)
    ? reviewConfig.reviewedFindings
    : [];
  const contracts = [];
  let completed = 0;
  let failed = 0;
  let parseErrors = 0;
  let issueCount = 0;
  const reviewedFindings = [];
  const unresolvedBySeverity = {};
  const unresolvedFindings = [];

  function matchReviewedFinding(contractName, issue) {
    return reviewedEntries.find((entry) => (
      entry &&
      entry.contract === contractName &&
      entry.title === issue.title &&
      entry.severity === issue.severity &&
      entry.function === issue.function
    )) ?? null;
  }

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
    const contractName = data.contract ?? file.replace(/\.json$/i, '');
    if (success) {
      completed += 1;
    } else {
      failed += 1;
    }

    if (success && Array.isArray(data.issues)) {
      for (const issue of data.issues) {
        const reviewed = matchReviewedFinding(contractName, issue);
        if (reviewed) {
          reviewedFindings.push({
            contract: contractName,
            title: issue.title ?? 'unknown',
            severity: issue.severity ?? 'Unknown',
            function: issue.function ?? 'unknown',
            reason: reviewed.reason ?? null,
          });
          continue;
        }

        const severity = issue.severity ?? 'Unknown';
        unresolvedBySeverity[severity] = Number(unresolvedBySeverity[severity] ?? 0) + 1;
        unresolvedFindings.push({
          contract: contractName,
          title: issue.title ?? 'unknown',
          severity,
          function: issue.function ?? 'unknown',
        });
      }
    }

    contracts.push({
      contract: contractName,
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
    reviewedFindings,
    unresolvedBySeverity,
    unresolvedFindings,
    contracts,
  };
}

const npmAuditFile = 'tests/reports/npm-audit.json';
const npmAuditRuntimeFile = 'tests/reports/npm-audit-runtime.json';
const backendNpmAuditRuntimeFile = 'tests/reports/backend-npm-audit-runtime.json';
const slitherFile = 'tests/reports/slither-findings.json';
const mythrilDir = 'tests/reports/mythril';
const slitherReviewFile = 'tests/security/slither-reviewed-findings.json';
const mythrilReviewFile = 'tests/security/mythril-reviewed-findings.json';

const npmAuditSummary = summarizeNpmAudit(npmAuditFile);
const npmAuditRuntimeSummary = summarizeNpmAudit(npmAuditRuntimeFile);
const backendNpmAuditRuntimeSummary = summarizeNpmAudit(backendNpmAuditRuntimeFile);
const slitherSummary = summarizeSlither(slitherFile, readJson(slitherReviewFile) ?? {});
const mythrilSummary = summarizeMythril(mythrilDir, readJson(mythrilReviewFile) ?? {});

const report = {
  generatedAt: new Date().toISOString(),
  npmAuditStatus: process.env.NPM_AUDIT_STATUS,
  npmAuditRuntimeStatus: process.env.NPM_AUDIT_RUNTIME_STATUS,
  backendNpmAuditRuntimeStatus: process.env.BACKEND_NPM_AUDIT_RUNTIME_STATUS,
  securitySmokeStatus: process.env.SECURITY_SMOKE_STATUS,
  slitherStatus: process.env.SLITHER_STATUS,
  mythrilStatus: process.env.MYTHRIL_STATUS,
  summaries: {
    npmAudit: npmAuditSummary,
    npmAuditRuntime: npmAuditRuntimeSummary,
    backendNpmAuditRuntime: backendNpmAuditRuntimeSummary,
    slither: slitherSummary,
    mythril: mythrilSummary,
  },
  files: {
    npmAudit: fs.existsSync(npmAuditFile) ? npmAuditFile : null,
    npmAuditRuntime: fs.existsSync(npmAuditRuntimeFile) ? npmAuditRuntimeFile : null,
    backendNpmAuditRuntime: fs.existsSync(backendNpmAuditRuntimeFile)
      ? backendNpmAuditRuntimeFile
      : null,
    slitherJson: fs.existsSync(slitherFile) ? slitherFile : null,
    slitherReview: fs.existsSync(slitherReviewFile) ? slitherReviewFile : null,
    mythrilReview: fs.existsSync(mythrilReviewFile) ? mythrilReviewFile : null,
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
