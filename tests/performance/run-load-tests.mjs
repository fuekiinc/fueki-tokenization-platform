#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('tests/reports', { recursive: true });

const baseUrl = process.env.FUEKI_API_URL || 'https://fueki-backend-pojr5zp2oq-uc.a.run.app';
const reportPath = 'tests/reports/api-load-report.json';
const startedAt = new Date().toISOString();

function hasCommand(command) {
  const probe = spawnSync('bash', ['-lc', `command -v ${command}`], { encoding: 'utf8' });
  return probe.status === 0;
}

function writeReport(payload) {
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  console.log(`[performance] wrote ${reportPath}`);
}

if (hasCommand('k6')) {
  const result = spawnSync(
    'k6',
    ['run', 'tests/performance/k6-api-load.js', '--summary-export', reportPath],
    {
      env: { ...process.env, FUEKI_API_URL: baseUrl },
      stdio: 'inherit',
    },
  );

  if (result.status === 0) {
    process.exit(0);
  }

  writeReport({
    generatedAt: new Date().toISOString(),
    startedAt,
    runner: 'k6',
    ok: false,
    error: `k6 exited with code ${result.status ?? -1}`,
  });
  process.exit(result.status ?? 1);
}

const artilleryBin = './node_modules/.bin/artillery';
if (fs.existsSync(artilleryBin)) {
  const output = 'tests/reports/artillery-raw.json';
  const artilleryEntrypoint = path.resolve('node_modules/artillery/bin/run');
  const artilleryCommand = process.versions.node.localeCompare('22.13.0', undefined, {
    numeric: true,
    sensitivity: 'base',
  }) >= 0
    ? { command: process.execPath, args: [artilleryEntrypoint] }
    : { command: 'npx', args: ['-y', 'node@22.13.0', artilleryEntrypoint] };
  const result = spawnSync(
    artilleryCommand.command,
    [...artilleryCommand.args, 'run', 'tests/api/load-artillery.yml', '--output', output],
    {
      env: { ...process.env, FUEKI_API_URL: baseUrl },
      stdio: 'inherit',
    },
  );

  if (result.status === 0) {
    const raw = fs.existsSync(output)
      ? JSON.parse(fs.readFileSync(output, 'utf8'))
      : null;

    writeReport({
      generatedAt: new Date().toISOString(),
      startedAt,
      runner: 'artillery',
      ok: true,
      summary: raw,
    });
    process.exit(0);
  }

  writeReport({
    generatedAt: new Date().toISOString(),
    startedAt,
    runner: 'artillery',
    ok: false,
    error: `artillery exited with code ${result.status ?? -1}`,
  });
  process.exit(result.status ?? 1);
}

writeReport({
  generatedAt: new Date().toISOString(),
  startedAt,
  ok: false,
  skipped: true,
  reason: 'Neither k6 nor artillery is available',
});
process.exit(0);
