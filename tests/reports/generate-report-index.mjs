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
  'coverage-debt-report.json',
  'npm-audit-runtime.json',
  'backend-npm-audit-runtime.json',
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

const GLOBAL_COVERAGE_THRESHOLDS = {
  lines: 80,
  statements: 80,
  branches: 75,
  functions: 80,
};

const CRITICAL_COVERAGE_THRESHOLDS = {
  lines: 65,
  statements: 65,
  branches: 50,
  functions: 70,
};

const CRITICAL_COVERAGE_TARGETS = [
  'src/lib/rpc/endpoints.ts',
  'src/lib/blockchain/txExecution.ts',
  'src/store/walletStore.ts',
  'src/lib/blockchain/contracts.ts',
  'src/lib/blockchain/marketData.ts',
  'src/lib/blockchain/transactionOverrides.ts',
  'src/hooks/usePriceHistory.ts',
  'backend/src/services/auth.ts',
  'backend/src/services/mintRequestVerification.ts',
  'backend/src/services/approvalActionFlow.ts',
  'backend/src/routes/marketData.ts',
  'backend/src/services/marketData.ts',
];

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

function normalizeCoverageSection(coverageSummary) {
  if (!coverageSummary || typeof coverageSummary !== 'object') return null;
  return coverageSummary.totals ?? coverageSummary;
}

function summarizeCoverage(coverageSummary) {
  const normalized = normalizeCoverageSection(coverageSummary);
  if (!normalized || typeof normalized !== 'object') return null;
  return {
    lines: normalized.lines ?? null,
    statements: normalized.statements ?? null,
    branches: normalized.branches ?? null,
    functions: normalized.functions ?? null,
  };
}

function summarizeCoverageEntries(entries) {
  let statementsCovered = 0;
  let statementsTotal = 0;
  let functionsCovered = 0;
  let functionsTotal = 0;
  let branchesCovered = 0;
  let branchesTotal = 0;
  let linesCovered = 0;
  let linesTotal = 0;

  for (const payload of entries) {
    for (const value of Object.values(payload.s ?? {})) {
      statementsTotal += 1;
      if (Number(value) > 0) statementsCovered += 1;
    }
    for (const value of Object.values(payload.f ?? {})) {
      functionsTotal += 1;
      if (Number(value) > 0) functionsCovered += 1;
    }
    for (const branchHits of Object.values(payload.b ?? {})) {
      const branchEntries = Array.isArray(branchHits) ? branchHits : [];
      for (const hit of branchEntries) {
        branchesTotal += 1;
        if (Number(hit) > 0) branchesCovered += 1;
      }
    }
    const lineSource = payload.l ?? payload.s ?? {};
    for (const value of Object.values(lineSource)) {
      linesTotal += 1;
      if (Number(value) > 0) linesCovered += 1;
    }
  }

  function pct(covered, total) {
    if (total === 0) return 100;
    return Number(((covered / total) * 100).toFixed(2));
  }

  return {
    statements: {
      covered: statementsCovered,
      total: statementsTotal,
      pct: pct(statementsCovered, statementsTotal),
    },
    branches: {
      covered: branchesCovered,
      total: branchesTotal,
      pct: pct(branchesCovered, branchesTotal),
    },
    functions: {
      covered: functionsCovered,
      total: functionsTotal,
      pct: pct(functionsCovered, functionsTotal),
    },
    lines: {
      covered: linesCovered,
      total: linesTotal,
      pct: pct(linesCovered, linesTotal),
    },
  };
}

function summarizeCriticalCoverage(coverageMap) {
  if (!coverageMap || typeof coverageMap !== 'object') {
    return null;
  }

  const matchedEntries = [];
  const perFile = [];
  const missingFiles = [];

  for (const target of CRITICAL_COVERAGE_TARGETS) {
    const match = Object.entries(coverageMap).find(([file]) => file.endsWith(target));
    if (!match) {
      missingFiles.push(target);
      continue;
    }
    const [file, payload] = match;
    matchedEntries.push(payload);
    perFile.push({
      target,
      sourcePath: path.relative(process.cwd(), file),
      coverage: summarizeCoverageEntries([payload]),
    });
  }

  const measured = summarizeCoverageEntries(matchedEntries);
  const pass = Boolean(
    measured &&
    missingFiles.length === 0 &&
    measured.lines.pct >= CRITICAL_COVERAGE_THRESHOLDS.lines &&
    measured.statements.pct >= CRITICAL_COVERAGE_THRESHOLDS.statements &&
    measured.branches.pct >= CRITICAL_COVERAGE_THRESHOLDS.branches &&
    measured.functions.pct >= CRITICAL_COVERAGE_THRESHOLDS.functions,
  );

  return {
    pass,
    thresholds: CRITICAL_COVERAGE_THRESHOLDS,
    matchedFiles: perFile.length,
    missingFiles,
    measured,
    perFile,
  };
}

function auditHasHighOrCritical(summary) {
  return (
    (summary?.totals?.high ?? 0) > 0 ||
    (summary?.totals?.critical ?? 0) > 0
  );
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
  details[file] = parsed ?? {
    parseError: true,
    sourcePath: path.relative(process.cwd(), sourcePath),
  };
}

