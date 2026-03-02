/**
 * HolderPortfolio -- connected wallet's complete position in an ERC-1404 security token.
 *
 * Sections:
 *   A) Balance Summary (free, unlocked, locked, total with stacked bar)
 *   B) Timelock Breakdown (per-timelock details with progress bars)
 *   C) Claimable Dividends (per-snapshot with claim buttons)
 *   D) Active Swaps (swaps involving connected wallet with action buttons)
 */

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  SecurityTokenABI,
  SWAP_STATUS,
  SWAP_STATUS_LABELS,
} from '../../contracts/abis/SecurityToken';
import { useWalletStore, getProvider, getSigner } from '../../store/walletStore';
import { parseContractError } from '../../lib/blockchain/contracts';
import {
  formatWeiAmount,
  truncateAddress,
  formatDateTime,
} from '../../lib/formatters';
import Card from '../Common/Card';
import Spinner from '../Common/Spinner';
import Badge from '../Common/Badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HolderPortfolioProps {
  tokenAddress: string;
}

interface BalanceSummary {
  tokensBalance: bigint;
  unlockedAmount: bigint;
  lockedAmount: bigint;
  totalBalance: bigint;
}

interface TimelockInfo {
  index: number;
  scheduleId: bigint;
  commencementTimestamp: bigint;
  tokensTransferred: bigint;
  totalAmount: bigint;
  cancelableBy: string[];
  locked: bigint;
  unlocked: bigint;
  schedule: {
    releaseCount: bigint;
    delayUntilFirstRelease: bigint;
    initialReleasePortionInBips: bigint;
    periodBetweenReleases: bigint;
  } | null;
}

interface DividendEntry {
  snapshotId: bigint;
  token: string;
  unclaimed: bigint;
}

interface SwapEntry {
  swapNumber: bigint;
  status: number;
  role: 'restrictedTokenSender' | 'quoteTokenSender';
  restrictedTokenSender: string;
  restrictedTokenAmount: bigint;
  quoteToken: string;
  quoteTokenSender: string;
  quoteTokenAmount: bigint;
}

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------

const BUTTON_SM =
  'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors';

const BUTTON_DANGER_SM =
  'bg-red-600/80 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getContract(tokenAddress: string): ethers.Contract | null {
  const provider = getProvider();
  if (!provider) return null;
  return new ethers.Contract(tokenAddress, SecurityTokenABI, provider);
}

