#!/usr/bin/env tsx

/*
 * Smoke-check JSON-RPC batch behavior for configured endpoints.
 *
 * Usage:
 *   npx tsx scripts/check-rpc-batch-limits.ts
 */

import { getRpcEndpoints } from '../src/lib/rpc/endpoints';

const CHAIN_IDS = [1, 17000, 42161, 421614, 8453, 84532] as const;

interface ProbeResult {
  ok: boolean;
  status: number;
  body: string;
}

async function probe(url: string, batchSize: number): Promise<ProbeResult> {
  const payload = Array.from({ length: batchSize }, (_, idx) => ({
    jsonrpc: '2.0',
    id: idx + 1,
    method: 'eth_chainId',
    params: [],
  }));

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarize(body: string): string {
  return body.length > 180 ? `${body.slice(0, 180)}...` : body;
}

async function run(): Promise<void> {
  let hadFailure = false;

  for (const chainId of CHAIN_IDS) {
    const endpoints = getRpcEndpoints(chainId);
    if (endpoints.length === 0) {
      console.log(`[chain ${chainId}] no endpoints configured`);
      continue;
    }

    const primary = endpoints[0];
    const one = await probe(primary, 1);
    const four = await probe(primary, 4);

    if (!one.ok) {
      hadFailure = true;
      console.log(`[chain ${chainId}] primary failed single call: ${one.status} ${summarize(one.body)}`);
      continue;
    }

    const hasBatchLimit = /batch of more than|not allowed on free tier|too many requests/i.test(four.body);
    const batchStatus = hasBatchLimit
      ? 'LIMITED (expected for some free-tier RPCs)'
      : four.ok
        ? 'OK'
        : `FAIL (${four.status})`;

    if (!four.ok && !hasBatchLimit) {
      hadFailure = true;
    }

    console.log(`[chain ${chainId}] primary=${primary}`);
    console.log(`  batch size 1: OK (${one.status})`);
    console.log(`  batch size 4: ${batchStatus}`);
  }

  if (hadFailure) {
    process.exitCode = 1;
  }
}

void run();
