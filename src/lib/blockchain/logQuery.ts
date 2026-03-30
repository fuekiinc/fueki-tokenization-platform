import { ethers } from 'ethers';
import logger from '../logger';
import {
  getOrderedRpcEndpoints,
  isRetryableRpcError,
  reportRpcEndpointFailure,
  reportRpcEndpointSuccess,
} from '../rpc/endpoints';
import {
  createReadOnlyRpcProvider,
  getJsonRpcProviderUrl,
} from '../rpc/providers';

export interface RecentLogQueryOptions {
  chainId: number;
  label: string;
  maxLookbackBlocks: number;
  initialChunkSize?: number;
  minChunkSize?: number;
  maxRequests?: number;
  maxEvents?: number;
}

const DEFAULT_INITIAL_CHUNK_SIZE = 100_000;
const DEFAULT_MIN_CHUNK_SIZE = 2_000;
const DEFAULT_MAX_REQUESTS = 12;
const DEFAULT_MAX_EVENTS = 24;
const FALLBACK_DELAY_MS = 300;

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;

  const candidate = error as {
    message?: unknown;
    shortMessage?: unknown;
    details?: unknown;
    cause?: unknown;
    info?: unknown;
  };

  if (typeof candidate?.shortMessage === 'string') return candidate.shortMessage;
  if (typeof candidate?.message === 'string') return candidate.message;
  if (typeof candidate?.details === 'string') return candidate.details;
  if (typeof candidate?.info === 'string') return candidate.info;
  if (candidate?.cause) return extractErrorMessage(candidate.cause);

  return String(error);
}

function isPayloadTooLargeError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  return /http\s*413|payload too large|request entity too large|content length exceeded/i.test(message);
}

function logSortValue(log: ethers.Log | ethers.EventLog): [number, number] {
  return [log.blockNumber ?? 0, log.index ?? 0];
}

/**
 * Query recent event history without issuing oversized eth_getLogs requests.
 *
 * The dashboard only needs a bounded recent activity window, not a full-chain
 * historical backfill on every page load. This helper walks backward in chunks
 * and shrinks the chunk size when the provider rejects the request payload.
 */
