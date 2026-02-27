/**
 * RPC endpoint registry with deterministic fallback and basic health cooldown.
 *
 * Endpoints are loaded from comma-separated env vars (for example:
 * `VITE_RPC_17000_URLS=url1,url2`) and merged with safe defaults.
 */

import logger from '../logger';

const FAILURE_THRESHOLD = 2;
const COOLDOWN_MS = 30_000;

interface EndpointHealth {
  failures: number;
  cooldownUntil: number;
}

const endpointHealth = new Map<string, EndpointHealth>();
const log = logger.child('rpc-endpoints');

const RPC_ENV_BY_CHAIN: Record<number, string> = {
  1: 'VITE_RPC_1_URLS',
  17000: 'VITE_RPC_17000_URLS',
  42161: 'VITE_RPC_42161_URLS',
  421614: 'VITE_RPC_421614_URLS',
  8453: 'VITE_RPC_8453_URLS',
  84532: 'VITE_RPC_84532_URLS',
};

const DEFAULT_RPC_BY_CHAIN: Record<number, string[]> = {
  1: [
    'https://ethereum-rpc.publicnode.com',
    'https://eth.drpc.org',
  ],
  137: ['https://polygon-rpc.com'],
  31337: ['http://127.0.0.1:8545'],
  8453: ['https://mainnet.base.org'],
  84532: ['https://sepolia.base.org'],
  17000: [
    'https://holesky.drpc.org',
    'https://ethereum-holesky-rpc.publicnode.com',
    'https://1rpc.io/holesky',
    'https://rpc.holesky.ethpandaops.io',
  ],
  42161: ['https://arb1.arbitrum.io/rpc'],
  421614: [
    'https://sepolia-rollup.arbitrum.io/rpc',
    'https://arbitrum-sepolia-rpc.publicnode.com',
  ],
  11155111: [
    'https://rpc.sepolia.org',
    'https://ethereum-sepolia-rpc.publicnode.com',
  ],
};

function endpointKey(chainId: number, url: string): string {
  return `${chainId}:${url}`;
}

