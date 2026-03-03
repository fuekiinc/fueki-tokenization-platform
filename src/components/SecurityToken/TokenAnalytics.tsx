/**
 * TokenAnalytics -- on-chain analytics dashboard for an ERC-1404 security token.
 *
 * Sections:
 *   A) Supply Gauges (total supply, max supply, minted/burned)
 *   B) Holder Distribution by Group
 *   C) Locked vs Unlocked Breakdown
 *   D) Active Timelocks Summary
 *   E) Pending Dividends
 *   F) Swap Volume
 *   G) Snapshot Timeline
 */

import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import {
  SecurityTokenABI,
} from '../../contracts/abis/SecurityToken';
import { useWalletStore } from '../../store/walletStore';
import { getReadOnlyProvider, parseContractError } from '../../lib/blockchain/contracts';
import {
  formatCompact,
  formatDateTime,
  formatWeiAmount,
  truncateAddress,
} from '../../lib/formatters';
import Card from '../Common/Card';
import Spinner from '../Common/Spinner';
import Badge from '../Common/Badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenAnalyticsProps {
  tokenAddress: string;
}

interface SupplyData {
  totalSupply: bigint;
  maxTotalSupply: bigint;
  mintedAmount: bigint;
  burnedAmount: bigint;
  decimals: number;
}

interface GroupDistribution {
  groupId: number;
  count: number;
  addresses: string[];
}

interface BalanceBreakdown {
  tokensBalance: bigint;
  unlockedAmount: bigint;
  lockedAmount: bigint;
  totalBalance: bigint;
}

interface SnapshotEntry {
  id: bigint;
  blockNumber: number;
  timestamp: number | null;
  totalSupply: bigint | null;
}

interface SwapSummary {
  completedCount: number;
  totalRestrictedVolume: bigint;
}

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  'bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors w-full text-sm';

const BUTTON_CLASS =
  'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-medium transition-colors';

const ANALYTICS_LOOKBACK_BLOCKS = 50_000;
const DEFAULT_LOG_QUERY_CHUNK_SIZE = 9_000;
const MIN_LOG_QUERY_CHUNK_SIZE = 500;
const LOG_RANGE_LIMIT_RE = /ranges over .*blocks|block range|over\s+\d+\s+blocks|more than\s+\d+\s+blocks/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getContract(tokenAddress: string): ethers.Contract | null {
  const { chainId } = useWalletStore.getState().wallet;
  if (!chainId) return null;
  const readProvider = getReadOnlyProvider(chainId);
  return new ethers.Contract(tokenAddress, SecurityTokenABI, readProvider);
}

async function resolveBlockTimestamp(
  provider: ethers.JsonRpcProvider | ethers.BrowserProvider,
  blockNumber: number,
): Promise<number | null> {
  try {
    const block = await provider.getBlock(blockNumber);
    return block ? block.timestamp : null;
  } catch {
    return null;
  }
}

function isLogRangeLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return LOG_RANGE_LIMIT_RE.test(message);
}

async function queryLogsChunked(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  fromBlock: number,
  toBlock: number,
): Promise<ethers.EventLog[]> {
  const events: ethers.EventLog[] = [];

  let cursor = fromBlock;
  let chunkSize = DEFAULT_LOG_QUERY_CHUNK_SIZE;

  while (cursor <= toBlock) {
    const chunkEnd = Math.min(toBlock, cursor + chunkSize - 1);

    try {
      const chunk = await contract.queryFilter(filter, cursor, chunkEnd);
      for (const log of chunk) {
        events.push(log as ethers.EventLog);
      }
      cursor = chunkEnd + 1;
    } catch (error) {
      if (isLogRangeLimitError(error) && chunkSize > MIN_LOG_QUERY_CHUNK_SIZE) {
        chunkSize = Math.max(MIN_LOG_QUERY_CHUNK_SIZE, Math.floor(chunkSize / 2));
        continue;
      }
      throw error;
    }
  }

  return events;
}

async function queryRecentLogsChunked(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  provider: ethers.JsonRpcProvider | ethers.BrowserProvider,
  lookbackBlocks = ANALYTICS_LOOKBACK_BLOCKS,
): Promise<ethers.EventLog[]> {
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - lookbackBlocks);
  return queryLogsChunked(contract, filter, fromBlock, currentBlock);
}

// ---------------------------------------------------------------------------
// A) Supply Gauges
// ---------------------------------------------------------------------------

