#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const reportsDir = path.resolve('tests/reports');
const testResultsPath = path.join(reportsDir, 'test-results.json');
const outPath = path.join(reportsDir, 'full-testing-suite-results.md');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function formatPct(value) {
  return typeof value === 'number' ? `${value.toFixed(2)}%` : 'n/a';
}

const results = readJson(testResultsPath);
if (!results) {
  console.error(`[full-report] Missing or invalid ${testResultsPath}`);
  process.exit(1);
}

const readiness = results.summary?.productionReadiness ?? {};
const vitest = results.summary?.vitest ?? {};
const coverage = results.summary?.coverage ?? {};
const gas = readJson(path.join(reportsDir, 'gas-report.json'));
const performance = readJson(path.join(reportsDir, 'performance-report.json'));
const security = readJson(path.join(reportsDir, 'security-findings.json'));
const walletSimulation = readJson(path.join(reportsDir, 'wallet-simulation.json'));
const apiLoad = readJson(path.join(reportsDir, 'api-load-report.json'));
const newman = readJson(path.join(reportsDir, 'newman-report.json'));

const walletChains = Array.isArray(walletSimulation?.chains) ? walletSimulation.chains : [];
const walletSummary = {
  total: walletChains.length,
  ok: walletChains.filter((c) => c.skipped !== true && !(c.walletBalances ?? []).some((b) => b.error)).length,
  skipped: walletChains.filter((c) => c.skipped === true).length,
  error: walletChains.filter((c) => c.skipped !== true && (c.walletBalances ?? []).some((b) => b.error)).length,
};

const markdown = `# Full Testing Suite Results (Consolidated)

Generated at: \`${new Date().toISOString()}\`  
Data source: \`tests/reports\`.

## 1) Executive Summary

- Production readiness: **${readiness.ready ? 'READY' : 'NOT READY'}**
- Blockers: ${
  Array.isArray(readiness.blockers) && readiness.blockers.length
    ? readiness.blockers.map((item) => `\`${item}\``).join(', ')
    : 'None'
}
- Artifact completeness: ${
  Object.values(results.reports ?? {}).every((value) => value === 'present')
    ? '**Complete**'
    : '**Partial**'
}

## 2) Vitest & Backend Tests

- Workspace suites: \`${vitest.workspace?.numPassedTestSuites ?? 0}/${vitest.workspace?.numTotalTestSuites ?? 0}\` passed
- Workspace tests: \`${vitest.workspace?.numPassedTests ?? 0}/${vitest.workspace?.numTotalTests ?? 0}\` passed
- API suites: \`${vitest.api?.numPassedTestSuites ?? 0}/${vitest.api?.numTotalTestSuites ?? 0}\` passed
- Security suites: \`${vitest.security?.numPassedTestSuites ?? 0}/${vitest.security?.numTotalTestSuites ?? 0}\` passed
- Backend suites: \`${vitest.backend?.numPassedTestSuites ?? 0}/${vitest.backend?.numTotalTestSuites ?? 0}\` passed

## 3) Coverage (Frontend + Backend Merged)

- Lines: \`${coverage.lines?.covered ?? 0}/${coverage.lines?.total ?? 0}\` (${formatPct(coverage.lines?.pct)})
- Statements: \`${coverage.statements?.covered ?? 0}/${coverage.statements?.total ?? 0}\` (${formatPct(coverage.statements?.pct)})
- Branches: \`${coverage.branches?.covered ?? 0}/${coverage.branches?.total ?? 0}\` (${formatPct(coverage.branches?.pct)})
- Functions: \`${coverage.functions?.covered ?? 0}/${coverage.functions?.total ?? 0}\` (${formatPct(coverage.functions?.pct)})
- Threshold gate: **${readiness.gates?.coverage?.pass ? 'Pass' : 'Fail'}**

## 4) Security

- Security smoke: \`${security?.securitySmokeStatus ?? 'unknown'}\`
- npm audit status: \`${security?.npmAuditStatus ?? 'unknown'}\`
- Slither status: \`${security?.slitherStatus ?? 'unknown'}\`
- Mythril status: \`${security?.mythrilStatus ?? 'unknown'}\`
- npm audit totals: \`high=${security?.summaries?.npmAudit?.totals?.high ?? 'n/a'}\`, \`critical=${security?.summaries?.npmAudit?.totals?.critical ?? 'n/a'}\`
- Slither findings: \`${security?.summaries?.slither?.totalFindings ?? 'n/a'}\`
- Mythril completed contracts: \`${security?.summaries?.mythril?.completedContracts ?? 'n/a'} / ${security?.summaries?.mythril?.totalContracts ?? 'n/a'}\`

## 5) Gas Benchmarks

- Completeness: **${gas?.completeness?.isComplete ? 'Complete' : 'Incomplete'}**
- Missing benchmarks: ${
  Array.isArray(gas?.completeness?.missingBenchmarks) && gas.completeness.missingBenchmarks.length
    ? gas.completeness.missingBenchmarks.map((item) => `\`${item}\``).join(', ')
    : 'None'
}
- Target evaluation: \`${Object.entries(gas?.evaluation ?? {})
  .map(([name, entry]) => `${name}:${entry?.status ?? 'n/a'}`)
  .join(', ')}\`

## 6) Performance / Lighthouse

- Parsed pages: \`${performance?.summary?.parsedPages ?? 0}\`
- Passing pages: \`${performance?.summary?.passingPages ?? 0}\`
- Failing pages: \`${performance?.summary?.failingPages ?? 0}\`
- Performance gate: **${readiness.gates?.performance?.pass ? 'Pass' : 'Fail'}**

## 7) API Contract & Load

- Newman executions: \`${newman?.run?.executions?.length ?? 0}\`
- Newman assertions: \`${newman?.run?.stats?.assertions?.total ?? 0}\` (failed: \`${newman?.run?.stats?.assertions?.failed ?? 0}\`)
- Load runner: \`${apiLoad?.runner ?? 'unknown'}\`
- Load success: \`${apiLoad?.ok ?? 'unknown'}\`

## 8) Wallet Simulation

- Chains tested: \`${walletSummary.total}\`
- OK: \`${walletSummary.ok}\`
- Error: \`${walletSummary.error}\`
- Skipped: \`${walletSummary.skipped}\`

## 9) Overall Production Readiness Interpretation

Current snapshot indicates:
- Infrastructure for comprehensive reporting is in place.
- Core automated checks are running consistently.
- Production readiness is **${readiness.ready ? 'complete' : 'not yet complete'}**${
  Array.isArray(readiness.blockers) && readiness.blockers.length
    ? ` due to:\n${readiness.blockers.map((item) => `  - ${item}`).join('\n')}`
    : '.'
}
`;

fs.writeFileSync(outPath, markdown);
console.log(`[full-report] Wrote ${outPath}`);
