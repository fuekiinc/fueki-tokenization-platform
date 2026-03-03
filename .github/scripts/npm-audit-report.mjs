import { readFileSync } from 'node:fs';

function parseJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not parse ${filePath}: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : [value];
}

function formatVia(via) {
  return toArray(via)
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        const source = typeof entry.source === 'number' ? `GHSA-${entry.source}` : 'advisory';
        const title = typeof entry.title === 'string' ? entry.title : 'issue';
        return `${source}: ${title}`;
      }
      return 'unknown advisory';
    })
    .slice(0, 3)
    .join('; ');
}

function summarizeVulnerabilities(report) {
  const vulnerabilities = report?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== 'object') return [];

  return Object.entries(vulnerabilities).map(([name, detail]) => {
    const severity = typeof detail?.severity === 'string' ? detail.severity : 'unknown';
    const fixAvailable =
      detail?.fixAvailable === true
        ? 'yes'
        : detail?.fixAvailable && typeof detail.fixAvailable === 'object' && typeof detail.fixAvailable.name === 'string'
          ? `yes (${detail.fixAvailable.name})`
          : 'no';
    const range = typeof detail?.range === 'string' ? detail.range : 'unknown';
    const via = formatVia(detail?.via);

    return { name, severity, fixAvailable, range, via };
  });
}

function writeSummary(message) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    process.stdout.write(`${message}\n`);
  } else {
    console.log(message);
  }
}

const [filePath, label = 'dependency-set'] = process.argv.slice(2);
if (!filePath) {
  console.error('Usage: node .github/scripts/npm-audit-report.mjs <audit-json-path> [label]');
  process.exit(2);
}

const report = parseJson(filePath);
const meta = report?.metadata?.vulnerabilities ?? {};
const counts = {
  critical: Number(meta.critical ?? 0),
  high: Number(meta.high ?? 0),
  moderate: Number(meta.moderate ?? 0),
  low: Number(meta.low ?? 0),
};

const rows = summarizeVulnerabilities(report)
  .sort((a, b) => {
    const rank = { critical: 4, high: 3, moderate: 2, low: 1, info: 0, unknown: -1 };
    return (rank[b.severity] ?? -1) - (rank[a.severity] ?? -1);
  })
  .slice(0, 20);

writeSummary(`## npm audit (${label})`);
writeSummary(`- Critical: ${counts.critical}`);
writeSummary(`- High: ${counts.high}`);
writeSummary(`- Moderate: ${counts.moderate}`);
writeSummary(`- Low: ${counts.low}`);

if (rows.length > 0) {
  writeSummary('');
  writeSummary('| Package | Severity | Fix Available | Range | Advisory |');
  writeSummary('| --- | --- | --- | --- | --- |');
  for (const row of rows) {
    writeSummary(`| ${row.name} | ${row.severity} | ${row.fixAvailable} | ${row.range} | ${row.via} |`);
  }
  writeSummary('');
  writeSummary(`Run \`npm audit fix --omit=dev\` for ${label}, then re-run CI.`);
}

if (counts.critical > 0 || counts.high > 0) {
  console.error(`Blocking security gate: ${label} has ${counts.critical} critical and ${counts.high} high vulnerabilities.`);
  process.exit(1);
}
