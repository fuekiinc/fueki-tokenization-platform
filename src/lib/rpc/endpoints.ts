/**
 * RPC endpoint registry with deterministic fallback and basic health cooldown.
 *
 * Endpoints are loaded from comma-separated env vars (for example:
 * `VITE_RPC_17000_URLS=url1,url2`) and merged with safe defaults.
 */

import logger from '../logger';

const FAILURE_THRESHOLD = 2;
const COOLDOWN_MS = 30_000;
const HEALTHY_ENDPOINT_CACHE_TTL_MS = 2 * 60_000;

interface EndpointHealth {
  failures: number;
  cooldownUntil: number;
}

interface HealthyEndpointCacheEntry {
  url: string;
  expiresAt: number;
}

const endpointHealth = new Map<string, EndpointHealth>();
const healthyEndpointCache = new Map<number, HealthyEndpointCacheEntry>();
const log = logger.child('rpc-endpoints');

const RPC_ENV_BY_CHAIN: Record<number, string> = {
  1: 'VITE_RPC_1_URLS',
  137: 'VITE_RPC_137_URLS',
  17000: 'VITE_RPC_17000_URLS',
  42161: 'VITE_RPC_42161_URLS',
  421614: 'VITE_RPC_421614_URLS',
  8453: 'VITE_RPC_8453_URLS',
  84532: 'VITE_RPC_84532_URLS',
  11155111: 'VITE_RPC_11155111_URLS',
};

const DEFAULT_RPC_BY_CHAIN: Record<number, string[]> = {
  1: [
    'https://billowing-rough-moon.quiknode.pro/a3cc003399fc8c72876d87c1f516c0897574e60c/',
    'https://ethereum-rpc.publicnode.com',
    'https://eth.drpc.org',
  ],
  137: [
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygon.drpc.org',
    'https://1rpc.io/matic',
  ],
  31337: ['http://127.0.0.1:8545'],
  17000: [
    'https://flashy-crimson-borough.ethereum-holesky.quiknode.pro/f43097bbd32a1c3476c2f3f1ff1d4780361be827/',
    'https://holesky.drpc.org',
    'https://ethereum-holesky-rpc.publicnode.com',
    'https://1rpc.io/holesky',
  ],
  42161: [
    'https://snowy-blue-frost.arbitrum-mainnet.quiknode.pro/a691b5e884e8df719f8ce8ec8ad5e22092d17cdb/',
    'https://arb1.arbitrum.io/rpc',
  ],
  421614: [
    'https://ancient-holy-tent.arbitrum-sepolia.quiknode.pro/53623a401aa412366b43ddea31aa6538ef24d7fd/',
    'https://arbitrum-sepolia-rpc.publicnode.com',
    'https://arbitrum-sepolia.drpc.org',
    'https://sepolia-rollup.arbitrum.io/rpc',
  ],
  8453: [
    'https://delicate-red-cloud.base-mainnet.quiknode.pro/3ae2b0cd08e640c9c6a3e4c0ca89351dc879e5c8/',
    'https://mainnet.base.org',
  ],
  84532: [
    'https://billowing-wandering-yard.base-sepolia.quiknode.pro/70e0d692e7ba902f935ff17774c1aed59a21e0d0/',
    'https://sepolia.base.org',
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
    .filter((part) => part.length > 0)
    .filter((part) => {
      try {
        const parsed = new URL(part);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch {
        log.warn('Ignoring invalid RPC URL from environment config', { url: part });
        return false;
      }
    });
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
 * RPC URLs suitable for wallet chain-switch / chain-add prompts.
 *
 * We intentionally prioritize built-in public endpoints first to avoid
 * wallet validation failures when user-provided/private endpoints are
 * unavailable to the wallet runtime.
 */
export function getWalletSwitchRpcUrls(chainId: number): string[] {
  const defaults = DEFAULT_RPC_BY_CHAIN[chainId] ?? [];
  const configured = getRpcEndpoints(chainId);
  return dedupeStable([...defaults, ...configured]);
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

  const cachedHealthy = healthyEndpointCache.get(chainId);
  if (
    cachedHealthy &&
    cachedHealthy.expiresAt > now &&
    endpoints.includes(cachedHealthy.url)
  ) {
    const health = endpointHealth.get(endpointKey(chainId, cachedHealthy.url));
    if (!health || health.cooldownUntil <= now) {
      return cachedHealthy.url;
    }
  }

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

  const now = Date.now();
  const cachedHealthy = healthyEndpointCache.get(chainId);
  if (
    cachedHealthy &&
    cachedHealthy.expiresAt > now &&
    endpoints.includes(cachedHealthy.url)
  ) {
    const health = endpointHealth.get(endpointKey(chainId, cachedHealthy.url));
    if (!health || health.cooldownUntil <= now) {
      return cachedHealthy.url;
    }
  }

  // Shared AbortController lets us cancel remaining probes once the first
  // one succeeds, preventing wasted network requests and open connections.
  const sharedController = new AbortController();

  /** Probe a single endpoint; resolves with its URL on success, rejects on failure. */
  const probe = (url: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
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
        signal: sharedController.signal,
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
          // Don't report abort as a failure -- it means another probe won.
          if (err instanceof DOMException && err.name === 'AbortError') {
            reject(err);
            return;
          }
          reportRpcEndpointFailure(chainId, url);
          reject(err);
        });
    });

  try {
    // Promise.any resolves as soon as ANY probe succeeds.
    const healthy = await Promise.any(endpoints.map(probe));
    // Abort remaining in-flight probes to free connections.
    sharedController.abort();
    healthyEndpointCache.set(chainId, {
      url: healthy,
      expiresAt: Date.now() + HEALTHY_ENDPOINT_CACHE_TTL_MS,
    });
    return healthy;
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
  healthyEndpointCache.set(chainId, {
    url,
    expiresAt: Date.now() + HEALTHY_ENDPOINT_CACHE_TTL_MS,
  });
}
