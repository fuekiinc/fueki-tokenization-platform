/**
 * CreatePoolForm -- Create a new Orbital AMM multi-token pool.
 *
 * Allows the user to:
 *   1. Select 2-8 tokens for the pool
 *   2. Choose a concentration power (2, 4, 8, 16, 32)
 *   3. Choose a fee tier
 *   4. Set the LP token name and symbol
 *   5. Provide initial liquidity for all tokens
 *
 * Handles multi-token approval and pool creation in a single flow.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  Plus,
  X,
  Loader2,
  Check,
  AlertCircle,
  Orbit,
  Sparkles,
  Zap,
  Target,
  Focus,
  Info,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { OrbitalContractService } from '../../lib/blockchain/orbitalContracts';
import { parseContractError } from '../../lib/blockchain/contracts';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import { formatPercent } from '../../lib/formatters';
import logger from '../../lib/logger';
import HelpTooltip from '../Common/HelpTooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TxStatus = 'idle' | 'approving' | 'creating' | 'confirmed';

interface AvailableToken {
  address: string;
  symbol: string;
  name: string;
  balance: bigint;
}

interface SelectedToken {
  address: string;
  symbol: string;
  name: string;
  balance: bigint;
  initialAmount: string;
}

interface CreatePoolFormProps {
  contractService: OrbitalContractService | null;
  userAddress: string;
  tokenAddresses?: string[];
  onPoolCreated?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONCENTRATION_OPTIONS = [
  {
    value: 2,
    label: 'Broad (2x)',
    description: 'Wide liquidity spread. Best for volatile or uncorrelated token pairs.',
    icon: Sparkles,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    ringColor: 'ring-blue-500/20',
  },
  {
    value: 4,
    label: 'Standard (4x)',
    description: 'Balanced concentration. Good default for most pool types.',
    icon: Target,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    ringColor: 'ring-indigo-500/20',
  },
  {
    value: 8,
    label: 'Focused (8x)',
    description: 'Higher capital efficiency. Suited for correlated assets.',
    icon: Zap,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    ringColor: 'ring-purple-500/20',
  },
  {
    value: 16,
    label: 'Tight (16x)',
    description: 'High concentration near equilibrium. Best for stable pairs.',
    icon: Focus,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    ringColor: 'ring-cyan-500/20',
  },
  {
    value: 32,
    label: 'Ultra-Tight (32x)',
    description: 'Maximum capital efficiency. Only for tightly pegged assets.',
    icon: Orbit,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    ringColor: 'ring-emerald-500/20',
  },
];

const FEE_TIERS = [
  { bps: 10, label: '0.10%', description: 'Stablecoin pairs' },
  { bps: 30, label: '0.30%', description: 'Standard pools' },
  { bps: 50, label: '0.50%', description: 'Medium volatility' },
  { bps: 100, label: '1.00%', description: 'High volatility' },
];

const MIN_TOKENS = 2;
const MAX_TOKENS = 8;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreatePoolForm({
  contractService,
  userAddress,
  tokenAddresses,
  onPoolCreated,
}: CreatePoolFormProps) {
  // ---- Available tokens ------------------------------------------------------

  const [availableTokens, setAvailableTokens] = useState<AvailableToken[]>([]);
  const [, setLoadingTokens] = useState(false);

  // ---- Pool configuration ---------------------------------------------------

  const [selectedTokens, setSelectedTokens] = useState<SelectedToken[]>([]);
  const [concentration, setConcentration] = useState(4);
  const [feeBps, setFeeBps] = useState(30);
  const [poolName, setPoolName] = useState('');
  const [poolSymbol, setPoolSymbol] = useState('');

  // ---- Token picker ---------------------------------------------------------

  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [tokenSearch, setTokenSearch] = useState('');
  const [manualTokenAddress, setManualTokenAddress] = useState('');
  const [isAddingManualToken, setIsAddingManualToken] = useState(false);

  // ---- TX state -------------------------------------------------------------

  const [txStatus, setTxStatus] = useState<TxStatus>('idle');

  // ---- Wizard step state ---------------------------------------------------

  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);

  const WIZARD_STEPS = [
    { step: 1 as const, label: 'Tokens', description: 'Select pool tokens' },
    { step: 2 as const, label: 'Configuration', description: 'Set concentration and fees' },
    { step: 3 as const, label: 'Review & Create', description: 'Confirm and deploy' },
  ];

  // ---- Load available tokens ------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadTokens() {
      if (!contractService || !tokenAddresses || tokenAddresses.length === 0) {
        setAvailableTokens([]);
        return;
      }

      setLoadingTokens(true);
      const tokens: AvailableToken[] = [];

      await Promise.all(
        tokenAddresses.map(async (addr) => {
          try {
            const [tokenInfo, balance] = await Promise.all([
              contractService.getTokenInfo(addr),
              contractService.getTokenBalance(addr, userAddress),
            ]);
            tokens.push({
              address: addr,
              symbol: tokenInfo.symbol,
              name: tokenInfo.name,
              balance,
            });
          } catch (err) {
            logger.error(`Failed to load token ${addr}:`, err);
            // Still include with fallback data
            tokens.push({
              address: addr,
              symbol: formatAddress(addr),
              name: formatAddress(addr),
              balance: 0n,
            });
          }
        }),
      );

      if (!cancelled) {
        // Sort alphabetically by symbol
        tokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setAvailableTokens(tokens);
      }
    }

    void loadTokens();
    return () => {
      cancelled = true;
    };
  }, [contractService, tokenAddresses, userAddress]);

  // ---- Auto-generate pool name/symbol from selected tokens ------------------

  useEffect(() => {
    if (selectedTokens.length >= 2) {
      const symbols = selectedTokens.map((t) => t.symbol);
      const autoName = `Orbital ${symbols.join('-')} Pool`;
      const autoSymbol = `OLP-${symbols.join('-')}`;
      if (!poolName || poolName.startsWith('Orbital ')) setPoolName(autoName);
      if (!poolSymbol || poolSymbol.startsWith('OLP-')) setPoolSymbol(autoSymbol);
    }
  }, [selectedTokens.length]); // Only regenerate when count changes

  // ---- Filtered available tokens for picker ---------------------------------

  const filteredAvailable = useMemo(() => {
    const selectedAddrs = new Set(selectedTokens.map((t) => t.address.toLowerCase()));
    const q = tokenSearch.toLowerCase().trim();

    return availableTokens.filter((t) => {
      if (selectedAddrs.has(t.address.toLowerCase())) return false;
      if (!q) return true;
      return (
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
      );
    });
  }, [availableTokens, selectedTokens, tokenSearch]);

  // ---- Add / Remove tokens --------------------------------------------------

  const handleAddToken = useCallback((token: AvailableToken) => {
    if (selectedTokens.length >= MAX_TOKENS) return;
    setSelectedTokens((prev) => [
      ...prev,
      { ...token, initialAmount: '' },
    ]);
    setShowTokenPicker(false);
    setTokenSearch('');
  }, [selectedTokens.length]);

  const handleRemoveToken = useCallback((address: string) => {
    setSelectedTokens((prev) => prev.filter((t) => t.address !== address));
  }, []);

  const handleAmountChange = useCallback((address: string, value: string) => {
    if (!/^[0-9]*\.?[0-9]*$/.test(value)) return;
    setSelectedTokens((prev) =>
      prev.map((t) => (t.address === address ? { ...t, initialAmount: value } : t)),
    );
  }, []);

  const handleMaxAmount = useCallback((address: string) => {
    setSelectedTokens((prev) =>
      prev.map((t) =>
        t.address === address
          ? { ...t, initialAmount: ethers.formatUnits(t.balance, 18) }
          : t,
      ),
    );
  }, []);

  const handleAddTokenByAddress = useCallback(async () => {
    if (!contractService) return;
    const candidate = manualTokenAddress.trim();
    if (!candidate) {
      toast.error('Enter a token contract address.');
      return;
    }
    if (!ethers.isAddress(candidate)) {
      toast.error('Invalid token contract address.');
      return;
    }
    if (selectedTokens.length >= MAX_TOKENS) {
      toast.error(`You can add up to ${MAX_TOKENS} tokens.`);
      return;
    }
    if (selectedTokens.some((t) => t.address.toLowerCase() === candidate.toLowerCase())) {
      toast.error('Token is already in this pool.');
      return;
    }

    setIsAddingManualToken(true);
    try {
      const [tokenInfo, balance] = await Promise.all([
        contractService.getTokenInfo(candidate),
        contractService.getTokenBalance(candidate, userAddress),
      ]);

      setSelectedTokens((prev) => [
        ...prev,
        {
          address: candidate,
          symbol: tokenInfo.symbol || formatAddress(candidate),
          name: tokenInfo.name || 'Token',
          balance,
          initialAmount: '',
        },
      ]);
      setManualTokenAddress('');
      setShowTokenPicker(false);
      setTokenSearch('');
      toast.success(`Added ${tokenInfo.symbol || formatAddress(candidate)}`);
    } catch (err: unknown) {
      toast.error(`Unable to load token: ${parseContractError(err)}`);
    } finally {
      setIsAddingManualToken(false);
    }
  }, [contractService, manualTokenAddress, selectedTokens, userAddress]);

  // ---- Parsed amounts -------------------------------------------------------

  const parsedAmounts = useMemo(() => {
    return selectedTokens.map((t) => {
      try {
        if (!t.initialAmount || Number(t.initialAmount) <= 0) return 0n;
        return ethers.parseUnits(t.initialAmount, 18);
      } catch {
        return 0n;
      }
    });
  }, [selectedTokens]);

  const allAmountsPositive =
    parsedAmounts.length >= MIN_TOKENS && parsedAmounts.every((a) => a > 0n);

  // ---- Validation -----------------------------------------------------------

  const validationErrors: string[] = [];

  if (selectedTokens.length < MIN_TOKENS) {
    validationErrors.push(`Select at least ${MIN_TOKENS} tokens.`);
  }
  if (!poolName.trim()) {
    validationErrors.push('Pool name is required.');
  }
  if (!poolSymbol.trim()) {
    validationErrors.push('Pool symbol is required.');
  }
  if (!allAmountsPositive && selectedTokens.length >= MIN_TOKENS) {
    validationErrors.push('All tokens need initial liquidity amounts.');
  }

  // Check for duplicate addresses
  const addrSet = new Set<string>();
  for (const t of selectedTokens) {
    const lower = t.address.toLowerCase();
    if (addrSet.has(lower)) {
      validationErrors.push('Duplicate token detected.');
      break;
    }
    addrSet.add(lower);
  }

  // Check balances
  for (let i = 0; i < selectedTokens.length; i++) {
    const amount = parsedAmounts[i];
    if (amount > selectedTokens[i].balance) {
      validationErrors.push(
        `Insufficient ${selectedTokens[i].symbol} balance.`,
      );
    }
  }

  const isValid = validationErrors.length === 0 && selectedTokens.length >= MIN_TOKENS;

  // ---- Create pool ----------------------------------------------------------

  const handleCreatePool = useCallback(async () => {
    if (!contractService || !isValid) return;
    if (txStatus !== 'idle' && txStatus !== 'confirmed') return;

    const tokenAddrs = selectedTokens.map((t) => t.address);

    // 1. Approve all tokens for the router (needed for addLiquidity)
    if (allAmountsPositive) {
      setTxStatus('approving');
      const routerAddress = contractService.getRouterAddress();
      for (let i = 0; i < selectedTokens.length; i++) {
        const amount = parsedAmounts[i];
        if (amount <= 0n) continue;
        const token = selectedTokens[i];
        try {
          const allowance = await contractService.getTokenAllowance(
            token.address,
            userAddress,
            routerAddress,
          );
          if (allowance < amount) {
            toast.loading(`Approving ${token.symbol}...`, { id: `approve-create-${token.symbol}` });
            const approveTx = await contractService.approveRouter(token.address, amount);
            await contractService.waitForTransaction(approveTx);
            toast.success(`${token.symbol} approved`, { id: `approve-create-${token.symbol}` });
          }
        } catch (err: unknown) {
          toast.error(parseContractError(err));
          setTxStatus('idle');
          return;
        }
      }
    }

    // 2. Create the pool
    setTxStatus('creating');
    try {
      toast.loading('Creating Orbital pool...', { id: 'create-orbital' });
      const tx = await contractService.createPool(
        tokenAddrs,
        concentration,
        feeBps,
        poolName.trim(),
        poolSymbol.trim(),
      );
      await contractService.waitForTransaction(tx);
      toast.success('Orbital pool created!', { id: 'create-orbital' });

      // 3. Add initial liquidity if amounts were provided
      if (allAmountsPositive) {
        toast.loading('Adding initial liquidity...', { id: 'initial-liq' });
        try {
          // Look up the newly created pool address
          const newPoolAddress = await contractService.getPool(tokenAddrs, concentration);
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
          const liqTx = await contractService.addLiquidity(
            newPoolAddress,
            parsedAmounts,
            0n, // First deposit: no reference for minLiquidity
            deadline,
          );
          await contractService.waitForTransaction(liqTx);
          toast.success('Initial liquidity added!', { id: 'initial-liq' });
        } catch (liqErr: unknown) {
          toast.error(parseContractError(liqErr), { id: 'initial-liq' });
        }
      }

      setTxStatus('confirmed');
      onPoolCreated?.();
      setTimeout(() => setTxStatus('idle'), 3000);
    } catch (err: unknown) {
      toast.error(parseContractError(err), { id: 'create-orbital' });
      setTxStatus('idle');
    }
  }, [
    contractService,
    isValid,
    selectedTokens,
    parsedAmounts,
    allAmountsPositive,
    concentration,
    feeBps,
    poolName,
    poolSymbol,
    userAddress,
    txStatus,
    onPoolCreated,
  ]);

  // ---- Wizard navigation helpers -------------------------------------------

  const canAdvance = useMemo(() => {
    switch (wizardStep) {
      case 1:
        return selectedTokens.length >= MIN_TOKENS;
      case 2:
        return true; // concentration + fee always have defaults
      case 3:
        return isValid;
      default:
        return false;
    }
  }, [wizardStep, selectedTokens.length, isValid]);

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ---- Step Indicators ------------------------------------------------- */}
      <div className="flex items-center justify-between gap-2">
        {WIZARD_STEPS.map(({ step, label }, i) => (
          <div key={step} className="flex items-center flex-1 last:flex-initial">
            <button
              type="button"
              onClick={() => {
                // Only allow navigating to completed or current steps
                if (step <= wizardStep) setWizardStep(step);
              }}
              className={clsx(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all',
                'min-w-0',
                wizardStep === step
                  ? 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/25'
                  : step < wizardStep
                    ? 'bg-emerald-500/10 text-emerald-400 cursor-pointer hover:bg-emerald-500/15'
                    : 'bg-white/[0.02] text-gray-600',
              )}
            >
              <span
                className={clsx(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  wizardStep === step
                    ? 'bg-indigo-500/25 text-indigo-400'
                    : step < wizardStep
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-white/[0.06] text-gray-600',
                )}
              >
                {step < wizardStep ? <Check className="h-3 w-3" /> : step}
              </span>
              <span className="hidden sm:inline truncate">{label}</span>
            </button>
            {i < WIZARD_STEPS.length - 1 && (
              <div
                className={clsx(
                  'mx-2 h-px flex-1',
                  step < wizardStep ? 'bg-emerald-500/30' : 'bg-white/[0.06]',
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* ---- Step 1: Token Selection ----------------------------------------- */}
      {wizardStep === 1 && (
      <>
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Pool Tokens ({selectedTokens.length}/{MAX_TOKENS})
            <HelpTooltip
              tooltipId="pool.tokenPair"
              flow="pool"
              component="CreatePoolForm.StepTokens"
            />
          </div>
          <span className="text-[10px] text-gray-600">
            Min {MIN_TOKENS}, Max {MAX_TOKENS}
          </span>
        </div>
        <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] text-gray-500">
          Initial pool pricing is inferred from your first liquidity ratios.
          <HelpTooltip
            tooltipId="pool.initialPrice"
            flow="pool"
            component="CreatePoolForm.StepTokens"
          />
        </p>

        {/* Selected tokens list */}
        <div className="space-y-3">
          {selectedTokens.map((token, i) => (
            <div
              key={token.address}
              className={clsx(
                'rounded-xl p-4',
                'bg-[#0D0F14] border border-white/[0.06]',
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/10 text-[10px] font-bold text-indigo-400">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold text-white">{token.symbol}</span>
                  <span className="text-xs text-gray-500">{token.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveToken(token.address)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Initial amount"
                  value={token.initialAmount}
                  onChange={(e) => handleAmountChange(token.address, e.target.value)}
                  className={clsx(
                    'flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold text-white font-mono',
                    'bg-white/[0.03] border border-white/[0.04]',
                    'placeholder:text-gray-600',
                    'focus:border-white/[0.1] focus:outline-none',
                    'transition-all',
                  )}
                />
                {token.balance > 0n && (
                  <button
                    type="button"
                    onClick={() => handleMaxAmount(token.address)}
                    className="rounded bg-indigo-500/10 px-2 py-1 text-[10px] font-bold uppercase text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                  >
                    Max
                  </button>
                )}
              </div>

              <div className="mt-1.5 text-[11px] text-gray-500">
                Balance:{' '}
                <span className="font-mono text-gray-400">
                  {formatBalance(token.balance, 18, 6)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Add token button */}
        {selectedTokens.length < MAX_TOKENS && (
          <div className="relative mt-3">
            <button
              type="button"
              onClick={() => setShowTokenPicker(!showTokenPicker)}
              className={clsx(
                'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold',
                'border-2 border-dashed border-white/[0.08]',
                'text-gray-500 hover:text-gray-300 hover:border-white/[0.15]',
                'transition-all duration-200',
              )}
            >
              <Plus className="h-4 w-4" />
              Add Token
            </button>

            {/* Token picker dropdown */}
            {showTokenPicker && (
              <div
                className={clsx(
                  'absolute z-50 mt-2 w-full rounded-xl',
                  'bg-[#12141A] border border-white/[0.08]',
                  'shadow-2xl shadow-black/50',
                  'overflow-hidden',
                )}
              >
                {/* Search */}
                <div className="p-3 border-b border-white/[0.04]">
                  <input
                    type="text"
                    placeholder="Search tokens..."
                    value={tokenSearch}
                    onChange={(e) => setTokenSearch(e.target.value)}
                    autoFocus
                    className={clsx(
                      'w-full rounded-lg px-3 py-2 text-sm text-white',
                      'bg-white/[0.04] border border-white/[0.06]',
                      'placeholder:text-gray-600',
                      'focus:outline-none focus:border-white/[0.12]',
                    )}
                  />
                </div>

                {/* Token list */}
                <div className="max-h-48 overflow-y-auto py-1">
                  {filteredAvailable.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-gray-500">
                      No indexed tokens found. Paste a token address below.
                    </div>
                  ) : (
                    filteredAvailable.map((token) => (
                      <button
                        key={token.address}
                        type="button"
                        onClick={() => handleAddToken(token)}
                        className={clsx(
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm',
                          'hover:bg-white/[0.04] transition-colors',
                          'text-gray-300',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{token.symbol}</div>
                          <div className="text-[10px] text-gray-500 truncate">
                            {token.name}
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-gray-500">
                          {formatBalance(token.balance, 18, 4)}
                        </span>
                      </button>
                    ))
                  )}
                </div>

                {/* Manual token address fallback */}
                <div className="border-t border-white/[0.04] p-3 space-y-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-gray-600">
                    Add by address
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="0x..."
                      value={manualTokenAddress}
                      onChange={(e) => setManualTokenAddress(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleAddTokenByAddress();
                        }
                      }}
                      className={clsx(
                        'w-full rounded-lg px-3 py-2 text-xs font-mono text-white',
                        'bg-white/[0.04] border border-white/[0.06]',
                        'placeholder:text-gray-600',
                        'focus:outline-none focus:border-white/[0.12]',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddTokenByAddress()}
                      disabled={isAddingManualToken || selectedTokens.length >= MAX_TOKENS}
                      className={clsx(
                        'rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-wider',
                        'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/25',
                        'hover:bg-indigo-500/25 transition-colors',
                        'disabled:cursor-not-allowed disabled:opacity-40',
                      )}
                    >
                      {isAddingManualToken ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>

                {/* Close */}
                <div className="border-t border-white/[0.04] p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTokenPicker(false);
                      setTokenSearch('');
                    }}
                    className="w-full rounded-lg py-2 text-xs text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 1 navigation */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setWizardStep(2)}
          disabled={!canAdvance}
          className={clsx(
            'flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all',
            canAdvance
              ? 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 ring-1 ring-indigo-500/20'
              : 'bg-white/[0.02] text-gray-600 cursor-not-allowed',
          )}
        >
          Next: Configuration
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      </>
      )}

      {/* ---- Step 2: Configuration ------------------------------------------- */}
      {wizardStep === 2 && (
      <>
      {/* ---- Concentration Power --------------------------------------------- */}
      <div>
        <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Concentration Power
          <HelpTooltip
            tooltipId="orbital.concentration"
            flow="pool"
            component="CreatePoolForm.StepConfiguration"
          />
        </div>
        <div className="space-y-2">
          {CONCENTRATION_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = concentration === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setConcentration(opt.value)}
                className={clsx(
                  'flex w-full items-start gap-3.5 rounded-xl p-4 text-left transition-all duration-200',
                  selected
                    ? `${opt.bgColor} ring-1 ${opt.ringColor}`
                    : 'bg-[#0D0F14] border border-white/[0.06] hover:border-white/[0.12]',
                )}
              >
                <div
                  className={clsx(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    selected ? opt.bgColor : 'bg-white/[0.04]',
                  )}
                >
                  <Icon
                    className={clsx(
                      'h-4 w-4',
                      selected ? opt.color : 'text-gray-500',
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={clsx(
                      'text-sm font-semibold',
                      selected ? 'text-white' : 'text-gray-300',
                    )}
                  >
                    {opt.label}
                  </div>
                  <div
                    className={clsx(
                      'mt-0.5 text-xs leading-relaxed',
                      selected ? 'text-gray-300' : 'text-gray-500',
                    )}
                  >
                    {opt.description}
                  </div>
                </div>
                {selected && (
                  <div className={clsx('mt-1 shrink-0', opt.color)}>
                    <Check className="h-4 w-4" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] leading-relaxed text-gray-500">
          <Info className="h-3 w-3 shrink-0 text-gray-600" />
          Higher concentration focuses more liquidity near the equilibrium price, increasing capital efficiency.
        </p>

        {/* Visual concentration explanation */}
        <div className="mt-4 rounded-xl bg-[#0D0F14] border border-white/[0.06] p-4">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-3 block">
            Liquidity Distribution at {concentration}x
          </span>
          <div className="relative h-16 w-full rounded-lg bg-white/[0.02] overflow-hidden">
            {/* Background grid */}
            <div className="absolute inset-0 flex items-end justify-center">
              {Array.from({ length: 21 }).map((_, i) => {
                const center = 10;
                const dist = Math.abs(i - center);
                // Bell curve-like distribution, sharper with higher concentration
                const spread = Math.max(1, 12 / Math.sqrt(concentration));
                const heightPct = Math.max(5, 100 * Math.exp(-(dist * dist) / (2 * spread * spread)));
                return (
                  <div
                    key={i}
                    className="flex-1 mx-px"
                    style={{ height: `${heightPct}%` }}
                  >
                    <div
                      className={clsx(
                        'h-full w-full rounded-t-sm',
                        i === center
                          ? 'bg-indigo-400/40'
                          : dist <= spread
                            ? 'bg-indigo-500/20'
                            : 'bg-white/[0.03]',
                      )}
                    />
                  </div>
                );
              })}
            </div>
            {/* Center line label */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] text-gray-600 pb-0.5">
              equilibrium
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-gray-600">
            <span>Wide range</span>
            <span>Concentrated</span>
          </div>
        </div>
      </div>

      {/* ---- Fee Tier -------------------------------------------------------- */}
      <div>
        <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Fee Tier
          <HelpTooltip
            tooltipId="pool.feeTier"
            flow="pool"
            component="CreatePoolForm.StepConfiguration"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FEE_TIERS.map((tier) => {
            // Recommend fee tier based on concentration
            const recommended =
              (concentration >= 16 && tier.bps === 10) ||
              (concentration >= 8 && concentration < 16 && tier.bps === 30) ||
              (concentration >= 4 && concentration < 8 && tier.bps === 50) ||
              (concentration < 4 && tier.bps === 100);
            return (
              <button
                key={tier.bps}
                type="button"
                onClick={() => setFeeBps(tier.bps)}
                className={clsx(
                  'relative rounded-xl px-4 py-3.5 text-center transition-all duration-200',
                  feeBps === tier.bps
                    ? 'bg-indigo-500/15 ring-1 ring-indigo-500/30 text-indigo-400'
                    : 'bg-[#0D0F14] border border-white/[0.06] text-gray-400 hover:border-white/[0.12]',
                )}
              >
                {recommended && feeBps !== tier.bps && (
                  <span className="absolute -top-1.5 right-2 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-emerald-400 ring-1 ring-emerald-500/20">
                    Suggested
                  </span>
                )}
                <div className="text-sm font-bold font-mono">{tier.label}</div>
                <div className="mt-1 text-[10px] text-gray-500">{tier.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2 navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setWizardStep(1)}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-all"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back: Tokens
        </button>
        <button
          type="button"
          onClick={() => setWizardStep(3)}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-semibold bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 ring-1 ring-indigo-500/20 transition-all"
        >
          Next: Review
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      </>
      )}

      {/* ---- Step 3: Review & Create ----------------------------------------- */}
      {wizardStep === 3 && (
      <>
      {/* ---- LP Token Metadata ----------------------------------------------- */}
      <div>
        <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          LP Token Details
          <HelpTooltip
            tooltipId="pool.poolShare"
            flow="pool"
            component="CreatePoolForm.StepReview"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] text-gray-500">Name</label>
            <input
              type="text"
              placeholder="e.g. Orbital ETH-USDC Pool"
              value={poolName}
              onChange={(e) => setPoolName(e.target.value)}
              className={clsx(
                'w-full rounded-xl px-4 py-3 text-sm text-white',
                'bg-[#0D0F14] border border-white/[0.06]',
                'placeholder:text-gray-600',
                'focus:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-white/[0.08]',
                'transition-all',
              )}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] text-gray-500">Symbol</label>
            <input
              type="text"
              placeholder="e.g. OLP-ETH-USDC"
              value={poolSymbol}
              onChange={(e) => setPoolSymbol(e.target.value.toUpperCase())}
              className={clsx(
                'w-full rounded-xl px-4 py-3 text-sm font-mono text-white',
                'bg-[#0D0F14] border border-white/[0.06]',
                'placeholder:text-gray-600',
                'focus:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-white/[0.08]',
                'transition-all',
              )}
            />
          </div>
        </div>
      </div>

      {/* ---- Initial Liquidity (editable on review) ------------------------- */}
      {selectedTokens.length >= MIN_TOKENS && (
        <div>
          <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Initial Liquidity
            <HelpTooltip
              tooltipId="pool.initialPrice"
              flow="pool"
              component="CreatePoolForm.StepReview"
            />
          </div>
          <div className="space-y-2.5">
            {selectedTokens.map((token) => (
              <div
                key={`review-liq-${token.address}`}
                className="rounded-xl bg-[#0D0F14] border border-white/[0.06] p-3"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-300">
                    {token.symbol}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    Balance: {formatBalance(token.balance, 18, 6)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Initial amount"
                    value={token.initialAmount}
                    onChange={(e) => handleAmountChange(token.address, e.target.value)}
                    className={clsx(
                      'flex-1 rounded-lg px-3 py-2 text-xs font-mono text-white',
                      'bg-white/[0.03] border border-white/[0.04]',
                      'placeholder:text-gray-600',
                      'focus:border-white/[0.1] focus:outline-none',
                    )}
                  />
                  {token.balance > 0n && (
                    <button
                      type="button"
                      onClick={() => handleMaxAmount(token.address)}
                      className="rounded bg-indigo-500/10 px-2 py-1 text-[10px] font-bold uppercase text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                    >
                      Max
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Summary --------------------------------------------------------- */}
      {selectedTokens.length >= MIN_TOKENS && (
        <div className="rounded-xl bg-[#0D0F14]/80 border border-white/[0.06] p-4 space-y-2.5">
          <span className="text-xs font-semibold text-gray-400">Pool Summary</span>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Tokens</span>
            <span className="text-gray-300">
              {selectedTokens.map((t) => t.symbol).join(', ')}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Concentration</span>
            <span className="text-gray-300">
              {CONCENTRATION_OPTIONS.find((c) => c.value === concentration)?.label ?? `${concentration}x`}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Fee Tier</span>
            <span className="text-gray-300">
              {FEE_TIERS.find((f) => f.bps === feeBps)?.label ?? formatPercent(feeBps / 100)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">LP Token</span>
            <span className="font-mono text-gray-300">
              {poolName || '---'} ({poolSymbol || '---'})
            </span>
          </div>
        </div>
      )}

      {/* ---- Validation errors ----------------------------------------------- */}
      {validationErrors.length > 0 && selectedTokens.length > 0 && (
        <div className="space-y-1.5">
          {validationErrors.map((err, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs text-amber-400/80"
            >
              <AlertCircle className="h-3 w-3 shrink-0" />
              {err}
            </div>
          ))}
        </div>
      )}

      {/* ---- Info banner ------------------------------------------------------ */}
      <div className="flex items-start gap-2.5 rounded-xl bg-indigo-500/5 border border-indigo-500/10 px-4 py-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400/60" />
        <p className="text-[11px] leading-relaxed text-gray-400">
          Orbital AMM uses a power-mean invariant for concentrated multi-token
          liquidity. Higher concentration powers focus liquidity near
          equilibrium, increasing capital efficiency but requiring more frequent
          rebalancing for volatile pairs.
        </p>
        <HelpTooltip
          tooltipId="orbital.invariant"
          flow="pool"
          component="CreatePoolForm.StepReview"
          className="mt-0.5"
        />
      </div>

      {/* Step 3 back button */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setWizardStep(2)}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-all"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back: Configuration
        </button>
      </div>

      {/* ---- Create button --------------------------------------------------- */}
      <button
        type="button"
        onClick={handleCreatePool}
        disabled={
          !contractService ||
          !isValid ||
          (txStatus !== 'idle' && txStatus !== 'confirmed')
        }
        className={clsx(
          'flex w-full items-center justify-center gap-2.5 rounded-xl py-4 text-sm font-semibold transition-all',
          txStatus === 'confirmed'
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-[0_0_24px_rgba(99,102,241,0.15)] hover:shadow-[0_0_36px_rgba(99,102,241,0.25)]',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        {txStatus === 'approving' ? (
          <>
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
            Approving Tokens...
          </>
        ) : txStatus === 'creating' ? (
          <>
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
            Creating Pool...
          </>
        ) : txStatus === 'confirmed' ? (
          <>
            <Check className="h-4.5 w-4.5" />
            Pool Created!
          </>
        ) : (
          <>
            <Orbit className="h-4.5 w-4.5" />
            Create Orbital Pool
          </>
        )}
      </button>
      </>
      )}
    </div>
  );
}
