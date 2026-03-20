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

function formatPct(metric) {
  return typeof metric?.pct === 'number' ? `${metric.pct.toFixed(2)}%` : 'n/a';
}

function formatFraction(metric) {
  return metric ? `${metric.covered ?? 0}/${metric.total ?? 0}` : 'n/a';
}

function formatScore(value) {
  return typeof value === 'number' ? value.toFixed(2) : 'n/a';
}

function formatCount(value) {
  return typeof value === 'number' ? String(value) : 'n/a';
}

function makeTable(headers, rows) {
  const headerLine = `| ${headers.join(' | ')} |`;
  const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return `${headerLine}\n${dividerLine}\n${body}`;
}

const results = readJson(testResultsPath);
if (!results) {
  console.error(`[full-report] Missing or invalid ${testResultsPath}`);
  process.exit(1);
}

const readiness = results.summary?.productionReadiness ?? {};
const vitest = results.summary?.vitest ?? {};
const coverage = results.summary?.coverage ?? {};
const security = readJson(path.join(reportsDir, 'security-findings.json'));
const performance = readJson(path.join(reportsDir, 'performance-report.json'));
const gas = readJson(path.join(reportsDir, 'gas-report.json'));
const walletSimulation = readJson(path.join(reportsDir, 'wallet-simulation.json'));
const apiLoad = readJson(path.join(reportsDir, 'api-load-report.json'));
const newman = readJson(path.join(reportsDir, 'newman-report.json'));

const walletChains = Array.isArray(walletSimulation?.chains) ? walletSimulation.chains : [];
const walletSummary = {
  total: walletChains.length,
  ok: walletChains.filter((chain) =>
    chain.skipped !== true &&
    !(chain.walletBalances ?? []).some((balance) => balance.error),
  ).length,
  skipped: walletChains.filter((chain) => chain.skipped === true).length,
  error: walletChains.filter((chain) =>
    chain.skipped !== true &&
    (chain.walletBalances ?? []).some((balance) => balance.error),
  ).length,
};

const stageTable = makeTable(
  ['Stage', 'Result'],
  [
    [
      'Workspace tests',
      `${vitest.workspace?.success ? 'PASS' : 'FAIL'} (${vitest.workspace?.numPassedTests ?? 0}/${vitest.workspace?.numTotalTests ?? 0} tests)`,
    ],
    [
      'API tests',
      `${vitest.api?.success ? 'PASS' : 'FAIL'} (${vitest.api?.numPassedTests ?? 0}/${vitest.api?.numTotalTests ?? 0} tests)`,
    ],
    [
      'Security smoke',
      `${vitest.security?.success ? 'PASS' : 'FAIL'} (${vitest.security?.numPassedTests ?? 0}/${vitest.security?.numTotalTests ?? 0} tests)`,
    ],
    [
      'Backend tests',
      `${vitest.backend?.success ? 'PASS' : 'FAIL'} (${vitest.backend?.numPassedTests ?? 0}/${vitest.backend?.numTotalTests ?? 0} tests)`,
    ],
    [
      'API contract checks',
      `${newman?.run?.stats?.assertions?.failed ? 'FAIL' : 'PASS'} (${newman?.run?.stats?.assertions?.total ?? 0} assertions)`,
    ],
    [
      'API load',
      `${apiLoad?.ok === true ? 'PASS' : 'FAIL'} (${apiLoad?.runner ?? 'unknown'})`,
    ],
    [
      'Performance gate',
      readiness.gates?.performance?.pass ? 'PASS' : 'FAIL',
    ],
    [
      'Gas gate',
      readiness.gates?.gas?.pass ? 'PASS' : 'FAIL',
    ],
    [
      'Wallet simulation',
      walletSummary.error === 0 ? `PASS (${walletSummary.ok}/${walletSummary.total} chains)` : `FAIL (${walletSummary.error} chains errored)`,
    ],
  ],
);

const globalCoverage = coverage.global ?? {};
const criticalCoverage = coverage.criticalPaths ?? {};
const coverageDebt = coverage.debtReport ?? {};
const securityGate = readiness.gates?.security ?? {};
const performancePages = Array.isArray(readiness.gates?.performance?.pages)
  ? readiness.gates.performance.pages
  : [];

const blockers = Array.isArray(readiness.blockers) ? readiness.blockers : [];

