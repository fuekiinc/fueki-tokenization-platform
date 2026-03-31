import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import clsx from 'clsx';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  createNavDraft,
  finalizeNavAttestation,
  getCurrentNav,
  getNavHistory,
  getNavHolderValue,
  getNavOracleRegistration,
  listNavPublishers,
  registerNavOracle,
  removeNavPublisher,
  upsertNavPublisher,
} from '../../lib/api/nav';
import { ROLE_CONTRACT_ADMIN, SecurityTokenABI } from '../../contracts/abis/SecurityToken';
import { NAVOracleABI } from '../../contracts/abis/NAVOracle';
import {
  computeFileKeccakHash,
  computePremiumDiscount,
  filterNavAttestationsByRange,
  getNavStalenessState,
  isUsdStableSymbol,
  NAV_TIME_RANGES,
  parseNavNumber,
  readCachedCurrentNav,
  toNavChartPoints,
  writeCachedCurrentNav,
} from '../../lib/navUtils';
import type {
  CurrentNav,
  NavAssetBreakdownInput,
  NavAttestation,
  NavOracleRegistration,
  NavPublisher,
  NavTimeRange,
} from '../../types/nav';
import { formatCurrency, formatDate, formatDateTime, formatPercent, formatRelativeDate, formatTokenAmount, truncateAddress } from '../../lib/formatters';
import { queryKeys } from '../../lib/queryClient';
import { getReadOnlyProvider, parseContractError } from '../../lib/blockchain/contracts';
import { sendTransactionWithRetry, waitForTransactionReceipt } from '../../lib/blockchain/txExecution';
import { useAuthStore } from '../../store/authStore';
import { getProvider, useWalletStore } from '../../store/walletStore';
import Badge from '../Common/Badge';
import Card from '../Common/Card';
import Spinner from '../Common/Spinner';
import { EmptyState, ErrorState } from '../Common/StateDisplays';

interface ValuationDashboardProps {
  tokenAddress: string;
}

interface RoleState {
  isPublisher: boolean;
  isOracleAdmin: boolean;
  isTokenAdmin: boolean;
  canPublish: boolean;
  canManage: boolean;
}

interface DividendMarker {
  timestamp: number;
  label: string;
}

interface DividendSummary {
  displayValue: string;
  note: string | null;
}

interface PublishFormState {
  reportFile: File | null;
  reportHash: string;
  reportURI: string;
  publisherName: string;
  effectiveDate: string;
  navPerToken: string;
  totalNAV: string;
  assetBreakdown: NavAssetBreakdownInput[];
}

const PRIMARY_BUTTON = clsx(
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium',
  'bg-indigo-600 text-white transition-colors hover:bg-indigo-500',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

const SECONDARY_BUTTON = clsx(
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium',
  'border border-white/[0.08] bg-white/[0.04] text-gray-200 transition-colors hover:bg-white/[0.08]',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

const INPUT_CLASS =
  'w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

const LOG_QUERY_LOOKBACK_BLOCKS = 250_000;
const LOG_QUERY_CHUNK_SIZE = 15_000;
const LOG_QUERY_MIN_CHUNK_SIZE = 750;
const LOG_RANGE_LIMIT_RE = /ranges over .*blocks|block range|over\s+\d+\s+blocks|more than\s+\d+\s+blocks/i;

function isLogRangeLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return LOG_RANGE_LIMIT_RE.test(message);
}

async function queryRecentLogsChunked(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  provider: ethers.JsonRpcProvider | ethers.BrowserProvider,
  lookbackBlocks = LOG_QUERY_LOOKBACK_BLOCKS,
): Promise<ethers.EventLog[]> {
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - lookbackBlocks);
  const events: ethers.EventLog[] = [];

  let cursor = fromBlock;
  let chunkSize = LOG_QUERY_CHUNK_SIZE;

  while (cursor <= currentBlock) {
    const chunkEnd = Math.min(currentBlock, cursor + chunkSize - 1);

    try {
      const chunk = await contract.queryFilter(filter, cursor, chunkEnd);
      events.push(...chunk.map((entry) => entry as ethers.EventLog));
      cursor = chunkEnd + 1;
    } catch (error) {
      if (isLogRangeLimitError(error) && chunkSize > LOG_QUERY_MIN_CHUNK_SIZE) {
        chunkSize = Math.max(LOG_QUERY_MIN_CHUNK_SIZE, Math.floor(chunkSize / 2));
        continue;
      }

      throw error;
    }
  }

  return events;
}

function buildEmptyAssetRow(): NavAssetBreakdownInput {
  return {
    assetName: '',
    assetType: '',
    grossAssetValue: '',
    liabilities: '0',
    netAssetValue: '',
    provenReservesOz: '',
    probableReservesOz: '',
    spotPricePerOz: '',
    productionRateTpd: '',
    notes: '',
  };
}

function getInitialPublishFormState(currentNav: NavAttestation | CurrentNav | null): PublishFormState {
  const effectiveDate = new Date().toISOString().slice(0, 10);

  if (!currentNav) {
    return {
      reportFile: null,
      reportHash: '',
      reportURI: '',
      publisherName: '',
      effectiveDate,
      navPerToken: '',
      totalNAV: '',
      assetBreakdown: [buildEmptyAssetRow()],
    };
  }

  return {
    reportFile: null,
    reportHash: currentNav.reportHash,
    reportURI: currentNav.reportURI,
    publisherName: currentNav.publisher.name ?? '',
    effectiveDate,
    navPerToken: currentNav.navPerToken,
    totalNAV: currentNav.totalNAV,
    assetBreakdown:
      currentNav.assetBreakdown.length > 0
        ? currentNav.assetBreakdown.map((asset) => ({
            assetName: asset.assetName,
            assetType: asset.assetType,
            grossAssetValue: asset.grossAssetValue,
            liabilities: asset.liabilities,
            netAssetValue: asset.netAssetValue,
            provenReservesOz: asset.provenReservesOz ?? '',
            probableReservesOz: asset.probableReservesOz ?? '',
            spotPricePerOz: asset.spotPricePerOz ?? '',
            productionRateTpd: asset.productionRateTpd ?? '',
            notes: asset.notes ?? '',
          }))
        : [buildEmptyAssetRow()],
  };
}

async function fetchRoleState(
  tokenAddress: string,
  chainId: number,
  walletAddress: string,
  oracleAddress: string | null,
): Promise<RoleState> {
  const readProvider = getReadOnlyProvider(chainId);
  const tokenContract = new ethers.Contract(tokenAddress, SecurityTokenABI, readProvider);
  const isTokenAdmin = await tokenContract.hasRole(walletAddress, ROLE_CONTRACT_ADMIN) as boolean;

  if (!oracleAddress) {
    return {
      isPublisher: false,
      isOracleAdmin: false,
      isTokenAdmin,
      canPublish: false,
      canManage: isTokenAdmin,
    };
  }

  const oracleContract = new ethers.Contract(oracleAddress, NAVOracleABI, readProvider);
  const [publisherRole, adminRole] = await Promise.all([
    oracleContract.NAV_PUBLISHER_ROLE() as Promise<string>,
    oracleContract.NAV_ADMIN_ROLE() as Promise<string>,
  ]);
  const [isPublisher, isOracleAdmin] = await Promise.all([
    oracleContract.hasRole(publisherRole, walletAddress) as Promise<boolean>,
    oracleContract.hasRole(adminRole, walletAddress) as Promise<boolean>,
  ]);

  return {
    isPublisher,
    isOracleAdmin,
    isTokenAdmin,
    canPublish: isPublisher || isOracleAdmin,
    canManage: isTokenAdmin || isOracleAdmin,
  };
}

