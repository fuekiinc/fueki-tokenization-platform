#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const [, , action = 'status'] = process.argv;
const pidFile = 'tests/reports/anvil.pid';
const logFile = 'tests/reports/anvil.log';

function readPid() {
  if (!fs.existsSync(pidFile)) return null;
  const raw = fs.readFileSync(pidFile, 'utf8').trim();
  return raw ? Number(raw) : null;
}

if (action === 'start') {
  const rpcUrl = process.env.ARBITRUM_RPC_URL || process.env.MAINNET_RPC_URL;
  if (!rpcUrl) {
    console.error('Set ARBITRUM_RPC_URL or MAINNET_RPC_URL before starting an Anvil fork.');
    process.exit(1);
  }

  fs.mkdirSync('tests/reports', { recursive: true });
  const port = process.env.ANVIL_PORT || '8545';
  const child = spawn('anvil', ['--fork-url', rpcUrl, '--port', port], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  fs.writeFileSync(pidFile, String(child.pid));
  child.unref();
  console.log(`Anvil started on port ${port} (pid ${child.pid}).`);
  process.exit(0);
}

if (action === 'stop') {
  const pid = readPid();
  if (!pid) {
    console.log('No tracked Anvil PID found.');
    process.exit(0);
  }
  try {
    process.kill(pid, 'SIGTERM');
    fs.rmSync(pidFile, { force: true });
    console.log(`Stopped Anvil pid ${pid}.`);
    process.exit(0);
  } catch (error) {
    console.error(`Failed to stop pid ${pid}:`, error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const pid = readPid();
if (!pid) {
  console.log('Anvil status: not running (no pid file).');
  process.exit(0);
}

try {
  process.kill(pid, 0);
  console.log(`Anvil status: running (pid ${pid}).`);
} catch {
  console.log(`Anvil status: stale pid file (${pid}).`);
  process.exitCode = 1;
}
