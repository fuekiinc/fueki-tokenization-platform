#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function parseVersion(version) {
  const cleaned = String(version).replace(/^v/, '');
  const parts = cleaned.split('.').map((part) => Number.parseInt(part, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  if (typeof result.error?.message === 'string') {
    console.error(result.error.message);
  }

  process.exit(result.status ?? 1);
}

const [, , minVersion, scriptPath, ...scriptArgs] = process.argv;

if (!minVersion || !scriptPath) {
  console.error('Usage: node scripts/run-supported-node.mjs <min-version> <script-path> [...args]');
  process.exit(1);
}

const resolvedScript = path.resolve(scriptPath);
if (!fs.existsSync(resolvedScript)) {
  console.error(`Unsupported node wrapper could not find script: ${resolvedScript}`);
  process.exit(1);
}

if (compareVersions(process.versions.node, minVersion) >= 0) {
  run(process.execPath, [resolvedScript, ...scriptArgs]);
}

run('npx', ['-y', `node@${minVersion}`, resolvedScript, ...scriptArgs]);
