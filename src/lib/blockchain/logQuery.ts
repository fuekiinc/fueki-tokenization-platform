import { ethers } from 'ethers';
import logger from '../logger';
import {
  isRetryableRpcError,
  reportRpcEndpointFailure,
  reportRpcEndpointSuccess,
} from '../rpc/endpoints';
import { getJsonRpcProviderUrl } from '../rpc/providers';

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
  runQuery: (fromBlock: number, toBlock: number) => Promise<Array<ethers.Log | ethers.EventLog>>,
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

  let latestBlock: number;
  try {
    latestBlock = await provider.getBlockNumber();
  } catch (error) {
    logger.warn(`Unable to determine latest block for ${label}`, error);
    return [];
  }

  const endpointUrl = getJsonRpcProviderUrl(provider);
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
      const chunk = await runQuery(fromBlock, cursor);
      if (endpointUrl) {
        reportRpcEndpointSuccess(chainId, endpointUrl);
      }
      results.push(...chunk);
      cursor = fromBlock - 1;
      continue;
    } catch (error) {
      const retryable = isRetryableRpcError(error) || isPayloadTooLargeError(error);
      if (retryable && endpointUrl) {
        reportRpcEndpointFailure(chainId, endpointUrl);
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

  return results.slice(0, maxEvents);
}