export async function queryRecentLogsBestEffort(
  provider: ethers.Provider,
  runQuery: (
    provider: ethers.Provider,
    fromBlock: number,
    toBlock: number,
  ) => Promise<Array<ethers.Log | ethers.EventLog>>,
  options: RecentLogQueryOptions,
): Promise<Array<ethers.Log | ethers.EventLog>> {
  const {
    chainId,
    label,
    maxLookbackBlocks,
    initialChunkSize = DEFAULT_INITIAL_CHUNK_SIZE,
    minChunkSize = DEFAULT_MIN_CHUNK_SIZE,
    maxRequests = DEFAULT_MAX_REQUESTS,
    maxEvents = DEFAULT_MAX_EVENTS,
  } = options;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const baseEndpointUrl = getJsonRpcProviderUrl(provider);
  const orderedEndpoints = getOrderedRpcEndpoints(chainId);
  const candidateEndpoints =
    baseEndpointUrl && orderedEndpoints.includes(baseEndpointUrl)
      ? [baseEndpointUrl, ...orderedEndpoints.filter((endpoint) => endpoint !== baseEndpointUrl)]
      : orderedEndpoints;
  const transientProviders = new Map<string, ethers.JsonRpcProvider>();

  let activeProvider = provider;
  let activeEndpointUrl = baseEndpointUrl;

  const getProviderForEndpoint = (endpoint: string): ethers.Provider => {
    if (endpoint === baseEndpointUrl) {
      return provider;
    }

    const cached = transientProviders.get(endpoint);
    if (cached) {
      return cached;
    }

    const nextProvider = createReadOnlyRpcProvider(endpoint, chainId);
    transientProviders.set(endpoint, nextProvider);
    return nextProvider;
  };

  const switchToNextProvider = (): boolean => {
    const currentIndex = activeEndpointUrl
      ? candidateEndpoints.indexOf(activeEndpointUrl)
      : -1;

    for (let index = Math.max(0, currentIndex + 1); index < candidateEndpoints.length; index += 1) {
      const nextEndpoint = candidateEndpoints[index];
      if (nextEndpoint === activeEndpointUrl) {
        continue;
      }

      activeProvider = getProviderForEndpoint(nextEndpoint);
      activeEndpointUrl = nextEndpoint;
      return true;
    }

    return false;
  };

  let latestBlock: number;
  try {
    latestBlock = await activeProvider.getBlockNumber();
    if (activeEndpointUrl) {
      reportRpcEndpointSuccess(chainId, activeEndpointUrl);
    }
  } catch (error) {
    const retryable = isRetryableRpcError(error);
    if (retryable && activeEndpointUrl) {
      reportRpcEndpointFailure(chainId, activeEndpointUrl);
    }

    if (retryable && switchToNextProvider()) {
      try {
        await sleep(FALLBACK_DELAY_MS);
        latestBlock = await activeProvider.getBlockNumber();
        if (activeEndpointUrl) {
          reportRpcEndpointSuccess(chainId, activeEndpointUrl);
        }
      } catch (fallbackError) {
        logger.warn(`Unable to determine latest block for ${label}`, fallbackError);
        for (const transientProvider of transientProviders.values()) {
          transientProvider.destroy();
        }
        return [];
      }
    } else {
      logger.warn(`Unable to determine latest block for ${label}`, error);
      for (const transientProvider of transientProviders.values()) {
        transientProvider.destroy();
      }
      return [];
    }
  }

  const earliestBlock = Math.max(0, latestBlock - Math.max(1, maxLookbackBlocks) + 1);
  const effectiveMinChunkSize = Math.max(
    1,
    Math.min(minChunkSize, initialChunkSize, maxLookbackBlocks),
  );
  let chunkSize = Math.max(
    effectiveMinChunkSize,
    Math.min(initialChunkSize, maxLookbackBlocks),
  );
  let cursor = latestBlock;
  let requestCount = 0;
  const results: Array<ethers.Log | ethers.EventLog> = [];

  while (cursor >= earliestBlock && requestCount < maxRequests && results.length < maxEvents) {
    const fromBlock = Math.max(earliestBlock, cursor - chunkSize + 1);
    requestCount += 1;

    try {
      const chunk = await runQuery(activeProvider, fromBlock, cursor);
      if (activeEndpointUrl) {
        reportRpcEndpointSuccess(chainId, activeEndpointUrl);
      }
      results.push(...chunk);
      cursor = fromBlock - 1;
      continue;
    } catch (error) {
      const payloadTooLarge = isPayloadTooLargeError(error);
      const retryable = isRetryableRpcError(error) || payloadTooLarge;
      const failedEndpointUrl = activeEndpointUrl;

      if (retryable && failedEndpointUrl) {
        reportRpcEndpointFailure(chainId, failedEndpointUrl);
      }

      if (retryable && !payloadTooLarge && switchToNextProvider()) {
        logger.warn(`Retrying ${label} logs against fallback RPC endpoint`, {
          chainId,
          fromBlock,
          toBlock: cursor,
          failedEndpoint: failedEndpointUrl,
          nextEndpoint: activeEndpointUrl,
          error: extractErrorMessage(error),
        });
        await sleep(FALLBACK_DELAY_MS);
        continue;
      }

      const nextChunkSize = Math.max(effectiveMinChunkSize, Math.floor(chunkSize / 2));
      if (retryable && nextChunkSize < chunkSize) {
        logger.warn(`Shrinking ${label} log query window after RPC failure`, {
          chainId,
          fromBlock,
          toBlock: cursor,
          chunkSize,
          nextChunkSize,
          error: extractErrorMessage(error),
        });
        chunkSize = nextChunkSize;
        continue;
      }

      logger.warn(`Skipping ${label} logs after query failure`, {
        chainId,
        fromBlock,
        toBlock: cursor,
        error: extractErrorMessage(error),
      });
      break;
    }
  }

  results.sort((left, right) => {
    const [leftBlock, leftIndex] = logSortValue(left);
    const [rightBlock, rightIndex] = logSortValue(right);

    if (rightBlock !== leftBlock) {
      return rightBlock - leftBlock;
    }
    return rightIndex - leftIndex;
  });

  for (const transientProvider of transientProviders.values()) {
    transientProvider.destroy();
  }

  return results.slice(0, maxEvents);
}
