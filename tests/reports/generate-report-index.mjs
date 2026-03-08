#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const reportsDir = path.resolve('tests/reports');
fs.mkdirSync(reportsDir, { recursive: true });

const reportFiles = [
  'vitest-results.json',
  'vitest-workspace-results.json',
  'vitest-coverage-results.json',
  'vitest-api-results.json',
  'vitest-security-results.json',
  'backend-vitest-results.json',
  'newman-report.json',
  'api-load-report.json',
  'security-findings.json',
  'performance-report.json',
  'gas-report.json',
  'slither-findings.json',
  'wallet-simulation.json',
  'coverage-final.json',
  'coverage-summary.json',
  'forge-gas-snapshot.txt',
];

const alternatePaths = {
  'coverage-final.json': [path.resolve('coverage/coverage-final.json')],
  'coverage-summary.json': [path.resolve('coverage/coverage-summary.json')],
};

const heavySummaryFiles = new Set([
  'slither-findings.json',
  'coverage-final.json',
]);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function numberOrZero(value) {
  return typeof value === 'number' ? value : 0;
}

function summarizeVitest(report) {
  if (!report || typeof report !== 'object') return null;
  return {
    success: Boolean(report.success),
    numTotalTestSuites: numberOrZero(report.numTotalTestSuites),
    numPassedTestSuites: numberOrZero(report.numPassedTestSuites),
    numFailedTestSuites: numberOrZero(report.numFailedTestSuites),
    numPendingTestSuites: numberOrZero(report.numPendingTestSuites),
    numTotalTests: numberOrZero(report.numTotalTests),
    numPassedTests: numberOrZero(report.numPassedTests),
    numFailedTests: numberOrZero(report.numFailedTests),
    numPendingTests: numberOrZero(report.numPendingTests),
  };
}

function mergeVitestSummaries(items) {
  if (!items.length) return null;
  return items.reduce(
    (acc, current) => ({
      success: acc.success && current.success,
      numTotalTestSuites: acc.numTotalTestSuites + current.numTotalTestSuites,
      numPassedTestSuites: acc.numPassedTestSuites + current.numPassedTestSuites,
      numFailedTestSuites: acc.numFailedTestSuites + current.numFailedTestSuites,
      numPendingTestSuites: acc.numPendingTestSuites + current.numPendingTestSuites,
      numTotalTests: acc.numTotalTests + current.numTotalTests,
      numPassedTests: acc.numPassedTests + current.numPassedTests,
      numFailedTests: acc.numFailedTests + current.numFailedTests,
      numPendingTests: acc.numPendingTests + current.numPendingTests,
    }),
    {
      success: true,
      numTotalTestSuites: 0,
      numPassedTestSuites: 0,
      numFailedTestSuites: 0,
      numPendingTestSuites: 0,
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
    },
  );
}

function summarizeCoverage(coverageSummary) {
  if (!coverageSummary || typeof coverageSummary !== 'object') return null;
  return {
    lines: coverageSummary.totals?.lines ?? null,
    statements: coverageSummary.totals?.statements ?? null,
    branches: coverageSummary.totals?.branches ?? null,
    functions: coverageSummary.totals?.functions ?? null,
  };
}

const status = {};
const details = {};
const sourcePaths = {};

for (const file of reportFiles) {
  const candidates = [path.join(reportsDir, file), ...(alternatePaths[file] ?? [])];
  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
  status[file] = sourcePath ? 'present' : 'missing';
  sourcePaths[file] = sourcePath ? path.relative(process.cwd(), sourcePath) : null;

  if (!sourcePath || !file.endsWith('.json')) continue;

  if (heavySummaryFiles.has(file)) {
    const stat = fs.statSync(sourcePath);
    details[file] = {
      sourcePath: path.relative(process.cwd(), sourcePath),
      parsed: false,
      sizeBytes: stat.size,
    };
    continue;
  }

  const parsed = readJson(sourcePath);
  details[file] = parsed ?? { parseError: true, sourcePath: path.relative(process.cwd(), sourcePath) };
}

const vitestWorkspace =
  summarizeVitest(details['vitest-workspace-results.json']) ??
  summarizeVitest(details['vitest-results.json']);
