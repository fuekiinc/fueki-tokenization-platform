type SupportedChainId =
  | 1
  | 137
  | 17000
  | 42161
  | 421614
  | 8453
  | 84532
  | 11155111
  | 31337;

type JsonRpcLog = {
  address: string;
  topics: string[];
  data: string;
};

type JsonRpcReceipt = {
  status: string | null;
  blockNumber: string | null;
  logs: JsonRpcLog[];
};

type JsonRpcTransaction = {
  from: string;
  to: string | null;
};

type DecodedAssetCreatedLog = {
  creator: string;
  assetAddress: string;
  recipient: string;
  name: string;
  symbol: string;
  documentHash: string;
  documentType: string;
  originalValue: bigint;
  mintAmount: bigint;
};

export type VerifyMintRequestInput = {
  chainId: number;
  txHash: string;
  tokenName: string;
  tokenSymbol: string;
  mintAmount: string;
  recipient: string;
  documentHash: string;
  documentType: string;
  originalValue: string;
  expectedCreatorAddress?: string | null;
};

export type VerifyMintRequestResult = {
  assetAddress: string;
  blockNumber: number;
};

export class MintRequestVerificationError extends Error {
  constructor(
    readonly code:
      | 'CHAIN_UNSUPPORTED'
      | 'RPC_UNAVAILABLE'
      | 'CHAIN_ID_MISMATCH'
      | 'TX_NOT_FOUND'
      | 'TX_TARGET_MISMATCH'
      | 'TX_RECEIPT_NOT_FOUND'
      | 'TX_FAILED'
      | 'ASSET_CREATED_EVENT_MISSING'
      | 'EVENT_DECODE_FAILED'
      | 'EVENT_MISMATCH'
      | 'ASSET_CONTRACT_MISSING'
      | 'DOCUMENT_HASH_UNSUPPORTED',
    message: string,
  ) {
    super(message);
    this.name = 'MintRequestVerificationError';
  }
}

const RPC_TIMEOUT_MS = 8_000;
const ASSET_CREATED_TOPIC0 =
  '0x01dca289c0f18a127f1c03e2c9bae0b2223e81a20cf61bc0a1dff0f0468d4c6b';
const TOKEN_DECIMALS = 18;

const RPC_ENV_BY_CHAIN: Record<SupportedChainId, string> = {
  1: 'MAINNET_RPC_URL',
  137: 'POLYGON_RPC_URL',
  17000: 'HOLESKY_RPC_URL',
  42161: 'ARBITRUM_RPC_URL',
  421614: 'ARBITRUM_SEPOLIA_RPC_URL',
  8453: 'BASE_RPC_URL',
  84532: 'BASE_SEPOLIA_RPC_URL',
  11155111: 'SEPOLIA_RPC_URL',
  31337: 'LOCALHOST_RPC_URL',
};

const DEFAULT_RPC_BY_CHAIN: Record<SupportedChainId, string[]> = {
  1: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'],
  137: [
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygon.drpc.org',
    'https://1rpc.io/matic',
  ],
  17000: ['https://holesky.drpc.org', 'https://ethereum-holesky-rpc.publicnode.com'],
  42161: ['https://arb1.arbitrum.io/rpc'],
  421614: [
    'https://arbitrum-sepolia-rpc.publicnode.com',
    'https://arbitrum-sepolia.drpc.org',
    'https://sepolia-rollup.arbitrum.io/rpc',
  ],
  8453: ['https://mainnet.base.org'],
  84532: ['https://sepolia.base.org'],
  11155111: [
    'https://1rpc.io/sepolia',
    'https://sepolia.drpc.org',
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://rpc2.sepolia.org',
  ],
  31337: ['http://127.0.0.1:8545'],
};

const DEFAULT_FACTORY_ADDRESS_BY_CHAIN: Partial<Record<SupportedChainId, string>> = {
  1: '0xf7d3fC3b395b4Add020fF46B7ceA9E4c404ab4dB',
  137: '0x0ad0bc183acb2f2124A6e8C40216af852d3c1C9b',
  17000: '0xCC00D84b5D2448552a238465C4C05A82ac5AB411',
  42161: '0x0ad0bc183acb2f2124A6e8C40216af852d3c1C9b',
  421614: '0x0ad0bc183acb2f2124A6e8C40216af852d3c1C9b',
  8453: '0x0ad0bc183acb2f2124A6e8C40216af852d3c1C9b',
  11155111: '0xf7d3fC3b395b4Add020fF46B7ceA9E4c404ab4dB',
  31337: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
};

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    deduped.push(trimmed);
  }
  return deduped;
}