function getEnvValue(name: string): string {
  const env = (import.meta as ImportMeta & {
    env?: Record<string, unknown>;
  }).env;
  const raw = env?.[name];
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

function parseCommaSeparatedUrls(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function dedupeStable(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const candidate = error as {
    message?: unknown;
    shortMessage?: unknown;
    details?: unknown;
    cause?: unknown;
  };
  if (typeof candidate?.shortMessage === 'string') return candidate.shortMessage;
  if (typeof candidate?.message === 'string') return candidate.message;
  if (typeof candidate?.details === 'string') return candidate.details;
  if (candidate?.cause) return extractErrorMessage(candidate.cause);
  return String(error);
}

const RETRYABLE_RPC_ERROR_PATTERNS = [
  /rpc endpoint returned too many errors/i,
  /too many requests|rate\s*limit|http\s*429/i,
  /temporarily unavailable|service unavailable/i,
  /bad gateway|gateway timeout|http\s*50[234]/i,
  /timeout|timed out|etimedout/i,
  /failed to fetch|networkerror|network request failed/i,
  /econnreset|econnrefused|ehostunreach|enotfound/i,
  /socket hang up|fetch failed|upstream/i,
];

export function isRetryableRpcError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  if (!message) return false;
  return RETRYABLE_RPC_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function getRpcEnvVarName(chainId: number): string | null {
  return RPC_ENV_BY_CHAIN[chainId] ?? null;
}

export function getRpcEndpoints(chainId: number): string[] {
  const envName = getRpcEnvVarName(chainId);
  const fromEnv = envName ? parseCommaSeparatedUrls(getEnvValue(envName)) : [];
  const defaults = DEFAULT_RPC_BY_CHAIN[chainId] ?? [];
  return dedupeStable([...fromEnv, ...defaults]);
}

/**
 * Return the preferred endpoint for a chain, excluding endpoints in cooldown.
 */
export function selectRpcEndpoint(chainId: number): string {
  const endpoints = getRpcEndpoints(chainId);
  if (endpoints.length === 0) {
    throw new Error(`No RPC endpoints configured for chain ${chainId}`);
  }

  const now = Date.now();
  for (const url of endpoints) {
    const health = endpointHealth.get(endpointKey(chainId, url));
    if (!health || health.cooldownUntil <= now) {
      if (url !== endpoints[0]) {
        log.warn(`Using fallback RPC endpoint on chain ${chainId}`, {
          chainId,
          endpoint: url,
          primary: endpoints[0],
        });
      }
      return url;
    }
  }

  // If all endpoints are cooling down, return the first deterministic entry.
  log.warn(`All RPC endpoints are cooling down on chain ${chainId}; using primary anyway`, {
    chainId,
    endpoint: endpoints[0],
  });
  return endpoints[0];
}

export function getOrderedRpcEndpoints(chainId: number): string[] {
  const endpoints = getRpcEndpoints(chainId);
  if (endpoints.length <= 1) return endpoints;
  const preferred = selectRpcEndpoint(chainId);
  return [preferred, ...endpoints.filter((endpoint) => endpoint !== preferred)];
}

export function getPrimaryRpcUrl(chainId: number): string {
  return selectRpcEndpoint(chainId);
}

export function reportRpcEndpointFailure(chainId: number, url: string): void {
  const key = endpointKey(chainId, url);
  const existing = endpointHealth.get(key) ?? { failures: 0, cooldownUntil: 0 };
  const failures = existing.failures + 1;
  const cooldownUntil =
    failures >= FAILURE_THRESHOLD ? Date.now() + COOLDOWN_MS : existing.cooldownUntil;
  endpointHealth.set(key, { failures, cooldownUntil });

  if (failures >= FAILURE_THRESHOLD) {
    log.warn(`RPC endpoint entered cooldown on chain ${chainId}`, {
      chainId,
      endpoint: url,
      failures,
      cooldownMs: COOLDOWN_MS,
    });
  }
}

/**
 * Probe RPC endpoints for a chain **in parallel** and return the first one that
 * responds to `eth_blockNumber`. This avoids 5-second serial timeouts per dead
 * endpoint — a single healthy endpoint responds almost instantly.
 *
 * Returns the first healthy URL, or `null` if all fail.
 */
export async function findHealthyEndpoint(
  chainId: number,
  timeoutMs = 5_000,
): Promise<string | null> {
  const endpoints = getRpcEndpoints(chainId);
  if (endpoints.length === 0) return null;

  /** Probe a single endpoint; resolves with its URL on success, rejects on failure. */
  const probe = (url: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error('timeout'));
      }, timeoutMs);

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          clearTimeout(timer);
          if (!res.ok) {
            reportRpcEndpointFailure(chainId, url);
            reject(new Error(`HTTP ${res.status}`));
            return;
          }
          const json = (await res.json()) as {
            result?: string;
            error?: unknown;
          };
          if (json.result) {
            log.info(`RPC probe success on chain ${chainId}`, { endpoint: url });
            reportRpcEndpointSuccess(chainId, url);
            resolve(url);
          } else {
            reportRpcEndpointFailure(chainId, url);
            reject(new Error('no result'));
          }
        })
        .catch((err) => {
          clearTimeout(timer);
          reportRpcEndpointFailure(chainId, url);
          reject(err);
        });
    });

  try {
    // Promise.any resolves as soon as ANY probe succeeds.
    return await Promise.any(endpoints.map(probe));
  } catch {
    // AggregateError — all probes failed.
    return null;
  }
}

export function reportRpcEndpointSuccess(chainId: number, url: string): void {
  const key = endpointKey(chainId, url);
  if (endpointHealth.has(key)) {
    log.info(`RPC endpoint recovered on chain ${chainId}`, {
      chainId,
      endpoint: url,
    });
  }
  endpointHealth.delete(key);
}