const coverageMap = readJson(path.join(reportsDir, 'coverage-final.json')) ??
  readJson(path.resolve('coverage/coverage-final.json'));

const vitestWorkspace =
  summarizeVitest(details['vitest-workspace-results.json']) ??
  summarizeVitest(details['vitest-results.json']);
const vitestApi = summarizeVitest(details['vitest-api-results.json']);
const vitestSecurity = summarizeVitest(details['vitest-security-results.json']);
const backendVitest = summarizeVitest(details['backend-vitest-results.json']);
const mergedVitest = mergeVitestSummaries(
  [vitestWorkspace, backendVitest].filter(Boolean),
);

const globalCoverage = summarizeCoverage(details['coverage-summary.json']);
const criticalCoverage = summarizeCriticalCoverage(coverageMap);
const coverageDebt = details['coverage-debt-report.json'] ?? null;
const globalCoverageMeetsLegacyThresholds = Boolean(
  globalCoverage &&
  globalCoverage.lines?.pct >= GLOBAL_COVERAGE_THRESHOLDS.lines &&
  globalCoverage.statements?.pct >= GLOBAL_COVERAGE_THRESHOLDS.statements &&
  globalCoverage.branches?.pct >= GLOBAL_COVERAGE_THRESHOLDS.branches &&
  globalCoverage.functions?.pct >= GLOBAL_COVERAGE_THRESHOLDS.functions,
);

const security = details['security-findings.json'] ?? null;
const securitySummaries = security?.summaries ?? {};
const npmAudit = securitySummaries.npmAudit ?? null;
const npmAuditRuntime = securitySummaries.npmAuditRuntime ?? null;
const backendNpmAuditRuntime = securitySummaries.backendNpmAuditRuntime ?? null;
const slither = securitySummaries.slither ?? null;
const mythril = securitySummaries.mythril ?? null;

const gas = details['gas-report.json'] ?? null;
const performance = details['performance-report.json'] ?? null;

const runtimeDependencyBlocker =
  auditHasHighOrCritical(npmAuditRuntime) ||
  auditHasHighOrCritical(backendNpmAuditRuntime);
const unresolvedProductionStaticHighFindings =
  slither?.productionContracts?.unresolvedHighFindings ?? [];
const unresolvedStaticHighCount = unresolvedProductionStaticHighFindings.length;
const securityPass = !runtimeDependencyBlocker && unresolvedStaticHighCount === 0;

const mythrilComplete = Boolean(
  mythril &&
  mythril.available === true &&
  Number(mythril.totalContracts ?? 0) > 0 &&
  Number(mythril.failedContracts ?? 0) === 0,
);

const performancePass = performance?.summary?.overallPass === true;

const gasBenchmarkSetComplete = gas && gas.completeness?.isComplete === true;
const gasTargetsPass =
  gas &&
  Object.values(gas.evaluation ?? {}).every(
    (entry) => entry && entry.status === 'pass',
  );
const gasComplete = Boolean(gasBenchmarkSetComplete && gasTargetsPass);

const blockers = [];
if (!criticalCoverage?.pass) blockers.push('low coverage');
if (!securityPass) blockers.push('unresolved static/dependency security findings');
if (!mythrilComplete) blockers.push('incomplete Mythril analysis');
if (!performancePass) blockers.push('performance below target');
if (!gasBenchmarkSetComplete) blockers.push('incomplete gas benchmark set');
if (gasBenchmarkSetComplete && !gasTargetsPass) blockers.push('gas benchmarks above target');

const productionReadiness = {
  ready: blockers.length === 0,
  blockers,
  gates: {
    coverage: {
      pass: Boolean(criticalCoverage?.pass),
      measured: criticalCoverage?.measured ?? null,
      thresholds: CRITICAL_COVERAGE_THRESHOLDS,
      criticalPaths: criticalCoverage ?? null,
      globalCoverageDebt: {
        pass: globalCoverageMeetsLegacyThresholds,
        thresholds: GLOBAL_COVERAGE_THRESHOLDS,
        measured: globalCoverage,
      },
    },
    security: {
      pass: securityPass,
      runtimeDependencyBlocker,
      runtimeAudits: {
        frontend: npmAuditRuntime,
        backend: backendNpmAuditRuntime,
      },
      fullDependencyAudit: npmAudit,
      unresolvedProductionStaticHighFindings: unresolvedProductionStaticHighFindings,
      reviewedProductionStaticFindings:
        slither?.productionContracts?.reviewedFindings ?? [],
      staticAnalysis: slither ?? null,
    },
    mythril: {
      pass: mythrilComplete,
      summary: mythril ?? null,
    },
    performance: {
      pass: Boolean(performancePass),
      summary: performance?.summary ?? null,
      pages: performance?.pages ?? [],
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
    coverage: {
      global: globalCoverage,
      criticalPaths: criticalCoverage,
      debtReport: coverageDebt,
    },
    productionReadiness,
  },
  details,
};

const outPath = path.join(reportsDir, 'test-results.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`[reports] Wrote ${outPath}`);