function getSupportedChainId(chainId: number): SupportedChainId | null {
  return Object.prototype.hasOwnProperty.call(RPC_ENV_BY_CHAIN, chainId)
    ? (chainId as SupportedChainId)
    : null;
}

function getRpcEndpoints(chainId: SupportedChainId): string[] {
  return dedupeStrings([
    process.env[RPC_ENV_BY_CHAIN[chainId]],
    ...DEFAULT_RPC_BY_CHAIN[chainId],
  ]);
}

function getFactoryAddress(chainId: SupportedChainId): string | null {
  const envCandidates = dedupeStrings([
    process.env[`WRAPPED_ASSET_FACTORY_${chainId}`],
    process.env[`FACTORY_${chainId}`],
    process.env[`VITE_FACTORY_${chainId}`],
  ]);
  const candidate = envCandidates[0] ?? DEFAULT_FACTORY_ADDRESS_BY_CHAIN[chainId];
  if (!candidate) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(candidate)) {
    throw new MintRequestVerificationError(
      'CHAIN_UNSUPPORTED',
      `Wrapped asset factory address is invalid for chain ${chainId}.`,
    );
  }
  return normalizeAddress(candidate);
}

function parseHexInteger(hex: string, label: string): bigint {
  if (!/^0x[0-9a-fA-F]+$/.test(hex)) {
    throw new MintRequestVerificationError(
      'EVENT_DECODE_FAILED',
      `Invalid ${label} returned by the RPC endpoint.`,
    );
  }
  return BigInt(hex);
}

function bigintToSafeNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MintRequestVerificationError(
      'EVENT_DECODE_FAILED',
      `${label} is too large to decode safely.`,
    );
  }
  return Number(value);
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function decodeTopicAddress(topic: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(topic)) {
    throw new MintRequestVerificationError(
      'EVENT_DECODE_FAILED',
      'AssetCreated topic payload is not a valid 32-byte topic.',
    );
  }
  return normalizeAddress(`0x${topic.slice(-40)}`);
}

function decodeAbiString(dataHex: string, offsetBytes: number, label: string): string {
  const lengthHex = dataHex.slice(offsetBytes * 2, offsetBytes * 2 + 64);
  if (lengthHex.length !== 64) {
    throw new MintRequestVerificationError(
      'EVENT_DECODE_FAILED',
      `Missing ${label} length while decoding AssetCreated.`,
    );
  }
  const length = bigintToSafeNumber(BigInt(`0x${lengthHex}`), `${label} length`);
  const valueStart = offsetBytes * 2 + 64;
  const valueEnd = valueStart + length * 2;
  const valueHex = dataHex.slice(valueStart, valueEnd);
  if (valueHex.length !== length * 2) {
    throw new MintRequestVerificationError(
      'EVENT_DECODE_FAILED',
      `Incomplete ${label} bytes while decoding AssetCreated.`,
    );
  }
  return Buffer.from(valueHex, 'hex').toString('utf8');
}

function decodeAssetCreatedLog(log: JsonRpcLog, factoryAddress: string): DecodedAssetCreatedLog | null {
  if (normalizeAddress(log.address) !== factoryAddress) return null;
  if (!Array.isArray(log.topics) || log.topics.length < 4) return null;
  if (log.topics[0]?.toLowerCase() !== ASSET_CREATED_TOPIC0) return null;
  if (!/^0x[0-9a-fA-F]+$/.test(log.data ?? '')) {
    throw new MintRequestVerificationError(
      'EVENT_DECODE_FAILED',
      'AssetCreated event data is not valid hex.',
    );
  }

  const dataHex = stripHexPrefix(log.data);
  const words = dataHex.match(/.{64}/g) ?? [];
  if (words.length < 6) {
    throw new MintRequestVerificationError(
      'EVENT_DECODE_FAILED',
      'AssetCreated event data is too short to decode.',
    );
  }

  const nameOffset = bigintToSafeNumber(BigInt(`0x${words[0]}`), 'name offset');
  const symbolOffset = bigintToSafeNumber(BigInt(`0x${words[1]}`), 'symbol offset');
  const documentTypeOffset = bigintToSafeNumber(
    BigInt(`0x${words[3]}`),
    'documentType offset',
  );

  return {
    creator: decodeTopicAddress(log.topics[1]),
    assetAddress: decodeTopicAddress(log.topics[2]),
    recipient: decodeTopicAddress(log.topics[3]),
    name: decodeAbiString(dataHex, nameOffset, 'name'),
    symbol: decodeAbiString(dataHex, symbolOffset, 'symbol'),
    documentHash: `0x${words[2].toLowerCase()}`,
    documentType: decodeAbiString(dataHex, documentTypeOffset, 'documentType'),
    originalValue: BigInt(`0x${words[4]}`),
    mintAmount: BigInt(`0x${words[5]}`),
  };
}

