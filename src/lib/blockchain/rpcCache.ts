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
 * `invalidateCacheForAsset`.
 *
 * Memory management:
 *   - MAX_CACHE_SIZE limits total entries; LRU eviction removes the
 *     least-recently-accessed entries when the cap is reached.
 *   - Expired entries are lazily cleaned on access and periodically
 *     via a sweep timer.
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
// Periodic sweep -- removes expired entries proactively so memory does not
// grow unbounded even if entries are never re-accessed.
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
}

// Start the sweep on module load. In test environments this is harmless;
// the timer uses setInterval which does not prevent Node from exiting.
startSweepTimer();

// ---------------------------------------------------------------------------
// LRU eviction -- sorts by lastAccessed and removes the oldest batch.
// ---------------------------------------------------------------------------

function evictLRU(): void {
  if (cache.size <= MAX_CACHE_SIZE) return;

  // Collect entries sorted by lastAccessed ascending (oldest first).
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

/**
 * Retrieve a cached value by key.
 * Returns `undefined` if the key is missing or the entry has expired.
 */
export function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  const now = Date.now();
  if (now - entry.createdAt > entry.ttlMs) {
    cache.delete(key);
    return undefined;
  }

  // Update last-accessed timestamp for LRU tracking.
  entry.lastAccessed = now;
  return entry.data as T;
}

/**
 * Store a value in the cache with a given TTL.
 *
 * @param key    Cache key (e.g. `asset:0xABC:balance:0xDEF`).
 * @param data   The data to cache.
 * @param ttlMs  Time-to-live in milliseconds. Use one of the TTL_*
 *               constants for consistency, or the default (30 s).
 */
export function setCache<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  const now = Date.now();
  cache.set(key, { data, createdAt: now, lastAccessed: now, ttlMs });

  // Evict if we exceed the size limit.
  if (cache.size > MAX_CACHE_SIZE) {
    evictLRU();
  }
}

/**
 * Invalidate cache entries by prefix, or clear the entire cache.
 *
 * @param prefix  If provided, only entries whose key starts with this
 *                string are removed. If omitted, the entire cache is cleared.
 */
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

/**
 * Invalidate all cache entries related to a specific asset address.
 * Covers balances, allowances, details, pool data, etc.
 */
export function invalidateCacheForAsset(assetAddress: string): void {
  invalidateCache(`asset:${assetAddress}`);
}

/**
 * Invalidate all pool-related cache entries.
 * Should be called after any AMM write operation (swap, add/remove liquidity).
 */
export function invalidatePoolCache(): void {
  invalidateCache('amm:');
  invalidateCache('orbital:');
}

/**
 * Return the current cache size (for diagnostics).
 */
export function getCacheSize(): number {
  return cache.size;
}

/**
 * Stop the periodic sweep timer. Useful for clean shutdown in tests.
 */
export function stopSweepTimer(): void {
  if (sweepTimer !== null) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