async function fetchDividendMarkers(
  tokenAddress: string,
  chainId: number,
): Promise<DividendMarker[]> {
  const provider = getReadOnlyProvider(chainId);
  const contract = new ethers.Contract(tokenAddress, SecurityTokenABI, provider);
  const logs = await queryRecentLogsChunked(contract, contract.filters.Funded(), provider);
  const blockTimestampCache = new Map<number, number>();
  const tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();

  const markers: DividendMarker[] = [];
  for (const log of logs) {
    const paymentToken = String(log.args[1]);
    const amount = log.args[2] as bigint;

    let timestamp = blockTimestampCache.get(log.blockNumber);
    if (timestamp === undefined) {
      const block = await provider.getBlock(log.blockNumber);
      timestamp = block?.timestamp ?? 0;
      blockTimestampCache.set(log.blockNumber, timestamp);
    }

    let tokenMeta = tokenMetaCache.get(paymentToken.toLowerCase());
    if (!tokenMeta) {
      try {
        const erc20 = new ethers.Contract(
          paymentToken,
          ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'],
          provider,
        );
        const [symbol, decimals] = await Promise.all([
          erc20.symbol() as Promise<string>,
          erc20.decimals() as Promise<number | bigint>,
        ]);
        tokenMeta = { symbol, decimals: Number(decimals) };
      } catch {
        tokenMeta = { symbol: 'TOKEN', decimals: 18 };
      }
      tokenMetaCache.set(paymentToken.toLowerCase(), tokenMeta);
    }

    const formattedAmount = Number.parseFloat(ethers.formatUnits(amount, tokenMeta.decimals));
    markers.push({
      timestamp: timestamp * 1000,
      label: `${tokenMeta.symbol} dividend ${formatTokenAmount(formattedAmount, 2)}`,
    });
  }

  return markers.sort((left, right) => left.timestamp - right.timestamp);
}

async function fetchDividendSummary(
  tokenAddress: string,
  chainId: number,
  holderAddress: string,
): Promise<DividendSummary> {
  const provider = getReadOnlyProvider(chainId);
  const contract = new ethers.Contract(tokenAddress, SecurityTokenABI, provider);
  const logs = await queryRecentLogsChunked(
    contract,
    contract.filters.Claimed(holderAddress, null, null, null),
    provider,
  );

  if (logs.length === 0) {
    return { displayValue: '$0.00', note: null };
  }

  const tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();
  let stableTotal = 0;
  let stableCount = 0;

  for (const log of logs) {
    const paymentToken = String(log.args[1]).toLowerCase();
    let tokenMeta = tokenMetaCache.get(paymentToken);

    if (!tokenMeta) {
      try {
        const erc20 = new ethers.Contract(
          paymentToken,
          ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'],
          provider,
        );
        const [symbol, decimals] = await Promise.all([
          erc20.symbol() as Promise<string>,
          erc20.decimals() as Promise<number | bigint>,
        ]);
        tokenMeta = { symbol, decimals: Number(decimals) };
      } catch {
        tokenMeta = { symbol: 'TOKEN', decimals: 18 };
      }
      tokenMetaCache.set(paymentToken, tokenMeta);
    }

    if (isUsdStableSymbol(tokenMeta.symbol)) {
      stableTotal += Number.parseFloat(ethers.formatUnits(log.args[2] as bigint, tokenMeta.decimals));
      stableCount += 1;
    }
  }

  if (stableCount === logs.length) {
    return { displayValue: formatCurrency(stableTotal), note: null };
  }

  if (tokenMetaCache.size === 1) {
    const [{ symbol, decimals }] = [...tokenMetaCache.values()];
    const aggregate = logs.reduce(
      (total, log) => total + Number.parseFloat(ethers.formatUnits(log.args[2] as bigint, decimals)),
      0,
    );
    return {
      displayValue: `${formatTokenAmount(aggregate, 4)} ${symbol}`,
      note: 'Claimed dividends are denominated in the payout token, not normalized to USD.',
    };
  }

  return {
    displayValue: `${logs.length} payouts`,
    note: 'Claimed dividends span multiple payout tokens and are not combined into a single currency figure.',
  };
}

function renderCopyButton(text: string) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
      }}
      className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-gray-300 transition-colors hover:bg-white/[0.08]"
      title="Copy to clipboard"
    >
      <Copy className="h-4 w-4" />
    </button>
  );
}

function ChartTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { isoDate: string; navPerToken: number; totalNAV: number } }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#11141c]/95 px-4 py-3 text-sm shadow-xl">
      <p className="text-xs uppercase tracking-[0.16em] text-gray-500">
        {formatDate(point.isoDate)}
      </p>
      <p className="mt-2 text-white">
        NAV / token: <span className="font-semibold">{formatCurrency(point.navPerToken)}</span>
      </p>
      <p className="mt-1 text-gray-300">
        Total NAV: <span className="font-semibold">{formatCurrency(point.totalNAV)}</span>
      </p>
    </div>
  );
}