function getSignedContract(tokenAddress: string): ethers.Contract | null {
  const signer = getSigner();
  if (!signer) return null;
  return new ethers.Contract(tokenAddress, SecurityTokenABI, signer);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// ---------------------------------------------------------------------------
// A) Balance Summary
// ---------------------------------------------------------------------------

function BalanceSummarySection({ tokenAddress }: { tokenAddress: string }) {
  const { wallet } = useWalletStore();
  const [data, setData] = useState<BalanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!wallet.address) {
        setLoading(false);
        return;
      }

      const contract = getContract(tokenAddress);
      if (!contract) {
        setLoading(false);
        return;
      }

      try {
        const [tokensBalance, unlockedAmount, lockedAmount, totalBalance] = await Promise.all([
          contract.tokensBalanceOf(wallet.address) as Promise<bigint>,
          contract.unlockedAmountOf(wallet.address) as Promise<bigint>,
          contract.lockedAmountOf(wallet.address) as Promise<bigint>,
          contract.balanceOf(wallet.address) as Promise<bigint>,
        ]);
        setData({ tokensBalance, unlockedAmount, lockedAmount, totalBalance });
      } catch (err) {
        setError(parseContractError(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tokenAddress, wallet.address]);

  if (!wallet.address) {
    return (
      <Card title="Balance Summary" compact>
        <p className="text-sm text-gray-500 text-center py-8">
          Connect your wallet to view your balance.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card title="Balance Summary" compact>
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Loading balances" />
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card title="Balance Summary" compact>
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error || 'Failed to load balance data.'}
        </div>
      </Card>
    );
  }

  const total = Number(data.totalBalance);
  const segments = [
    { label: 'Free (ERC-20)', value: data.tokensBalance, color: 'bg-indigo-500', textColor: 'text-indigo-400' },
    { label: 'Unlocked (Vesting)', value: data.unlockedAmount, color: 'bg-violet-500', textColor: 'text-violet-400' },
    { label: 'Locked (Vesting)', value: data.lockedAmount, color: 'bg-amber-500', textColor: 'text-amber-400' },
  ];

  return (
    <Card title="Balance Summary" subtitle={truncateAddress(wallet.address)} compact>
      <div className="space-y-5">
        {/* Total balance highlight */}
        <div className="rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 px-5 py-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Total Balance</p>
          <p className="text-3xl font-bold text-white">{formatWeiAmount(data.totalBalance)}</p>
        </div>

        {/* Stacked bar */}
        <div className="h-4 rounded-full bg-white/[0.06] overflow-hidden flex">
          {segments.map((seg) => {
            const pct = total > 0 ? (Number(seg.value) / total) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={seg.label}
                className={`${seg.color} transition-all duration-700`}
                style={{ width: `${pct}%` }}
                title={`${seg.label}: ${formatWeiAmount(seg.value)}`}
              />
            );
          })}
        </div>

        {/* Breakdown */}
        <div className="space-y-2.5">
          {segments.map((seg) => {
            const pct = total > 0 ? (Number(seg.value) / total) * 100 : 0;
            return (
              <div key={seg.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-3 h-3 rounded ${seg.color}`} />
                  <span className="text-sm text-gray-400">{seg.label}</span>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-semibold ${seg.textColor}`}>
                    {formatWeiAmount(seg.value)}
                  </span>
                  <span className="text-xs text-gray-600 ml-2">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// B) Timelock Breakdown
// ---------------------------------------------------------------------------

function TimelockBreakdown({ tokenAddress }: { tokenAddress: string }) {
  const { wallet } = useWalletStore();
  const [timelocks, setTimelocks] = useState<TimelockInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!wallet.address) {
        setLoading(false);
        return;
      }

      const contract = getContract(tokenAddress);
      if (!contract) {
        setLoading(false);
        return;
      }

      try {
        const count = Number(await contract.timelockCountOf(wallet.address) as bigint);
        const results: TimelockInfo[] = [];

        for (let i = 0; i < count; i++) {
          try {
            const [tl, locked, unlocked] = await Promise.all([
              contract.timelockOf(wallet.address, i),
              contract.lockedAmountOfTimelock(wallet.address, i) as Promise<bigint>,
              contract.unlockedAmountOfTimelock(wallet.address, i) as Promise<bigint>,
            ]);

            let schedule = null;
            try {
              const sched = await contract.releaseSchedules(tl.scheduleId);
              schedule = {
                releaseCount: sched[0] as bigint,
                delayUntilFirstRelease: sched[1] as bigint,
                initialReleasePortionInBips: sched[2] as bigint,
                periodBetweenReleases: sched[3] as bigint,
              };
            } catch {
              // Schedule may not be fetchable
            }

            results.push({
              index: i,
              scheduleId: tl.scheduleId as bigint,
              commencementTimestamp: tl.commencementTimestamp as bigint,
              tokensTransferred: tl.tokensTransferred as bigint,
              totalAmount: tl.totalAmount as bigint,
              cancelableBy: tl.cancelableBy as string[],
              locked,
              unlocked,
              schedule,
            });
          } catch {
            // Skip failed timelocks
          }
        }

        setTimelocks(results);
      } catch (err) {
        setError(parseContractError(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tokenAddress, wallet.address]);

  if (!wallet.address) {
    return (
      <Card title="Timelock Breakdown" compact>
        <p className="text-sm text-gray-500 text-center py-8">
          Connect your wallet to view timelocks.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card title="Timelock Breakdown" compact>
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Loading timelocks" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Timelock Breakdown" compact>
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      </Card>
    );
  }

  if (timelocks.length === 0) {
    return (
      <Card title="Timelock Breakdown" compact>
        <p className="text-sm text-gray-500 text-center py-8">
          No timelocks found for your address.
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="Timelock Breakdown"
      subtitle={`${timelocks.length} active timelock${timelocks.length !== 1 ? 's' : ''}`}
      compact
    >
      <div className="space-y-4">
        {timelocks.map((tl) => {
          const totalNum = Number(tl.totalAmount);
          const unlockedPct = totalNum > 0 ? (Number(tl.unlocked) / totalNum) * 100 : 0;
          const transferredPct = totalNum > 0 ? (Number(tl.tokensTransferred) / totalNum) * 100 : 0;
          const commencementDate = new Date(Number(tl.commencementTimestamp) * 1000);

          // Estimate next unlock
          let nextUnlockEstimate: string | null = null;
          if (tl.schedule && tl.locked > 0n) {
            const now = BigInt(Math.floor(Date.now() / 1000));
            const cliff = tl.commencementTimestamp + tl.schedule.delayUntilFirstRelease;
            if (now < cliff) {
              nextUnlockEstimate = formatDateTime(new Date(Number(cliff) * 1000));
            } else if (tl.schedule.periodBetweenReleases > 0n) {
              const elapsed = now - cliff;
              const periodsPassed = elapsed / tl.schedule.periodBetweenReleases;
              const nextPeriod = (periodsPassed + 1n) * tl.schedule.periodBetweenReleases + cliff;
              nextUnlockEstimate = formatDateTime(new Date(Number(nextPeriod) * 1000));
            }
          }

          return (
            <div
              key={tl.index}
              className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-4 space-y-3"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="primary" size="sm">
                    Timelock #{tl.index}
                  </Badge>
                  <span className="text-[10px] text-gray-600">
                    Schedule {tl.scheduleId.toString()}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  Started {formatDateTime(commencementDate)}
                </span>
              </div>

              {/* Schedule details */}
              {tl.schedule && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                    <p className="text-gray-500">Releases</p>
                    <p className="text-white font-medium">{tl.schedule.releaseCount.toString()}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                    <p className="text-gray-500">Cliff</p>
                    <p className="text-white font-medium">
                      {formatDuration(Number(tl.schedule.delayUntilFirstRelease))}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                    <p className="text-gray-500">Period</p>
                    <p className="text-white font-medium">
                      {formatDuration(Number(tl.schedule.periodBetweenReleases))}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                    <p className="text-gray-500">Initial Release</p>
                    <p className="text-white font-medium">
                      {(Number(tl.schedule.initialReleasePortionInBips) / 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}

              {/* Amounts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <p className="text-gray-500">Total</p>
                  <p className="text-white font-medium">{formatWeiAmount(tl.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Transferred</p>
                  <p className="text-gray-300 font-medium">{formatWeiAmount(tl.tokensTransferred)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Unlocked</p>
                  <p className="text-emerald-400 font-medium">{formatWeiAmount(tl.unlocked)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Locked</p>
                  <p className="text-amber-400 font-medium">{formatWeiAmount(tl.locked)}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden flex">
                  <div
                    className="bg-gray-500 transition-all duration-500"
                    style={{ width: `${transferredPct}%` }}
                    title={`Transferred: ${transferredPct.toFixed(1)}%`}
                  />
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.max(0, unlockedPct - transferredPct)}%` }}
                    title={`Unlocked: ${(unlockedPct - transferredPct).toFixed(1)}%`}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-gray-600">
                  <span>{unlockedPct.toFixed(1)}% vested</span>
                  {nextUnlockEstimate && (
                    <span>Next unlock: {nextUnlockEstimate}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// C) Claimable Dividends
// ---------------------------------------------------------------------------

function ClaimableDividends({ tokenAddress }: { tokenAddress: string }) {
  const { wallet } = useWalletStore();
  const [dividends, setDividends] = useState<DividendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [txError, setTxError] = useState('');
  const [txSuccess, setTxSuccess] = useState('');

  const loadDividends = useCallback(async () => {
    if (!wallet.address) {
      setLoading(false);
      return;
    }

    const contract = getContract(tokenAddress);
    const provider = getProvider();
    if (!contract || !provider) {
      setLoading(false);
      return;
    }

    try {
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 50_000);
      const filter = contract.filters.Funded();
      const logs = await contract.queryFilter(filter, fromBlock);

      const seen = new Set<string>();
      const entries: { token: string; snapshotId: bigint }[] = [];
      for (const log of logs) {
        const args = (log as ethers.EventLog).args;
        const token = args[1] as string;
        const snapshotId = args[3] as bigint;
        const key = `${token}-${snapshotId}`;
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({ token, snapshotId });
        }
      }

      const results: DividendEntry[] = [];
      for (const entry of entries) {
        try {
          const unclaimed = (await contract.unclaimedBalanceAt(
            entry.token,
            wallet.address,
            entry.snapshotId,
          )) as bigint;
          if (unclaimed > 0n) {
            results.push({
              snapshotId: entry.snapshotId,
              token: entry.token,
              unclaimed,
            });
          }
        } catch {
          // Skip
        }
      }

      setDividends(results);
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, wallet.address]);

  useEffect(() => {
    loadDividends();
  }, [loadDividends]);

  const handleClaim = useCallback(
    async (token: string, snapshotId: bigint) => {
      const claimKey = `${token}-${snapshotId}`;
      setClaiming(claimKey);
      setTxError('');
      setTxSuccess('');

      const contract = getSignedContract(tokenAddress);
      if (!contract) {
        setTxError('Wallet not connected.');
        setClaiming(null);
        return;
      }

      try {
        const tx = await contract.claimDividend(token, snapshotId);
        await tx.wait();
        setTxSuccess(`Dividend claimed successfully for snapshot #${snapshotId.toString()}.`);
        // Refresh
        await loadDividends();
      } catch (err) {
        setTxError(parseContractError(err));
      } finally {
        setClaiming(null);
      }
    },
    [tokenAddress, loadDividends],
  );

  if (!wallet.address) {
    return (
      <Card title="Claimable Dividends" compact>
        <p className="text-sm text-gray-500 text-center py-8">
          Connect your wallet to view claimable dividends.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card title="Claimable Dividends" compact>
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Loading dividends" />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Claimable Dividends" compact>
      <div className="space-y-3">
        {txSuccess && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
            {txSuccess}
          </div>
        )}
        {txError && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {txError}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {dividends.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No unclaimed dividends.
          </p>
        ) : (
          <div className="space-y-2">
            {dividends.map((d) => {
              const claimKey = `${d.token}-${d.snapshotId}`;
              const isClaiming = claiming === claimKey;
              return (
                <div
                  key={claimKey}
                  className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/[0.04] px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="info" size="sm">
                        Snapshot #{d.snapshotId.toString()}
                      </Badge>
                      <span className="text-xs text-gray-500 font-mono">
                        {truncateAddress(d.token)}
                      </span>
                    </div>
                    <p className="text-sm text-white font-semibold">
                      {formatWeiAmount(d.unclaimed)} unclaimed
                    </p>
                  </div>
                  <button
                    className={BUTTON_SM}
                    onClick={() => handleClaim(d.token, d.snapshotId)}
                    disabled={isClaiming}
                  >
                    {isClaiming ? <Spinner size="xs" /> : 'Claim'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// D) Active Swaps
// ---------------------------------------------------------------------------

function ActiveSwaps({ tokenAddress }: { tokenAddress: string }) {
  const { wallet } = useWalletStore();
  const [swaps, setSwaps] = useState<SwapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [txMsg, setTxMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const loadSwaps = useCallback(async () => {
    if (!wallet.address) {
      setLoading(false);
      return;
    }

    const contract = getContract(tokenAddress);
    const provider = getProvider();
    if (!contract || !provider) {
      setLoading(false);
      return;
    }

    try {
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 50_000);
      const filter = contract.filters.SwapConfigured();
      const logs = await contract.queryFilter(filter, fromBlock);

      const walletLower = wallet.address.toLowerCase();
      const results: SwapEntry[] = [];

      for (const log of logs) {
        const args = (log as ethers.EventLog).args;
        const swapNum = args[0] as bigint;
        const restrictedTokenSender = (args[1] as string).toLowerCase();
        const restrictedTokenAmount = args[2] as bigint;
        const quoteToken = args[3] as string;
        const quoteTokenSender = (args[4] as string).toLowerCase();
        const quoteTokenAmount = args[5] as bigint;

        if (restrictedTokenSender === walletLower || quoteTokenSender === walletLower) {
          try {
            const status = Number(await contract.swapStatus(swapNum) as bigint);
            // Only show active (non-completed, non-canceled) swaps
            if (status === SWAP_STATUS.Complete || status === SWAP_STATUS.Canceled) continue;

            results.push({
              swapNumber: swapNum,
              status,
              role: restrictedTokenSender === walletLower ? 'restrictedTokenSender' : 'quoteTokenSender',
              restrictedTokenSender: args[1] as string,
              restrictedTokenAmount,
              quoteToken,
              quoteTokenSender: args[4] as string,
              quoteTokenAmount,
            });
          } catch {
            // Skip
          }
        }
      }

      setSwaps(results);
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, wallet.address]);

  useEffect(() => {
    loadSwaps();
  }, [loadSwaps]);

  const handleComplete = useCallback(
    async (swap: SwapEntry) => {
      const key = swap.swapNumber.toString();
      setActionLoading(key);
      setTxMsg(null);

      const contract = getSignedContract(tokenAddress);
      if (!contract) {
        setTxMsg({ type: 'error', text: 'Wallet not connected.' });
        setActionLoading(null);
        return;
      }

      try {
        let tx;
        if (swap.status === SWAP_STATUS.SellConfigured) {
          // Buyer completes with quote token -- must first approve the security
          // token contract to spend the buyer's quote tokens.
          if (swap.quoteToken && swap.quoteToken !== ethers.ZeroAddress) {
            const provider = getProvider();
            if (provider) {
              const quoteTokenContract = new ethers.Contract(
                swap.quoteToken,
                ['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'],
                await provider.getSigner(),
              );
              const currentAllowance = await quoteTokenContract.allowance(
                await (await provider.getSigner()).getAddress(),
                tokenAddress,
              );
              if (BigInt(currentAllowance) < swap.quoteTokenAmount) {
                setTxMsg({ type: 'info', text: 'Approving quote token for swap...' });
                const approveTx = await quoteTokenContract.approve(tokenAddress, swap.quoteTokenAmount);
                await approveTx.wait();
              }
            }
          }
          tx = await contract.completeSwapWithPaymentToken(swap.swapNumber);
        } else {
          // Seller completes with restricted token
          tx = await contract.completeSwapWithRestrictedToken(swap.swapNumber);
        }
        await tx.wait();
        setTxMsg({ type: 'success', text: `Swap #${key} completed successfully.` });
        await loadSwaps();
      } catch (err) {
        setTxMsg({ type: 'error', text: parseContractError(err) });
      } finally {
        setActionLoading(null);
      }
    },
    [tokenAddress, loadSwaps],
  );

  const handleCancel = useCallback(
    async (swapNumber: bigint) => {
      const key = swapNumber.toString();
      setActionLoading(key);
      setTxMsg(null);

      const contract = getSignedContract(tokenAddress);
      if (!contract) {
        setTxMsg({ type: 'error', text: 'Wallet not connected.' });
        setActionLoading(null);
        return;
      }

      try {
        const tx = await contract.cancelSell(swapNumber);
        await tx.wait();
        setTxMsg({ type: 'success', text: `Swap #${key} canceled.` });
        await loadSwaps();
      } catch (err) {
        setTxMsg({ type: 'error', text: parseContractError(err) });
      } finally {
        setActionLoading(null);
      }
    },
    [tokenAddress, loadSwaps],
  );

  if (!wallet.address) {
    return (
      <Card title="Active Swaps" compact>
        <p className="text-sm text-gray-500 text-center py-8">
          Connect your wallet to view active swaps.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card title="Active Swaps" compact>
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Loading swaps" />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Active Swaps" compact>
      <div className="space-y-3">
        {txMsg && (
          <div
            className={`rounded-xl px-4 py-3 text-sm border ${
              txMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : txMsg.type === 'info'
                  ? 'bg-sky-500/10 border-sky-500/20 text-sky-300'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}
          >
            {txMsg.text}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {swaps.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No active swaps involving your address.
          </p>
        ) : (
          <div className="space-y-3">
            {swaps.map((swap) => {
              const key = swap.swapNumber.toString();
              const isActioning = actionLoading === key;
              return (
                <div
                  key={key}
                  className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="primary" size="sm">
                        Swap #{key}
                      </Badge>
                      <Badge
                        variant={swap.status === SWAP_STATUS.SellConfigured ? 'warning' : 'info'}
                        size="sm"
                      >
                        {SWAP_STATUS_LABELS[swap.status] ?? `Status ${swap.status}`}
                      </Badge>
                    </div>
                    <Badge
                      variant={swap.role === 'restrictedTokenSender' ? 'danger' : 'success'}
                      size="sm"
                      outline
                    >
                      {swap.role === 'restrictedTokenSender' ? 'Seller' : 'Buyer'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-gray-500">Restricted Token Amount</p>
                      <p className="text-white font-medium">
                        {formatWeiAmount(swap.restrictedTokenAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Quote Token Amount</p>
                      <p className="text-white font-medium">
                        {formatWeiAmount(swap.quoteTokenAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Restricted Token Sender</p>
                      <p className="text-gray-300 font-mono">
                        {truncateAddress(swap.restrictedTokenSender)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Quote Token</p>
                      <p className="text-gray-300 font-mono">
                        {truncateAddress(swap.quoteToken)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      className={BUTTON_SM}
                      onClick={() => handleComplete(swap)}
                      disabled={isActioning}
                    >
                      {isActioning ? <Spinner size="xs" /> : 'Complete'}
                    </button>
                    {swap.role === 'restrictedTokenSender' &&
                      swap.status === SWAP_STATUS.SellConfigured && (
                        <button
                          className={BUTTON_DANGER_SM}
                          onClick={() => handleCancel(swap.swapNumber)}
                          disabled={isActioning}
                        >
                          Cancel
                        </button>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function HolderPortfolio({ tokenAddress }: HolderPortfolioProps) {
  const { wallet } = useWalletStore();

  if (!wallet.isConnected) {
    return (
      <Card title="Holder Portfolio">
        <div className="text-center py-12">
          <p className="text-lg font-semibold text-white mb-2">Wallet Not Connected</p>
          <p className="text-sm text-gray-500">
            Connect your wallet to view your complete position in this security token.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <BalanceSummarySection tokenAddress={tokenAddress} />

      <TimelockBreakdown tokenAddress={tokenAddress} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClaimableDividends tokenAddress={tokenAddress} />
        <ActiveSwaps tokenAddress={tokenAddress} />
      </div>
    </div>
  );
}
