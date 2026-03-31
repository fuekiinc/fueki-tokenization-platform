import {
  type NavAttestationStatus,
  Prisma,
} from '@prisma/client';
import { ethers } from 'ethers';
import { prisma } from '../prisma';
import { ERC20_METADATA_ABI, NAV_ADMIN_ROLE, NAV_ORACLE_ABI, NAV_PUBLISHER_ROLE, SECURITY_TOKEN_CONTRACT_ADMIN_ROLE, SECURITY_TOKEN_ROLE_ABI } from '../lib/navContracts';
import { getRpcEndpoints, getSupportedChainId } from './rpcRegistry';

const NAV_DECIMALS = 6;
const HISTORY_DEFAULT_PAGE_SIZE = 20;
const HISTORY_MAX_PAGE_SIZE = 100;
const LOG_QUERY_INITIAL_CHUNK = 250_000n;
const LOG_QUERY_MIN_CHUNK = 5_000n;
const LOG_RANGE_LIMIT_RE = /ranges over .*blocks|block range|over\s+\d+\s+blocks|more than\s+\d+\s+blocks/i;
const REPORT_URI_RE = /^(ipfs:\/\/|https?:\/\/).+/i;

export interface NavAssetBreakdownInput {
  assetName: string;
  assetType: string;
  grossAssetValue: string;
  liabilities: string;
  netAssetValue: string;
  provenReservesOz?: string | null;
  probableReservesOz?: string | null;
  spotPricePerOz?: string | null;
  productionRateTpd?: string | null;
  notes?: string | null;
}

export interface RegisterNavOracleInput {
  tokenAddress: string;
  chainId: number;
  oracleAddress: string;
  baseCurrency?: string;
  stalenessWarningDays?: number;
  stalenessCriticalDays?: number;
  minAttestationIntervalSeconds?: number;
  maxNavChangeBps?: number;
  createdBy: string;
}

export interface CreateNavDraftInput {
  tokenAddress: string;
  chainId: number;
  navPerToken: string;
  totalNAV: string;
  effectiveDate: Date;
  reportHash: string;
  reportURI: string;
  publisherAddress: string;
  publisherName?: string | null;
  assetBreakdown: NavAssetBreakdownInput[];
}

export interface FinalizeNavAttestationInput extends CreateNavDraftInput {
  txHash: string;
  draftId?: string;
}

export interface NavHistoryParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
}

export interface NavOracleRegistrationResponse {
  tokenAddress: string;
  chainId: number;
  oracleAddress: string;
  baseCurrency: string;
  stalenessWarningDays: number;
  stalenessCriticalDays: number;
  minAttestationIntervalSeconds: number;
  maxNavChangeBps: number;
  createdAt: string;
  updatedAt: string;
}

export interface NavAssetSnapshotResponse {
  assetName: string;
  assetType: string;
  grossAssetValue: string;
  liabilities: string;
  netAssetValue: string;
  provenReservesOz: string | null;
  probableReservesOz: string | null;
  spotPricePerOz: string | null;
  productionRateTpd: string | null;
  notes: string | null;
}

export interface NavAttestationResponse {
  id: string;
  tokenAddress: string;
  chainId: number;
  oracleAddress: string;
  navPerToken: string;
  totalNAV: string;
  totalTokenSupply: string;
  baseCurrency: string;
  effectiveDate: string;
  publishedAt: string | null;
  publisher: {
    address: string;
    name: string | null;
  };
  reportHash: string;
  reportURI: string;
  txHash: string | null;
  attestationIndex: number | null;
  status: NavAttestationStatus;
  assetBreakdown: NavAssetSnapshotResponse[];
}

export interface CurrentNavResponse extends NavAttestationResponse {
  daysSinceLastUpdate: number | null;
  navChangeFromPrevious: {
    absolute: string;
    percentBps: number;
    direction: 'up' | 'down' | 'unchanged';
  } | null;
  stalenessWarningDays: number;
  stalenessCriticalDays: number;
}

export interface HolderValueResponse {
  holderAddress: string;
  tokenBalance: string;
  navPerToken: string;
  totalValue: string;
  baseCurrency: string;
  asOf: string;
  percentOfTotalSupply: string;
}

