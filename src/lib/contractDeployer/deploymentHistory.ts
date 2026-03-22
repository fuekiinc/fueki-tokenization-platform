/**
 * Deployment history persistence for the Fueki Smart Contract Deployer.
 *
 * Stores deployment records in localStorage so the user can view, search, and
 * interact with previously deployed contracts without requiring a backend.
 * Older entries are automatically pruned when the store exceeds MAX_ENTRIES.
 */

import type { DeploymentRecord } from '../../types/contractDeployer';
import logger from '../logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'fueki-contract-history-v1';
const LEGACY_STORAGE_KEY = 'fueki:deploy:history';
const MAX_ENTRIES = 100;

function deploymentIdentity(record: Pick<DeploymentRecord, 'chainId' | 'contractAddress'>): string {
  return `${record.chainId}:${record.contractAddress.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Load all deployment records from localStorage.
 * Returns an empty array if no records exist or if parsing fails.
 */
export function loadDeployments(): DeploymentRecord[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Basic shape validation -- ensure each entry has minimum required fields
    return parsed.filter(
      (entry: unknown): entry is DeploymentRecord =>
        typeof entry === 'object' &&
        entry !== null &&
        'id' in entry &&
        'contractAddress' in entry &&
        'chainId' in entry,
    );
  } catch {
    return [];
  }
}

/**
 * Find a specific deployment by chain ID and contract address.
 * Address comparison is case-insensitive (checksum-agnostic).
 */
export function getDeployment(chainId: number, address: string): DeploymentRecord | undefined {
  const history = loadDeployments();
  const normalizedAddress = address.toLowerCase();
  return history.find(
    (r) => r.chainId === chainId && r.contractAddress.toLowerCase() === normalizedAddress,
  );
}

/**
 * Find a specific deployment by its unique ID.
 */
export function getDeploymentById(id: string): DeploymentRecord | undefined {
  const history = loadDeployments();
  return history.find((r) => r.id === id);
}

/**
 * Get all deployments for a specific chain.
 */
export function getDeploymentsByChain(chainId: number): DeploymentRecord[] {
  return loadDeployments().filter((r) => r.chainId === chainId);
}

/**
 * Merge deployment records from multiple sources while deduping by
 * chainId+contractAddress. Newer records win when duplicates exist.
 */
export function mergeDeployments(
  local: DeploymentRecord[],
  remote: DeploymentRecord[],
): DeploymentRecord[] {
  const merged = new Map<string, DeploymentRecord>();

  for (const record of [...local, ...remote]) {
    const key = deploymentIdentity(record);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, record);
      continue;
    }

    const existingTime = new Date(existing.deployedAt).getTime();
    const recordTime = new Date(record.deployedAt).getTime();
    if (recordTime >= existingTime) {
      merged.set(key, record);
    }
  }

  return Array.from(merged.values())
    .sort((left, right) => {
      const leftTime = new Date(left.deployedAt).getTime();
      const rightTime = new Date(right.deployedAt).getTime();
      return rightTime - leftTime;
    })
    .slice(0, MAX_ENTRIES);
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Save a new deployment record. The record is prepended to the list (newest
 * first). If the list exceeds MAX_ENTRIES, the oldest entries are pruned.
 */
export function saveDeployment(record: DeploymentRecord): void {
  persistHistory(mergeDeployments([record], loadDeployments()));
}

/**
 * Remove a deployment record by its unique ID.
 */
export function removeDeployment(id: string): void {
  const history = loadDeployments().filter((r) => r.id !== id);
  persistHistory(history);
}

/**
 * Clear all deployment history from localStorage.
 */
export function clearDeployments(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage may be unavailable (private browsing, storage quota, etc.)
  }
}

/**
 * Replace the full persisted deployment history with a pre-merged list.
 */
export function replaceDeployments(history: DeploymentRecord[]): void {
  persistHistory(history);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Persist the deployment history array to localStorage.
 * Fails silently -- storage errors should never break the deployer.
 */
function persistHistory(history: DeploymentRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (err) {
    logger.warn('[deploymentHistory] Failed to persist history', err);
  }
}
