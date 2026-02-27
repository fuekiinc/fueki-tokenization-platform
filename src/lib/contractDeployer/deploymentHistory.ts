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

const STORAGE_KEY = 'fueki:deploy:history';
const MAX_ENTRIES = 100;

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Load all deployment records from localStorage.
 * Returns an empty array if no records exist or if parsing fails.
 */
export function loadDeployments(): DeploymentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Save a new deployment record. The record is prepended to the list (newest
 * first). If the list exceeds MAX_ENTRIES, the oldest entries are pruned.
 */
export function saveDeployment(record: DeploymentRecord): void {
  const history = loadDeployments();

  // Prevent duplicate entries for the same contract on the same chain
  const existingIndex = history.findIndex(
    (r) =>
      r.chainId === record.chainId &&
      r.contractAddress.toLowerCase() === record.contractAddress.toLowerCase(),
  );
  if (existingIndex !== -1) {
    history.splice(existingIndex, 1);
  }

  // Prepend new record (newest first)
  history.unshift(record);

  // Prune oldest entries if over limit
  if (history.length > MAX_ENTRIES) {
    history.length = MAX_ENTRIES;
  }

  persistHistory(history);
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
  } catch (err) {
    logger.warn('[deploymentHistory] Failed to persist history', err);
  }
}
