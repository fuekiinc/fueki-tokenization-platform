#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const reportsDir = path.resolve('tests/reports');
fs.mkdirSync(reportsDir, { recursive: true });

const files = [
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
  'forge-gas-snapshot.txt',
];

const alternatePaths = {
  'coverage-final.json': [path.resolve('coverage/coverage-final.json')],
};

const status = {};
const details = {};
for (const file of files) {
  const candidates = [path.join(reportsDir, file), ...(alternatePaths[file] ?? [])];
  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
  status[file] = sourcePath ? 'present' : 'missing';

  if (!sourcePath || !file.endsWith('.json')) continue;

  if (file === 'coverage-final.json') {
    details[file] = {
      sourcePath: path.relative(process.cwd(), sourcePath),
      parsed: false,
    };
    continue;
  }

  try {
    details[file] = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    if (sourcePath !== path.join(reportsDir, file)) {
      details[file] = {
        ...details[file],
        _sourcePath: path.relative(process.cwd(), sourcePath),
      };
    }
  } catch {
    details[file] = { parseError: true };
  }
}

const numberOrZero = (value) => (typeof value === 'number' ? value : 0);
const summarizeVitestReport = (report) => {
  if (!report || typeof report !== 'object') return null;
  return {
    success: Boolean(report.success),
    numTotalTestSuites: numberOrZero(report.numTotalTestSuites),
    numPassedTestSuites: numberOrZero(report.numPassedTestSuites),
    numFailedTestSuites: numberOrZero(report.numFailedTestSuites),
    numTotalTests: numberOrZero(report.numTotalTests),
    numPassedTests: numberOrZero(report.numPassedTests),
    numFailedTests: numberOrZero(report.numFailedTests),
  };
};

const sumVitestSummaries = (items) => {
  if (!items.length) return null;
  return items.reduce(
    (acc, item) => ({
      success: acc.success && item.success,
      numTotalTestSuites: acc.numTotalTestSuites + item.numTotalTestSuites,
      numPassedTestSuites: acc.numPassedTestSuites + item.numPassedTestSuites,
      numFailedTestSuites: acc.numFailedTestSuites + item.numFailedTestSuites,
      numTotalTests: acc.numTotalTests + item.numTotalTests,
      numPassedTests: acc.numPassedTests + item.numPassedTests,
      numFailedTests: acc.numFailedTests + item.numFailedTests,
    }),
    {
      success: true,
      numTotalTestSuites: 0,
      numPassedTestSuites: 0,
      numFailedTestSuites: 0,
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
    },
  );
};

const vitestWorkspace =
  summarizeVitestReport(details['vitest-workspace-results.json']) ??
  summarizeVitestReport(details['vitest-results.json']);
const vitestSecurity = summarizeVitestReport(details['vitest-security-results.json']);
const vitestApi = summarizeVitestReport(details['vitest-api-results.json']);
const backendVitest = summarizeVitestReport(details['backend-vitest-results.json']);

const mergedInputs = [];
if (vitestWorkspace) mergedInputs.push(vitestWorkspace);
if (backendVitest) mergedInputs.push(backendVitest);
const mergedVitest = sumVitestSummaries(mergedInputs);

const summary = {
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
};

const output = {
  generatedAt: new Date().toISOString(),
  cwd: process.cwd(),
  reports: status,
  summary,
  details,
};

const outPath = path.join(reportsDir, 'test-results.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`[reports] Wrote ${outPath}`);