function SupplyGauges({ tokenAddress }: { tokenAddress: string }) {
  const [data, setData] = useState<SupplyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const contract = getContract(tokenAddress);
      const { chainId } = useWalletStore.getState().wallet;
      if (!contract || !chainId) {
        setLoading(false);
        return;
      }

      try {
        const readProvider = getReadOnlyProvider(chainId);
        // Fetch supply data
        const [totalSupply, maxTotalSupply, decimals] = await Promise.all([
          contract.totalSupply() as Promise<bigint>,
          contract.maxTotalSupply() as Promise<bigint>,
          contract.decimals() as Promise<bigint>,
        ]);

        // Query mint/burn from recent Transfer events.
        const zeroAddr = ethers.ZeroAddress;

        const [mintFilter, burnFilter] = [
          contract.filters.Transfer(zeroAddr, null),
          contract.filters.Transfer(null, zeroAddr),
        ];

        const [mintLogs, burnLogs] = await Promise.all([
          queryRecentLogsChunked(contract, mintFilter, readProvider),
          queryRecentLogsChunked(contract, burnFilter, readProvider),
        ]);

        let minted = 0n;
        for (const log of mintLogs) {
          const args = (log as ethers.EventLog).args;
          minted += args[2] as bigint;
        }

        let burned = 0n;
        for (const log of burnLogs) {
          const args = (log as ethers.EventLog).args;
          burned += args[2] as bigint;
        }

        setData({
          totalSupply,
          maxTotalSupply,
          mintedAmount: minted,
          burnedAmount: burned,
          decimals: Number(decimals),
        });
      } catch (err) {
        setError(parseContractError(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tokenAddress]);

  if (loading) {
    return (
      <Card title="Supply Overview" compact>
        <div className="flex justify-center py-12">
          <Spinner size="lg" label="Loading supply data" />
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card title="Supply Overview" compact>
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error || 'Failed to load supply data.'}
        </div>
      </Card>
    );
  }

  const supplyPercent =
    data.maxTotalSupply > 0n
      ? Number((data.totalSupply * 10000n) / data.maxTotalSupply) / 100
      : 0;

  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (circumference * Math.min(100, supplyPercent)) / 100;

  return (
    <Card title="Supply Overview" compact>
      <div className="flex flex-col sm:flex-row items-center gap-8">
        {/* Circular gauge */}
        <div className="relative shrink-0">
          <svg width="120" height="120" viewBox="0 0 100 100" className="transform -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="url(#supplyGradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-1000"
            />
            <defs>
              <linearGradient id="supplyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-white">{supplyPercent.toFixed(1)}%</span>
            <span className="text-[10px] text-gray-500">utilized</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-3 w-full">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Total Supply</span>
            <span className="text-sm text-white font-semibold">
              {formatWeiAmount(data.totalSupply, data.decimals)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Max Total Supply</span>
            <span className="text-sm text-white font-semibold">
              {data.maxTotalSupply === 0n
                ? 'Unlimited'
                : formatWeiAmount(data.maxTotalSupply, data.decimals)}
            </span>
          </div>
          <div className="h-px bg-white/[0.06]" />
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Recently Minted</span>
            <span className="text-sm text-emerald-400 font-medium">
              +{formatWeiAmount(data.mintedAmount, data.decimals)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Recently Burned</span>
            <span className="text-sm text-red-400 font-medium">
              -{formatWeiAmount(data.burnedAmount, data.decimals)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// B) Holder Distribution by Group
// ---------------------------------------------------------------------------

function HolderDistribution({ tokenAddress }: { tokenAddress: string }) {
  const [groups, setGroups] = useState<GroupDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const contract = getContract(tokenAddress);
      const { chainId } = useWalletStore.getState().wallet;
      if (!contract || !chainId) {
        setLoading(false);
        return;
      }

      try {
        const readProvider = getReadOnlyProvider(chainId);
        const filter = contract.filters.AddressTransferGroup();
        const logs = await queryRecentLogsChunked(contract, filter, readProvider);

        // Build a map of address -> most recent group assignment
        const addrGroup = new Map<string, number>();
        for (const log of logs) {
          const args = log.args;
          const addr = (args[1] as string).toLowerCase();
          const groupId = Number(args[2] as bigint);
          addrGroup.set(addr, groupId);
        }

        // Aggregate by group
        const groupMap = new Map<number, string[]>();
        for (const [addr, gid] of addrGroup) {
          const existing = groupMap.get(gid) ?? [];
          existing.push(addr);
          groupMap.set(gid, existing);
        }

        const result: GroupDistribution[] = [];
        for (const [groupId, addresses] of groupMap) {
          result.push({ groupId, count: addresses.length, addresses });
        }
        result.sort((a, b) => a.groupId - b.groupId);
        setGroups(result);
      } catch (err) {
        setError(parseContractError(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tokenAddress]);

  const maxCount = Math.max(1, ...groups.map((g) => g.count));

  return (
    <Card title="Holder Distribution by Group" compact>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" label="Loading distribution" />
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          No group assignment events found in recent blocks.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const pct = (g.count / maxCount) * 100;
            return (
              <div key={g.groupId} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-300 font-medium">Group {g.groupId}</span>
                  <span className="text-gray-400">{g.count} holder{g.count !== 1 ? 's' : ''}</span>
                </div>
                <div className="relative h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-gray-600 pt-2">
            Based on AddressTransferGroup events in the last ~50,000 blocks.
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// C) Locked vs Unlocked Breakdown
// ---------------------------------------------------------------------------

function LockedUnlockedBreakdown({ tokenAddress }: { tokenAddress: string }) {
  const { wallet } = useWalletStore();
  const [queryAddr, setQueryAddr] = useState('');
  const [data, setData] = useState<BalanceBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const effectiveAddr = queryAddr || wallet.address;

  const handleLoad = useCallback(async () => {
    const addr = effectiveAddr;
    if (!addr || !ethers.isAddress(addr)) {
      setError('Enter a valid Ethereum address or connect your wallet.');
      return;
    }

    const contract = getContract(tokenAddress);
    if (!contract) {
      setError('Wallet not connected.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [tokensBalance, unlockedAmount, lockedAmount, totalBalance] = await Promise.all([
        contract.tokensBalanceOf(addr) as Promise<bigint>,
        contract.unlockedAmountOf(addr) as Promise<bigint>,
        contract.lockedAmountOf(addr) as Promise<bigint>,
        contract.balanceOf(addr) as Promise<bigint>,
      ]);
      setData({ tokensBalance, unlockedAmount, lockedAmount, totalBalance });
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, effectiveAddr]);

  useEffect(() => {
    if (wallet.address && !queryAddr) {
      handleLoad();
    }
  }, [wallet.address]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = data ? Number(data.totalBalance) : 0;
  const segments = data
    ? [
        { label: 'Free Tokens', value: data.tokensBalance, color: 'bg-indigo-500' },
        { label: 'Unlocked (Vesting)', value: data.unlockedAmount, color: 'bg-violet-500' },
        { label: 'Locked (Vesting)', value: data.lockedAmount, color: 'bg-amber-500' },
      ]
    : [];

  return (
    <Card title="Locked vs Unlocked Breakdown" compact>
      <div className="space-y-4">
        <div className="flex gap-3">
          <input
            className={INPUT_CLASS}
            placeholder={wallet.address ? `Default: ${truncateAddress(wallet.address)}` : '0x...'}
            value={queryAddr}
            onChange={(e) => setQueryAddr(e.target.value)}
          />
          <button
            className={`${BUTTON_CLASS} shrink-0`}
            onClick={handleLoad}
            disabled={loading}
          >
            {loading ? <Spinner size="xs" /> : 'Load'}
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {data && (
          <div className="space-y-4">
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

            {/* Legend */}
            <div className="space-y-2">
              {segments.map((seg) => {
                const pct = total > 0 ? (Number(seg.value) / total) * 100 : 0;
                return (
                  <div key={seg.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded ${seg.color}`} />
                      <span className="text-sm text-gray-400">{seg.label}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm text-white font-medium">
                        {formatWeiAmount(seg.value)}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({pct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="h-px bg-white/[0.06]" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300 font-medium">Total Balance</span>
                <span className="text-sm text-white font-bold">
                  {formatWeiAmount(data.totalBalance)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// D) Active Timelocks Summary
// ---------------------------------------------------------------------------

function TimelocksSummary({ tokenAddress }: { tokenAddress: string }) {
  const [totalLocked, setTotalLocked] = useState<bigint>(0n);
  const [totalUnlocked, setTotalUnlocked] = useState<bigint>(0n);
  const [timelockCount, setTimelockCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const contract = getContract(tokenAddress);
      const { chainId } = useWalletStore.getState().wallet;
      if (!contract || !chainId) {
        setLoading(false);
        return;
      }

      try {
        const readProvider = getReadOnlyProvider(chainId);
        // Find addresses with timelocks via ScheduleFunded events
        const filter = contract.filters.ScheduleFunded();
        const logs = await queryRecentLogsChunked(contract, filter, readProvider);

        const recipients = new Set<string>();
        for (const log of logs) {
          const args = log.args;
          recipients.add(args[1] as string);
        }

        let locked = 0n;
        let unlocked = 0n;
        let count = 0;

        for (const addr of recipients) {
          try {
            const tlCount = await contract.timelockCountOf(addr) as bigint;
            const c = Number(tlCount);
            count += c;

            for (let i = 0; i < c; i++) {
              const [lockedAmt, unlockedAmt] = await Promise.all([
                contract.lockedAmountOfTimelock(addr, i) as Promise<bigint>,
                contract.unlockedAmountOfTimelock(addr, i) as Promise<bigint>,
              ]);
              locked += lockedAmt;
              unlocked += unlockedAmt;
            }
          } catch {
            // Skip addresses that fail
          }
        }

        setTotalLocked(locked);
        setTotalUnlocked(unlocked);
        setTimelockCount(count);
      } catch (err) {
        setError(parseContractError(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tokenAddress]);

  return (
    <Card title="Active Timelocks Summary" compact>
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Scanning timelocks" />
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-4 text-center">
              <p className="text-2xl font-bold text-white">{timelockCount}</p>
              <p className="text-xs text-gray-500 mt-1">Active Timelocks</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-4 text-center">
              <p className="text-2xl font-bold text-amber-400">
                {formatCompact(Number(ethers.formatUnits(totalLocked, 18)))}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total Locked</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">
                {formatCompact(Number(ethers.formatUnits(totalUnlocked, 18)))}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total Unlocked</p>
            </div>
          </div>

          {/* Lock ratio bar */}
          {(totalLocked + totalUnlocked) > 0n && (
            <div>
              <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden flex">
                <div
                  className="bg-emerald-500 transition-all duration-700"
                  style={{
                    width: `${
                      Number((totalUnlocked * 10000n) / (totalLocked + totalUnlocked)) / 100
                    }%`,
                  }}
                />
                <div
                  className="bg-amber-500 transition-all duration-700"
                  style={{
                    width: `${
                      Number((totalLocked * 10000n) / (totalLocked + totalUnlocked)) / 100
                    }%`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-gray-500">
                <span>Unlocked</span>
                <span>Locked</span>
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-600">
            Aggregated from ScheduleFunded events in the last ~50,000 blocks.
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// E) Pending Dividends
// ---------------------------------------------------------------------------

function PendingDividends({ tokenAddress }: { tokenAddress: string }) {
  const { wallet } = useWalletStore();
  const [snapshots, setSnapshots] = useState<
    { snapshotId: bigint; token: string; unclaimed: bigint }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalUnclaimed, setTotalUnclaimed] = useState(0n);

  useEffect(() => {
    const load = async () => {
      if (!wallet.address) {
        setLoading(false);
        return;
      }

      const contract = getContract(tokenAddress);
      const { chainId } = useWalletStore.getState().wallet;
      if (!contract || !chainId) {
        setLoading(false);
        return;
      }

      try {
        const readProvider = getReadOnlyProvider(chainId);
        const filter = contract.filters.Funded();
        const logs = await queryRecentLogsChunked(contract, filter, readProvider);

        // Collect unique (token, snapshotId) pairs from Funded events
        const seen = new Set<string>();
        const entries: { token: string; snapshotId: bigint }[] = [];
        for (const log of logs) {
          const args = log.args;
          const token = args[1] as string;
          const snapshotId = args[3] as bigint;
          const key = `${token}-${snapshotId}`;
          if (!seen.has(key)) {
            seen.add(key);
            entries.push({ token, snapshotId });
          }
        }

        const results: { snapshotId: bigint; token: string; unclaimed: bigint }[] = [];
        let total = 0n;

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
              total += unclaimed;
            }
          } catch {
            // Skip failed queries
          }
        }

        setSnapshots(results);
        setTotalUnclaimed(total);
      } catch (err) {
        setError(parseContractError(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tokenAddress, wallet.address]);

  return (
    <Card title="Pending Dividends" compact>
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Loading dividends" />
        </div>
      ) : !wallet.address ? (
        <p className="text-sm text-gray-500 text-center py-8">
          Connect your wallet to view pending dividends.
        </p>
      ) : error ? (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : snapshots.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          No unclaimed dividends found.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-3 text-center">
            <p className="text-xs text-gray-400">Total Unclaimed</p>
            <p className="text-xl font-bold text-indigo-400 mt-1">
              {formatWeiAmount(totalUnclaimed)}
            </p>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {snapshots.map((s, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/[0.04] px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="info" size="sm">
                    Snapshot #{s.snapshotId.toString()}
                  </Badge>
                  <span className="text-xs text-gray-500 font-mono">
                    {truncateAddress(s.token)}
                  </span>
                </div>
                <span className="text-sm text-white font-medium">
                  {formatWeiAmount(s.unclaimed)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// F) Swap Volume
// ---------------------------------------------------------------------------

function SwapVolume({ tokenAddress }: { tokenAddress: string }) {
  const [summary, setSummary] = useState<SwapSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const contract = getContract(tokenAddress);
      const { chainId } = useWalletStore.getState().wallet;
      if (!contract || !chainId) {
        setLoading(false);
        return;
      }

      try {
        const readProvider = getReadOnlyProvider(chainId);
        const filter = contract.filters.SwapComplete();
        const logs = await queryRecentLogsChunked(contract, filter, readProvider);

        let totalVolume = 0n;
        for (const log of logs) {
          const args = log.args;
          totalVolume += args[2] as bigint; // restrictedTokenAmount
        }

        setSummary({
          completedCount: logs.length,
          totalRestrictedVolume: totalVolume,
        });
      } catch (err) {
        setError(parseContractError(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tokenAddress]);

  return (
    <Card title="Swap Volume" compact>
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-4 text-center">
            <p className="text-2xl font-bold text-white">{summary.completedCount}</p>
            <p className="text-xs text-gray-500 mt-1">Completed Swaps</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-4 text-center">
            <p className="text-2xl font-bold text-indigo-400">
              {formatWeiAmount(summary.totalRestrictedVolume)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Restricted Token Volume</p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// G) Snapshot Timeline
// ---------------------------------------------------------------------------

function SnapshotTimeline({ tokenAddress }: { tokenAddress: string }) {
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const contract = getContract(tokenAddress);
      const { chainId } = useWalletStore.getState().wallet;
      if (!contract || !chainId) {
        setLoading(false);
        return;
      }

      try {
        const readProvider = getReadOnlyProvider(chainId);
        const filter = contract.filters.Snapshot();
        const logs = await queryRecentLogsChunked(contract, filter, readProvider);

        const entries: SnapshotEntry[] = [];
        for (const log of logs) {
          const id = log.args[0] as bigint;
          const ts = await resolveBlockTimestamp(readProvider, log.blockNumber);

          let totalSupplyAtSnapshot: bigint | null = null;
          try {
            totalSupplyAtSnapshot = (await contract.totalSupplyAt(id)) as bigint;
          } catch {
            // totalSupplyAt may not be available
          }

          entries.push({
            id,
            blockNumber: log.blockNumber,
            timestamp: ts,
            totalSupply: totalSupplyAtSnapshot,
          });
        }

        setSnapshots(entries.reverse());
      } catch (err) {
        setError(parseContractError(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tokenAddress]);

  return (
    <Card title="Snapshot Timeline" compact>
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Loading snapshots" />
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : snapshots.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          No snapshots recorded in recent blocks.
        </p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {snapshots.map((s) => (
            <div
              key={s.id.toString()}
              className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/[0.04] px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Badge variant="primary" size="sm">
                  #{s.id.toString()}
                </Badge>
                <div>
                  <p className="text-xs text-gray-300">
                    {s.timestamp
                      ? formatDateTime(new Date(s.timestamp * 1000))
                      : `Block ${s.blockNumber}`}
                  </p>
                  {s.totalSupply !== null && (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Supply: {formatWeiAmount(s.totalSupply)}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-gray-600 font-mono">
                Block {s.blockNumber}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TokenAnalytics({ tokenAddress }: TokenAnalyticsProps) {
  return (
    <div className="space-y-6">
      {/* Supply + Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SupplyGauges tokenAddress={tokenAddress} />
        <HolderDistribution tokenAddress={tokenAddress} />
      </div>

      {/* Locked/Unlocked + Timelocks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LockedUnlockedBreakdown tokenAddress={tokenAddress} />
        <TimelocksSummary tokenAddress={tokenAddress} />
      </div>

      {/* Dividends + Swaps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PendingDividends tokenAddress={tokenAddress} />
        <SwapVolume tokenAddress={tokenAddress} />
      </div>

      {/* Snapshot Timeline */}
      <SnapshotTimeline tokenAddress={tokenAddress} />
    </div>
  );
}
