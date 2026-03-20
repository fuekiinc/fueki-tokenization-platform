#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const COVERAGE_PATH = path.resolve('tests/reports/coverage-final.json');
const OUTPUT_PATH = path.resolve('tests/reports/coverage-debt-report.json');
const MIN_STATEMENTS = 20;
const MAX_ENTRIES = 25;

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function calculateMetric(counterMap) {
  const values = Object.values(counterMap ?? {});
  const total = values.length;
  const covered = values.filter((value) => Number(value) > 0).length;
  const pct = total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2));
  return { covered, total, pct };
}

function calculateBranchMetric(branchMap) {
  const flattened = Object.values(branchMap ?? {}).flatMap((branchHits) =>
    Array.isArray(branchHits) ? branchHits : [],
  );
  const total = flattened.length;
  const covered = flattened.filter((value) => Number(value) > 0).length;
  const pct = total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2));
  return { covered, total, pct };
}

function classifyArea(filePath) {
  if (filePath.startsWith('backend/')) return 'backend';
  if (filePath.startsWith('src/')) return 'frontend';
  return 'other';
}

const coverageMap = readJson(COVERAGE_PATH);
if (!coverageMap) {
  console.error(`[coverage-debt] Missing or invalid ${COVERAGE_PATH}`);
  process.exit(1);
}

const candidates = Object.entries(coverageMap)
  .map(([absolutePath, payload]) => {
    const relativePath = path.relative(process.cwd(), absolutePath);
    const statements = calculateMetric(payload.s);
    const functions = calculateMetric(payload.f);
    const branches = calculateBranchMetric(payload.b);
    const lines = calculateMetric(payload.l ?? payload.s);
    const missedStatements = statements.total - statements.covered;

    return {
      file: relativePath,
      area: classifyArea(relativePath),
      statements,
      functions,
      branches,
      lines,
      missedStatements,
    };
  })
  .filter((entry) => (
    (entry.file.startsWith('src/') || entry.file.startsWith('backend/src/')) &&
    entry.statements.total >= MIN_STATEMENTS
  ))
  .sort((left, right) => {
    if (right.missedStatements !== left.missedStatements) {
      return right.missedStatements - left.missedStatements;
    }
    return left.file.localeCompare(right.file);
  });

const output = {
  generatedAt: new Date().toISOString(),
  source: path.relative(process.cwd(), COVERAGE_PATH),
  thresholds: {
    minStatements: MIN_STATEMENTS,
    maxEntries: MAX_ENTRIES,
  },
  totalTrackedFiles: candidates.length,
  topDebtFiles: candidates.slice(0, MAX_ENTRIES),
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
console.log(`[coverage-debt] wrote ${OUTPUT_PATH}`);
