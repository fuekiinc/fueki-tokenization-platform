/**
 * Simple in-memory cache for RPC read results.
 *
 * Stores responses keyed by a caller-defined string (e.g.
 * `asset:0xABC:details`) and evicts entries after a configurable TTL.
 * This avoids redundant RPC round-trips when the same data is requested
 * multiple times within a short window (e.g. navigating between pages).
 *
 * Write operations must NEVER be cached. After any on-chain mutation the
 * relevant cache entries should be invalidated via `invalidateCache` or
 * `invalidateCacheForAsset`.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 30_000; // 30 seconds

export function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > DEFAULT_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, _ttlMs = DEFAULT_TTL_MS): void {
  cache.set(key, { data, timestamp: Date.now() });
  // Evict oldest entries if cache grows too large
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function invalidateCacheForAsset(assetAddress: string): void {
  invalidateCache(`asset:${assetAddress}`);
}