function encodeRequestDocumentHash(documentHash: string): string {
  const trimmed = documentHash.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^0x[0-9a-fA-F]{1,64}$/.test(trimmed)) {
    let hex = stripHexPrefix(trimmed);
    if (hex.length % 2 !== 0) {
      hex = `0${hex}`;
    }
    return `0x${hex.padEnd(64, '0').toLowerCase()}`;
  }
  throw new MintRequestVerificationError(
    'DOCUMENT_HASH_UNSUPPORTED',
    'This mint request uses a document hash format that cannot be verified on-chain.',
  );
}

function parseDecimalToUnits(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new MintRequestVerificationError(
      'EVENT_MISMATCH',
      'Mint request contains an invalid decimal amount for on-chain verification.',
    );
  }

  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > TOKEN_DECIMALS) {
    throw new MintRequestVerificationError(
      'EVENT_MISMATCH',
      'Mint request amount uses more than 18 decimal places and cannot match the on-chain value.',
    );
  }

  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fraction.padEnd(TOKEN_DECIMALS, '0');
  return BigInt(`${normalizedWhole}${normalizedFraction}`);
}

async function rpcRequest<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new MintRequestVerificationError(
        'RPC_UNAVAILABLE',
        `RPC endpoint returned HTTP ${response.status} for ${method}.`,
      );
    }

    const json = (await response.json()) as {
      error?: { code?: number; message?: string };
      result?: T;
    };

    if (json.error) {
      throw new MintRequestVerificationError(
        'RPC_UNAVAILABLE',
        `RPC error for ${method}: ${json.error.message ?? 'unknown error'}`,
      );
    }

    return json.result as T;
  } catch (err) {
    if (err instanceof MintRequestVerificationError) {
      throw err;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new MintRequestVerificationError(
        'RPC_UNAVAILABLE',
        `RPC request timed out for ${method}.`,
      );
    }
    throw new MintRequestVerificationError(
      'RPC_UNAVAILABLE',
      `Unable to reach RPC endpoint for ${method}.`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function assertAssetCreatedMatchesRequest(
  eventLog: DecodedAssetCreatedLog,
  transaction: JsonRpcTransaction,
  input: VerifyMintRequestInput,
): void {
  const expectedRecipient = normalizeAddress(input.recipient);
  const expectedDocumentHash = encodeRequestDocumentHash(input.documentHash);
  const expectedOriginalValue = parseDecimalToUnits(input.originalValue);
  const expectedMintAmount = parseDecimalToUnits(input.mintAmount);

  if (normalizeAddress(transaction.from) !== eventLog.creator) {
    throw new MintRequestVerificationError(
      'EVENT_MISMATCH',
      'Transaction sender does not match the AssetCreated creator.',
    );
  }

  if (input.expectedCreatorAddress) {
    const expectedCreator = normalizeAddress(input.expectedCreatorAddress);
    if (normalizeAddress(transaction.from) !== expectedCreator) {
      throw new MintRequestVerificationError(
        'EVENT_MISMATCH',
        'Transaction sender does not match the requester wallet on file.',
      );
    }
  }

  if (eventLog.name !== input.tokenName.trim()) {
    throw new MintRequestVerificationError(
      'EVENT_MISMATCH',
      'AssetCreated token name does not match the approved request.',
    );
  }

  if (eventLog.symbol !== input.tokenSymbol.trim()) {
    throw new MintRequestVerificationError(
      'EVENT_MISMATCH',
      'AssetCreated token symbol does not match the approved request.',
    );
  }

  if (eventLog.recipient !== expectedRecipient) {
    throw new MintRequestVerificationError(
      'EVENT_MISMATCH',
      'AssetCreated recipient does not match the approved request.',
    );
  }

  if (eventLog.documentHash !== expectedDocumentHash) {
    throw new MintRequestVerificationError(
      'EVENT_MISMATCH',
      'AssetCreated document hash does not match the approved request.',
    );
  }

  if (eventLog.documentType !== input.documentType.trim()) {
    throw new MintRequestVerificationError(
      'EVENT_MISMATCH',
      'AssetCreated document type does not match the approved request.',
    );
  }

  if (eventLog.originalValue !== expectedOriginalValue) {
    throw new MintRequestVerificationError(
      'EVENT_MISMATCH',
      'AssetCreated original value does not match the approved request.',
    );
  }

  if (eventLog.mintAmount !== expectedMintAmount) {
    throw new MintRequestVerificationError(
      'EVENT_MISMATCH',
      'AssetCreated mint amount does not match the approved request.',
    );
  }
}

async function verifyMintRequestOnEndpoint(
  endpoint: string,
  factoryAddress: string,
  input: VerifyMintRequestInput,
): Promise<VerifyMintRequestResult> {
  const chainIdHex = await rpcRequest<string>(endpoint, 'eth_chainId', []);
  const actualChainId = bigintToSafeNumber(
    parseHexInteger(chainIdHex, 'chainId'),
    'chainId',
  );

  if (actualChainId !== input.chainId) {
    throw new MintRequestVerificationError(
      'CHAIN_ID_MISMATCH',
      `RPC endpoint returned chain ${actualChainId} instead of ${input.chainId}.`,
    );
  }

  const transaction = await rpcRequest<JsonRpcTransaction | null>(
    endpoint,
    'eth_getTransactionByHash',
    [input.txHash],
  );

  if (!transaction) {
    throw new MintRequestVerificationError(
      'TX_NOT_FOUND',
      'Mint transaction was not found on the expected chain.',
    );
  }

  if (!transaction.to || normalizeAddress(transaction.to) !== factoryAddress) {
    throw new MintRequestVerificationError(
      'TX_TARGET_MISMATCH',
      'Mint transaction was not sent to the expected wrapped-asset factory.',
    );
  }

  const receipt = await rpcRequest<JsonRpcReceipt | null>(
    endpoint,
    'eth_getTransactionReceipt',
    [input.txHash],
  );

  if (!receipt) {
    throw new MintRequestVerificationError(
      'TX_RECEIPT_NOT_FOUND',
      'Mint transaction receipt is not yet available on the expected chain.',
    );
  }

  if (receipt.status !== '0x1') {
    throw new MintRequestVerificationError(
      'TX_FAILED',
      'Mint transaction did not succeed on-chain.',
    );
  }

  const eventLog = receipt.logs
    .map((log) => decodeAssetCreatedLog(log, factoryAddress))
    .find((log): log is DecodedAssetCreatedLog => log !== null);

  if (!eventLog) {
    throw new MintRequestVerificationError(
      'ASSET_CREATED_EVENT_MISSING',
      'Mint transaction did not emit the expected AssetCreated event.',
    );
  }

  assertAssetCreatedMatchesRequest(eventLog, transaction, input);

  const contractCode = await rpcRequest<string>(
    endpoint,
    'eth_getCode',
    [eventLog.assetAddress, receipt.blockNumber ?? 'latest'],
  );

  if (!contractCode || contractCode === '0x') {
    throw new MintRequestVerificationError(
      'ASSET_CONTRACT_MISSING',
      'Mint transaction did not leave bytecode at the emitted asset address.',
    );
  }

  const blockNumber = receipt.blockNumber
    ? bigintToSafeNumber(parseHexInteger(receipt.blockNumber, 'blockNumber'), 'blockNumber')
    : 0;

  return {
    assetAddress: eventLog.assetAddress,
    blockNumber,
  };
}

export async function verifyMintRequestOnChain(
  input: VerifyMintRequestInput,
): Promise<VerifyMintRequestResult> {
  const supportedChainId = getSupportedChainId(input.chainId);
  if (!supportedChainId) {
    throw new MintRequestVerificationError(
      'CHAIN_UNSUPPORTED',
      `Chain ${input.chainId} is not supported for mint verification.`,
    );
  }

  const factoryAddress = getFactoryAddress(supportedChainId);
  if (!factoryAddress) {
    throw new MintRequestVerificationError(
      'CHAIN_UNSUPPORTED',
      `Wrapped asset mint verification is not configured for chain ${input.chainId}.`,
    );
  }

  const endpoints = getRpcEndpoints(supportedChainId);
  if (endpoints.length === 0) {
    throw new MintRequestVerificationError(
      'RPC_UNAVAILABLE',
      `No RPC endpoints are configured for chain ${input.chainId}.`,
    );
  }

  let lastError: MintRequestVerificationError | null = null;

  for (const endpoint of endpoints) {
    try {
      return await verifyMintRequestOnEndpoint(endpoint, factoryAddress, input);
    } catch (err) {
      if (err instanceof MintRequestVerificationError) {
        lastError = err;
        if (
          err.code !== 'RPC_UNAVAILABLE' &&
          err.code !== 'CHAIN_ID_MISMATCH' &&
          err.code !== 'TX_NOT_FOUND' &&
          err.code !== 'TX_RECEIPT_NOT_FOUND'
        ) {
          break;
        }
        continue;
      }

      lastError = new MintRequestVerificationError(
        'RPC_UNAVAILABLE',
        'Unexpected RPC verification failure.',
      );
    }
  }

  throw (
    lastError ??
    new MintRequestVerificationError(
      'RPC_UNAVAILABLE',
      'Mint transaction could not be verified on-chain.',
    )
  );
}
