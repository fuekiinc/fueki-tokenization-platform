/**
 * DividendManager -- Manages snapshot-based dividend distribution for an
 * ERC-1404 security token.
 *
 * Sections:
 *   A) Snapshot Management  -- view/create snapshots
 *   B) Fund Dividend        -- approve & fund dividend payments per snapshot
 *   C) Distribution Analytics -- per-snapshot funding & claim analytics
 *   D) Claim Dividend       -- claim unclaimed dividends for connected wallet
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  Camera,
  DollarSign,
  PieChart,
  Gift,
  Loader2,
  AlertCircle,
  RefreshCw,
  Check,
  ArrowRight,
  Download,
  Search,
  Coins,
} from 'lucide-react';
import {
  SecurityTokenABI,
  ROLE_CONTRACT_ADMIN,
} from '../../contracts/abis/SecurityToken';
import { useWalletStore, getProvider } from '../../store/walletStore';
import { parseContractError, getReadOnlyProvider } from '../../lib/blockchain/contracts';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import Card from '../Common/Card';
import Spinner from '../Common/Spinner';
import EmptyState from '../Common/EmptyState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DividendManagerProps {
  tokenAddress: string;
}

interface SnapshotInfo {
  id: bigint;
  blockNumber: number;
  timestamp: number;
}

interface HolderDistribution {
  address: string;
  totalAwarded: bigint;
  claimed: bigint;
  unclaimed: bigint;
}

type ActiveTab = 'snapshots' | 'fund' | 'analytics' | 'claim';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  'bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors w-full';

const BTN_PRIMARY =
  'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-medium transition-colors';

const BTN_SECONDARY =
  'bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors';

/** Minimal ERC-20 ABI for reading payment token metadata and approving. */
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  if (ts === 0) return 'N/A';
  const d = new Date(ts * 1000);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DividendManager({
  tokenAddress,
}: DividendManagerProps) {
  const { wallet } = useWalletStore();
  const connectedAddress = wallet.address;

  // ---- Tab state ----------------------------------------------------------
  const [activeTab, setActiveTab] = useState<ActiveTab>('snapshots');

  // ---- Role check ---------------------------------------------------------
  const [isContractAdmin, setIsContractAdmin] = useState(false);

  // ---- Snapshot state -----------------------------------------------------
  const [currentSnapshotId, setCurrentSnapshotId] = useState<bigint>(0n);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [, setDecimals] = useState<number>(18);

  // ---- Fund state ---------------------------------------------------------
  const [fundPaymentToken, setFundPaymentToken] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [fundSnapshotId, setFundSnapshotId] = useState('');
  const [paymentTokenInfo, setPaymentTokenInfo] = useState<{
    symbol: string;
    decimals: number;
    balance: bigint;
    allowance: bigint;
  } | null>(null);
  const [loadingTokenInfo, setLoadingTokenInfo] = useState(false);
  const [approving, setApproving] = useState(false);
  const [fundingDividend, setFundingDividend] = useState(false);

  // ---- Analytics state ----------------------------------------------------
  const [analyticsSnapshotId, setAnalyticsSnapshotId] = useState('');
  const [analyticsPaymentToken, setAnalyticsPaymentToken] = useState('');
  const [totalFunded, setTotalFunded] = useState<bigint>(0n);
  const [tokensRemaining, setTokensRemaining] = useState<bigint>(0n);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [holderLookupAddress, setHolderLookupAddress] = useState('');
  const [holderDistribution, setHolderDistribution] =
    useState<HolderDistribution | null>(null);
  const [holderLoading, setHolderLoading] = useState(false);
  const [analyticsTokenDecimals, setAnalyticsTokenDecimals] =
    useState<number>(18);

  // ---- Claim state --------------------------------------------------------
  const [claimableSnapshots, setClaimableSnapshots] = useState<
    {
      snapshotId: bigint;
      paymentToken: string;
      paymentTokenSymbol: string;
      paymentTokenDecimals: number;
      unclaimed: bigint;
    }[]
  >([]);
  const [claimableLoading, setClaimableLoading] = useState(false);
  const [claimingSnapshotId, setClaimingSnapshotId] = useState<
    string | null
  >(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawToken, setWithdrawToken] = useState('');
  const [withdrawSnapshotId, setWithdrawSnapshotId] = useState('');

  // ---- Helper: get contract -----------------------------------------------

  const getContract = useCallback(
    async (withSigner: boolean = false) => {
      if (withSigner) {
        const provider = getProvider();
        if (!provider) throw new Error('Wallet not connected');
        const signer = await provider.getSigner();
        return new ethers.Contract(
          tokenAddress,
          SecurityTokenABI,
          signer,
        );
      }
      // Use a direct RPC provider for reads to avoid thirdweb proxy rate limits.
      const { chainId } = useWalletStore.getState().wallet;
      if (chainId) {
        const readProvider = getReadOnlyProvider(chainId);
        return new ethers.Contract(tokenAddress, SecurityTokenABI, readProvider);
      }
      const provider = getProvider();
      if (!provider) throw new Error('Wallet not connected');
      return new ethers.Contract(tokenAddress, SecurityTokenABI, provider);
    },
    [tokenAddress],
  );

  // ---- Check admin role ---------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function checkRole() {
      if (!connectedAddress) return;
      try {
        const contract = await getContract();
        const hasAdmin: boolean = await contract.hasRole(
          connectedAddress,
          ROLE_CONTRACT_ADMIN,
        );
        if (!cancelled) setIsContractAdmin(hasAdmin);
      } catch {
        // Non-critical
      }
    }

    void checkRole();
    return () => {
      cancelled = true;
    };
  }, [getContract, connectedAddress]);

  // ---- Load token decimals ------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadDecimals() {
      try {
        const contract = await getContract();
        const dec: bigint = await contract.decimals();
        if (!cancelled) setDecimals(Number(dec));
      } catch {
        // Default 18
      }
    }

    void loadDecimals();
    return () => {
      cancelled = true;
    };
  }, [getContract]);

  // ---- Load snapshots -----------------------------------------------------

  const loadSnapshots = useCallback(async () => {
    setSnapshotsLoading(true);
    try {
      const contract = await getContract();
      const currentId: bigint = await contract.getCurrentSnapshotId();
      setCurrentSnapshotId(currentId);

      // Query Snapshot events to build history using direct RPC
      const { chainId: evtChainId } = useWalletStore.getState().wallet;
      if (!evtChainId) return;
      const evtProvider = getReadOnlyProvider(evtChainId);

      const loaded: SnapshotInfo[] = [];
      try {
        const filter = contract.filters.Snapshot();
        const latestBlock = await evtProvider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - 50000);
        const events = await contract.queryFilter(
          filter,
          fromBlock,
        );

        for (const event of events) {
          const log = event as ethers.EventLog;
          const block = await log.getBlock();
          loaded.push({
            id: log.args[0] as bigint,
            blockNumber: log.blockNumber,
            timestamp: block?.timestamp ?? 0,
          });
        }
      } catch {
        // If event query fails, build a list from known IDs
        for (let i = 1n; i <= currentId; i++) {
          loaded.push({ id: i, blockNumber: 0, timestamp: 0 });
        }
      }

      setSnapshots(loaded);
    } catch (err) {
      toast.error(`Failed to load snapshots: ${parseContractError(err)}`);
    } finally {
      setSnapshotsLoading(false);
    }
  }, [getContract]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  // ---- Create snapshot ----------------------------------------------------

  const handleCreateSnapshot = useCallback(async () => {
    if (creatingSnapshot) return;
    setCreatingSnapshot(true);

    try {
      toast.loading('Creating snapshot...', { id: 'create-snapshot' });
      const contract = await getContract(true);
      const gasEstimate = await contract.snapshot.estimateGas();
      const gasLimit = (gasEstimate * 120n) / 100n;
      const tx = await contract.snapshot({ gasLimit });
      await tx.wait();

      toast.success('Snapshot created successfully', {
        id: 'create-snapshot',
      });
      await loadSnapshots();
    } catch (err) {
      toast.error(parseContractError(err), { id: 'create-snapshot' });
    } finally {
      setCreatingSnapshot(false);
    }
  }, [getContract, creatingSnapshot, loadSnapshots]);

  // ---- Load payment token info --------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadPaymentToken() {
      if (
        !fundPaymentToken ||
        !ethers.isAddress(fundPaymentToken) ||
        !connectedAddress
      ) {
        setPaymentTokenInfo(null);
        return;
      }

      setLoadingTokenInfo(true);
      try {
        const { chainId: tokenInfoChainId } = useWalletStore.getState().wallet;
        if (!tokenInfoChainId) return;
        const tokenInfoProvider = getReadOnlyProvider(tokenInfoChainId);

        const erc20 = new ethers.Contract(
          fundPaymentToken,
          ERC20_ABI,
          tokenInfoProvider,
        );

        const [symbol, dec, balance, allowance] = await Promise.all([
          erc20.symbol() as Promise<string>,
          erc20.decimals() as Promise<bigint>,
          erc20.balanceOf(connectedAddress) as Promise<bigint>,
          erc20.allowance(
            connectedAddress,
            tokenAddress,
          ) as Promise<bigint>,
        ]);

        if (!cancelled) {
          setPaymentTokenInfo({
            symbol,
            decimals: Number(dec),
            balance,
            allowance,
          });
        }
      } catch {
        if (!cancelled) setPaymentTokenInfo(null);
      } finally {
        if (!cancelled) setLoadingTokenInfo(false);
      }
    }

    const timer = setTimeout(() => {
      void loadPaymentToken();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fundPaymentToken, connectedAddress, tokenAddress]);

  // ---- Approve payment token ----------------------------------------------

  const handleApprove = useCallback(async () => {
    if (approving || !paymentTokenInfo) return;
    setApproving(true);

    try {
      const amount = ethers.parseUnits(
        fundAmount,
        paymentTokenInfo.decimals,
      );

      toast.loading('Approving payment token...', {
        id: 'approve-dividend',
      });

      const provider = getProvider();
      if (!provider) throw new Error('Wallet not connected');
      const signer = await provider.getSigner();
      const erc20 = new ethers.Contract(
        fundPaymentToken,
        ERC20_ABI,
        signer,
      );

      const gasEstimate = await erc20.approve.estimateGas(
        tokenAddress,
        amount,
      );
      const gasLimit = (gasEstimate * 120n) / 100n;
      const tx = await erc20.approve(tokenAddress, amount, {
        gasLimit,
      });
      await tx.wait();

      // Refresh allowance
      const newAllowance = (await erc20.allowance(
        connectedAddress,
        tokenAddress,
      )) as bigint;
      setPaymentTokenInfo((prev) =>
        prev ? { ...prev, allowance: newAllowance } : prev,
      );

      toast.success('Payment token approved', {
        id: 'approve-dividend',
      });
    } catch (err) {
      toast.error(parseContractError(err), { id: 'approve-dividend' });
    } finally {
      setApproving(false);
    }
  }, [
    approving,
    fundPaymentToken,
    fundAmount,
    paymentTokenInfo,
    tokenAddress,
    connectedAddress,
  ]);

  // ---- Fund dividend ------------------------------------------------------

  const handleFundDividend = useCallback(async () => {
    if (fundingDividend || !paymentTokenInfo) return;
    setFundingDividend(true);

    try {
      const amount = ethers.parseUnits(
        fundAmount,
        paymentTokenInfo.decimals,
      );
      const snapshotId = BigInt(fundSnapshotId);

      toast.loading('Funding dividend...', { id: 'fund-dividend' });

      const contract = await getContract(true);
      const gasEstimate = await contract.fundDividend.estimateGas(
        fundPaymentToken,
        amount,
        snapshotId,
      );
      const gasLimit = (gasEstimate * 120n) / 100n;
      const tx = await contract.fundDividend(
        fundPaymentToken,
        amount,
        snapshotId,
        { gasLimit },
      );
      await tx.wait();

      toast.success('Dividend funded successfully', {
        id: 'fund-dividend',
      });
      setFundAmount('');
    } catch (err) {
      toast.error(parseContractError(err), { id: 'fund-dividend' });
    } finally {
      setFundingDividend(false);
    }
  }, [
    getContract,
    fundPaymentToken,
    fundAmount,
    fundSnapshotId,
    paymentTokenInfo,
    fundingDividend,
  ]);

  // ---- Needs approval check -----------------------------------------------

  const needsApproval = useMemo(() => {
    if (!paymentTokenInfo || !fundAmount) return false;
    try {
      const amount = ethers.parseUnits(
        fundAmount,
        paymentTokenInfo.decimals,
      );
      return paymentTokenInfo.allowance < amount;
    } catch {
      return false;
    }
  }, [paymentTokenInfo, fundAmount]);

  // ---- Load analytics -----------------------------------------------------

  const loadAnalytics = useCallback(async () => {
    if (!analyticsPaymentToken || !analyticsSnapshotId) return;
    if (!ethers.isAddress(analyticsPaymentToken)) {
      toast.error('Invalid payment token address');
      return;
    }

    setAnalyticsLoading(true);
    try {
      const contract = await getContract();

      // Get payment token decimals
      const { chainId: analyticsChainId } = useWalletStore.getState().wallet;
      if (!analyticsChainId) return;
      const analyticsReadProvider = getReadOnlyProvider(analyticsChainId);
      const erc20 = new ethers.Contract(
        analyticsPaymentToken,
        ERC20_ABI,
        analyticsReadProvider,
      );
      const dec: bigint = await erc20.decimals();
      setAnalyticsTokenDecimals(Number(dec));

      const snapshotId = BigInt(analyticsSnapshotId);
      const [funded, remaining] = await Promise.all([
        contract.fundsAt(
          analyticsPaymentToken,
          snapshotId,
        ) as Promise<bigint>,
        contract.tokensAt(
          analyticsPaymentToken,
          snapshotId,
        ) as Promise<bigint>,
      ]);

      setTotalFunded(funded);
      setTokensRemaining(remaining);
    } catch (err) {
      toast.error(
        `Failed to load analytics: ${parseContractError(err)}`,
      );
    } finally {
      setAnalyticsLoading(false);
    }
  }, [getContract, analyticsPaymentToken, analyticsSnapshotId]);

  // ---- Load holder distribution -------------------------------------------

  const loadHolderDistribution = useCallback(async () => {
    if (
      !holderLookupAddress ||
      !ethers.isAddress(holderLookupAddress) ||
      !analyticsPaymentToken ||
      !analyticsSnapshotId
    )
      return;

    setHolderLoading(true);
    try {
      const contract = await getContract();
      const snapshotId = BigInt(analyticsSnapshotId);

      const [totalAwarded, claimed, unclaimed] = await Promise.all([
        contract.totalAwardedBalanceAt(
          analyticsPaymentToken,
          holderLookupAddress,
          snapshotId,
        ) as Promise<bigint>,
        contract.claimedBalanceAt(
          analyticsPaymentToken,
          holderLookupAddress,
          snapshotId,
        ) as Promise<bigint>,
        contract.unclaimedBalanceAt(
          analyticsPaymentToken,
          holderLookupAddress,
          snapshotId,
        ) as Promise<bigint>,
      ]);

      setHolderDistribution({
        address: holderLookupAddress,
        totalAwarded,
        claimed,
        unclaimed,
      });
    } catch (err) {
      toast.error(
        `Failed to load holder data: ${parseContractError(err)}`,
      );
    } finally {
      setHolderLoading(false);
    }
  }, [
    getContract,
    holderLookupAddress,
    analyticsPaymentToken,
    analyticsSnapshotId,
  ]);

  // ---- Load claimable dividends -------------------------------------------

  const loadClaimable = useCallback(async () => {
    if (!connectedAddress || snapshots.length === 0) return;

    setClaimableLoading(true);
    try {
      const contract = await getContract();
      const { chainId: claimChainId } = useWalletStore.getState().wallet;
      if (!claimChainId) return;
      const claimReadProvider = getReadOnlyProvider(claimChainId);

      // Scan Funded events to find payment tokens per snapshot
      const filter = contract.filters.Funded();
      const latestBlock = await claimReadProvider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 50000);
      const events = await contract.queryFilter(filter, fromBlock);

      // Build unique (token, snapshotId) pairs
      const pairs = new Map<
        string,
        { token: string; snapshotId: bigint }
      >();
      for (const event of events) {
        const log = event as ethers.EventLog;
        const token = log.args[1] as string;
        const snapshotId = log.args[3] as bigint;
        const key = `${token}-${snapshotId.toString()}`;
        if (!pairs.has(key)) {
          pairs.set(key, { token, snapshotId });
        }
      }

      const claimable: typeof claimableSnapshots = [];

      for (const { token, snapshotId } of pairs.values()) {
        try {
          const unclaimed: bigint = await contract.unclaimedBalanceAt(
            token,
            connectedAddress,
            snapshotId,
          );

          if (unclaimed > 0n) {
            const erc20 = new ethers.Contract(
              token,
              ERC20_ABI,
              provider,
            );
            let symbol = 'UNKNOWN';
            let dec = 18;
            try {
              symbol = await erc20.symbol();
              dec = Number(await erc20.decimals());
            } catch {
              // Use defaults
            }

            claimable.push({
              snapshotId,
              paymentToken: token,
              paymentTokenSymbol: symbol,
              paymentTokenDecimals: dec,
              unclaimed,
            });
          }
        } catch {
          // Skip entries that fail
        }
      }

      setClaimableSnapshots(claimable);
    } catch (err) {
      toast.error(
        `Failed to load claimable dividends: ${parseContractError(err)}`,
      );
    } finally {
      setClaimableLoading(false);
    }
  }, [getContract, connectedAddress, snapshots]);

  useEffect(() => {
    if (activeTab === 'claim') {
      void loadClaimable();
    }
  }, [activeTab, loadClaimable]);

  // ---- Claim dividend -----------------------------------------------------

  const handleClaim = useCallback(
    async (paymentToken: string, snapshotId: bigint) => {
      const key = `${paymentToken}-${snapshotId.toString()}`;
      if (claimingSnapshotId === key) return;
      setClaimingSnapshotId(key);

      try {
        toast.loading('Claiming dividend...', {
          id: 'claim-dividend',
        });

        const contract = await getContract(true);
        const gasEstimate =
          await contract.claimDividend.estimateGas(
            paymentToken,
            snapshotId,
          );
        const gasLimit = (gasEstimate * 120n) / 100n;
        const tx = await contract.claimDividend(
          paymentToken,
          snapshotId,
          { gasLimit },
        );
        await tx.wait();

        toast.success('Dividend claimed!', { id: 'claim-dividend' });
        await loadClaimable();
      } catch (err) {
        toast.error(parseContractError(err), {
          id: 'claim-dividend',
        });
      } finally {
        setClaimingSnapshotId(null);
      }
    },
    [getContract, claimingSnapshotId, loadClaimable],
  );

  // ---- Withdraw remains ---------------------------------------------------

  const handleWithdrawRemains = useCallback(async () => {
    if (withdrawing) return;
    setWithdrawing(true);

    try {
      if (!ethers.isAddress(withdrawToken)) {
        toast.error('Invalid payment token address');
        return;
      }

      toast.loading('Withdrawing remaining tokens...', {
        id: 'withdraw-remains',
      });

      const contract = await getContract(true);
      const snapshotId = BigInt(withdrawSnapshotId);
      const gasEstimate =
        await contract.withdrawalRemains.estimateGas(
          withdrawToken,
          snapshotId,
        );
      const gasLimit = (gasEstimate * 120n) / 100n;
      const tx = await contract.withdrawalRemains(
        withdrawToken,
        snapshotId,
        { gasLimit },
      );
      await tx.wait();

      toast.success('Withdrawal complete', { id: 'withdraw-remains' });
    } catch (err) {
      toast.error(parseContractError(err), {
        id: 'withdraw-remains',
      });
    } finally {
      setWithdrawing(false);
    }
  }, [getContract, withdrawToken, withdrawSnapshotId, withdrawing]);

  // ---- Render: Tab buttons ------------------------------------------------

  const tabs: { key: ActiveTab; label: string; icon: typeof Camera }[] = [
    { key: 'snapshots', label: 'Snapshots', icon: Camera },
    { key: 'fund', label: 'Fund', icon: DollarSign },
    { key: 'analytics', label: 'Analytics', icon: PieChart },
    { key: 'claim', label: 'Claim', icon: Gift },
  ];

  // ---- Render -------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
              activeTab === key
                ? 'bg-indigo-600/20 text-indigo-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]',
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ================================================================= */}
      {/* A) SNAPSHOT MANAGEMENT                                            */}
      {/* ================================================================= */}

      {activeTab === 'snapshots' && (
        <div className="space-y-6">
          <Card
            title="Snapshot Management"
            subtitle={`Current snapshot ID: ${currentSnapshotId.toString()}`}
            gradientBorder
            action={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadSnapshots}
                  disabled={snapshotsLoading}
                  className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-500 hover:text-gray-300 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw
                    className={clsx(
                      'h-4 w-4',
                      snapshotsLoading && 'animate-spin',
                    )}
                  />
                </button>
                {isContractAdmin && (
                  <button
                    type="button"
                    onClick={handleCreateSnapshot}
                    disabled={creatingSnapshot}
                    className={BTN_PRIMARY}
                  >
                    {creatingSnapshot ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        Create Snapshot
                      </span>
                    )}
                  </button>
                )}
              </div>
            }
          >
            {snapshotsLoading ? (
              <div className="flex justify-center py-10">
                <Spinner label="Loading snapshots..." />
              </div>
            ) : snapshots.length === 0 ? (
              <EmptyState
                icon={<Camera />}
                title="No Snapshots"
                description="No snapshots have been created yet. Contract admins can create a snapshot to enable dividend distribution."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-xs text-gray-500">
                      <th className="pb-3 pr-4">Snapshot ID</th>
                      <th className="pb-3 pr-4">Block</th>
                      <th className="pb-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((s) => (
                      <tr
                        key={s.id.toString()}
                        className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-3 pr-4 font-mono text-indigo-400">
                          #{s.id.toString()}
                        </td>
                        <td className="py-3 pr-4 font-mono text-gray-400">
                          {s.blockNumber > 0
                            ? s.blockNumber.toLocaleString()
                            : '--'}
                        </td>
                        <td className="py-3 text-gray-400">
                          {s.timestamp > 0
                            ? formatTimestamp(s.timestamp)
                            : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ================================================================= */}
      {/* B) FUND DIVIDEND                                                  */}
      {/* ================================================================= */}

      {activeTab === 'fund' && (
        <div className="space-y-6">
          <Card
            title="Fund Dividend"
            subtitle="Deposit payment tokens for distribution to holders at a snapshot"
            gradientBorder
          >
            <div className="space-y-4">
              {/* Payment token address */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  Payment Token Address (ERC-20)
                </label>
                <input
                  type="text"
                  value={fundPaymentToken}
                  onChange={(e) =>
                    setFundPaymentToken(e.target.value)
                  }
                  placeholder="0x..."
                  className={INPUT_CLASS}
                />
                {loadingTokenInfo && (
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading token info...
                  </div>
                )}
                {paymentTokenInfo && (
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                    <span>
                      Symbol:{' '}
                      <span className="text-white font-medium">
                        {paymentTokenInfo.symbol}
                      </span>
                    </span>
                    <span>
                      Balance:{' '}
                      <span className="text-gray-400 font-mono">
                        {formatBalance(
                          paymentTokenInfo.balance,
                          paymentTokenInfo.decimals,
                          6,
                        )}
                      </span>
                    </span>
                    <span>
                      Allowance:{' '}
                      <span className="text-gray-400 font-mono">
                        {formatBalance(
                          paymentTokenInfo.allowance,
                          paymentTokenInfo.decimals,
                          6,
                        )}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Amount */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Amount
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fundAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^[0-9]*\.?[0-9]*$/.test(val))
                        setFundAmount(val);
                    }}
                    placeholder="0.0"
                    className={INPUT_CLASS}
                  />
                </div>

                {/* Snapshot ID */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Snapshot ID
                  </label>
                  <select
                    value={fundSnapshotId}
                    onChange={(e) => setFundSnapshotId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    <option value="">Select snapshot...</option>
                    {snapshots.map((s) => (
                      <option
                        key={s.id.toString()}
                        value={s.id.toString()}
                      >
                        #{s.id.toString()}
                        {s.timestamp > 0
                          ? ` -- ${formatTimestamp(s.timestamp)}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Approval flow */}
              {needsApproval ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Approval required. You need to approve the security
                    token contract to spend your payment tokens first.
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Step 1: Approve */}
                    <div className="flex-1">
                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={approving}
                        className={clsx(BTN_PRIMARY, 'w-full')}
                      >
                        {approving ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Approving...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Check className="h-4 w-4" />
                            Step 1: Approve
                          </span>
                        )}
                      </button>
                    </div>

                    <ArrowRight className="h-4 w-4 text-gray-600 shrink-0" />

                    {/* Step 2: Fund (disabled until approved) */}
                    <div className="flex-1">
                      <button
                        type="button"
                        disabled
                        className={clsx(BTN_PRIMARY, 'w-full opacity-30')}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Step 2: Fund
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleFundDividend}
                  disabled={
                    fundingDividend ||
                    !fundPaymentToken ||
                    !fundAmount ||
                    !fundSnapshotId
                  }
                  className={BTN_PRIMARY}
                >
                  {fundingDividend ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Funding...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Fund Dividend
                    </span>
                  )}
                </button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ================================================================= */}
      {/* C) DISTRIBUTION ANALYTICS                                         */}
      {/* ================================================================= */}

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <Card
            title="Distribution Analytics"
            subtitle="View funding and claims for a specific snapshot"
            gradientBorder
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Payment Token Address
                  </label>
                  <input
                    type="text"
                    value={analyticsPaymentToken}
                    onChange={(e) =>
                      setAnalyticsPaymentToken(e.target.value)
                    }
                    placeholder="0x..."
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Snapshot ID
                  </label>
                  <select
                    value={analyticsSnapshotId}
                    onChange={(e) =>
                      setAnalyticsSnapshotId(e.target.value)
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="">Select snapshot...</option>
                    {snapshots.map((s) => (
                      <option
                        key={s.id.toString()}
                        value={s.id.toString()}
                      >
                        #{s.id.toString()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={loadAnalytics}
                disabled={
                  analyticsLoading ||
                  !analyticsPaymentToken ||
                  !analyticsSnapshotId
                }
                className={BTN_PRIMARY}
              >
                {analyticsLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <PieChart className="h-4 w-4" />
                    Load Analytics
                  </span>
                )}
              </button>

              {/* Funding overview */}
              {(totalFunded > 0n || tokensRemaining > 0n) && (
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-white">
                    Snapshot #{analyticsSnapshotId} Overview
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg bg-white/[0.03] p-4">
                      <p className="text-xs text-gray-500 mb-1">
                        Total Funded
                      </p>
                      <p className="text-lg font-semibold font-mono text-emerald-400">
                        {formatBalance(
                          totalFunded,
                          analyticsTokenDecimals,
                          6,
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] p-4">
                      <p className="text-xs text-gray-500 mb-1">
                        Tokens Remaining
                      </p>
                      <p className="text-lg font-semibold font-mono text-amber-400">
                        {formatBalance(
                          tokensRemaining,
                          analyticsTokenDecimals,
                          6,
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Claimed vs unclaimed bar */}
                  {totalFunded > 0n && (
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                        <span>Claimed</span>
                        <span>Remaining</span>
                      </div>
                      <div className="h-3 rounded-full bg-white/[0.05] overflow-hidden flex">
                        {(() => {
                          const claimedAmount =
                            totalFunded - tokensRemaining;
                          const claimedPct =
                            totalFunded > 0n
                              ? Number(
                                  (claimedAmount * 10000n) /
                                    totalFunded,
                                ) / 100
                              : 0;
                          return (
                            <>
                              <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                                style={{
                                  width: `${claimedPct}%`,
                                }}
                              />
                              <div
                                className="h-full bg-amber-500/30 transition-all duration-500"
                                style={{
                                  width: `${100 - claimedPct}%`,
                                }}
                              />
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Per-holder lookup */}
              <div className="pt-4 border-t border-white/[0.04]">
                <h4 className="text-sm font-semibold text-white mb-3">
                  Holder Distribution
                </h4>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                    <input
                      type="text"
                      value={holderLookupAddress}
                      onChange={(e) =>
                        setHolderLookupAddress(e.target.value)
                      }
                      placeholder="Holder address..."
                      className={clsx(INPUT_CLASS, 'pl-10')}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={loadHolderDistribution}
                    disabled={
                      holderLoading ||
                      !holderLookupAddress ||
                      !analyticsPaymentToken ||
                      !analyticsSnapshotId
                    }
                    className={BTN_SECONDARY}
                  >
                    {holderLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Lookup'
                    )}
                  </button>
                </div>

                {holderDistribution && (
                  <div className="mt-4 rounded-lg bg-white/[0.02] border border-white/[0.04] p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>Holder:</span>
                      <span className="font-mono text-gray-400">
                        {formatAddress(holderDistribution.address)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] text-gray-600">
                          Total Awarded
                        </p>
                        <p className="font-mono text-sm text-white">
                          {formatBalance(
                            holderDistribution.totalAwarded,
                            analyticsTokenDecimals,
                            6,
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-600">
                          Claimed
                        </p>
                        <p className="font-mono text-sm text-emerald-400">
                          {formatBalance(
                            holderDistribution.claimed,
                            analyticsTokenDecimals,
                            6,
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-600">
                          Unclaimed
                        </p>
                        <p className="font-mono text-sm text-amber-400">
                          {formatBalance(
                            holderDistribution.unclaimed,
                            analyticsTokenDecimals,
                            6,
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Mini claimed vs unclaimed bar */}
                    {holderDistribution.totalAwarded > 0n && (
                      <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden flex">
                        {(() => {
                          const pct =
                            Number(
                              (holderDistribution.claimed * 10000n) /
                                holderDistribution.totalAwarded,
                            ) / 100;
                          return (
                            <>
                              <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                              <div
                                className="h-full bg-amber-500/40 transition-all"
                                style={{
                                  width: `${100 - pct}%`,
                                }}
                              />
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Admin: Withdraw remains */}
          {isContractAdmin && (
            <Card
              title="Withdraw Remaining Tokens"
              subtitle="Reclaim unused dividend payment tokens (admin only)"
              compact
            >
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">
                      Payment Token Address
                    </label>
                    <input
                      type="text"
                      value={withdrawToken}
                      onChange={(e) =>
                        setWithdrawToken(e.target.value)
                      }
                      placeholder="0x..."
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">
                      Snapshot ID
                    </label>
                    <select
                      value={withdrawSnapshotId}
                      onChange={(e) =>
                        setWithdrawSnapshotId(e.target.value)
                      }
                      className={INPUT_CLASS}
                    >
                      <option value="">Select snapshot...</option>
                      {snapshots.map((s) => (
                        <option
                          key={s.id.toString()}
                          value={s.id.toString()}
                        >
                          #{s.id.toString()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleWithdrawRemains}
                  disabled={
                    withdrawing ||
                    !withdrawToken ||
                    !withdrawSnapshotId
                  }
                  className={BTN_SECONDARY}
                >
                  {withdrawing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Withdrawing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Withdraw Remains
                    </span>
                  )}
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* D) CLAIM DIVIDEND                                                 */}
      {/* ================================================================= */}

      {activeTab === 'claim' && (
        <div className="space-y-6">
          <Card
            title="Claim Dividends"
            subtitle="Claim unclaimed dividend payments for your connected wallet"
            gradientBorder
            action={
              <button
                type="button"
                onClick={loadClaimable}
                disabled={claimableLoading}
                className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-500 hover:text-gray-300 transition-colors"
                title="Refresh"
              >
                <RefreshCw
                  className={clsx(
                    'h-4 w-4',
                    claimableLoading && 'animate-spin',
                  )}
                />
              </button>
            }
          >
            {!connectedAddress ? (
              <EmptyState
                icon={<Gift />}
                title="Wallet Not Connected"
                description="Connect your wallet to view and claim dividends."
              />
            ) : claimableLoading ? (
              <div className="flex justify-center py-10">
                <Spinner label="Scanning for claimable dividends..." />
              </div>
            ) : claimableSnapshots.length === 0 ? (
              <EmptyState
                icon={<Gift />}
                title="No Unclaimed Dividends"
                description="You have no unclaimed dividend payments across any snapshots."
              />
            ) : (
              <div className="space-y-3">
                {claimableSnapshots.map((item) => {
                  const key = `${item.paymentToken}-${item.snapshotId.toString()}`;
                  const isClaiming = claimingSnapshotId === key;

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Coins className="h-4 w-4 text-indigo-400" />
                          <span className="text-sm font-medium text-white">
                            Snapshot #{item.snapshotId.toString()}
                          </span>
                          <span className="text-xs text-gray-500">
                            ({item.paymentTokenSymbol})
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          Token:{' '}
                          <span className="font-mono text-gray-400">
                            {formatAddress(item.paymentToken)}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-semibold font-mono text-emerald-400">
                            {formatBalance(
                              item.unclaimed,
                              item.paymentTokenDecimals,
                              6,
                            )}
                          </p>
                          <p className="text-[10px] text-gray-600">
                            {item.paymentTokenSymbol} unclaimed
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleClaim(
                              item.paymentToken,
                              item.snapshotId,
                            )
                          }
                          disabled={isClaiming}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                        >
                          {isClaiming ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Claiming...
                            </>
                          ) : (
                            <>
                              <Gift className="h-3.5 w-3.5" />
                              Claim
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
