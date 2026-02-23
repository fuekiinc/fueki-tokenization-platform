/**
 * VestingManager -- Manages release schedules, timelock funding, and
 * per-address timelock dashboards for an ERC-1404 security token.
 *
 * Sections:
 *   A) Release Schedule Builder -- create & view schedules, visualize curves
 *   B) Fund Release Schedule   -- single and batch funding of timelocks
 *   C) Timelock Dashboard      -- inspect, cancel, and transfer timelocks
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  Calendar,
  Clock,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Send,
  Loader2,
  AlertCircle,
  Users,
  BarChart3,
  FileSpreadsheet,
  X,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  SecurityTokenABI,
  BIPS_PRECISION,
} from '../../contracts/abis/SecurityToken';
import { useWalletStore, getProvider } from '../../store/walletStore';
import { parseContractError } from '../../lib/blockchain/contracts';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import Card from '../Common/Card';
import Spinner from '../Common/Spinner';
import EmptyState from '../Common/EmptyState';
import Modal from '../Common/Modal';
import { InfoTooltip } from '../Common/Tooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VestingManagerProps {
  tokenAddress: string;
}

interface ReleaseSchedule {
  id: number;
  releaseCount: bigint;
  delayUntilFirstReleaseInSeconds: bigint;
  initialReleasePortionInBips: bigint;
  periodBetweenReleasesInSeconds: bigint;
}

interface Timelock {
  index: number;
  scheduleId: bigint;
  commencementTimestamp: bigint;
  tokensTransferred: bigint;
  totalAmount: bigint;
  cancelableBy: string[];
  lockedAmount: bigint;
  unlockedAmount: bigint;
}

interface BatchRow {
  id: string;
  recipient: string;
  amount: string;
  commencementTimestamp: string;
  scheduleId: string;
}

type ActiveTab = 'schedules' | 'fund' | 'dashboard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  'bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors w-full';

const BTN_PRIMARY =
  'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-medium transition-colors';

const BTN_SECONDARY =
  'bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors';

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_MONTH = 2592000; // 30 days

const SCHEDULE_FIELD_TOOLTIPS = {
  releaseCount:
    'Total number of vesting unlock events in this schedule. If set to 1, there is a single unlock after the initial delay. If set to 12, tokens unlock in 12 separate releases.',
  delayUntilFirstRelease:
    'Number of seconds from timelock commencement until the first release occurs. Example: 2592000 = 30 days. Set to 0 for no initial delay.',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function secondsToHuman(seconds: bigint | number): string {
  const s = Number(seconds);
  if (s === 0) return '0s';
  const days = Math.floor(s / SECONDS_PER_DAY);
  const months = Math.floor(s / SECONDS_PER_MONTH);
  if (months > 0 && s % SECONDS_PER_MONTH === 0) {
    return `${months} month${months !== 1 ? 's' : ''}`;
  }
  if (days > 0) {
    const remainHours = Math.floor((s % SECONDS_PER_DAY) / 3600);
    return remainHours > 0
      ? `${days}d ${remainHours}h`
      : `${days} day${days !== 1 ? 's' : ''}`;
  }
  const hours = Math.floor(s / 3600);
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(s / 60);
  return minutes > 0 ? `${minutes}m` : `${s}s`;
}

function bipsToPercent(bips: bigint | number): string {
  return (Number(bips) / 100).toFixed(2);
}

function formatTimestamp(ts: bigint | number): string {
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function datetimeLocalToTimestamp(val: string): number {
  if (!val) return 0;
  return Math.floor(new Date(val).getTime() / 1000);
}

function generateRowId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// ---------------------------------------------------------------------------
// Sub-component: Release Curve SVG
// ---------------------------------------------------------------------------

function ReleaseCurve({
  schedule,
  tokenAddress,
}: {
  schedule: ReleaseSchedule;
  tokenAddress: string;
}) {
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function compute() {
      setLoading(true);
      try {
        const provider = getProvider();
        if (!provider) return;
        const contract = new ethers.Contract(
          tokenAddress,
          SecurityTokenABI,
          provider,
        );

        const totalAmount = ethers.parseUnits('1000', 18);
        const commencedTimestamp = BigInt(
          Math.floor(Date.now() / 1000),
        );
        const totalDuration =
          schedule.delayUntilFirstReleaseInSeconds +
          schedule.periodBetweenReleasesInSeconds *
            (schedule.releaseCount - 1n);

        const steps = 50;
        const stepSize =
          totalDuration > 0n ? totalDuration / BigInt(steps) : 1n;
        const computed: { x: number; y: number }[] = [];

        for (let i = 0; i <= steps; i++) {
          const elapsed = stepSize * BigInt(i);
          const currentTs = commencedTimestamp + elapsed;
          try {
            const unlocked: bigint = await contract.calculateUnlocked(
              commencedTimestamp,
              currentTs,
              totalAmount,
              schedule.id,
            );
            computed.push({
              x: Number(elapsed),
              y: Number(unlocked),
            });
          } catch {
            computed.push({ x: Number(elapsed), y: 0 });
          }
        }

        if (!cancelled) setPoints(computed);
      } catch {
        // Silently handle errors for the visualization
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void compute();
    return () => {
      cancelled = true;
    };
  }, [schedule, tokenAddress]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Spinner size="sm" label="Computing release curve..." />
      </div>
    );
  }

  if (points.length < 2) return null;

  const maxX = Math.max(...points.map((p) => p.x));
  const maxY = Math.max(...points.map((p) => p.y));
  if (maxX === 0 || maxY === 0) return null;

  const width = 400;
  const height = 150;
  const padX = 0;
  const padY = 10;

  const scaledPoints = points.map((p) => ({
    x: padX + (p.x / maxX) * (width - padX * 2),
    y: height - padY - (p.y / maxY) * (height - padY * 2),
  }));

  const linePath = scaledPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const areaPath = `${linePath} L ${scaledPoints[scaledPoints.length - 1].x} ${height - padY} L ${padX} ${height - padY} Z`;

  return (
    <div className="mt-4">
      <p className="text-xs text-gray-500 mb-2">
        Release Curve (1,000 token simulation)
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-40 rounded-lg"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient
            id={`curve-grad-${schedule.id}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path
          d={areaPath}
          fill={`url(#curve-grad-${schedule.id})`}
        />
        <path
          d={linePath}
          fill="none"
          stroke="#6366f1"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between text-[10px] text-gray-600 mt-1 px-1">
        <span>0</span>
        <span>{secondsToHuman(BigInt(maxX))}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function VestingManager({ tokenAddress }: VestingManagerProps) {
  const { wallet } = useWalletStore();
  const connectedAddress = wallet.address;

  // ---- Tab state ----------------------------------------------------------
  const [activeTab, setActiveTab] = useState<ActiveTab>('schedules');

  // ---- Contract config state ----------------------------------------------
  const [minTimelockAmount, setMinTimelockAmount] = useState<bigint>(0n);
  const [maxReleaseDelay, setMaxReleaseDelay] = useState<bigint>(0n);
  const [decimals, setDecimals] = useState<number>(18);

  // ---- Schedule state -----------------------------------------------------
  const [schedules, setSchedules] = useState<ReleaseSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<
    number | null
  >(null);
  const [showCurve, setShowCurve] = useState(false);

  // Schedule form
  const [newReleaseCount, setNewReleaseCount] = useState('4');
  const [newDelay, setNewDelay] = useState('0');
  const [newInitialBips, setNewInitialBips] = useState('2500');
  const [newPeriod, setNewPeriod] = useState('2592000');
  const [creatingSchedule, setCreatingSchedule] = useState(false);

  // ---- Fund state ---------------------------------------------------------
  const [fundRecipient, setFundRecipient] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [fundCommencement, setFundCommencement] = useState('');
  const [fundScheduleId, setFundScheduleId] = useState('');
  const [fundCancelableBy, setFundCancelableBy] = useState<string[]>(['']);
  const [funding, setFunding] = useState(false);

  // Batch fund
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchRows, setBatchRows] = useState<BatchRow[]>([
    {
      id: generateRowId(),
      recipient: '',
      amount: '',
      commencementTimestamp: '',
      scheduleId: '',
    },
  ]);
  const [batchCancelableBy, setBatchCancelableBy] = useState<string[]>([
    '',
  ]);
  const [batchFunding, setBatchFunding] = useState(false);

  // ---- Dashboard state ----------------------------------------------------
  const [lookupAddress, setLookupAddress] = useState('');
  const [timelocks, setTimelocks] = useState<Timelock[]>([]);
  const [timelocksLoading, setTimelocksLoading] = useState(false);
  const [cancelingIndex, setCancelingIndex] = useState<number | null>(null);
  const [transferringIndex, setTransferringIndex] = useState<
    number | null
  >(null);
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');

  // ---- Cancel confirmation modal ------------------------------------------
  const [cancelModal, setCancelModal] = useState<{
    open: boolean;
    timelockIndex: number;
    timelock: Timelock | null;
  }>({ open: false, timelockIndex: -1, timelock: null });
  const [reclaimTo, setReclaimTo] = useState('');

  // ---- Helper: get contract -----------------------------------------------

  const getContract = useCallback(
    async (withSigner: boolean = false) => {
      const provider = getProvider();
      if (!provider) throw new Error('Wallet not connected');
      if (withSigner) {
        const signer = await provider.getSigner();
        return new ethers.Contract(tokenAddress, SecurityTokenABI, signer);
      }
      return new ethers.Contract(tokenAddress, SecurityTokenABI, provider);
    },
    [tokenAddress],
  );

  // ---- Load contract config -----------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const contract = await getContract();
        const [minAmt, maxDelay, dec] = await Promise.all([
          contract.minTimelockAmount() as Promise<bigint>,
          contract.maxReleaseDelay() as Promise<bigint>,
          contract.decimals() as Promise<bigint>,
        ]);
        if (!cancelled) {
          setMinTimelockAmount(minAmt);
          setMaxReleaseDelay(maxDelay);
          setDecimals(Number(dec));
        }
      } catch {
        // Non-critical: config will show as 0
      }
    }

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [getContract]);

  // ---- Load schedules -----------------------------------------------------

  const loadSchedules = useCallback(async () => {
    setSchedulesLoading(true);
    try {
      const contract = await getContract();
      const count: bigint = await contract.scheduleCount();
      const loaded: ReleaseSchedule[] = [];

      for (let i = 0; i < Number(count); i++) {
        try {
          const s = await contract.releaseSchedules(i);
          loaded.push({
            id: i,
            releaseCount: s[0],
            delayUntilFirstReleaseInSeconds: s[1],
            initialReleasePortionInBips: s[2],
            periodBetweenReleasesInSeconds: s[3],
          });
        } catch {
          // Skip corrupted entries
        }
      }

      setSchedules(loaded);
    } catch (err) {
      toast.error(`Failed to load schedules: ${parseContractError(err)}`);
    } finally {
      setSchedulesLoading(false);
    }
  }, [getContract]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  // ---- Create schedule ----------------------------------------------------

  const handleCreateSchedule = useCallback(async () => {
    if (creatingSchedule) return;
    setCreatingSchedule(true);

    try {
      const contract = await getContract(true);
      const releaseCount = BigInt(newReleaseCount);
      const delay = BigInt(newDelay);
      const initialBips = BigInt(newInitialBips);
      const period = BigInt(newPeriod);

      if (releaseCount < 1n) {
        toast.error('Release count must be at least 1');
        return;
      }
      if (initialBips > BigInt(BIPS_PRECISION)) {
        toast.error(
          `Initial release portion cannot exceed ${BIPS_PRECISION} bips (100%)`,
        );
        return;
      }

      toast.loading('Creating release schedule...', {
        id: 'create-schedule',
      });

      const gasEstimate =
        await contract.createReleaseSchedule.estimateGas(
          releaseCount,
          delay,
          initialBips,
          period,
        );
      const gasLimit = (gasEstimate * 120n) / 100n;
      const tx = await contract.createReleaseSchedule(
        releaseCount,
        delay,
        initialBips,
        period,
        { gasLimit },
      );
      await tx.wait();

      toast.success('Release schedule created successfully', {
        id: 'create-schedule',
      });
      await loadSchedules();
    } catch (err) {
      toast.error(parseContractError(err), { id: 'create-schedule' });
    } finally {
      setCreatingSchedule(false);
    }
  }, [
    getContract,
    newReleaseCount,
    newDelay,
    newInitialBips,
    newPeriod,
    creatingSchedule,
    loadSchedules,
  ]);

  // ---- Fund single schedule -----------------------------------------------

  const handleFundSchedule = useCallback(async () => {
    if (funding) return;
    setFunding(true);

    try {
      if (!ethers.isAddress(fundRecipient)) {
        toast.error('Invalid recipient address');
        return;
      }

      const amount = ethers.parseUnits(fundAmount, decimals);
      if (amount < minTimelockAmount) {
        toast.error(
          `Amount must be >= ${ethers.formatUnits(minTimelockAmount, decimals)} (min timelock amount)`,
        );
        return;
      }

      const commencement = BigInt(
        datetimeLocalToTimestamp(fundCommencement),
      );
      if (commencement === 0n) {
        toast.error('Please set a commencement timestamp');
        return;
      }

      const scheduleId = BigInt(fundScheduleId);
      const cancelableAddresses = fundCancelableBy.filter(
        (a) => a.trim() !== '',
      );

      // Validate cancelable addresses
      for (const addr of cancelableAddresses) {
        if (!ethers.isAddress(addr)) {
          toast.error(`Invalid cancelableBy address: ${addr}`);
          return;
        }
      }

      toast.loading('Funding release schedule...', { id: 'fund-schedule' });

      const contract = await getContract(true);
      const gasEstimate =
        await contract.fundReleaseSchedule.estimateGas(
          fundRecipient,
          amount,
          commencement,
          scheduleId,
          cancelableAddresses,
        );
      const gasLimit = (gasEstimate * 120n) / 100n;
      const tx = await contract.fundReleaseSchedule(
        fundRecipient,
        amount,
        commencement,
        scheduleId,
        cancelableAddresses,
        { gasLimit },
      );
      await tx.wait();

      toast.success('Release schedule funded successfully', {
        id: 'fund-schedule',
      });
      setFundRecipient('');
      setFundAmount('');
      setFundCommencement('');
      setFundScheduleId('');
      setFundCancelableBy(['']);
    } catch (err) {
      toast.error(parseContractError(err), { id: 'fund-schedule' });
    } finally {
      setFunding(false);
    }
  }, [
    getContract,
    fundRecipient,
    fundAmount,
    fundCommencement,
    fundScheduleId,
    fundCancelableBy,
    minTimelockAmount,
    decimals,
    funding,
  ]);

  // ---- Batch fund ---------------------------------------------------------

  const handleBatchFund = useCallback(async () => {
    if (batchFunding) return;
    setBatchFunding(true);

    try {
      const validRows = batchRows.filter(
        (r) =>
          r.recipient.trim() !== '' &&
          r.amount.trim() !== '' &&
          r.commencementTimestamp.trim() !== '' &&
          r.scheduleId.trim() !== '',
      );

      if (validRows.length === 0) {
        toast.error('No valid rows to fund');
        return;
      }

      const recipients: string[] = [];
      const amounts: bigint[] = [];
      const commencementTimestamps: bigint[] = [];
      const scheduleIds: bigint[] = [];

      for (const row of validRows) {
        if (!ethers.isAddress(row.recipient)) {
          toast.error(`Invalid address: ${row.recipient}`);
          return;
        }
        recipients.push(row.recipient);
        amounts.push(ethers.parseUnits(row.amount, decimals));
        commencementTimestamps.push(
          BigInt(datetimeLocalToTimestamp(row.commencementTimestamp)),
        );
        scheduleIds.push(BigInt(row.scheduleId));
      }

      const cancelableAddresses = batchCancelableBy.filter(
        (a) => a.trim() !== '',
      );
      for (const addr of cancelableAddresses) {
        if (!ethers.isAddress(addr)) {
          toast.error(`Invalid cancelableBy address: ${addr}`);
          return;
        }
      }

      toast.loading(
        `Batch funding ${validRows.length} timelock(s)...`,
        { id: 'batch-fund' },
      );

      const contract = await getContract(true);
      const gasEstimate =
        await contract.batchFundReleaseSchedule.estimateGas(
          recipients,
          amounts,
          commencementTimestamps,
          scheduleIds,
          cancelableAddresses,
        );
      const gasLimit = (gasEstimate * 120n) / 100n;
      const tx = await contract.batchFundReleaseSchedule(
        recipients,
        amounts,
        commencementTimestamps,
        scheduleIds,
        cancelableAddresses,
        { gasLimit },
      );
      await tx.wait();

      toast.success(
        `Successfully funded ${validRows.length} timelock(s)`,
        { id: 'batch-fund' },
      );
      setBatchRows([
        {
          id: generateRowId(),
          recipient: '',
          amount: '',
          commencementTimestamp: '',
          scheduleId: '',
        },
      ]);
    } catch (err) {
      toast.error(parseContractError(err), { id: 'batch-fund' });
    } finally {
      setBatchFunding(false);
    }
  }, [getContract, batchRows, batchCancelableBy, decimals, batchFunding]);

  // ---- Load timelocks for address -----------------------------------------

  const loadTimelocks = useCallback(
    async (address: string) => {
      if (!ethers.isAddress(address)) {
        toast.error('Invalid address');
        return;
      }

      setTimelocksLoading(true);
      setTimelocks([]);

      try {
        const contract = await getContract();
        const count: bigint = await contract.timelockCountOf(address);
        const loaded: Timelock[] = [];

        for (let i = 0; i < Number(count); i++) {
          try {
            const [tl, locked, unlocked] = await Promise.all([
              contract.timelockOf(address, i),
              contract.lockedAmountOfTimelock(address, i) as Promise<bigint>,
              contract.unlockedAmountOfTimelock(
                address,
                i,
              ) as Promise<bigint>,
            ]);

            loaded.push({
              index: i,
              scheduleId: tl.scheduleId,
              commencementTimestamp: tl.commencementTimestamp,
              tokensTransferred: tl.tokensTransferred,
              totalAmount: tl.totalAmount,
              cancelableBy: [...tl.cancelableBy],
              lockedAmount: locked,
              unlockedAmount: unlocked,
            });
          } catch {
            // Skip entries that fail to load
          }
        }

        setTimelocks(loaded);
      } catch (err) {
        toast.error(
          `Failed to load timelocks: ${parseContractError(err)}`,
        );
      } finally {
        setTimelocksLoading(false);
      }
    },
    [getContract],
  );

  // ---- Cancel timelock ----------------------------------------------------

  const handleCancelTimelock = useCallback(async () => {
    if (cancelingIndex !== null || !cancelModal.timelock) return;
    const tl = cancelModal.timelock;
    const idx = cancelModal.timelockIndex;
    setCancelingIndex(idx);

    try {
      const reclaimAddress = reclaimTo.trim() || connectedAddress;
      if (!reclaimAddress || !ethers.isAddress(reclaimAddress)) {
        toast.error('Invalid reclaim address');
        return;
      }

      toast.loading('Canceling timelock...', { id: 'cancel-timelock' });

      const contract = await getContract(true);
      const gasEstimate = await contract.cancelTimelock.estimateGas(
        lookupAddress,
        idx,
        tl.scheduleId,
        tl.commencementTimestamp,
        tl.totalAmount,
        reclaimAddress,
      );
      const gasLimit = (gasEstimate * 120n) / 100n;
      const tx = await contract.cancelTimelock(
        lookupAddress,
        idx,
        tl.scheduleId,
        tl.commencementTimestamp,
        tl.totalAmount,
        reclaimAddress,
        { gasLimit },
      );
      await tx.wait();

      toast.success('Timelock canceled', { id: 'cancel-timelock' });
      setCancelModal({ open: false, timelockIndex: -1, timelock: null });
      setReclaimTo('');
      await loadTimelocks(lookupAddress);
    } catch (err) {
      toast.error(parseContractError(err), { id: 'cancel-timelock' });
    } finally {
      setCancelingIndex(null);
    }
  }, [
    getContract,
    cancelModal,
    cancelingIndex,
    lookupAddress,
    reclaimTo,
    connectedAddress,
    loadTimelocks,
  ]);

  // ---- Transfer timelock --------------------------------------------------

  const handleTransferTimelock = useCallback(
    async (timelockId: number) => {
      if (transferringIndex !== null) return;
      setTransferringIndex(timelockId);

      try {
        if (!ethers.isAddress(transferTo)) {
          toast.error('Invalid recipient address');
          return;
        }

        const value = ethers.parseUnits(transferAmount, decimals);

        toast.loading('Transferring from timelock...', {
          id: 'transfer-timelock',
        });

        const contract = await getContract(true);
        const gasEstimate =
          await contract.transferTimelock.estimateGas(
            transferTo,
            value,
            timelockId,
          );
        const gasLimit = (gasEstimate * 120n) / 100n;
        const tx = await contract.transferTimelock(
          transferTo,
          value,
          timelockId,
          { gasLimit },
        );
        await tx.wait();

        toast.success('Timelock transfer complete', {
          id: 'transfer-timelock',
        });
        setTransferTo('');
        setTransferAmount('');
        setTransferringIndex(null);
        await loadTimelocks(lookupAddress);
      } catch (err) {
        toast.error(parseContractError(err), {
          id: 'transfer-timelock',
        });
      } finally {
        setTransferringIndex(null);
      }
    },
    [
      getContract,
      transferTo,
      transferAmount,
      decimals,
      transferringIndex,
      lookupAddress,
      loadTimelocks,
    ],
  );

  // ---- Validation helpers -------------------------------------------------

  const fundValidation = useMemo(() => {
    const errors: string[] = [];
    if (fundAmount) {
      try {
        const amt = ethers.parseUnits(fundAmount, decimals);
        if (amt < minTimelockAmount) {
          errors.push(
            `Amount must be >= ${ethers.formatUnits(minTimelockAmount, decimals)}`,
          );
        }
      } catch {
        errors.push('Invalid amount');
      }
    }
    if (fundCommencement && fundScheduleId && schedules.length > 0) {
      const commencement = datetimeLocalToTimestamp(fundCommencement);
      const sid = Number(fundScheduleId);
      const schedule = schedules.find((s) => s.id === sid);
      if (schedule && maxReleaseDelay > 0n) {
        const maxAllowed =
          Math.floor(Date.now() / 1000) + Number(maxReleaseDelay);
        const firstRelease =
          commencement +
          Number(schedule.delayUntilFirstReleaseInSeconds);
        if (firstRelease > maxAllowed) {
          errors.push('Commencement + delay exceeds max release delay');
        }
      }
    }
    return errors;
  }, [
    fundAmount,
    fundCommencement,
    fundScheduleId,
    schedules,
    minTimelockAmount,
    maxReleaseDelay,
    decimals,
  ]);

  // ---- Render: Tab buttons ------------------------------------------------

  const tabs: { key: ActiveTab; label: string; icon: typeof Clock }[] = [
    { key: 'schedules', label: 'Schedules', icon: Calendar },
    { key: 'fund', label: 'Fund', icon: Send },
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
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
              'flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
              activeTab === key
                ? 'bg-indigo-600/20 text-indigo-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Config info */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span>
          Min Timelock:{' '}
          <span className="text-gray-400 font-mono">
            {ethers.formatUnits(minTimelockAmount, decimals)}
          </span>
        </span>
        <span>
          Max Release Delay:{' '}
          <span className="text-gray-400 font-mono">
            {secondsToHuman(maxReleaseDelay)}
          </span>
        </span>
      </div>

      {/* ================================================================= */}
      {/* A) RELEASE SCHEDULE BUILDER                                       */}
      {/* ================================================================= */}

      {activeTab === 'schedules' && (
        <div className="space-y-6">
          {/* Create new schedule */}
          <Card
            title="Create Release Schedule"
            subtitle="Define a new vesting schedule for token distribution"
            gradientBorder
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Release Count */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span>Release Count</span>
                    <InfoTooltip content={SCHEDULE_FIELD_TOOLTIPS.releaseCount} />
                  </span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={newReleaseCount}
                  onChange={(e) => setNewReleaseCount(e.target.value)}
                  placeholder="Number of releases"
                  className={INPUT_CLASS}
                />
              </div>

              {/* Delay Until First Release */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span>Delay Until First Release (seconds)</span>
                    <InfoTooltip
                      content={SCHEDULE_FIELD_TOOLTIPS.delayUntilFirstRelease}
                    />
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={newDelay}
                  onChange={(e) => setNewDelay(e.target.value)}
                  placeholder="Seconds"
                  className={INPUT_CLASS}
                />
                {Number(newDelay) > 0 && (
                  <p className="mt-1 text-[10px] text-gray-600">
                    = {secondsToHuman(BigInt(newDelay))}
                  </p>
                )}
              </div>

              {/* Initial Release Portion */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  Initial Release Portion (bips)
                </label>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={newInitialBips}
                  onChange={(e) => setNewInitialBips(e.target.value)}
                  placeholder="0 - 10000"
                  className={INPUT_CLASS}
                />
                <p className="mt-1 text-[10px] text-gray-600">
                  = {bipsToPercent(Number(newInitialBips) || 0)}% released
                  immediately
                </p>
              </div>

              {/* Period Between Releases */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  Period Between Releases (seconds)
                </label>
                <input
                  type="number"
                  min="0"
                  value={newPeriod}
                  onChange={(e) => setNewPeriod(e.target.value)}
                  placeholder="Seconds"
                  className={INPUT_CLASS}
                />
                {Number(newPeriod) > 0 && (
                  <p className="mt-1 text-[10px] text-gray-600">
                    = {secondsToHuman(BigInt(newPeriod))}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={handleCreateSchedule}
                disabled={creatingSchedule}
                className={BTN_PRIMARY}
              >
                {creatingSchedule ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Create Schedule
                  </span>
                )}
              </button>
            </div>
          </Card>

          {/* Existing schedules table */}
          <Card
            title="Existing Schedules"
            subtitle={`${schedules.length} schedule(s) on-chain`}
            action={
              <button
                type="button"
                onClick={loadSchedules}
                disabled={schedulesLoading}
                className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-500 hover:text-gray-300 transition-colors"
                title="Refresh schedules"
              >
                <RefreshCw
                  className={clsx(
                    'h-4 w-4',
                    schedulesLoading && 'animate-spin',
                  )}
                />
              </button>
            }
          >
            {schedulesLoading ? (
              <div className="flex justify-center py-10">
                <Spinner label="Loading schedules..." />
              </div>
            ) : schedules.length === 0 ? (
              <EmptyState
                icon={<Calendar />}
                title="No Schedules"
                description="Create a release schedule to get started with token vesting."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-xs text-gray-500">
                      <th className="pb-3 pr-4">ID</th>
                      <th className="pb-3 pr-4">Releases</th>
                      <th className="pb-3 pr-4">Cliff</th>
                      <th className="pb-3 pr-4">Initial %</th>
                      <th className="pb-3 pr-4">Period</th>
                      <th className="pb-3">Curve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-3 pr-4 font-mono text-indigo-400">
                          #{s.id}
                        </td>
                        <td className="py-3 pr-4 text-white">
                          {s.releaseCount.toString()}
                        </td>
                        <td className="py-3 pr-4 text-gray-400">
                          {secondsToHuman(
                            s.delayUntilFirstReleaseInSeconds,
                          )}
                        </td>
                        <td className="py-3 pr-4 text-gray-400">
                          {bipsToPercent(s.initialReleasePortionInBips)}%
                        </td>
                        <td className="py-3 pr-4 text-gray-400">
                          {secondsToHuman(
                            s.periodBetweenReleasesInSeconds,
                          )}
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedScheduleId(s.id);
                              setShowCurve(true);
                            }}
                            className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Release curve visualization */}
                {showCurve && selectedScheduleId !== null && (
                  <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">
                        Schedule #{selectedScheduleId} Release Curve
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCurve(false)}
                        className="p-1 rounded hover:bg-white/[0.05] text-gray-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {schedules.find(
                      (s) => s.id === selectedScheduleId,
                    ) && (
                      <ReleaseCurve
                        schedule={
                          schedules.find(
                            (s) => s.id === selectedScheduleId,
                          )!
                        }
                        tokenAddress={tokenAddress}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ================================================================= */}
      {/* B) FUND RELEASE SCHEDULE                                          */}
      {/* ================================================================= */}

      {activeTab === 'fund' && (
        <div className="space-y-6">
          {/* Single fund form */}
          <Card
            title="Fund Release Schedule"
            subtitle="Assign tokens to a recipient under a vesting schedule"
            gradientBorder
          >
            <div className="space-y-4">
              {/* Recipient */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={fundRecipient}
                  onChange={(e) => setFundRecipient(e.target.value)}
                  placeholder="0x..."
                  className={INPUT_CLASS}
                />
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
                    placeholder="Token amount"
                    className={INPUT_CLASS}
                  />
                </div>

                {/* Commencement Timestamp */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Commencement Date
                  </label>
                  <input
                    type="datetime-local"
                    value={fundCommencement}
                    onChange={(e) =>
                      setFundCommencement(e.target.value)
                    }
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              {/* Schedule ID */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  Schedule ID
                </label>
                <select
                  value={fundScheduleId}
                  onChange={(e) => setFundScheduleId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Select a schedule...</option>
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.id} -- {s.releaseCount.toString()} releases,{' '}
                      {bipsToPercent(s.initialReleasePortionInBips)}%
                      initial,{' '}
                      {secondsToHuman(s.periodBetweenReleasesInSeconds)}{' '}
                      period
                    </option>
                  ))}
                </select>
              </div>

              {/* CancelableBy addresses */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  Cancelable By (addresses that can cancel this timelock)
                </label>
                {fundCancelableBy.map((addr, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={addr}
                      onChange={(e) => {
                        const updated = [...fundCancelableBy];
                        updated[i] = e.target.value;
                        setFundCancelableBy(updated);
                      }}
                      placeholder="0x..."
                      className={INPUT_CLASS}
                    />
                    {fundCancelableBy.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setFundCancelableBy(
                            fundCancelableBy.filter((_, j) => j !== i),
                          )
                        }
                        className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setFundCancelableBy([...fundCancelableBy, ''])
                  }
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  + Add address
                </button>
              </div>

              {/* Validation errors */}
              {fundValidation.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  {fundValidation.map((err, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-amber-400"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {err}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={handleFundSchedule}
                disabled={funding || fundValidation.length > 0}
                className={BTN_PRIMARY}
              >
                {funding ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Funding...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Fund Schedule
                  </span>
                )}
              </button>
            </div>
          </Card>

          {/* Batch fund form */}
          <Card
            title="Batch Fund"
            subtitle="Fund multiple timelocks in a single transaction"
            action={
              <button
                type="button"
                onClick={() => setShowBatchForm(!showBatchForm)}
                className={BTN_SECONDARY}
              >
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  {showBatchForm ? 'Hide' : 'Show'} Batch Form
                </span>
              </button>
            }
          >
            {showBatchForm && (
              <div className="space-y-4">
                {/* Batch rows */}
                <div className="space-y-3">
                  {batchRows.map((row, i) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                    >
                      <input
                        type="text"
                        value={row.recipient}
                        onChange={(e) => {
                          const updated = [...batchRows];
                          updated[i] = {
                            ...updated[i],
                            recipient: e.target.value,
                          };
                          setBatchRows(updated);
                        }}
                        placeholder="Recipient 0x..."
                        className={clsx(INPUT_CLASS, 'text-xs')}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                            const updated = [...batchRows];
                            updated[i] = {
                              ...updated[i],
                              amount: val,
                            };
                            setBatchRows(updated);
                          }
                        }}
                        placeholder="Amount"
                        className={clsx(INPUT_CLASS, 'text-xs')}
                      />
                      <input
                        type="datetime-local"
                        value={row.commencementTimestamp}
                        onChange={(e) => {
                          const updated = [...batchRows];
                          updated[i] = {
                            ...updated[i],
                            commencementTimestamp: e.target.value,
                          };
                          setBatchRows(updated);
                        }}
                        className={clsx(INPUT_CLASS, 'text-xs')}
                      />
                      <div className="flex gap-2">
                        <select
                          value={row.scheduleId}
                          onChange={(e) => {
                            const updated = [...batchRows];
                            updated[i] = {
                              ...updated[i],
                              scheduleId: e.target.value,
                            };
                            setBatchRows(updated);
                          }}
                          className={clsx(
                            INPUT_CLASS,
                            'text-xs flex-1',
                          )}
                        >
                          <option value="">Schedule...</option>
                          {schedules.map((s) => (
                            <option key={s.id} value={s.id}>
                              #{s.id}
                            </option>
                          ))}
                        </select>
                        {batchRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setBatchRows(
                                batchRows.filter(
                                  (_, j) => j !== i,
                                ),
                              )
                            }
                            className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setBatchRows([
                      ...batchRows,
                      {
                        id: generateRowId(),
                        recipient: '',
                        amount: '',
                        commencementTimestamp: '',
                        scheduleId: '',
                      },
                    ])
                  }
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  + Add Row
                </button>

                {/* Batch cancelableBy */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    CancelableBy (shared across all rows)
                  </label>
                  {batchCancelableBy.map((addr, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={addr}
                        onChange={(e) => {
                          const updated = [...batchCancelableBy];
                          updated[i] = e.target.value;
                          setBatchCancelableBy(updated);
                        }}
                        placeholder="0x..."
                        className={clsx(INPUT_CLASS, 'text-xs')}
                      />
                      {batchCancelableBy.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setBatchCancelableBy(
                              batchCancelableBy.filter(
                                (_, j) => j !== i,
                              ),
                            )
                          }
                          className="p-2 rounded-lg text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setBatchCancelableBy([
                        ...batchCancelableBy,
                        '',
                      ])
                    }
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    + Add address
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleBatchFund}
                  disabled={batchFunding}
                  className={BTN_PRIMARY}
                >
                  {batchFunding ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Batch Funding...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Fund{' '}
                      {
                        batchRows.filter(
                          (r) =>
                            r.recipient && r.amount && r.scheduleId,
                        ).length
                      }{' '}
                      Timelock(s)
                    </span>
                  )}
                </button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ================================================================= */}
      {/* C) TIMELOCK DASHBOARD                                             */}
      {/* ================================================================= */}

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Address lookup */}
          <Card
            title="Timelock Dashboard"
            subtitle="View and manage timelocks for any address"
            gradientBorder
          >
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                <input
                  type="text"
                  value={lookupAddress}
                  onChange={(e) => setLookupAddress(e.target.value)}
                  placeholder="Enter address to look up timelocks..."
                  className={clsx(INPUT_CLASS, 'pl-10')}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (lookupAddress) void loadTimelocks(lookupAddress);
                }}
                disabled={
                  timelocksLoading ||
                  !lookupAddress ||
                  !ethers.isAddress(lookupAddress)
                }
                className={BTN_PRIMARY}
              >
                {timelocksLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Lookup'
                )}
              </button>
            </div>

            {connectedAddress && (
              <button
                type="button"
                onClick={() => {
                  setLookupAddress(connectedAddress);
                  void loadTimelocks(connectedAddress);
                }}
                className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Use connected wallet ({formatAddress(connectedAddress)})
              </button>
            )}
          </Card>

          {/* Timelocks list */}
          {timelocksLoading ? (
            <div className="flex justify-center py-12">
              <Spinner label="Loading timelocks..." />
            </div>
          ) : lookupAddress &&
            ethers.isAddress(lookupAddress) &&
            timelocks.length === 0 ? (
            <EmptyState
              icon={<Lock />}
              title="No Timelocks"
              description={`No timelocks found for ${formatAddress(lookupAddress)}`}
            />
          ) : (
            <div className="space-y-4">
              {timelocks.map((tl) => {
                const totalNum = Number(tl.totalAmount);
                const transferredNum = Number(tl.tokensTransferred);
                const unlockedNum = Number(tl.unlockedAmount);
                const transferredPct =
                  totalNum > 0
                    ? (transferredNum / totalNum) * 100
                    : 0;
                const unlockedPct =
                  totalNum > 0 ? (unlockedNum / totalNum) * 100 : 0;

                const canCancel =
                  connectedAddress &&
                  tl.cancelableBy.some(
                    (a) =>
                      a.toLowerCase() ===
                      connectedAddress.toLowerCase(),
                  );

                const isLookupMyAddress =
                  connectedAddress &&
                  lookupAddress.toLowerCase() ===
                    connectedAddress.toLowerCase();

                return (
                  <Card key={tl.index} compact hoverable>
                    <div className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              Timelock
                            </span>
                            <span className="font-mono text-sm text-indigo-400">
                              #{tl.index}
                            </span>
                            <span className="text-xs text-gray-600">
                              (Schedule #{tl.scheduleId.toString()})
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            Commenced:{' '}
                            {formatTimestamp(tl.commencementTimestamp)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-white font-mono">
                            {formatBalance(tl.totalAmount, decimals, 4)}
                          </p>
                          <p className="text-[10px] text-gray-600">
                            Total Amount
                          </p>
                        </div>
                      </div>

                      {/* Progress bars */}
                      <div className="space-y-3 mb-4">
                        {/* Transferred progress */}
                        <div>
                          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                            <span className="flex items-center gap-1">
                              <Send className="h-3 w-3" />
                              Transferred
                            </span>
                            <span className="font-mono">
                              {formatBalance(
                                tl.tokensTransferred,
                                decimals,
                                4,
                              )}{' '}
                              ({transferredPct.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                              style={{
                                width: `${Math.min(transferredPct, 100)}%`,
                              }}
                            />
                          </div>
                        </div>

                        {/* Unlocked progress */}
                        <div>
                          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                            <span className="flex items-center gap-1">
                              <Unlock className="h-3 w-3" />
                              Unlocked
                            </span>
                            <span className="font-mono">
                              {formatBalance(
                                tl.unlockedAmount,
                                decimals,
                                4,
                              )}{' '}
                              ({unlockedPct.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                              style={{
                                width: `${Math.min(unlockedPct, 100)}%`,
                              }}
                            />
                          </div>
                        </div>

                        {/* Locked amount */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-gray-500">
                            <Lock className="h-3 w-3" />
                            Locked
                          </span>
                          <span className="font-mono text-gray-400">
                            {formatBalance(
                              tl.lockedAmount,
                              decimals,
                              4,
                            )}
                          </span>
                        </div>
                      </div>

                      {/* CancelableBy */}
                      {tl.cancelableBy.length > 0 && (
                        <div className="mb-4">
                          <p className="text-[10px] text-gray-600 mb-1">
                            Cancelable By:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {tl.cancelableBy.map((addr, i) => (
                              <span
                                key={i}
                                className={clsx(
                                  'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-mono',
                                  connectedAddress &&
                                    addr.toLowerCase() ===
                                      connectedAddress.toLowerCase()
                                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                    : 'bg-white/[0.03] text-gray-500 border border-white/[0.06]',
                                )}
                              >
                                {formatAddress(addr)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() =>
                              setCancelModal({
                                open: true,
                                timelockIndex: tl.index,
                                timelock: tl,
                              })
                            }
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Cancel
                          </button>
                        )}

                        {isLookupMyAddress &&
                          tl.unlockedAmount > tl.tokensTransferred && (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                value={
                                  transferringIndex === tl.index
                                    ? transferTo
                                    : ''
                                }
                                onChange={(e) => {
                                  setTransferringIndex(tl.index);
                                  setTransferTo(e.target.value);
                                }}
                                onFocus={() =>
                                  setTransferringIndex(tl.index)
                                }
                                placeholder="Transfer to 0x..."
                                className={clsx(
                                  INPUT_CLASS,
                                  'text-xs py-2',
                                )}
                              />
                              <input
                                type="text"
                                inputMode="decimal"
                                value={
                                  transferringIndex === tl.index
                                    ? transferAmount
                                    : ''
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                                    setTransferringIndex(tl.index);
                                    setTransferAmount(val);
                                  }
                                }}
                                onFocus={() =>
                                  setTransferringIndex(tl.index)
                                }
                                placeholder="Amount"
                                className={clsx(
                                  INPUT_CLASS,
                                  'text-xs py-2 w-32',
                                )}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleTransferTimelock(tl.index)
                                }
                                disabled={
                                  transferringIndex !== null &&
                                  transferringIndex !== tl.index
                                }
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors whitespace-nowrap disabled:opacity-50"
                              >
                                {transferringIndex === tl.index &&
                                transferringIndex !== null ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Send className="h-3.5 w-3.5" />
                                )}
                                Transfer
                              </button>
                            </div>
                          )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---- Cancel confirmation modal ------------------------------------- */}
      <Modal
        isOpen={cancelModal.open}
        onClose={() => {
          setCancelModal({
            open: false,
            timelockIndex: -1,
            timelock: null,
          });
          setReclaimTo('');
        }}
        title="Cancel Timelock"
        description="This will cancel the timelock and reclaim remaining locked tokens."
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setCancelModal({
                  open: false,
                  timelockIndex: -1,
                  timelock: null,
                });
                setReclaimTo('');
              }}
              className={BTN_SECONDARY}
            >
              Nevermind
            </button>
            <button
              type="button"
              onClick={handleCancelTimelock}
              disabled={cancelingIndex !== null}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-medium transition-colors"
            >
              {cancelingIndex !== null ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Canceling...
                </span>
              ) : (
                'Confirm Cancel'
              )}
            </button>
          </>
        }
      >
        {cancelModal.timelock && (
          <div className="space-y-4">
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Timelock Index</span>
                <span className="font-mono text-white">
                  #{cancelModal.timelockIndex}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Amount</span>
                <span className="font-mono text-white">
                  {formatBalance(
                    cancelModal.timelock.totalAmount,
                    decimals,
                    4,
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Already Transferred</span>
                <span className="font-mono text-emerald-400">
                  {formatBalance(
                    cancelModal.timelock.tokensTransferred,
                    decimals,
                    4,
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Locked (reclaimable)</span>
                <span className="font-mono text-amber-400">
                  {formatBalance(
                    cancelModal.timelock.lockedAmount,
                    decimals,
                    4,
                  )}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Reclaim Tokens To (leave blank for connected wallet)
              </label>
              <input
                type="text"
                value={reclaimTo}
                onChange={(e) => setReclaimTo(e.target.value)}
                placeholder={connectedAddress || '0x...'}
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              This action cannot be undone. Unlocked tokens that have not
              been transferred will remain with the holder.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
