/**
 * TTL-based in-memory cache for RPC read results.
 *
 * Stores responses keyed by a caller-defined string (e.g.
 * `asset:0xABC:details`) and evicts entries after a configurable TTL.
 * This avoids redundant RPC round-trips when the same data is requested
 * multiple times within a short window (e.g. navigating between pages).
 *
 * TTL tiers:
 *   - BALANCE  (30 s): balances, allowances -- time-sensitive
 *   - POOL     (60 s): pool reserves, LP positions -- moderate freshness
 *   - METADATA (300 s): names, symbols, decimals -- rarely change
 *
 * Write operations must NEVER be cached. After any on-chain mutation the
 * relevant cache entries should be invalidated via `invalidateCache` or
 * chain-scoped helpers.
 */

import logger from '../logger';

// ---------------------------------------------------------------------------
// TTL constants (milliseconds)
// ---------------------------------------------------------------------------

/** 30 seconds -- balances, allowances. */
export const TTL_BALANCE = 30_000;

/** 60 seconds -- pool reserves, LP data. */
export const TTL_POOL = 60_000;

/** 300 seconds -- token metadata (name, symbol, decimals). */
export const TTL_METADATA = 300_000;

/** Default TTL when no specific tier is provided. */
const DEFAULT_TTL_MS = TTL_BALANCE;

const CHAIN_KEY_PREFIX = 'chain:';

// ---------------------------------------------------------------------------
// Cache internals
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  /** Timestamp when the entry was stored. */
  createdAt: number;
  /** Timestamp of last access (for LRU eviction). */
  lastAccessed: number;
  /** Time-to-live in milliseconds. */
  ttlMs: number;
}

/** Maximum number of entries before LRU eviction kicks in. */
const MAX_CACHE_SIZE = 500;

/** Number of entries to evict in a single LRU pass (batch eviction). */
const EVICTION_BATCH_SIZE = 50;

/** Interval for periodic expired-entry sweep (ms). */
const SWEEP_INTERVAL_MS = 60_000;

const cache = new Map<string, CacheEntry<unknown>>();

// ---------------------------------------------------------------------------
// Periodic sweep
// ---------------------------------------------------------------------------

let sweepTimer: ReturnType<typeof setInterval> | null = null;

function startSweepTimer(): void {
  if (sweepTimer !== null) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now - entry.createdAt > entry.ttlMs) {
        cache.delete(key);
      }
    }
  }, SWEEP_INTERVAL_MS);

  // Allow Node-based scripts/tests to exit without waiting on this interval.
  if (typeof (sweepTimer as { unref?: () => void }).unref === 'function') {
    (sweepTimer as { unref: () => void }).unref();
  }
}

startSweepTimer();

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

export function makeChainCacheKey(chainId: number, key: string): string {
  return `${CHAIN_KEY_PREFIX}${chainId}:${key}`;
}

export function getChainCachePrefix(chainId: number): string {
  return `${CHAIN_KEY_PREFIX}${chainId}:`;
}

export function getChainCachePrefixForKey(chainId: number, keyPrefix: string): string {
  return makeChainCacheKey(chainId, keyPrefix);
}

// ---------------------------------------------------------------------------
// LRU eviction
// ---------------------------------------------------------------------------

function evictLRU(): void {
  if (cache.size <= MAX_CACHE_SIZE) return;

  const entries = Array.from(cache.entries()).sort(
    ([, a], [, b]) => a.lastAccessed - b.lastAccessed,
  );

  const toRemove = Math.min(EVICTION_BATCH_SIZE, entries.length);
  for (let i = 0; i < toRemove; i++) {
    cache.delete(entries[i][0]);
  }

  logger.debug(`[rpcCache] LRU eviction removed ${toRemove} entries, size=${cache.size}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  const now = Date.now();
  if (now - entry.createdAt > entry.ttlMs) {
    cache.delete(key);
    return undefined;
  }

  entry.lastAccessed = now;
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  const now = Date.now();
  cache.set(key, { data, createdAt: now, lastAccessed: now, ttlMs });

  if (cache.size > MAX_CACHE_SIZE) {
    evictLRU();
  }
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/** Invalidate all cache entries for a specific chain, optionally by key prefix. */
export function invalidateChainCache(chainId: number, keyPrefix?: string): void {
  const prefix = keyPrefix
    ? getChainCachePrefixForKey(chainId, keyPrefix)
    : getChainCachePrefix(chainId);
  invalidateCache(prefix);
}

export function invalidateCacheForAsset(assetAddress: string, chainId?: number): void {
  if (typeof chainId === 'number') {
    invalidateChainCache(chainId, `asset:${assetAddress}`);
    return;
  }
  invalidateCache(`asset:${assetAddress}`);
}

export function invalidatePoolCache(chainId?: number): void {
  if (typeof chainId === 'number') {
    invalidateChainCache(chainId, 'amm:');
    invalidateChainCache(chainId, 'orbital:');
    return;
  }
  invalidateCache('amm:');
  invalidateCache('orbital:');
}

export function getCacheSize(): number {
  return cache.size;
}

export function stopSweepTimer(): void {
  if (sweepTimer !== null) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