const markdown = `# Full Testing Suite Results

Generated at: \`${results.generatedAt}\`  
Report root: \`tests/reports\`

## Executive Summary

- Production readiness: **${readiness.ready ? 'READY' : 'NOT READY'}**
- Blocking issues: ${blockers.length ? blockers.map((item) => `\`${item}\``).join(', ') : 'None'}
- Artifact completeness: ${Object.values(results.reports ?? {}).every((value) => value === 'present') ? '**Complete**' : '**Partial**'}

${stageTable}

## Coverage

### Critical Path Gate

${makeTable(
  ['Metric', 'Measured', 'Threshold', 'Pass'],
  [
    ['Lines', `${formatFraction(criticalCoverage.measured?.lines)} (${formatPct(criticalCoverage.measured?.lines)})`, `${criticalCoverage.thresholds?.lines ?? 'n/a'}%`, criticalCoverage.pass ? 'YES' : 'NO'],
    ['Statements', `${formatFraction(criticalCoverage.measured?.statements)} (${formatPct(criticalCoverage.measured?.statements)})`, `${criticalCoverage.thresholds?.statements ?? 'n/a'}%`, criticalCoverage.pass ? 'YES' : 'NO'],
    ['Branches', `${formatFraction(criticalCoverage.measured?.branches)} (${formatPct(criticalCoverage.measured?.branches)})`, `${criticalCoverage.thresholds?.branches ?? 'n/a'}%`, criticalCoverage.pass ? 'YES' : 'NO'],
    ['Functions', `${formatFraction(criticalCoverage.measured?.functions)} (${formatPct(criticalCoverage.measured?.functions)})`, `${criticalCoverage.thresholds?.functions ?? 'n/a'}%`, criticalCoverage.pass ? 'YES' : 'NO'],
  ],
)}

- Critical files matched: \`${criticalCoverage.matchedFiles ?? 0}\`
- Missing critical files: ${
  Array.isArray(criticalCoverage.missingFiles) && criticalCoverage.missingFiles.length
    ? criticalCoverage.missingFiles.map((file) => `\`${file}\``).join(', ')
    : 'None'
}

### Global Coverage Debt

${makeTable(
  ['Metric', 'Measured', 'Legacy target'],
  [
    ['Lines', `${formatFraction(globalCoverage.lines)} (${formatPct(globalCoverage.lines)})`, `${readiness.gates?.coverage?.globalCoverageDebt?.thresholds?.lines ?? 'n/a'}%`],
    ['Statements', `${formatFraction(globalCoverage.statements)} (${formatPct(globalCoverage.statements)})`, `${readiness.gates?.coverage?.globalCoverageDebt?.thresholds?.statements ?? 'n/a'}%`],
    ['Branches', `${formatFraction(globalCoverage.branches)} (${formatPct(globalCoverage.branches)})`, `${readiness.gates?.coverage?.globalCoverageDebt?.thresholds?.branches ?? 'n/a'}%`],
    ['Functions', `${formatFraction(globalCoverage.functions)} (${formatPct(globalCoverage.functions)})`, `${readiness.gates?.coverage?.globalCoverageDebt?.thresholds?.functions ?? 'n/a'}%`],
  ],
)}

- Global coverage debt status: **${readiness.gates?.coverage?.globalCoverageDebt?.pass ? 'Within legacy target' : 'Tracked advisory backlog'}**
- Production readiness uses the critical-path gate above. Repo-wide debt remains visible here and in \`tests/reports/coverage-debt-report.json\`.
- Highest-need files: ${
  Array.isArray(coverageDebt.topDebtFiles) && coverageDebt.topDebtFiles.length
    ? coverageDebt.topDebtFiles
        .slice(0, 10)
        .map((entry) => `\`${entry.file}\` (${entry.statements.pct}% statements)`)
        .join(', ')
    : 'n/a'
}

## Security

### Dependency Audits