export interface NavPublisherResponse {
  walletAddress: string;
  name: string;
  licenseNumber: string | null;
  licenseType: string | null;
  contactEmail: string | null;
  isActive: boolean;
  onChainActive: boolean;
  addedAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export interface UpsertNavPublisherInput {
  tokenAddress: string;
  chainId: number;
  walletAddress: string;
  name: string;
  licenseNumber?: string | null;
  licenseType?: string | null;
  contactEmail?: string | null;
  addedBy: string;
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

function ensureSupportedChainId(chainId: number): number {
  if (!getSupportedChainId(chainId)) {
    throw new Error(`Unsupported chain id: ${chainId}`);
  }
  return chainId;
}

function getFallbackProvider(chainId: number): ethers.FallbackProvider {
  const supportedChainId = getSupportedChainId(chainId);
  if (!supportedChainId) {
    throw new Error(`Unsupported chain id: ${chainId}`);
  }

  const endpoints = getRpcEndpoints(supportedChainId);
  if (endpoints.length === 0) {
    throw new Error(`No RPC endpoints configured for chain ${chainId}`);
  }

  return new ethers.FallbackProvider(
    endpoints.map((url, index) => ({
      provider: new ethers.JsonRpcProvider(url, chainId, { staticNetwork: true }),
      priority: index + 1,
      weight: 1,
      stallTimeout: 1_500,
    })),
  );
}

function getNavOracleContract(oracleAddress: string, chainId: number): ethers.Contract {
  return new ethers.Contract(
    normalizeAddress(oracleAddress),
    NAV_ORACLE_ABI,
    getFallbackProvider(chainId),
  );
}

function getTokenContract(tokenAddress: string, chainId: number): ethers.Contract {
  return new ethers.Contract(
    normalizeAddress(tokenAddress),
    ERC20_METADATA_ABI,
    getFallbackProvider(chainId),
  );
}

function getSecurityTokenRoleContract(tokenAddress: string, chainId: number): ethers.Contract {
  return new ethers.Contract(
    normalizeAddress(tokenAddress),
    SECURITY_TOKEN_ROLE_ABI,
    getFallbackProvider(chainId),
  );
}

function isLogRangeLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return LOG_RANGE_LIMIT_RE.test(message);
}

async function queryLogsChunked(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<ethers.EventLog[]> {
  const logs: ethers.EventLog[] = [];
  let cursor = fromBlock;
  let chunkSize = LOG_QUERY_INITIAL_CHUNK;

  while (cursor <= toBlock) {
    const chunkEnd = cursor + chunkSize - 1n > toBlock
      ? toBlock
      : cursor + chunkSize - 1n;

    try {
      const chunk = await contract.queryFilter(filter, cursor, chunkEnd);
      logs.push(...chunk.map((entry) => entry as ethers.EventLog));
      cursor = chunkEnd + 1n;
    } catch (error) {
      if (isLogRangeLimitError(error) && chunkSize > LOG_QUERY_MIN_CHUNK) {
        chunkSize = chunkSize / 2n;
        if (chunkSize < LOG_QUERY_MIN_CHUNK) {
          chunkSize = LOG_QUERY_MIN_CHUNK;
        }
        continue;
      }

      throw error;
    }
  }

  return logs;
}

function toFixedUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = (absolute % base).toString().padStart(decimals, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

function toSignedFixedUnits(value: bigint, decimals: number): string {
  return value > 0n ? `+${toFixedUnits(value, decimals)}` : toFixedUnits(value, decimals);
}

function formatPercentScaled(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = (absolute % base).toString().padStart(decimals, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

function parseScaledDecimal(value: string, decimals = NAV_DECIMALS): bigint {
  return ethers.parseUnits(value.trim(), decimals);
}

function dateDiffInDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function mapAssetSnapshot(
  snapshot: {
    assetName: string;
    assetType: string;
    grossAssetValue: Prisma.Decimal;
    liabilities: Prisma.Decimal;
    netAssetValue: Prisma.Decimal;
    provenReservesOz: Prisma.Decimal | null;
    probableReservesOz: Prisma.Decimal | null;
    spotPricePerOz: Prisma.Decimal | null;
    productionRateTpd: Prisma.Decimal | null;
    notes: string | null;
  },
): NavAssetSnapshotResponse {
  return {
    assetName: snapshot.assetName,
    assetType: snapshot.assetType,
    grossAssetValue: snapshot.grossAssetValue.toFixed(6),
    liabilities: snapshot.liabilities.toFixed(6),
    netAssetValue: snapshot.netAssetValue.toFixed(6),
    provenReservesOz: snapshot.provenReservesOz?.toFixed(6) ?? null,
    probableReservesOz: snapshot.probableReservesOz?.toFixed(6) ?? null,
    spotPricePerOz: snapshot.spotPricePerOz?.toFixed(6) ?? null,
    productionRateTpd: snapshot.productionRateTpd?.toFixed(6) ?? null,
    notes: snapshot.notes,
  };
}

function mapAttestationRecord(
  record: {
    id: string;
    tokenAddress: string;
    chainId: number;
    oracleAddress: string;
    navPerToken: Prisma.Decimal;
    totalNAV: Prisma.Decimal;
    totalTokenSupply: Prisma.Decimal;
    baseCurrency: string;
    effectiveDate: Date;
    publishedAt: Date | null;
    publisherAddress: string;
    publisherName: string | null;
    reportHash: string;
    reportURI: string;
    txHash: string | null;
    attestationIndex: number | null;
    status: NavAttestationStatus;
    assetSnapshots: Array<{
      assetName: string;
      assetType: string;
      grossAssetValue: Prisma.Decimal;
      liabilities: Prisma.Decimal;
      netAssetValue: Prisma.Decimal;
      provenReservesOz: Prisma.Decimal | null;
      probableReservesOz: Prisma.Decimal | null;
      spotPricePerOz: Prisma.Decimal | null;
      productionRateTpd: Prisma.Decimal | null;
      notes: string | null;
    }>;
  },
): NavAttestationResponse {
  return {
    id: record.id,
    tokenAddress: record.tokenAddress,
    chainId: record.chainId,
    oracleAddress: record.oracleAddress,
    navPerToken: record.navPerToken.toFixed(6),
    totalNAV: record.totalNAV.toFixed(6),
    totalTokenSupply: record.totalTokenSupply.toFixed(0),
    baseCurrency: record.baseCurrency,
    effectiveDate: record.effectiveDate.toISOString(),
    publishedAt: record.publishedAt?.toISOString() ?? null,
    publisher: {
      address: record.publisherAddress,
      name: record.publisherName,
    },
    reportHash: record.reportHash,
    reportURI: record.reportURI,
    txHash: record.txHash,
    attestationIndex: record.attestationIndex,
    status: record.status,
    assetBreakdown: record.assetSnapshots.map(mapAssetSnapshot),
  };
}

function mapRegistrationRecord(
  record: {
    tokenAddress: string;
    chainId: number;
    oracleAddress: string;
    baseCurrency: string;
    stalenessWarningDays: number;
    stalenessCriticalDays: number;
    minAttestationIntervalSeconds: number;
    maxNavChangeBps: number;
    createdAt: Date;
    updatedAt: Date;
  },
): NavOracleRegistrationResponse {
  return {
    tokenAddress: record.tokenAddress,
    chainId: record.chainId,
    oracleAddress: record.oracleAddress,
    baseCurrency: record.baseCurrency,
    stalenessWarningDays: record.stalenessWarningDays,
    stalenessCriticalDays: record.stalenessCriticalDays,
    minAttestationIntervalSeconds: record.minAttestationIntervalSeconds,
    maxNavChangeBps: record.maxNavChangeBps,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function getTokenSupplySnapshot(
  tokenAddress: string,
  chainId: number,
): Promise<{ totalSupply: bigint; decimals: number }> {
  const token = getTokenContract(tokenAddress, chainId);
  const [totalSupply, decimals] = await Promise.all([
    token.totalSupply() as Promise<bigint>,
    token.decimals() as Promise<number | bigint>,
  ]);

  return {
    totalSupply,
    decimals: Number(decimals),
  };
}

async function getOracleThresholds(
  oracleAddress: string,
  chainId: number,
): Promise<{ minAttestationInterval: number; maxNavChangeBps: number }> {
  const oracle = getNavOracleContract(oracleAddress, chainId);
  const [minAttestationInterval, maxNavChangeBps] = await Promise.all([
    oracle.minAttestationInterval() as Promise<bigint>,
    oracle.maxNavChangeBps() as Promise<bigint>,
  ]);

  return {
    minAttestationInterval: Number(minAttestationInterval),
    maxNavChangeBps: Number(maxNavChangeBps),
  };
}

async function getOracleMetadata(
  oracleAddress: string,
  chainId: number,
): Promise<{ tokenAddress: string; baseCurrency: string }> {
  const oracle = getNavOracleContract(oracleAddress, chainId);
  const [tokenAddress, baseCurrency] = await Promise.all([
    oracle.token() as Promise<string>,
    oracle.baseCurrency() as Promise<string>,
  ]);

  return {
    tokenAddress: normalizeAddress(tokenAddress),
    baseCurrency: baseCurrency.trim() || 'USD',
  };
}

async function upsertAttestationFromEvent(
  registration: {
    tokenAddress: string;
    chainId: number;
    oracleAddress: string;
    baseCurrency: string;
  },
  oracle: ethers.Contract,
  log: ethers.EventLog,
): Promise<void> {
  const attestationIndex = Number(log.args.attestationIndex ?? log.args[0]);
  const detail = await oracle.getAttestation(attestationIndex);
  const publisherAddress = normalizeAddress(String(detail.publisher ?? detail[5]));
  const reportHash = normalizeHex(String(detail.reportHash ?? detail[6]));
  const publisher = await prisma.navPublisher.findUnique({
    where: { walletAddress: publisherAddress },
  });
  const draft = await prisma.navAttestation.findFirst({
    where: {
      tokenAddress: registration.tokenAddress,
      chainId: registration.chainId,
      reportHash,
      status: { in: ['DRAFT', 'PENDING_TX'] },
    },
    include: { assetSnapshots: true },
    orderBy: { createdAt: 'desc' },
  });

  await prisma.navAttestation.upsert({
    where: {
      tokenAddress_chainId_attestationIndex: {
        tokenAddress: registration.tokenAddress,
        chainId: registration.chainId,
        attestationIndex,
      },
    },
    update: {
      oracleAddress: registration.oracleAddress,
      navPerToken: toFixedUnits(BigInt(detail.navPerToken ?? detail[0]), NAV_DECIMALS),
      totalNAV: toFixedUnits(BigInt(detail.totalNAV ?? detail[1]), NAV_DECIMALS),
      totalTokenSupply: BigInt(detail.totalTokenSupply ?? detail[2]).toString(),
      baseCurrency: registration.baseCurrency,
      effectiveDate: new Date(Number(detail.effectiveDate ?? detail[3]) * 1000),
      publishedAt: new Date(Number(detail.publishedAt ?? detail[4]) * 1000),
      publisherAddress,
      publisherName: draft?.publisherName ?? publisher?.name ?? null,
      reportHash,
      reportURI: String(detail.reportURI ?? detail[7]),
      txHash: normalizeHex(log.transactionHash),
      indexedBlockNumber: BigInt(log.blockNumber),
      status: 'PUBLISHED',
    },
    create: {
      tokenAddress: registration.tokenAddress,
      chainId: registration.chainId,
      oracleAddress: registration.oracleAddress,
      navPerToken: toFixedUnits(BigInt(detail.navPerToken ?? detail[0]), NAV_DECIMALS),
      totalNAV: toFixedUnits(BigInt(detail.totalNAV ?? detail[1]), NAV_DECIMALS),
      totalTokenSupply: BigInt(detail.totalTokenSupply ?? detail[2]).toString(),
      baseCurrency: registration.baseCurrency,
      effectiveDate: new Date(Number(detail.effectiveDate ?? detail[3]) * 1000),
      publishedAt: new Date(Number(detail.publishedAt ?? detail[4]) * 1000),
      publisherAddress,
      publisherName: draft?.publisherName ?? publisher?.name ?? null,
      reportHash,
      reportURI: String(detail.reportURI ?? detail[7]),
      txHash: normalizeHex(log.transactionHash),
      attestationIndex,
      indexedBlockNumber: BigInt(log.blockNumber),
      status: 'PUBLISHED',
    },
  });
}

async function markSupersededAttestations(tokenAddress: string, chainId: number): Promise<void> {
  const latest = await prisma.navAttestation.findFirst({
    where: {
      tokenAddress,
      chainId,
      attestationIndex: { not: null },
    },
    orderBy: { attestationIndex: 'desc' },
  });

  if (!latest || latest.attestationIndex === null) {
    return;
  }

  await prisma.$transaction([
    prisma.navAttestation.updateMany({
      where: {
        tokenAddress,
        chainId,
        id: { not: latest.id },
        status: { in: ['PUBLISHED', 'SUPERSEDED'] },
      },
      data: { status: 'SUPERSEDED' },
    }),
    prisma.navAttestation.update({
      where: { id: latest.id },
      data: { status: 'PUBLISHED' },
    }),
  ]);
}

async function syncNavOracleHistory(tokenAddress: string, chainId: number): Promise<void> {
  const registration = await prisma.navOracleRegistration.findUnique({
    where: {
      tokenAddress_chainId: {
        tokenAddress: normalizeAddress(tokenAddress),
        chainId,
      },
    },
  });

  if (!registration) {
    return;
  }

  const provider = getFallbackProvider(chainId);
  const oracle = new ethers.Contract(registration.oracleAddress, NAV_ORACLE_ABI, provider);
  const count = Number(await oracle.attestationCount());
  const currentBlock = BigInt(await provider.getBlockNumber());

  if (count === 0) {
    await prisma.navOracleRegistration.update({
      where: {
        tokenAddress_chainId: {
          tokenAddress: registration.tokenAddress,
          chainId: registration.chainId,
        },
      },
      data: { lastIndexedBlock: currentBlock },
    });
    return;
  }

  const fromBlock = registration.lastIndexedBlock !== null
    ? BigInt(registration.lastIndexedBlock.toString()) + 1n
    : 0n;

  let logs = await queryLogsChunked(
    oracle,
    oracle.filters.NAVPublished(),
    fromBlock,
    currentBlock,
  );

  const existingCount = await prisma.navAttestation.count({
    where: {
      tokenAddress: registration.tokenAddress,
      chainId: registration.chainId,
      attestationIndex: { not: null },
    },
  });

  if (logs.length === 0 && existingCount < count) {
    logs = await queryLogsChunked(
      oracle,
      oracle.filters.NAVPublished(),
      0n,
      currentBlock,
    );
  }

  logs.sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber - right.blockNumber;
    }
    return left.index - right.index;
  });

  for (const log of logs) {
    await upsertAttestationFromEvent(registration, oracle, log);
  }

  await prisma.navOracleRegistration.update({
    where: {
      tokenAddress_chainId: {
        tokenAddress: registration.tokenAddress,
        chainId: registration.chainId,
      },
    },
    data: { lastIndexedBlock: currentBlock },
  });

  await markSupersededAttestations(registration.tokenAddress, registration.chainId);
}

export async function getUserWalletAddress(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletAddress: true },
  });

  return user?.walletAddress ? normalizeAddress(user.walletAddress) : null;
}

export async function isOraclePublisher(
  oracleAddress: string,
  chainId: number,
  walletAddress: string,
): Promise<boolean> {
  const oracle = getNavOracleContract(oracleAddress, chainId);
  return oracle.hasRole(NAV_PUBLISHER_ROLE, normalizeAddress(walletAddress)) as Promise<boolean>;
}

export async function isOracleAdmin(
  oracleAddress: string,
  chainId: number,
  walletAddress: string,
): Promise<boolean> {
  const oracle = getNavOracleContract(oracleAddress, chainId);
  return oracle.hasRole(NAV_ADMIN_ROLE, normalizeAddress(walletAddress)) as Promise<boolean>;
}

export async function isSecurityTokenContractAdmin(
  tokenAddress: string,
  chainId: number,
  walletAddress: string,
): Promise<boolean> {
  const token = getSecurityTokenRoleContract(tokenAddress, chainId);
  return token.hasRole(normalizeAddress(walletAddress), SECURITY_TOKEN_CONTRACT_ADMIN_ROLE) as Promise<boolean>;
}

export async function getNavOracleRegistration(
  tokenAddress: string,
  chainId: number,
): Promise<NavOracleRegistrationResponse | null> {
  const registration = await prisma.navOracleRegistration.findUnique({
    where: {
      tokenAddress_chainId: {
        tokenAddress: normalizeAddress(tokenAddress),
        chainId,
      },
    },
  });

  return registration ? mapRegistrationRecord(registration) : null;
}

export async function registerNavOracle(
  input: RegisterNavOracleInput,
): Promise<NavOracleRegistrationResponse> {
  ensureSupportedChainId(input.chainId);
  const normalizedTokenAddress = normalizeAddress(input.tokenAddress);
  const normalizedOracleAddress = normalizeAddress(input.oracleAddress);
  const [oracleThresholds, oracleMetadata] = await Promise.all([
    getOracleThresholds(normalizedOracleAddress, input.chainId),
    getOracleMetadata(normalizedOracleAddress, input.chainId),
  ]);

  if (oracleMetadata.tokenAddress !== normalizedTokenAddress) {
    throw new Error('NAV oracle token does not match the selected security token.');
  }

  const registration = await prisma.navOracleRegistration.upsert({
    where: {
      tokenAddress_chainId: {
        tokenAddress: normalizedTokenAddress,
        chainId: input.chainId,
      },
    },
    update: {
      oracleAddress: normalizedOracleAddress,
      baseCurrency: input.baseCurrency?.trim() || oracleMetadata.baseCurrency,
      stalenessWarningDays: input.stalenessWarningDays ?? 90,
      stalenessCriticalDays: input.stalenessCriticalDays ?? 180,
      minAttestationIntervalSeconds:
        input.minAttestationIntervalSeconds ?? oracleThresholds.minAttestationInterval,
      maxNavChangeBps: input.maxNavChangeBps ?? oracleThresholds.maxNavChangeBps,
    },
    create: {
      tokenAddress: normalizedTokenAddress,
      chainId: input.chainId,
      oracleAddress: normalizedOracleAddress,
      baseCurrency: input.baseCurrency?.trim() || oracleMetadata.baseCurrency,
      stalenessWarningDays: input.stalenessWarningDays ?? 90,
      stalenessCriticalDays: input.stalenessCriticalDays ?? 180,
      minAttestationIntervalSeconds:
        input.minAttestationIntervalSeconds ?? oracleThresholds.minAttestationInterval,
      maxNavChangeBps: input.maxNavChangeBps ?? oracleThresholds.maxNavChangeBps,
      createdBy: input.createdBy,
    },
  });

  await syncNavOracleHistory(registration.tokenAddress, registration.chainId);
  return mapRegistrationRecord(registration);
}

export async function validateNavAttestationInput(
  input: CreateNavDraftInput,
): Promise<string[]> {
  ensureSupportedChainId(input.chainId);
  const errors: string[] = [];
  const now = Date.now();

  const normalizedReportHash = normalizeHex(input.reportHash);
  if (!/^0x[a-f0-9]{64}$/.test(normalizedReportHash)) {
    errors.push('Report hash must be a 32-byte hex string.');
  }

  if (!REPORT_URI_RE.test(input.reportURI.trim())) {
    errors.push('Report URI must be an ipfs:// or http(s):// URL.');
  }

  if (input.effectiveDate.getTime() > now) {
    errors.push('Effective date cannot be in the future.');
  }

  let navPerToken: bigint | null = null;
  let totalNav: bigint | null = null;
  try {
    navPerToken = parseScaledDecimal(input.navPerToken);
    if (navPerToken <= 0n) {
      errors.push('NAV per token must be greater than zero.');
    }
  } catch {
    errors.push('NAV per token must be a valid decimal with up to 6 places.');
  }

  try {
    totalNav = parseScaledDecimal(input.totalNAV);
    if (totalNav <= 0n) {
      errors.push('Total NAV must be greater than zero.');
    }
  } catch {
    errors.push('Total NAV must be a valid decimal with up to 6 places.');
  }

  if (input.assetBreakdown.length === 0) {
    errors.push('At least one asset breakdown entry is required.');
  }

  let assetNetTotal = 0n;
  for (const [index, asset] of input.assetBreakdown.entries()) {
    if (!asset.assetName.trim()) {
      errors.push(`Asset row ${index + 1} is missing a name.`);
    }
    if (!asset.assetType.trim()) {
      errors.push(`Asset row ${index + 1} is missing an asset type.`);
    }

    try {
      const gross = parseScaledDecimal(asset.grossAssetValue);
      const liabilities = parseScaledDecimal(asset.liabilities || '0');
      const net = parseScaledDecimal(asset.netAssetValue);
      if (gross < 0n || liabilities < 0n || net < 0n) {
        errors.push(`Asset row ${index + 1} contains a negative value.`);
      }
      assetNetTotal += net;
    } catch {
      errors.push(`Asset row ${index + 1} contains an invalid decimal value.`);
    }
  }

  const registration = await prisma.navOracleRegistration.findUnique({
    where: {
      tokenAddress_chainId: {
        tokenAddress: normalizeAddress(input.tokenAddress),
        chainId: input.chainId,
      },
    },
  });

  const { totalSupply, decimals } = await getTokenSupplySnapshot(
    input.tokenAddress,
    input.chainId,
  );

  if (navPerToken !== null && totalNav !== null) {
    const expectedTotalNav = (totalSupply * navPerToken) / (10n ** BigInt(decimals));
    const totalNavTolerance = totalNav / 10_000n > 0n ? totalNav / 10_000n : 1n;
    const totalNavDelta = expectedTotalNav > totalNav
      ? expectedTotalNav - totalNav
      : totalNav - expectedTotalNav;
    if (totalNavDelta > totalNavTolerance) {
      errors.push('NAV per token and token supply do not reconcile to total NAV within 0.01%.');
    }

    const assetTolerance = totalNav / 10_000n > 0n ? totalNav / 10_000n : 1n;
    const assetDelta = assetNetTotal > totalNav
      ? assetNetTotal - totalNav
      : totalNav - assetNetTotal;
    if (assetDelta > assetTolerance) {
      errors.push('Asset breakdown does not reconcile to total NAV within 0.01%.');
    }

    if (registration) {
      const latest = await prisma.navAttestation.findFirst({
        where: {
          tokenAddress: registration.tokenAddress,
          chainId: registration.chainId,
          status: 'PUBLISHED',
          attestationIndex: { not: null },
        },
        orderBy: { attestationIndex: 'desc' },
      });

      if (latest) {
        if (latest.publishedAt) {
          const earliestAllowed =
            latest.publishedAt.getTime() + registration.minAttestationIntervalSeconds * 1000;
          if (now < earliestAllowed) {
            errors.push(
              `A new NAV attestation cannot be published until ${new Date(earliestAllowed).toISOString()}.`,
            );
          }
        }

        const latestScaled = parseScaledDecimal(latest.navPerToken.toFixed(6));
        const delta = navPerToken > latestScaled ? navPerToken - latestScaled : latestScaled - navPerToken;
        const maxDelta = (latestScaled * BigInt(registration.maxNavChangeBps)) / 10_000n;
        if (delta > maxDelta) {
          errors.push(`NAV change exceeds the configured ${registration.maxNavChangeBps} bps threshold.`);
        }
      }
    }
  }

  return errors;
}

export async function createNavDraft(
  input: CreateNavDraftInput,
): Promise<NavAttestationResponse> {
  const registration = await prisma.navOracleRegistration.findUnique({
    where: {
      tokenAddress_chainId: {
        tokenAddress: normalizeAddress(input.tokenAddress),
        chainId: input.chainId,
      },
    },
  });

  if (!registration) {
    throw new Error('NAV oracle is not registered for this token.');
  }

  const { totalSupply } = await getTokenSupplySnapshot(input.tokenAddress, input.chainId);

  const record = await prisma.navAttestation.create({
    data: {
      tokenAddress: registration.tokenAddress,
      chainId: registration.chainId,
      oracleAddress: registration.oracleAddress,
      navPerToken: input.navPerToken,
      totalNAV: input.totalNAV,
      totalTokenSupply: totalSupply.toString(),
      baseCurrency: registration.baseCurrency,
      effectiveDate: input.effectiveDate,
      publishedAt: null,
      publisherAddress: normalizeAddress(input.publisherAddress),
      publisherName: input.publisherName ?? null,
      reportHash: normalizeHex(input.reportHash),
      reportURI: input.reportURI.trim(),
      txHash: null,
      attestationIndex: null,
      status: 'DRAFT',
      assetSnapshots: {
        create: input.assetBreakdown.map((asset) => ({
          assetName: asset.assetName.trim(),
          assetType: asset.assetType.trim(),
          grossAssetValue: asset.grossAssetValue,
          liabilities: asset.liabilities,
          netAssetValue: asset.netAssetValue,
          provenReservesOz: asset.provenReservesOz ?? null,
          probableReservesOz: asset.probableReservesOz ?? null,
          spotPricePerOz: asset.spotPricePerOz ?? null,
          productionRateTpd: asset.productionRateTpd ?? null,
          notes: asset.notes?.trim() || null,
        })),
      },
    },
    include: { assetSnapshots: true },
  });

  return mapAttestationRecord(record);
}

export async function finalizePublishedNavAttestation(
  input: FinalizeNavAttestationInput,
): Promise<NavAttestationResponse> {
  const normalizedTokenAddress = normalizeAddress(input.tokenAddress);
  const normalizedTxHash = normalizeHex(input.txHash);

  await syncNavOracleHistory(normalizedTokenAddress, input.chainId);

  const published = await prisma.navAttestation.findFirst({
    where: {
      tokenAddress: normalizedTokenAddress,
      chainId: input.chainId,
      txHash: normalizedTxHash,
      attestationIndex: { not: null },
    },
    include: { assetSnapshots: true },
  });

  if (!published) {
    throw new Error('Published attestation could not be found on-chain for the provided transaction hash.');
  }

  const publishedRecord = await prisma.$transaction(async (tx) => {
    let selectedAssetBreakdown = input.assetBreakdown;
    let selectedPublisherName = input.publisherName ?? null;

    if (input.draftId) {
      const draft = await tx.navAttestation.findUnique({
        where: { id: input.draftId },
        include: { assetSnapshots: true },
      });

      if (draft) {
        if (draft.assetSnapshots.length > 0) {
          selectedAssetBreakdown = draft.assetSnapshots.map((asset) => ({
            assetName: asset.assetName,
            assetType: asset.assetType,
            grossAssetValue: asset.grossAssetValue.toFixed(6),
            liabilities: asset.liabilities.toFixed(6),
            netAssetValue: asset.netAssetValue.toFixed(6),
            provenReservesOz: asset.provenReservesOz?.toFixed(6) ?? null,
            probableReservesOz: asset.probableReservesOz?.toFixed(6) ?? null,
            spotPricePerOz: asset.spotPricePerOz?.toFixed(6) ?? null,
            productionRateTpd: asset.productionRateTpd?.toFixed(6) ?? null,
            notes: asset.notes,
          }));
        }
        selectedPublisherName = draft.publisherName ?? selectedPublisherName;

        await tx.navAssetSnapshot.deleteMany({
          where: { attestationId: draft.id },
        });
        await tx.navAttestation.delete({
          where: { id: draft.id },
        });
      }
    }

    await tx.navAssetSnapshot.deleteMany({
      where: { attestationId: published.id },
    });

    const updated = await tx.navAttestation.update({
      where: { id: published.id },
      data: {
        publisherName: selectedPublisherName,
        reportURI: input.reportURI.trim(),
        reportHash: normalizeHex(input.reportHash),
        txHash: normalizedTxHash,
        status: 'PUBLISHED',
        assetSnapshots: {
          create: selectedAssetBreakdown.map((asset) => ({
            assetName: asset.assetName.trim(),
            assetType: asset.assetType.trim(),
            grossAssetValue: asset.grossAssetValue,
            liabilities: asset.liabilities,
            netAssetValue: asset.netAssetValue,
            provenReservesOz: asset.provenReservesOz ?? null,
            probableReservesOz: asset.probableReservesOz ?? null,
            spotPricePerOz: asset.spotPricePerOz ?? null,
            productionRateTpd: asset.productionRateTpd ?? null,
            notes: asset.notes?.trim() || null,
          })),
        },
      },
      include: { assetSnapshots: true },
    });

    return updated;
  });

  await markSupersededAttestations(normalizedTokenAddress, input.chainId);
  return mapAttestationRecord(publishedRecord);
}

export async function updateNavAttestationStatus(
  id: string,
  status: NavAttestationStatus,
): Promise<NavAttestationResponse> {
  const updated = await prisma.navAttestation.update({
    where: { id },
    data: { status },
    include: { assetSnapshots: true },
  });

  return mapAttestationRecord(updated);
}

export async function getCurrentNav(
  tokenAddress: string,
  chainId: number,
): Promise<CurrentNavResponse | null> {
  const normalizedTokenAddress = normalizeAddress(tokenAddress);
  await syncNavOracleHistory(normalizedTokenAddress, chainId);

  const registration = await prisma.navOracleRegistration.findUnique({
    where: {
      tokenAddress_chainId: {
        tokenAddress: normalizedTokenAddress,
        chainId,
      },
    },
  });

  if (!registration) {
    return null;
  }

  const latest = await prisma.navAttestation.findFirst({
    where: {
      tokenAddress: normalizedTokenAddress,
      chainId,
      status: 'PUBLISHED',
      attestationIndex: { not: null },
    },
    orderBy: { attestationIndex: 'desc' },
    include: { assetSnapshots: true },
  });

  if (!latest) {
    return null;
  }

  const previous = latest.attestationIndex !== null
    ? await prisma.navAttestation.findFirst({
        where: {
          tokenAddress: normalizedTokenAddress,
          chainId,
          attestationIndex: { lt: latest.attestationIndex },
        },
        orderBy: { attestationIndex: 'desc' },
        include: { assetSnapshots: true },
      })
    : null;

  const latestScaled = parseScaledDecimal(latest.navPerToken.toFixed(6));
  const previousScaled = previous ? parseScaledDecimal(previous.navPerToken.toFixed(6)) : null;
  const delta = previousScaled === null ? null : latestScaled - previousScaled;
  const percentBps = previousScaled && previousScaled > 0n
    ? Number((delta! * 10_000n) / previousScaled)
    : null;

  return {
    ...mapAttestationRecord(latest),
    daysSinceLastUpdate: latest.publishedAt
      ? dateDiffInDays(latest.publishedAt, new Date())
      : null,
    navChangeFromPrevious: previousScaled === null || delta === null || percentBps === null
      ? null
      : {
          absolute: toSignedFixedUnits(delta, NAV_DECIMALS),
          percentBps,
          direction: delta > 0n ? 'up' : delta < 0n ? 'down' : 'unchanged',
        },
    stalenessWarningDays: registration.stalenessWarningDays,
    stalenessCriticalDays: registration.stalenessCriticalDays,
  };
}

export async function getNavHistory(
  tokenAddress: string,
  chainId: number,
  params: NavHistoryParams = {},
): Promise<{
  attestations: NavAttestationResponse[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  summary: {
    firstAttestation: string | null;
    latestAttestation: string | null;
    highestNAV: string | null;
    lowestNAV: string | null;
    averageNAV: string | null;
    totalDividendsPaid: string | null;
  };
}> {
  const normalizedTokenAddress = normalizeAddress(tokenAddress);
  await syncNavOracleHistory(normalizedTokenAddress, chainId);

  const page = params.page ?? 1;
  const pageSize = Math.min(params.pageSize ?? HISTORY_DEFAULT_PAGE_SIZE, HISTORY_MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  const where: Prisma.NavAttestationWhereInput = {
    tokenAddress: normalizedTokenAddress,
    chainId,
    attestationIndex: { not: null },
  };

  if (params.from || params.to) {
    where.effectiveDate = {};
    if (params.from) {
      where.effectiveDate.gte = new Date(params.from);
    }
    if (params.to) {
      where.effectiveDate.lte = new Date(params.to);
    }
  }

  const [records, totalCount, summaryRecords] = await Promise.all([
    prisma.navAttestation.findMany({
      where,
      orderBy: { effectiveDate: 'desc' },
      skip,
      take: pageSize,
      include: { assetSnapshots: true },
    }),
    prisma.navAttestation.count({ where }),
    prisma.navAttestation.findMany({
      where,
      orderBy: { effectiveDate: 'asc' },
      select: {
        id: true,
        navPerToken: true,
        effectiveDate: true,
      },
    }),
  ]);

  let highest: bigint | null = null;
  let lowest: bigint | null = null;
  let sum = 0n;
  for (const record of summaryRecords) {
    const scaled = parseScaledDecimal(record.navPerToken.toFixed(6));
    sum += scaled;
    if (highest === null || scaled > highest) highest = scaled;
    if (lowest === null || scaled < lowest) lowest = scaled;
  }

  const average = summaryRecords.length > 0
    ? sum / BigInt(summaryRecords.length)
    : null;

  return {
    attestations: records.map(mapAttestationRecord),
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize),
    },
    summary: {
      firstAttestation: summaryRecords[0]?.effectiveDate.toISOString() ?? null,
      latestAttestation: summaryRecords.at(-1)?.effectiveDate.toISOString() ?? null,
      highestNAV: highest === null ? null : toFixedUnits(highest, NAV_DECIMALS),
      lowestNAV: lowest === null ? null : toFixedUnits(lowest, NAV_DECIMALS),
      averageNAV: average === null ? null : toFixedUnits(average, NAV_DECIMALS),
      totalDividendsPaid: null,
    },
  };
}

export async function getNavAttestationByIndex(
  tokenAddress: string,
  chainId: number,
  index: number,
): Promise<NavAttestationResponse | null> {
  const normalizedTokenAddress = normalizeAddress(tokenAddress);
  await syncNavOracleHistory(normalizedTokenAddress, chainId);

  const record = await prisma.navAttestation.findUnique({
    where: {
      tokenAddress_chainId_attestationIndex: {
        tokenAddress: normalizedTokenAddress,
        chainId,
        attestationIndex: index,
      },
    },
    include: { assetSnapshots: true },
  });

  return record ? mapAttestationRecord(record) : null;
}

export async function getHolderValue(
  tokenAddress: string,
  chainId: number,
  holderAddress: string,
): Promise<HolderValueResponse | null> {
  const current = await getCurrentNav(tokenAddress, chainId);
  if (!current) {
    return null;
  }

  const normalizedTokenAddress = normalizeAddress(tokenAddress);
  const normalizedHolderAddress = normalizeAddress(holderAddress);
  const { totalSupply, decimals } = await getTokenSupplySnapshot(normalizedTokenAddress, chainId);
  const token = getTokenContract(normalizedTokenAddress, chainId);
  const balance = await token.balanceOf(normalizedHolderAddress) as bigint;
  const navPerToken = parseScaledDecimal(current.navPerToken);
  const totalValue = (balance * navPerToken) / (10n ** BigInt(decimals));
  const ownershipScaled = totalSupply > 0n
    ? (balance * 1_000_000n) / totalSupply
    : 0n;

  return {
    holderAddress: normalizedHolderAddress,
    tokenBalance: ethers.formatUnits(balance, decimals),
    navPerToken: current.navPerToken,
    totalValue: toFixedUnits(totalValue, NAV_DECIMALS),
    baseCurrency: current.baseCurrency,
    asOf: current.effectiveDate,
    percentOfTotalSupply: formatPercentScaled(ownershipScaled, 4),
  };
}

export async function listNavPublishers(
  tokenAddress: string,
  chainId: number,
): Promise<NavPublisherResponse[]> {
  const normalizedTokenAddress = normalizeAddress(tokenAddress);
  const registration = await prisma.navOracleRegistration.findUnique({
    where: {
      tokenAddress_chainId: {
        tokenAddress: normalizedTokenAddress,
        chainId,
      },
    },
    include: {
      publisherAssignments: {
        include: { publisher: true },
        orderBy: { addedAt: 'asc' },
      },
    },
  });

  if (!registration) {
    return [];
  }

  const oracle = getNavOracleContract(registration.oracleAddress, chainId);
  return Promise.all(
    registration.publisherAssignments.map(async (assignment) => {
      const onChainActive = await oracle.hasRole(
        NAV_PUBLISHER_ROLE,
        assignment.walletAddress,
      ) as boolean;

      return {
        walletAddress: assignment.walletAddress,
        name: assignment.publisher.name,
        licenseNumber: assignment.publisher.licenseNumber,
        licenseType: assignment.publisher.licenseType,
        contactEmail: assignment.publisher.contactEmail,
        isActive: assignment.isActive,
        onChainActive,
        addedAt: assignment.addedAt.toISOString(),
        updatedAt: assignment.updatedAt.toISOString(),
        revokedAt: assignment.revokedAt?.toISOString() ?? null,
      };
    }),
  );
}

export async function upsertNavPublisher(
  input: UpsertNavPublisherInput,
): Promise<NavPublisherResponse> {
  const normalizedTokenAddress = normalizeAddress(input.tokenAddress);
  const normalizedWalletAddress = normalizeAddress(input.walletAddress);

  const registration = await prisma.navOracleRegistration.findUnique({
    where: {
      tokenAddress_chainId: {
        tokenAddress: normalizedTokenAddress,
        chainId: input.chainId,
      },
    },
  });

  if (!registration) {
    throw new Error('NAV oracle is not registered for this token.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.navPublisher.upsert({
      where: { walletAddress: normalizedWalletAddress },
      update: {
        name: input.name.trim(),
        licenseNumber: input.licenseNumber?.trim() || null,
        licenseType: input.licenseType?.trim() || null,
        contactEmail: input.contactEmail?.trim() || null,
        isActive: true,
      },
      create: {
        walletAddress: normalizedWalletAddress,
        name: input.name.trim(),
        licenseNumber: input.licenseNumber?.trim() || null,
        licenseType: input.licenseType?.trim() || null,
        contactEmail: input.contactEmail?.trim() || null,
        addedBy: input.addedBy,
      },
    });

    await tx.navPublisherAssignment.upsert({
      where: {
        tokenAddress_chainId_walletAddress: {
          tokenAddress: normalizedTokenAddress,
          chainId: input.chainId,
          walletAddress: normalizedWalletAddress,
        },
      },
      update: {
        isActive: true,
        revokedAt: null,
        revokedBy: null,
        addedBy: input.addedBy,
      },
      create: {
        tokenAddress: normalizedTokenAddress,
        chainId: input.chainId,
        walletAddress: normalizedWalletAddress,
        addedBy: input.addedBy,
      },
    });
  });

  const refreshed = (await listNavPublishers(normalizedTokenAddress, input.chainId))
    .find((entry) => entry.walletAddress === normalizedWalletAddress);
  if (!refreshed) {
    throw new Error('Unable to load the updated publisher.');
  }
  return refreshed;
}

export async function removeNavPublisher(
  tokenAddress: string,
  chainId: number,
  walletAddress: string,
  revokedBy: string,
): Promise<void> {
  await prisma.navPublisherAssignment.update({
    where: {
      tokenAddress_chainId_walletAddress: {
        tokenAddress: normalizeAddress(tokenAddress),
        chainId,
        walletAddress: normalizeAddress(walletAddress),
      },
    },
    data: {
      isActive: false,
      revokedAt: new Date(),
      revokedBy,
    },
  });
}
