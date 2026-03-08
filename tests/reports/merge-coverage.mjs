#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const FRONTEND_COVERAGE_PATH = path.resolve('coverage/coverage-final.json');
const BACKEND_COVERAGE_PATH = path.resolve('backend/coverage/coverage-final.json');
const OUTPUT_PATH = path.resolve('tests/reports/coverage-final.json');
const SUMMARY_PATH = path.resolve('tests/reports/coverage-summary.json');

function readCoverage(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to parse coverage file: ${filePath} (${error instanceof Error ? error.message : String(error)})`);
  }
}

function addNumericCounters(target, incoming) {
  for (const key of Object.keys(incoming)) {
    const incomingValue = Number(incoming[key] ?? 0);
    const baseValue = Number(target[key] ?? 0);
    target[key] = baseValue + incomingValue;
  }
}

function addBranchCounters(target, incoming) {
  for (const key of Object.keys(incoming)) {
    const incomingValue = Array.isArray(incoming[key]) ? incoming[key] : [];
    const baseValue = Array.isArray(target[key]) ? target[key] : [];
    const merged = [];
    const size = Math.max(baseValue.length, incomingValue.length);
    for (let i = 0; i < size; i += 1) {
      merged.push(Number(baseValue[i] ?? 0) + Number(incomingValue[i] ?? 0));
    }
    target[key] = merged;
  }
}

function mergeCoverageMaps(base, incoming) {
  for (const [file, payload] of Object.entries(incoming)) {
    if (!base[file]) {
      base[file] = payload;
      continue;
    }

    if (payload.s) addNumericCounters(base[file].s ?? (base[file].s = {}), payload.s);
    if (payload.f) addNumericCounters(base[file].f ?? (base[file].f = {}), payload.f);
    if (payload.l) addNumericCounters(base[file].l ?? (base[file].l = {}), payload.l);
    if (payload.b) addBranchCounters(base[file].b ?? (base[file].b = {}), payload.b);
  }
}

function percent(covered, total) {
  if (total === 0) return 100;
  return Number(((covered / total) * 100).toFixed(2));
}

function summarizeCoverage(map) {
  let statementsCovered = 0;
  let statementsTotal = 0;
  let functionsCovered = 0;
  let functionsTotal = 0;
  let branchesCovered = 0;
  let branchesTotal = 0;
  let linesCovered = 0;
  let linesTotal = 0;

  for (const payload of Object.values(map)) {
    for (const value of Object.values(payload.s ?? {})) {
      statementsTotal += 1;
      if (Number(value) > 0) statementsCovered += 1;
    }
    for (const value of Object.values(payload.f ?? {})) {
      functionsTotal += 1;
      if (Number(value) > 0) functionsCovered += 1;
    }
    for (const branchHits of Object.values(payload.b ?? {})) {
      const entries = Array.isArray(branchHits) ? branchHits : [];
      for (const hit of entries) {
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

  return {
    statements: {
      covered: statementsCovered,
      total: statementsTotal,
      pct: percent(statementsCovered, statementsTotal),
    },
    branches: {
      covered: branchesCovered,
      total: branchesTotal,
      pct: percent(branchesCovered, branchesTotal),
    },
    functions: {
      covered: functionsCovered,
      total: functionsTotal,
      pct: percent(functionsCovered, functionsTotal),
    },
    lines: {
      covered: linesCovered,
      total: linesTotal,
      pct: percent(linesCovered, linesTotal),
    },
  };
}

const frontendCoverage = readCoverage(FRONTEND_COVERAGE_PATH);
const backendCoverage = readCoverage(BACKEND_COVERAGE_PATH);

if (!frontendCoverage && !backendCoverage) {
  console.error('[coverage] Neither frontend nor backend coverage artifacts were found.');
  process.exit(1);
}

const merged = {};
if (frontendCoverage) mergeCoverageMaps(merged, frontendCoverage);
if (backendCoverage) mergeCoverageMaps(merged, backendCoverage);

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2));

const summary = {
  generatedAt: new Date().toISOString(),
  sources: {
    frontend: frontendCoverage ? path.relative(process.cwd(), FRONTEND_COVERAGE_PATH) : null,
    backend: backendCoverage ? path.relative(process.cwd(), BACKEND_COVERAGE_PATH) : null,
  },
  fileCount: Object.keys(merged).length,
  totals: summarizeCoverage(merged),
};

fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
console.log('[coverage] wrote tests/reports/coverage-final.json and coverage-summary.json');