${makeTable(
  ['Scope', 'High', 'Critical', 'Other', 'Blocks readiness'],
  [
    [
      'Frontend/runtime',
      formatCount(security?.summaries?.npmAuditRuntime?.totals?.high),
      formatCount(security?.summaries?.npmAuditRuntime?.totals?.critical),
      formatCount((security?.summaries?.npmAuditRuntime?.totals?.total ?? 0) - (security?.summaries?.npmAuditRuntime?.totals?.high ?? 0) - (security?.summaries?.npmAuditRuntime?.totals?.critical ?? 0)),
      securityGate.runtimeDependencyBlocker ? 'Potentially' : 'No',
    ],
    [
      'Backend/runtime',
      formatCount(security?.summaries?.backendNpmAuditRuntime?.totals?.high),
      formatCount(security?.summaries?.backendNpmAuditRuntime?.totals?.critical),
      formatCount((security?.summaries?.backendNpmAuditRuntime?.totals?.total ?? 0) - (security?.summaries?.backendNpmAuditRuntime?.totals?.high ?? 0) - (security?.summaries?.backendNpmAuditRuntime?.totals?.critical ?? 0)),
      securityGate.runtimeDependencyBlocker ? 'Potentially' : 'No',
    ],
    [
      'Full repo (informational)',
      formatCount(security?.summaries?.npmAudit?.totals?.high),
      formatCount(security?.summaries?.npmAudit?.totals?.critical),
      formatCount((security?.summaries?.npmAudit?.totals?.total ?? 0) - (security?.summaries?.npmAudit?.totals?.high ?? 0) - (security?.summaries?.npmAudit?.totals?.critical ?? 0)),
      'Informational',
    ],
  ],
)}

### Static Analysis

- Slither total findings: \`${security?.summaries?.slither?.totalFindings ?? 'n/a'}\`
- Reviewed production findings: \`${securityGate.reviewedProductionStaticFindings?.length ?? 0}\`
- Unresolved production high findings: \`${securityGate.unresolvedProductionStaticHighFindings?.length ?? 0}\`
- Mythril completed contracts: \`${security?.summaries?.mythril?.completedContracts ?? 'n/a'} / ${security?.summaries?.mythril?.totalContracts ?? 'n/a'}\`
- Reviewed Mythril findings: \`${security?.summaries?.mythril?.reviewedFindings?.length ?? 0}\`
- Unresolved Mythril findings: \`${security?.summaries?.mythril?.unresolvedFindings?.length ?? 0}\`

${securityGate.unresolvedProductionStaticHighFindings?.length
  ? `${makeTable(
      ['Check', 'File', 'Line'],
      securityGate.unresolvedProductionStaticHighFindings.map((finding) => [
        finding.check ?? 'unknown',
        finding.file ?? 'unknown',
        formatCount(finding.line),
      ]),
    )}\n`
  : '- No unresolved high-severity static-analysis findings remain in the reviewed production-contract set.\n'}

## Performance

${makeTable(
  ['Page', 'Perf', 'A11y', 'Best', 'SEO', 'LCP ms', 'CLS', 'TBT ms', 'Pass'],
  performancePages.map((page) => [
    page.url ?? 'unknown',
    formatScore(page.performance),
    formatScore(page.accessibility),
    formatScore(page.bestPractices),
    formatScore(page.seo),
    typeof page.webVitals?.lcpMs === 'number'
      ? formatCount(Math.round(page.webVitals.lcpMs))
      : 'n/a',
    typeof page.webVitals?.cls === 'number' ? page.webVitals.cls.toFixed(3) : 'n/a',
    typeof page.webVitals?.tbtMs === 'number'
      ? formatCount(Math.round(page.webVitals.tbtMs))
      : 'n/a',
    page.pass ? 'YES' : 'NO',
  ]),
)}

- Overall performance gate: **${readiness.gates?.performance?.pass ? 'PASS' : 'FAIL'}**

## Load, Gas, and Wallet Checks

${makeTable(
  ['Check', 'Result'],
  [
    ['API load success', apiLoad?.ok === true ? 'PASS' : 'FAIL'],
    ['API load runner', apiLoad?.runner ?? 'unknown'],
    ['Gas benchmark completeness', gas?.completeness?.isComplete ? 'Complete' : 'Incomplete'],
    ['Gas targets', readiness.gates?.gas?.targetsPass ? 'All pass' : 'At least one failed'],
    ['Wallet chains OK', `${walletSummary.ok}/${walletSummary.total}`],
  ],
)}

## Interpretation

- The critical-path production gate is **${readiness.ready ? 'green' : 'still blocked'}**.
- The report now separates production blockers from background debt:
  - Critical-path coverage decides readiness.
  - Runtime dependency high/critical findings decide dependency readiness.
  - Full-repo dependency findings remain visible for backlog management.
  - Reviewed Slither false positives are recorded explicitly instead of being silently ignored.
`;

fs.writeFileSync(outPath, markdown);
console.log(`[full-report] Wrote ${outPath}`);
