#!/usr/bin/env node
import fs from 'node:fs';

const hardhatGasFile = 'gas-report.txt';
const hardhatGasJsonFile = 'gasReporterOutput.json';
const forgeSnapshotFile = 'tests/reports/forge-gas-snapshot.txt';

const targets = {
  simpleSwap: 150000,
  tickCrossingSwap: 200000,
  addLiquidityPerToken: 200000,
  removeLiquidity: 150000,
  quote: 50000,
};

function parseIntSafe(raw) {
  if (typeof raw !== 'string') return null;
  const normalized = raw.replace(/[,_.]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  return Number.parseInt(normalized, 10);
}

function parseForgeSnapshot(filePath) {
  if (!fs.existsSync(filePath)) return { available: false, rows: [] };

  const content = fs.readFileSync(filePath, 'utf8');
  const rows = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const gasTag = trimmed.match(/^(?<name>.+?)\s+\(gas:\s*(?<gas>[\d,_.]+)\)$/);
    if (gasTag?.groups) {
      rows.push({
        name: gasTag.groups.name,
        gas: parseIntSafe(gasTag.groups.gas),
      });
      continue;
    }

    const colonTag = trimmed.match(/^(?<name>[^:]+(?::[^:]+)?)\s*:\s*(?<gas>[\d,_.]+)$/);
    if (colonTag?.groups) {
      rows.push({
        name: colonTag.groups.name,
        gas: parseIntSafe(colonTag.groups.gas),
      });
    }
  }

  return {
    available: true,
    rows,
    path: filePath,
  };
}

function parseHardhatReport(filePath) {
  if (!fs.existsSync(filePath)) return { available: false, methods: [] };
  const content = fs.readFileSync(filePath, 'utf8');
  const methods = [];

  // Parse gas reporter markdown-like rows:
  // |  Contract  ·  Method  ·  Min  ·  Max  ·  Avg  · ...
  for (const line of content.split('\n')) {
    if (!line.includes('|') || line.includes('---') || line.toLowerCase().includes('contract')) continue;
    const cells = line
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    if (cells.length < 4) continue;
    const avgCell = cells.find((cell) => /^\d[\d,_.]*$/.test(cell));
    if (!avgCell) continue;
    const gas = parseIntSafe(avgCell);
    if (!gas) continue;
    methods.push({
      contract: cells[0] || null,
      method: cells[1] || null,
      avgGas: gas,
      raw: line.trim(),
    });
  }

  return {
    available: true,
    methods,
    path: filePath,
  };
}

function parseHardhatJson(filePath) {
  if (!fs.existsSync(filePath)) return { available: false, methods: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const methodMap = raw?.data?.methods ?? {};
    const methods = Object.values(methodMap)
      .filter(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          Array.isArray(entry.gasData) &&
          entry.gasData.length > 0,
      )
      .map((entry) => ({
        contract: entry.contract ?? null,
        method: entry.method ?? null,
        fnSig: entry.fnSig ?? null,
        avgGas:
          typeof entry.executionGasAverage === 'number'
            ? entry.executionGasAverage
            : parseIntSafe(String(entry.executionGasAverage ?? '')),
        minGas: typeof entry.min === 'number' ? entry.min : parseIntSafe(String(entry.min ?? '')),
        maxGas: typeof entry.max === 'number' ? entry.max : parseIntSafe(String(entry.max ?? '')),
        numberOfCalls:
          typeof entry.numberOfCalls === 'number'
            ? entry.numberOfCalls
            : parseIntSafe(String(entry.numberOfCalls ?? '')),
      }));
    return {
      available: true,
      path: filePath,
      methods,
    };
  } catch {
    return {
      available: true,
      path: filePath,
      parseError: true,
      methods: [],
    };
  }
}

function firstMatchingGas(rows, candidates) {
  for (const row of rows) {
    const rowName = row.name?.toLowerCase() ?? '';
    for (const candidate of candidates) {
      if (rowName.includes(candidate.toLowerCase()) && typeof row.gas === 'number') {
        return row.gas;
      }
    }
  }
  return null;
}