const vitestApi = summarizeVitest(details['vitest-api-results.json']);
const vitestSecurity = summarizeVitest(details['vitest-security-results.json']);
const backendVitest = summarizeVitest(details['backend-vitest-results.json']);
const mergedVitest = mergeVitestSummaries(
  [vitestWorkspace, backendVitest].filter(Boolean),
);

const coverageSummary = summarizeCoverage(details['coverage-summary.json']);
const coverageThresholds = {
  lines: 80,
  statements: 80,
  branches: 75,
  functions: 80,
};

const security = details['security-findings.json'] ?? null;
const securitySummaries = security?.summaries ?? {};
const npmAudit = securitySummaries.npmAudit ?? null;
const slither = securitySummaries.slither ?? null;
const mythril = securitySummaries.mythril ?? null;

const gas = details['gas-report.json'] ?? null;
const performance = details['performance-report.json'] ?? null;

const coverageGate =
  coverageSummary &&
  coverageSummary.lines?.pct >= coverageThresholds.lines &&
  coverageSummary.statements?.pct >= coverageThresholds.statements &&
  coverageSummary.branches?.pct >= coverageThresholds.branches &&
  coverageSummary.functions?.pct >= coverageThresholds.functions;

const unresolvedSecurityFindings =
  (npmAudit?.totals?.high ?? 0) > 0 ||
  (npmAudit?.totals?.critical ?? 0) > 0 ||
  (slither?.totalFindings ?? 0) > 0;

const mythrilComplete =
  mythril &&
  mythril.available === true &&
  Number(mythril.totalContracts ?? 0) > 0 &&
  Number(mythril.failedContracts ?? 0) === 0;

const performancePass = performance?.summary?.overallPass === true;

const gasBenchmarkSetComplete = gas && gas.completeness?.isComplete === true;
const gasTargetsPass =
  gas &&
  Object.values(gas.evaluation ?? {}).every(
    (entry) => entry && entry.status === 'pass',
  );
const gasComplete = Boolean(gasBenchmarkSetComplete && gasTargetsPass);

const blockers = [];
if (!coverageGate) blockers.push('low coverage');
if (unresolvedSecurityFindings) blockers.push('unresolved static/dependency security findings');
if (!mythrilComplete) blockers.push('incomplete Mythril analysis');
if (!performancePass) blockers.push('performance below target');
if (!gasBenchmarkSetComplete) blockers.push('incomplete gas benchmark set');
if (gasBenchmarkSetComplete && !gasTargetsPass) blockers.push('gas benchmarks above target');

const productionReadiness = {
  ready: blockers.length === 0,
  blockers,
  gates: {
    coverage: {
      pass: Boolean(coverageGate),
      thresholds: coverageThresholds,
      measured: coverageSummary,
    },
    security: {
      pass: !unresolvedSecurityFindings,
      unresolvedFindings: unresolvedSecurityFindings,
      npmAuditHigh: npmAudit?.totals?.high ?? null,
      npmAuditCritical: npmAudit?.totals?.critical ?? null,
      slitherFindings: slither?.totalFindings ?? null,
    },
    mythril: {
      pass: Boolean(mythrilComplete),
      summary: mythril ?? null,
    },
    performance: {
      pass: Boolean(performancePass),
      summary: performance?.summary ?? null,
    },
    gas: {
      pass: Boolean(gasComplete),
      summary: gas?.completeness ?? null,
      targetsPass: gasTargetsPass ?? null,
      evaluation: gas?.evaluation ?? null,
    },
  },
};

const output = {
  generatedAt: new Date().toISOString(),
  cwd: process.cwd(),
  reports: status,
  reportSources: sourcePaths,
  summary: {
    vitest: {
      workspace: vitestWorkspace,
      api: vitestApi,
      security: vitestSecurity,
      backend: backendVitest,
      mergedNonOverlapping: mergedVitest
        ? {
            included: [
              ...(vitestWorkspace ? ['workspace'] : []),
              ...(backendVitest ? ['backend'] : []),
            ],
            ...mergedVitest,
          }
        : null,
    },
    coverage: coverageSummary,
    productionReadiness,
  },
  details,
};

const outPath = path.join(reportsDir, 'test-results.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`[reports] Wrote ${outPath}`);