function AttestationDetailDialog({
  attestation,
  onClose,
}: {
  attestation: NavAttestation | null;
  onClose: () => void;
}) {
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [verificationState, setVerificationState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleVerifyFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !attestation) {
      return;
    }

    setVerificationState('loading');
    setVerificationMessage(null);

    try {
      const hash = await computeFileKeccakHash(file);
      if (hash.toLowerCase() === attestation.reportHash.toLowerCase()) {
        setVerificationState('success');
        setVerificationMessage('This document matches the report hash stored on-chain.');
      } else {
        setVerificationState('error');
        setVerificationMessage('Hash mismatch. The selected file does not match the attested report hash.');
      }
    } catch (error) {
      setVerificationState('error');
      setVerificationMessage(parseContractError(error));
    } finally {
      event.target.value = '';
    }
  }, [attestation]);

  return (
    <Dialog open={Boolean(attestation)} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel className="w-full max-w-3xl rounded-2xl border border-white/[0.08] bg-[#0D0F14] p-6 shadow-2xl sm:p-8">
            {attestation && (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <DialogTitle className="text-xl font-semibold text-white">
                      NAV Attestation #{attestation.attestationIndex ?? 'Draft'}
                    </DialogTitle>
                    <p className="mt-1 text-sm text-gray-500">
                      Effective {formatDate(attestation.effectiveDate)} by{' '}
                      {attestation.publisher.name ?? truncateAddress(attestation.publisher.address)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/[0.08]"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">NAV / token</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {formatCurrency(attestation.navPerToken)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Total NAV</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {formatCurrency(attestation.totalNAV)}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Report Hash</p>
                    <div className="mt-2 flex items-center gap-3">
                      <p className="truncate font-mono text-sm text-gray-200">{attestation.reportHash}</p>
                      {renderCopyButton(attestation.reportHash)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Report</p>
                    <a
                      href={attestation.reportURI}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200"
                    >
                      View report <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Verify appraisal hash</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Drop the original PDF to confirm it matches the on-chain attestation hash.
                      </p>
                    </div>
                    <label className={SECONDARY_BUTTON}>
                      <UploadCloud className="h-4 w-4" />
                      Verify file
                      <input type="file" accept=".pdf" className="hidden" onChange={handleVerifyFile} />
                    </label>
                  </div>

                  {verificationMessage && (
                    <div
                      className={clsx(
                        'mt-4 rounded-xl px-4 py-3 text-sm',
                        verificationState === 'success'
                          ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                          : verificationState === 'error'
                            ? 'border border-red-500/20 bg-red-500/10 text-red-300'
                            : 'border border-white/[0.08] bg-white/[0.04] text-gray-300',
                      )}
                    >
                      {verificationMessage}
                    </div>
                  )}
                </div>

                <div className="mt-6 space-y-3">
                  <p className="text-sm font-semibold text-white">Asset breakdown</p>
                  {attestation.assetBreakdown.map((asset) => (
                    <div
                      key={`${asset.assetName}-${asset.assetType}`}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{asset.assetName}</p>
                          <p className="text-xs uppercase tracking-[0.16em] text-gray-500">
                            {asset.assetType.replace(/_/g, ' ')}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-white">
                          {formatCurrency(asset.netAssetValue)}
                        </p>
                      </div>
                      {(asset.provenReservesOz || asset.probableReservesOz || asset.spotPricePerOz) && (
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400">
                          {asset.provenReservesOz && <span>Proven: {formatTokenAmount(asset.provenReservesOz, 2)} oz</span>}
                          {asset.probableReservesOz && <span>Probable: {formatTokenAmount(asset.probableReservesOz, 2)} oz</span>}
                          {asset.spotPricePerOz && <span>Spot: {formatCurrency(asset.spotPricePerOz)}</span>}
                        </div>
                      )}
                      {asset.notes && <p className="mt-3 text-sm text-gray-400">{asset.notes}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}

function OracleRegistrationPanel({
  tokenAddress,
  chainId,
  existingRegistration,
  onRegistered,
}: {
  tokenAddress: string;
  chainId: number;
  existingRegistration: NavOracleRegistration | null;
  onRegistered: (registration: NavOracleRegistration) => void;
}) {
  const [oracleAddress, setOracleAddress] = useState(existingRegistration?.oracleAddress ?? '');
  const [baseCurrency, setBaseCurrency] = useState(existingRegistration?.baseCurrency ?? 'USD');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existingRegistration) {
      return;
    }

    setOracleAddress(existingRegistration.oracleAddress);
    setBaseCurrency(existingRegistration.baseCurrency);
  }, [existingRegistration]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const registration = await registerNavOracle(tokenAddress, chainId, {
        oracleAddress,
        baseCurrency,
      });
      onRegistered(registration);
      toast.success('NAV oracle registration updated.');
    } catch (submitError) {
      const message = parseContractError(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [baseCurrency, chainId, onRegistered, oracleAddress, tokenAddress]);

  return (
    <Card
      title="Oracle Registration"
      subtitle="Register the NAVOracle address that serves this security token."
      compact
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1.5 block text-xs text-gray-500">NAV Oracle Address</label>
          <input
            type="text"
            value={oracleAddress}
            onChange={(event) => setOracleAddress(event.target.value)}
            placeholder="0x..."
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-gray-500">Base Currency</label>
          <input
            type="text"
            value={baseCurrency}
            onChange={(event) => setBaseCurrency(event.target.value.toUpperCase())}
            maxLength={10}
            className={INPUT_CLASS}
          />
        </div>
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        <button type="submit" className={PRIMARY_BUTTON} disabled={isSubmitting || !oracleAddress}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {existingRegistration ? 'Update Oracle' : 'Register Oracle'}
        </button>
      </form>
    </Card>
  );
}

function PublisherManagementPanel({
  tokenAddress,
  chainId,
  registration,
  publishers,
  canManage,
  onUpdated,
}: {
  tokenAddress: string;
  chainId: number;
  registration: NavOracleRegistration;
  publishers: NavPublisher[];
  canManage: boolean;
  onUpdated: () => void;
}) {
  const [walletAddress, setWalletAddress] = useState('');
  const [name, setName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseType, setLicenseType] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const authorizePublisher = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || !walletAddress || !name) {
      return;
    }

    setBusyKey('create');
    try {
      const provider = getProvider();
      if (!provider) {
        throw new Error('Wallet not connected');
      }

      const signer = await provider.getSigner();
      const oracle = new ethers.Contract(registration.oracleAddress, NAVOracleABI, signer);
      const publisherRole = await oracle.NAV_PUBLISHER_ROLE() as string;

      const tx = await sendTransactionWithRetry(
        () => oracle.grantRole(publisherRole, walletAddress),
        { label: 'ValuationDashboard.grantPublisherRole' },
      );
      await waitForTransactionReceipt(tx, { label: 'ValuationDashboard.grantPublisherRole' });

      await upsertNavPublisher(tokenAddress, chainId, {
        walletAddress,
        name,
        licenseNumber: licenseNumber || undefined,
        licenseType: licenseType || undefined,
        contactEmail: contactEmail || undefined,
      });

      toast.success('Publisher authorized.');
      setWalletAddress('');
      setName('');
      setLicenseNumber('');
      setLicenseType('');
      setContactEmail('');
      onUpdated();
    } catch (error) {
      toast.error(parseContractError(error));
    } finally {
      setBusyKey(null);
    }
  }, [canManage, chainId, contactEmail, licenseNumber, licenseType, name, onUpdated, registration.oracleAddress, tokenAddress, walletAddress]);

  const revokePublisher = useCallback(async (publisher: NavPublisher) => {
    setBusyKey(publisher.walletAddress);
    try {
      const provider = getProvider();
      if (!provider) {
        throw new Error('Wallet not connected');
      }

      const signer = await provider.getSigner();
      const oracle = new ethers.Contract(registration.oracleAddress, NAVOracleABI, signer);
      const publisherRole = await oracle.NAV_PUBLISHER_ROLE() as string;

      const tx = await sendTransactionWithRetry(
        () => oracle.revokeRole(publisherRole, publisher.walletAddress),
        { label: 'ValuationDashboard.revokePublisherRole' },
      );
      await waitForTransactionReceipt(tx, { label: 'ValuationDashboard.revokePublisherRole' });
      await removeNavPublisher(tokenAddress, chainId, publisher.walletAddress);
      toast.success('Publisher revoked.');
      onUpdated();
    } catch (error) {
      toast.error(parseContractError(error));
    } finally {
      setBusyKey(null);
    }
  }, [chainId, onUpdated, registration.oracleAddress, tokenAddress]);

  return (
    <Card title="Publisher Management" subtitle="Authorize or revoke NAV publishers for this oracle." compact>
      <div className="space-y-5">
        {publishers.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-4 text-sm text-gray-400">
            No publishers recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {publishers.map((publisher) => (
              <div
                key={publisher.walletAddress}
                className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{publisher.name}</p>
                    <Badge variant={publisher.onChainActive ? 'success' : 'warning'} size="sm" dot>
                      {publisher.onChainActive ? 'On-chain active' : 'Metadata only'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs font-mono text-gray-500">{publisher.walletAddress}</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void revokePublisher(publisher)}
                    className={SECONDARY_BUTTON}
                    disabled={busyKey !== null}
                  >
                    {busyKey === publisher.walletAddress ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={authorizePublisher}>
            <input
              type="text"
              value={walletAddress}
              onChange={(event) => setWalletAddress(event.target.value)}
              placeholder="Publisher wallet address"
              className={INPUT_CLASS}
            />
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Publisher name"
              className={INPUT_CLASS}
            />
            <input
              type="text"
              value={licenseNumber}
              onChange={(event) => setLicenseNumber(event.target.value)}
              placeholder="License number"
              className={INPUT_CLASS}
            />
            <input
              type="text"
              value={licenseType}
              onChange={(event) => setLicenseType(event.target.value)}
              placeholder="License type"
              className={INPUT_CLASS}
            />
            <input
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="Contact email"
              className={clsx(INPUT_CLASS, 'sm:col-span-2')}
            />
            <button
              type="submit"
              className={PRIMARY_BUTTON}
              disabled={busyKey !== null || !walletAddress || !name}
            >
              {busyKey === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Authorize Publisher
            </button>
          </form>
        )}
      </div>
    </Card>
  );
}

function PublishNavPanel({
  tokenAddress,
  chainId,
  registration,
  currentNav,
  canPublish,
  isAuthenticated,
  onPublished,
}: {
  tokenAddress: string;
  chainId: number;
  registration: NavOracleRegistration;
  currentNav: CurrentNav | null;
  canPublish: boolean;
  isAuthenticated: boolean;
  onPublished: () => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<PublishFormState>(() => getInitialPublishFormState(currentNav));
  const [busyState, setBusyState] = useState<'idle' | 'hashing' | 'draft' | 'publishing'>('idle');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    setForm(getInitialPublishFormState(currentNav));
    setDraftId(null);
    setValidationMessage(null);
    setStep(1);
  }, [currentNav]);

  const updateAssetRow = useCallback((index: number, key: keyof NavAssetBreakdownInput, value: string) => {
    setForm((current) => ({
      ...current,
      assetBreakdown: current.assetBreakdown.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    }));
  }, []);

  const addAssetRow = useCallback(() => {
    setForm((current) => ({
      ...current,
      assetBreakdown: [...current.assetBreakdown, buildEmptyAssetRow()],
    }));
  }, []);

  const removeAssetRow = useCallback((index: number) => {
    setForm((current) => ({
      ...current,
      assetBreakdown:
        current.assetBreakdown.length === 1
          ? [buildEmptyAssetRow()]
          : current.assetBreakdown.filter((_, rowIndex) => rowIndex !== index),
    }));
  }, []);

  const handleFileSelected = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setBusyState('hashing');
    setValidationMessage(null);

    try {
      const reportHash = await computeFileKeccakHash(file);
      setForm((current) => ({
        ...current,
        reportFile: file,
        reportHash,
      }));
      toast.success('Keccak-256 report hash computed.');
    } catch (error) {
      toast.error(parseContractError(error));
    } finally {
      setBusyState('idle');
      event.target.value = '';
    }
  }, []);

  const canProceedToValuation = form.reportHash && form.reportURI;
  const canProceedToReview = form.effectiveDate && form.navPerToken && form.totalNAV
    && form.assetBreakdown.some((row) => row.assetName && row.assetType && row.netAssetValue);

  const saveDraft = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error('Sign in to save valuation drafts.');
      return;
    }

    setBusyState('draft');
    setValidationMessage(null);

    try {
      const draft = await createNavDraft(tokenAddress, chainId, {
        navPerToken: form.navPerToken,
        totalNAV: form.totalNAV,
        effectiveDate: new Date(form.effectiveDate).toISOString(),
        reportHash: form.reportHash,
        reportURI: form.reportURI,
        publisherName: form.publisherName || undefined,
        assetBreakdown: form.assetBreakdown,
      });
      setDraftId(draft.id);
      toast.success('NAV draft saved.');
    } catch (error) {
      const message = parseContractError(error);
      setValidationMessage(message);
      toast.error(message);
    } finally {
      setBusyState('idle');
    }
  }, [chainId, form, isAuthenticated, tokenAddress]);

  const publishAttestation = useCallback(async () => {
    if (!canPublish) {
      toast.error('This wallet cannot publish NAV attestations.');
      return;
    }

    if (!isAuthenticated) {
      toast.error('Sign in to publish NAV attestations.');
      return;
    }

    setBusyState('publishing');
    setValidationMessage(null);

    try {
      const draft =
        draftId
          ? { id: draftId }
          : await createNavDraft(tokenAddress, chainId, {
              navPerToken: form.navPerToken,
              totalNAV: form.totalNAV,
              effectiveDate: new Date(form.effectiveDate).toISOString(),
              reportHash: form.reportHash,
              reportURI: form.reportURI,
              publisherName: form.publisherName || undefined,
              assetBreakdown: form.assetBreakdown,
            });

      const provider = getProvider();
      if (!provider) {
        throw new Error('Wallet not connected');
      }

      const signer = await provider.getSigner();
      const signerOracle = new ethers.Contract(registration.oracleAddress, NAVOracleABI, signer);
      const tokenContract = new ethers.Contract(tokenAddress, SecurityTokenABI, signer.provider ?? signer);
      const totalSupply = await tokenContract.totalSupply() as bigint;

      const tx = await sendTransactionWithRetry(
        () =>
          signerOracle.publishNAV(
            ethers.parseUnits(form.navPerToken, 6),
            ethers.parseUnits(form.totalNAV, 6),
            totalSupply,
            Math.floor(new Date(form.effectiveDate).getTime() / 1000),
            form.reportHash,
            form.reportURI,
          ),
        { label: 'ValuationDashboard.publishNAV' },
      );
      const receipt = await waitForTransactionReceipt(tx, { label: 'ValuationDashboard.publishNAV' });

      let finalized: NavAttestation | null = null;
      let finalizeError: unknown = null;
      for (let attempt = 0; attempt < 3 && !finalized; attempt += 1) {
        try {
          finalized = await finalizeNavAttestation(tokenAddress, chainId, {
            navPerToken: form.navPerToken,
            totalNAV: form.totalNAV,
            effectiveDate: new Date(form.effectiveDate).toISOString(),
            reportHash: form.reportHash,
            reportURI: form.reportURI,
            publisherName: form.publisherName || undefined,
            assetBreakdown: form.assetBreakdown,
            txHash: receipt.hash,
            draftId: draft.id,
          });
        } catch (error) {
          finalizeError = error;
          await new Promise((resolve) => setTimeout(resolve, 1_500));
        }
      }

      if (!finalized) {
        throw finalizeError ?? new Error('Published on-chain, but the platform could not finalize the attestation record.');
      }

      setDraftId(null);
      toast.success('NAV attestation published.');
      onPublished();
      setForm(getInitialPublishFormState(finalized));
      setStep(1);
    } catch (error) {
      const message = parseContractError(error);
      setValidationMessage(message);
      toast.error(message);
    } finally {
      setBusyState('idle');
    }
  }, [canPublish, chainId, draftId, form, isAuthenticated, onPublished, registration.oracleAddress, tokenAddress]);

  const previousNavDelta = currentNav
    ? computePremiumDiscount(currentNav.navPerToken, form.navPerToken)
    : null;

  return (
    <Card title="Publish NAV" subtitle="Stage a valuation, review the delta, then publish it on-chain." compact>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((currentStep) => (
            <div
              key={currentStep}
              className={clsx(
                'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium',
                currentStep === step
                  ? 'bg-indigo-500/20 text-indigo-200'
                  : currentStep < step
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-white/[0.04] text-gray-500',
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px]">
                {currentStep}
              </span>
              {currentStep === 1 && 'Report'}
              {currentStep === 2 && 'Valuation'}
              {currentStep === 3 && 'Review'}
              {currentStep === 4 && 'Publish'}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Appraisal document</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Upload the PDF to compute its keccak256 hash before publishing.
                  </p>
                </div>
                <label className={SECONDARY_BUTTON}>
                  {busyState === 'hashing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  Upload PDF
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileSelected} />
                </label>
              </div>
              {form.reportFile && (
                <p className="mt-3 text-xs text-gray-400">
                  Selected file: <span className="font-medium text-gray-200">{form.reportFile.name}</span>
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-gray-500">Report Hash</label>
              <input type="text" value={form.reportHash} readOnly className={INPUT_CLASS} placeholder="0x..." />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-gray-500">Report URI</label>
              <input
                type="text"
                value={form.reportURI}
                onChange={(event) => setForm((current) => ({ ...current, reportURI: event.target.value }))}
                placeholder="ipfs://... or https://..."
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-gray-500">Publisher Name</label>
              <input
                type="text"
                value={form.publisherName}
                onChange={(event) => setForm((current) => ({ ...current, publisherName: event.target.value }))}
                placeholder="Rocky Mountain Appraisals LLC"
                className={INPUT_CLASS}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs text-gray-500">Effective Date</label>
                <input
                  type="date"
                  value={form.effectiveDate}
                  onChange={(event) => setForm((current) => ({ ...current, effectiveDate: event.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-gray-500">NAV per Token</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.navPerToken}
                  onChange={(event) => setForm((current) => ({ ...current, navPerToken: event.target.value }))}
                  placeholder="5.000000"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-gray-500">Total NAV</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.totalNAV}
                  onChange={(event) => setForm((current) => ({ ...current, totalNAV: event.target.value }))}
                  placeholder="5000000.000000"
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Asset breakdown</p>
                <button type="button" className={SECONDARY_BUTTON} onClick={addAssetRow}>
                  <Plus className="h-4 w-4" />
                  Add asset
                </button>
              </div>

              {form.assetBreakdown.map((asset, index) => (
                <div key={`asset-row-${index}`} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-white">Asset #{index + 1}</p>
                    <button type="button" className="text-xs text-gray-500 transition-colors hover:text-red-300" onClick={() => removeAssetRow(index)}>
                      Remove
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      value={asset.assetName}
                      onChange={(event) => updateAssetRow(index, 'assetName', event.target.value)}
                      placeholder="Asset name"
                      className={INPUT_CLASS}
                    />
                    <input
                      type="text"
                      value={asset.assetType}
                      onChange={(event) => updateAssetRow(index, 'assetType', event.target.value)}
                      placeholder="mining_property"
                      className={INPUT_CLASS}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={asset.grossAssetValue}
                      onChange={(event) => updateAssetRow(index, 'grossAssetValue', event.target.value)}
                      placeholder="Gross asset value"
                      className={INPUT_CLASS}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={asset.liabilities}
                      onChange={(event) => updateAssetRow(index, 'liabilities', event.target.value)}
                      placeholder="Liabilities"
                      className={INPUT_CLASS}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={asset.netAssetValue}
                      onChange={(event) => updateAssetRow(index, 'netAssetValue', event.target.value)}
                      placeholder="Net asset value"
                      className={INPUT_CLASS}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={asset.spotPricePerOz ?? ''}
                      onChange={(event) => updateAssetRow(index, 'spotPricePerOz', event.target.value)}
                      placeholder="Spot price / oz"
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">Review summary</p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-500">NAV per token</dt>
                  <dd className="font-semibold text-white">{formatCurrency(form.navPerToken)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-500">Total NAV</dt>
                  <dd className="font-semibold text-white">{formatCurrency(form.totalNAV)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-500">Effective date</dt>
                  <dd className="font-semibold text-white">{form.effectiveDate ? formatDate(form.effectiveDate) : '--'}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-500">Report URI</dt>
                  <dd className="truncate font-medium text-indigo-300">{form.reportURI || '--'}</dd>
                </div>
              </dl>
            </div>

            {currentNav && previousNavDelta && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">Change vs previous attestation</p>
                <p className="mt-2 text-sm text-gray-300">
                  Current published NAV: <span className="font-semibold text-white">{formatCurrency(currentNav.navPerToken)}</span>
                </p>
                <p
                  className={clsx(
                    'mt-2 text-sm font-medium',
                    previousNavDelta.direction === 'premium'
                      ? 'text-emerald-300'
                      : previousNavDelta.direction === 'discount'
                        ? 'text-amber-300'
                        : 'text-gray-300',
                  )}
                >
                  Proposed change: {formatPercent(Math.abs(previousNavDelta.percent))}{' '}
                  {previousNavDelta.direction === 'at-nav' ? 'at current NAV' : previousNavDelta.direction}
                </p>
              </div>
            )}

            {draftId && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                Draft saved and ready to publish.
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-4 text-sm text-indigo-100">
              Publishing will send an on-chain `publishNAV` transaction from your connected wallet,
              wait for confirmation, then sync the attestation into the platform database.
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-500">Oracle</dt>
                  <dd className="font-mono text-gray-200">{truncateAddress(registration.oracleAddress, 8)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-500">Publisher access</dt>
                  <dd className="font-medium text-white">{canPublish ? 'Confirmed' : 'Missing role'}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-500">Auth session</dt>
                  <dd className="font-medium text-white">{isAuthenticated ? 'Connected' : 'Login required'}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {validationMessage && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {validationMessage}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-3">
            <button type="button" className={SECONDARY_BUTTON} onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1 || busyState !== 'idle'}>
              Back
            </button>
            {step < 4 && (
              <button
                type="button"
                className={PRIMARY_BUTTON}
                onClick={() => setStep((current) => Math.min(4, current + 1))}
                disabled={
                  busyState !== 'idle'
                  || (step === 1 && !canProceedToValuation)
                  || (step === 2 && !canProceedToReview)
                }
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {step >= 3 && (
              <button type="button" className={SECONDARY_BUTTON} onClick={() => void saveDraft()} disabled={busyState !== 'idle'}>
                {busyState === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                Save Draft
              </button>
            )}
            {step === 4 && (
              <button type="button" className={PRIMARY_BUTTON} onClick={() => void publishAttestation()} disabled={busyState !== 'idle' || !canPublish || !isAuthenticated}>
                {busyState === 'publishing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Publish Attestation
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function ValuationDashboard({ tokenAddress }: ValuationDashboardProps) {
  const queryClient = useQueryClient();
  const chainId = useWalletStore((state) => state.wallet.chainId);
  const walletAddress = useWalletStore((state) => state.wallet.address);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [timeRange, setTimeRange] = useState<NavTimeRange>('1Y');
  const [selectedAttestation, setSelectedAttestation] = useState<NavAttestation | null>(null);

  const cachedCurrentNav = useMemo(
    () => (chainId ? readCachedCurrentNav(tokenAddress, chainId) : null),
    [chainId, tokenAddress],
  );

  const registrationQuery = useQuery({
    queryKey: queryKeys.navRegistration(tokenAddress, chainId),
    enabled: Boolean(chainId),
    staleTime: 300_000,
    queryFn: async () => {
      if (!chainId) {
        return null;
      }
      return getNavOracleRegistration(tokenAddress, chainId);
    },
  });

  const currentNavQuery = useQuery({
    queryKey: queryKeys.navCurrent(tokenAddress, chainId),
    enabled: Boolean(chainId),
    initialData: cachedCurrentNav ?? undefined,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!chainId) {
        return null;
      }
      const currentNav = await getCurrentNav(tokenAddress, chainId);
      writeCachedCurrentNav(tokenAddress, chainId, currentNav);
      return currentNav;
    },
  });

  const historyQuery = useQuery({
    queryKey: queryKeys.navHistory(tokenAddress, chainId, timeRange),
    enabled: Boolean(chainId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!chainId) {
        throw new Error('Wallet not connected');
      }

      const history = await getNavHistory(tokenAddress, chainId, {
        page: 1,
        pageSize: 100,
      });
      return {
        ...history,
        attestations: filterNavAttestationsByRange(history.attestations, timeRange),
      };
    },
  });

  const holderValueQuery = useQuery({
    queryKey: queryKeys.navHolderValue(tokenAddress, walletAddress, chainId),
    enabled: Boolean(chainId && walletAddress),
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!chainId || !walletAddress) {
        return null;
      }
      return getNavHolderValue(tokenAddress, chainId, walletAddress);
    },
  });

  const roleQuery = useQuery({
    queryKey: [
      'navRoles',
      tokenAddress.toLowerCase(),
      chainId ?? 'unknown',
      walletAddress?.toLowerCase() ?? 'anonymous',
      registrationQuery.data?.oracleAddress ?? 'none',
    ],
    enabled: Boolean(chainId && walletAddress),
    staleTime: 60_000,
    queryFn: async () => {
      if (!chainId || !walletAddress) {
        return {
          isPublisher: false,
          isOracleAdmin: false,
          isTokenAdmin: false,
          canPublish: false,
          canManage: false,
        } satisfies RoleState;
      }

      return fetchRoleState(
        tokenAddress,
        chainId,
        walletAddress,
        registrationQuery.data?.oracleAddress ?? null,
      );
    },
  });

  const publishersQuery = useQuery({
    queryKey: queryKeys.navPublishers(tokenAddress, chainId),
    enabled: Boolean(chainId && registrationQuery.data?.oracleAddress && roleQuery.data?.canManage),
    staleTime: 60_000,
    queryFn: async () => {
      if (!chainId) {
        return [];
      }
      return listNavPublishers(tokenAddress, chainId);
    },
  });

  const dividendMarkersQuery = useQuery({
    queryKey: ['navDividendMarkers', tokenAddress.toLowerCase(), chainId ?? 'unknown'],
    enabled: Boolean(chainId),
    staleTime: 300_000,
    queryFn: async () => {
      if (!chainId) {
        return [];
      }
      return fetchDividendMarkers(tokenAddress, chainId);
    },
  });

  const dividendSummaryQuery = useQuery({
    queryKey: ['navDividendSummary', tokenAddress.toLowerCase(), chainId ?? 'unknown', walletAddress?.toLowerCase() ?? 'anonymous'],
    enabled: Boolean(chainId && walletAddress),
    staleTime: 300_000,
    queryFn: async () => {
      if (!chainId || !walletAddress) {
        return null;
      }
      return fetchDividendSummary(tokenAddress, chainId, walletAddress);
    },
  });

  const refreshNavQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.navRegistration(tokenAddress, chainId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.navCurrent(tokenAddress, chainId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.navHistory(tokenAddress, chainId, timeRange) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.navHolderValue(tokenAddress, walletAddress, chainId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.navPublishers(tokenAddress, chainId) });
  }, [chainId, queryClient, timeRange, tokenAddress, walletAddress]);

  useEffect(() => {
    if (!chainId || !registrationQuery.data?.oracleAddress) {
      return undefined;
    }

    const contract = new ethers.Contract(
      registrationQuery.data.oracleAddress,
      NAVOracleABI,
      getReadOnlyProvider(chainId),
    );

    const handlePublished = () => {
      refreshNavQueries();
    };

    contract.on('NAVPublished', handlePublished);
    return () => {
      contract.off('NAVPublished', handlePublished);
    };
  }, [chainId, refreshNavQueries, registrationQuery.data?.oracleAddress]);

  const chartPoints = useMemo(
    () => toNavChartPoints(historyQuery.data?.attestations ?? []),
    [historyQuery.data?.attestations],
  );

  const activeDividendMarkers = useMemo(() => {
    if (!dividendMarkersQuery.data || chartPoints.length === 0) {
      return [];
    }

    const minTimestamp = chartPoints[0]?.timestamp ?? 0;
    const maxTimestamp = chartPoints.at(-1)?.timestamp ?? 0;
    return dividendMarkersQuery.data
      .filter((marker) => marker.timestamp >= minTimestamp && marker.timestamp <= maxTimestamp)
      .slice(-6);
  }, [chartPoints, dividendMarkersQuery.data]);

  const currentNav = currentNavQuery.data ?? null;
  const roles = roleQuery.data;
  const stalenessState = currentNav
    ? getNavStalenessState(
        currentNav.daysSinceLastUpdate,
        currentNav.stalenessWarningDays,
        currentNav.stalenessCriticalDays,
      )
    : 'fresh';

  if (!chainId) {
    return (
      <Card title="Valuation" compact>
        <EmptyState
          icon={<Wallet className="h-6 w-6 text-gray-500" />}
          title="Connect a wallet"
          description="Connect your wallet to load chain-specific NAV and holder valuation data."
        />
      </Card>
    );
  }

  if (
    registrationQuery.isLoading
    || currentNavQuery.isLoading
    || historyQuery.isLoading
    || roleQuery.isLoading
  ) {
    return (
      <Card title="Valuation" compact>
        <div className="flex justify-center py-14">
          <Spinner label="Loading NAV dashboard..." />
        </div>
      </Card>
    );
  }

  if (registrationQuery.error || currentNavQuery.error || historyQuery.error || roleQuery.error) {
    return (
      <Card title="Valuation" compact>
        <ErrorState
          message={parseContractError(
            registrationQuery.error ?? currentNavQuery.error ?? historyQuery.error ?? roleQuery.error,
          )}
          onRetry={() => {
            void registrationQuery.refetch();
            void currentNavQuery.refetch();
            void historyQuery.refetch();
            void roleQuery.refetch();
          }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card
        title="Net Asset Value"
        subtitle="On-chain valuation and attestation history for this security token."
        gradientBorder
        action={
          <div className="flex flex-wrap items-center gap-2">
            {cachedCurrentNav && currentNavQuery.isFetching && (
              <Badge variant="warning" size="sm" dot>
                Cached value refreshing
              </Badge>
            )}
            {registrationQuery.data && (
              <Badge variant="info" size="sm">
                {registrationQuery.data.baseCurrency}
              </Badge>
            )}
          </div>
        }
      >
        {!registrationQuery.data ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-5 text-sm text-amber-100">
              No NAV oracle is registered for this token yet. Register the oracle address to start
              publishing and viewing valuations.
            </div>
            {roles?.canManage ? (
              <OracleRegistrationPanel
                tokenAddress={tokenAddress}
                chainId={chainId}
                existingRegistration={null}
                onRegistered={() => refreshNavQueries()}
              />
            ) : (
              <EmptyState
                icon={<AlertCircle className="h-6 w-6 text-amber-300" />}
                title="NAV not configured"
                description="A token administrator needs to register this token's NAV oracle before valuations can be published."
              />
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[1.6fr,1fr]">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
                {currentNav ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Current NAV / token</p>
                        <p className="mt-2 text-4xl font-semibold text-white">
                          {formatCurrency(currentNav.navPerToken, currentNav.baseCurrency)}
                        </p>
                        <p className="mt-2 text-sm text-gray-400">
                          Total NAV {formatCurrency(currentNav.totalNAV, currentNav.baseCurrency)} across{' '}
                          {formatTokenAmount(currentNav.totalTokenSupply, 0)} tokens
                        </p>
                      </div>

                      <div className="space-y-2 text-right">
                        {currentNav.navChangeFromPrevious ? (
                          <p
                            className={clsx(
                              'text-sm font-medium',
                              currentNav.navChangeFromPrevious.direction === 'up'
                                ? 'text-emerald-300'
                                : currentNav.navChangeFromPrevious.direction === 'down'
                                  ? 'text-amber-300'
                                  : 'text-gray-300',
                            )}
                          >
                            {currentNav.navChangeFromPrevious.absolute} ({formatPercent(Math.abs(currentNav.navChangeFromPrevious.percentBps / 100))})
                          </p>
                        ) : (
                          <p className="text-sm text-gray-400">First attestation</p>
                        )}
                        <p className="text-xs text-gray-500">
                          Effective {formatDate(currentNav.effectiveDate)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-gray-400">
                      <span className="inline-flex items-center gap-2">
                        <Clock3 className="h-4 w-4" />
                        {currentNav.daysSinceLastUpdate === null
                          ? 'Published date unavailable'
                          : `${currentNav.daysSinceLastUpdate} day${currentNav.daysSinceLastUpdate === 1 ? '' : 's'} since update`}
                      </span>
                      <span>by {currentNav.publisher.name ?? truncateAddress(currentNav.publisher.address)}</span>
                    </div>

                    {stalenessState !== 'fresh' && (
                      <div
                        className={clsx(
                          'mt-4 rounded-xl border px-4 py-3 text-sm',
                          stalenessState === 'critical'
                            ? 'border-red-500/20 bg-red-500/10 text-red-200'
                            : 'border-amber-500/20 bg-amber-500/10 text-amber-100',
                        )}
                      >
                        Valuation is {stalenessState === 'critical' ? 'critically stale' : 'getting stale'}.
                        Published {currentNav.publishedAt ? formatRelativeDate(currentNav.publishedAt) : 'previously'}.
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <a
                        href={currentNav.reportURI}
                        target="_blank"
                        rel="noreferrer"
                        className={PRIMARY_BUTTON}
                      >
                        View Report <ExternalLink className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        className={SECONDARY_BUTTON}
                        onClick={() => setSelectedAttestation(currentNav)}
                      >
                        Verify Hash <FileCheck2 className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    icon={<ShieldCheck className="h-6 w-6 text-indigo-300" />}
                    title="No published valuations yet"
                    description="The oracle is registered, but no NAV attestation has been published on-chain for this token yet."
                  />
                )}
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Wallet className="h-4 w-4 text-indigo-300" />
                  Your Position
                </div>
                {!walletAddress ? (
                  <p className="mt-4 text-sm text-gray-500">
                    Connect a wallet to see your current position value and ownership.
                  </p>
                ) : holderValueQuery.isLoading ? (
                  <div className="mt-6 flex justify-center">
                    <Spinner label="Loading position..." />
                  </div>
                ) : !holderValueQuery.data ? (
                  <p className="mt-4 text-sm text-gray-500">
                    No live position value is available until a NAV attestation is published.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    <p className="text-2xl font-semibold text-white">
                      {formatCurrency(holderValueQuery.data.totalValue, holderValueQuery.data.baseCurrency)}
                    </p>
                    <p className="text-sm text-gray-400">
                      {formatTokenAmount(holderValueQuery.data.tokenBalance, 4)} tokens
                    </p>
                    <div className="space-y-2 text-sm text-gray-300">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-500">Ownership</span>
                        <span>{formatPercent(holderValueQuery.data.percentOfTotalSupply)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-500">Dividends received</span>
                        <span>{dividendSummaryQuery.data?.displayValue ?? '--'}</span>
                      </div>
                      {dividendSummaryQuery.data?.note && (
                        <p className="text-xs text-gray-500">{dividendSummaryQuery.data.note}</p>
                      )}
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-500">Cost basis</span>
                        <span className="text-gray-400">Unavailable until acquisition lots are indexed</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.7fr,1fr]">
              <Card
                title="NAV History"
                subtitle="Historical NAV trend with recent dividend distribution markers."
                compact
                action={
                  <div className="flex flex-wrap gap-2">
                    {NAV_TIME_RANGES.map((range) => (
                      <button
                        key={range}
                        type="button"
                        onClick={() => setTimeRange(range)}
                        className={clsx(
                          'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                          timeRange === range
                            ? 'bg-indigo-500/20 text-indigo-200'
                            : 'bg-white/[0.04] text-gray-500 hover:bg-white/[0.08] hover:text-gray-300',
                        )}
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                }
              >
                {chartPoints.length === 0 ? (
                  <EmptyState
                    icon={<Clock3 className="h-6 w-6 text-gray-500" />}
                    title="No valuation history"
                    description="Publish the first attestation to start building the NAV history chart."
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartPoints} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="navArea" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#818CF8" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#818CF8" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                          <XAxis
                            type="number"
                            dataKey="timestamp"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(value) => formatDate(value)}
                            tick={{ fill: '#6B7280', fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={(value) => `$${Number(value).toFixed(2)}`}
                            tick={{ fill: '#6B7280', fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                            width={80}
                          />
                          <Tooltip content={<ChartTooltipContent />} />
                          {activeDividendMarkers.map((marker) => (
                            <ReferenceLine
                              key={`${marker.timestamp}-${marker.label}`}
                              x={marker.timestamp}
                              stroke="rgba(16, 185, 129, 0.35)"
                              strokeDasharray="4 4"
                              label={{
                                value: marker.label,
                                angle: -90,
                                position: 'insideTopLeft',
                                fill: '#9CA3AF',
                                fontSize: 10,
                              }}
                            />
                          ))}
                          <Area
                            type="monotone"
                            dataKey="navPerToken"
                            stroke="#818CF8"
                            strokeWidth={2}
                            fill="url(#navArea)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">High</p>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {historyQuery.data?.summary.highestNAV ? formatCurrency(historyQuery.data.summary.highestNAV) : '--'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Low</p>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {historyQuery.data?.summary.lowestNAV ? formatCurrency(historyQuery.data.summary.lowestNAV) : '--'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Average</p>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {historyQuery.data?.summary.averageNAV ? formatCurrency(historyQuery.data.summary.averageNAV) : '--'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Dividends</p>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {historyQuery.data?.summary.totalDividendsPaid ? formatCurrency(historyQuery.data.summary.totalDividendsPaid) : '--'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              <Card title="Asset Breakdown" subtitle="How underlying assets contribute to current NAV." compact>
                {!currentNav || currentNav.assetBreakdown.length === 0 ? (
                  <EmptyState
                    icon={<ShieldCheck className="h-6 w-6 text-gray-500" />}
                    title="No asset-level breakdown"
                    description="Publish a valuation with asset snapshots to visualize concentration and reserve metrics."
                  />
                ) : (
                  <div className="space-y-3">
                    {currentNav.assetBreakdown.map((asset) => {
                      const share = parseNavNumber(currentNav.totalNAV) > 0
                        ? (parseNavNumber(asset.netAssetValue) / parseNavNumber(currentNav.totalNAV)) * 100
                        : 0;

                      return (
                        <div key={`${asset.assetName}-${asset.assetType}`} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">{asset.assetName}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-500">
                                {asset.assetType.replace(/_/g, ' ')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-white">{formatCurrency(asset.netAssetValue)}</p>
                              <p className="mt-1 text-xs text-gray-500">{formatPercent(share)}</p>
                            </div>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-white/[0.06]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                              style={{ width: `${Math.max(0, Math.min(share, 100))}%` }}
                            />
                          </div>
                          {(asset.provenReservesOz || asset.probableReservesOz || asset.spotPricePerOz) && (
                            <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400">
                              {asset.provenReservesOz && <span>Proven {formatTokenAmount(asset.provenReservesOz, 2)} oz</span>}
                              {asset.probableReservesOz && <span>Probable {formatTokenAmount(asset.probableReservesOz, 2)} oz</span>}
                              {asset.spotPricePerOz && <span>Spot {formatCurrency(asset.spotPricePerOz)}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            <Card title="Attestation Timeline" subtitle="Every attestation published for this token, newest first." compact>
              {!historyQuery.data || historyQuery.data.attestations.length === 0 ? (
                <EmptyState
                  icon={<Clock3 className="h-6 w-6 text-gray-500" />}
                  title="No attestations yet"
                  description="Published valuations will appear here as an audit trail."
                />
              ) : (
                <div className="space-y-3">
                  {historyQuery.data.attestations.map((attestation, index) => {
                    const previous = historyQuery.data?.attestations[index + 1] ?? null;
                    const delta = previous
                      ? computePremiumDiscount(previous.navPerToken, attestation.navPerToken)
                      : null;

                    return (
                      <button
                        key={attestation.id}
                        type="button"
                        onClick={() => setSelectedAttestation(attestation)}
                        className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.05]"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-white">{formatDate(attestation.effectiveDate)}</p>
                              <Badge variant={attestation.status === 'PUBLISHED' ? 'success' : 'warning'} size="sm" dot>
                                {attestation.status}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              {attestation.publisher.name ?? truncateAddress(attestation.publisher.address)} • {attestation.publishedAt ? formatDateTime(attestation.publishedAt) : 'Draft'}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm font-semibold text-white">
                              {formatCurrency(attestation.navPerToken)}
                            </p>
                            <p
                              className={clsx(
                                'mt-1 text-xs',
                                !delta || delta.direction === 'at-nav'
                                  ? 'text-gray-500'
                                  : delta.direction === 'premium'
                                    ? 'text-emerald-300'
                                    : 'text-amber-300',
                              )}
                            >
                              {!delta
                                ? 'First attestation'
                                : `${formatPercent(Math.abs(delta.percent))} ${delta.direction === 'at-nav' ? 'unchanged' : delta.direction}`}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>

            {(roles?.canManage || roles?.canPublish) && (
              <div
                className={clsx(
                  'grid gap-6',
                  roles?.canManage && roles?.canPublish ? 'xl:grid-cols-2' : 'xl:grid-cols-1',
                )}
              >
                {roles?.canManage && (
                  <div className="space-y-6">
                    <OracleRegistrationPanel
                      tokenAddress={tokenAddress}
                      chainId={chainId}
                      existingRegistration={registrationQuery.data}
                      onRegistered={() => refreshNavQueries()}
                    />
                    {registrationQuery.data && (
                      <PublisherManagementPanel
                        tokenAddress={tokenAddress}
                        chainId={chainId}
                        registration={registrationQuery.data}
                        publishers={publishersQuery.data ?? []}
                        canManage={roles.canManage}
                        onUpdated={refreshNavQueries}
                      />
                    )}
                  </div>
                )}

                {registrationQuery.data && roles?.canPublish && (
                  <PublishNavPanel
                    tokenAddress={tokenAddress}
                    chainId={chainId}
                    registration={registrationQuery.data}
                    currentNav={currentNav}
                    canPublish={Boolean(roles?.canPublish)}
                    isAuthenticated={isAuthenticated}
                    onPublished={refreshNavQueries}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <AttestationDetailDialog attestation={selectedAttestation} onClose={() => setSelectedAttestation(null)} />
    </div>
  );
}