function evaluate(measured, limit) {
  if (typeof measured !== 'number') return { status: 'missing', measured: null, target: limit };
  return {
    status: measured <= limit ? 'pass' : 'fail',
    measured,
    target: limit,
    delta: measured - limit,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  hardhat: parseHardhatReport(hardhatGasFile),
  hardhatJson: parseHardhatJson(hardhatGasJsonFile),
  forge: parseForgeSnapshot(forgeSnapshotFile),
  targets,
  measurements: {},
  evaluation: {},
};

const forgeRows = report.forge.rows ?? [];
report.measurements = {
  simpleSwap: firstMatchingGas(forgeRows, ['testgas_swap2token', 'swap2token']),
  tickCrossingSwap: firstMatchingGas(forgeRows, ['tickcrossing', 'crossing']),
  addLiquidityPerToken: firstMatchingGas(forgeRows, ['testgas_addliquidity', 'addliquidity']),
  removeLiquidity: firstMatchingGas(forgeRows, ['testgas_removeliquidity', 'removeliquidity']),
  quote: firstMatchingGas(forgeRows, ['quote']),
  routerMultiHop2: firstMatchingGas(forgeRows, ['testgas_routermultihop2', 'multihop2']),
};

report.evaluation = {
  simpleSwap: evaluate(report.measurements.simpleSwap, targets.simpleSwap),
  tickCrossingSwap: evaluate(report.measurements.tickCrossingSwap, targets.tickCrossingSwap),
  addLiquidityPerToken: evaluate(report.measurements.addLiquidityPerToken, targets.addLiquidityPerToken),
  removeLiquidity: evaluate(report.measurements.removeLiquidity, targets.removeLiquidity),
  quote: evaluate(report.measurements.quote, targets.quote),
};

const requiredTargets = Object.keys(targets);
report.completeness = {
  requiredBenchmarks: requiredTargets.length,
  measuredBenchmarks: requiredTargets.filter(
    (name) => typeof report.measurements[name] === 'number',
  ).length,
};
report.completeness.missingBenchmarks = requiredTargets.filter(
  (name) => typeof report.measurements[name] !== 'number',
);
report.completeness.isComplete = report.completeness.missingBenchmarks.length === 0;

report.hasMeasuredValues = Object.values(report.measurements).some(
  (value) => typeof value === 'number',
);
report.notes = [];
if (!report.hardhat.available) {
  report.notes.push(`Missing ${hardhatGasFile}`);
}
if (!report.hardhatJson.available) {
  report.notes.push(`Missing ${hardhatGasJsonFile}`);
}
if (!report.forge.available) {
  report.notes.push(`Missing ${forgeSnapshotFile}`);
}
if (!report.hasMeasuredValues) {
  report.notes.push('No parseable gas measurements were found in available snapshot files.');
}

if (report.forge.available && report.forge.rows.length === 0) {
  report.notes.push('Forge snapshot file is present but no rows matched parser patterns.');
}
if (
  report.hardhat.available &&
  report.hardhat.methods.length === 0 &&
  !(report.hardhatJson.available && report.hardhatJson.methods.length > 0)
) {
  report.notes.push('Hardhat gas report file is present but no table rows matched parser patterns.');
}
if (report.hardhatJson.available && report.hardhatJson.methods.length === 0) {
  report.notes.push('Hardhat gas JSON file is present but no executed methods contained gas data.');
}
if (!report.completeness.isComplete) {
  report.notes.push(
    `Missing benchmark measurements for: ${report.completeness.missingBenchmarks.join(', ')}`,
  );
}

if (report.forge.available) {
  report.forge = {
    ...report.forge,
    sampleRows: report.forge.rows.slice(0, 20),
  };
};
if (report.hardhat.available) {
  report.hardhat = {
    ...report.hardhat,
    sampleMethods: report.hardhat.methods.slice(0, 20),
  };
};
if (report.hardhatJson.available) {
  report.hardhatJson = {
    ...report.hardhatJson,
    sampleMethods: report.hardhatJson.methods.slice(0, 20),
  };
}

fs.mkdirSync('tests/reports', { recursive: true });
fs.writeFileSync('tests/reports/gas-report.json', JSON.stringify(report, null, 2));
console.log('[gas-report] wrote tests/reports/gas-report.json');
