/**
 * TokenSelector -- glass-morphism dropdown for choosing a wrapped asset token.
 *
 * Uses a React Portal so the dropdown menu renders directly in document.body,
 * escaping all parent overflow/stacking-context clipping. The dropdown is
 * positioned dynamically relative to the trigger button.
 *
 * Features:
 *   - Contract address search (paste a 0x address to look up unknown tokens)
 *   - Recent selections persisted in localStorage (last 5)
 *   - Balance display per token (grayed out for zero balance)
 *   - Verification badges for known vs. address-searched tokens
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Loader2, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { ethers } from 'ethers';
import type { WrappedAsset } from '../../types';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import { ETH_SENTINEL, isETH } from '../../lib/blockchain/contracts';
import { useWalletStore } from '../../store/walletStore';
import { DEFAULT_CHAIN_ID } from '../../contracts/addresses';
import {
  getPrimaryRpcUrl,
  getRpcEndpoints,
  reportRpcEndpointFailure,
  reportRpcEndpointSuccess,
} from '../../lib/rpc/endpoints';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENT_TOKENS_KEY = 'fueki-recent-tokens';
const MAX_RECENT_TOKENS = 5;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TokenSelectorProps {
  assets: WrappedAsset[];
  selectedToken: string | null;
  onSelect: (address: string) => void;
  label: string;
  /** When true, include "ETH" as a selectable option with the sentinel address. */
  includeETH?: boolean;
  /** The user's native ETH balance (wei as string) for display. */
  ethBalance?: string;
}

// ---------------------------------------------------------------------------
// Deterministic colour for token avatar circles
// ---------------------------------------------------------------------------

const TOKEN_COLORS = [
  'from-blue-500 to-blue-600',
  'from-violet-500 to-violet-600',
  'from-emerald-500 to-emerald-600',
  'from-amber-500 to-amber-600',
  'from-rose-500 to-rose-600',
  'from-cyan-500 to-cyan-600',
  'from-fuchsia-500 to-fuchsia-600',
  'from-teal-500 to-teal-600',
];

function tokenColor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TOKEN_COLORS[Math.abs(hash) % TOKEN_COLORS.length];
}

// ---------------------------------------------------------------------------
// Recent tokens helpers (localStorage)
// ---------------------------------------------------------------------------

interface RecentTokenEntry {
  address: string;
  symbol: string;
  name: string;
}

function loadRecentTokens(): RecentTokenEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_TOKENS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_RECENT_TOKENS);
  } catch {
    return [];
  }
}

function saveRecentToken(entry: RecentTokenEntry): void {
  try {
    const existing = loadRecentTokens();
    // Remove duplicate if present, then prepend
    const filtered = existing.filter(
      (t) => t.address.toLowerCase() !== entry.address.toLowerCase(),
    );
    const updated = [entry, ...filtered].slice(0, MAX_RECENT_TOKENS);
    localStorage.setItem(RECENT_TOKENS_KEY, JSON.stringify(updated));
  } catch {
    // localStorage may be unavailable; silently ignore
  }
}

// ---------------------------------------------------------------------------
// Address detection helper
// ---------------------------------------------------------------------------

function isEthereumAddress(input: string): boolean {
  const trimmed = input.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TokenSelector({
  assets,
  selectedToken,
  onSelect,
  label,
  includeETH = false,
  ethBalance = '0',
}: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  // Recent tokens state
  const [recentTokens, setRecentTokens] = useState<RecentTokenEntry[]>([]);

  // Contract address search state
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const [addressSearchResult, setAddressSearchResult] = useState<WrappedAsset | null>(null);
  const [addressSearchError, setAddressSearchError] = useState<string | null>(null);

  // Wallet connection state for balance display
  const isConnected = useWalletStore((s) => s.wallet.isConnected);
  const chainId = useWalletStore((s) => s.wallet.chainId);

  // Load recent tokens when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setRecentTokens(loadRecentTokens());
    }
  }, [isOpen]);

  // ---- Derived state ------------------------------------------------------

  const ethEntry: WrappedAsset | null = useMemo(() => {
    if (!includeETH) return null;
    return {
      address: ETH_SENTINEL,
      name: 'Ether',
      symbol: 'ETH',
      totalSupply: '0',
      balance: ethBalance,
      documentHash: '',
      documentType: '',
      originalValue: '0',
    };
  }, [includeETH, ethBalance]);

  const allEntries = useMemo(() => {
    if (!ethEntry) return assets;
    return [ethEntry, ...assets];
  }, [ethEntry, assets]);

  // Set of known (verified) token addresses for badge display
  const knownAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const a of allEntries) {
      set.add(a.address.toLowerCase());
    }
    return set;
  }, [allEntries]);

  const selectedAsset = allEntries.find((a) => a.address === selectedToken) ?? null;

  // Determine if the search looks like an Ethereum address
  const searchIsAddress = useMemo(() => isEthereumAddress(search), [search]);

  const filtered = useMemo(() => {
    // If searching by address, and a result was found that is NOT already in the list, append it
    const base = allEntries.filter((asset) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        asset.name.toLowerCase().includes(q) ||
        asset.symbol.toLowerCase().includes(q) ||
        asset.address.toLowerCase().includes(q)
      );
    });

    // If the address search result exists and is not already in the filtered list, append it
    if (
      addressSearchResult &&
      !base.some(
        (a) => a.address.toLowerCase() === addressSearchResult.address.toLowerCase(),
      )
    ) {
      return [...base, addressSearchResult];
    }

    return base;
  }, [allEntries, search, addressSearchResult]);

  // ---- Contract address search effect ------------------------------------

  useEffect(() => {
    if (!searchIsAddress) {
      setAddressSearchResult(null);
      setAddressSearchError(null);
      setAddressSearchLoading(false);
      return;
    }

    const address = search.trim();

    // Check if the address is already known
    if (knownAddresses.has(address.toLowerCase())) {
      setAddressSearchResult(null);
      setAddressSearchError(null);
      setAddressSearchLoading(false);
      return;
    }

    // Validate with ethers
    if (!ethers.isAddress(address)) {
      setAddressSearchResult(null);
      setAddressSearchError('Invalid Ethereum address');
      setAddressSearchLoading(false);
      return;
    }

    let cancelled = false;
    setAddressSearchLoading(true);
    setAddressSearchError(null);
    setAddressSearchResult(null);

    // Attempt to read token name + symbol from the contract via a generic
    // ERC-20 ABI. This is a best-effort lookup -- if the address is not an
    // ERC-20 contract the calls will fail and we show an error.
    const minimalERC20ABI = [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
    ];

    async function readTokenMetadata(provider: ethers.Provider): Promise<{ name: string; symbol: string }> {
      const contract = new ethers.Contract(address, minimalERC20ABI, provider);
      const [name, symbol] = await Promise.all([
        contract.name() as Promise<string>,
        contract.symbol() as Promise<string>,
      ]);
      return { name, symbol };
    }

    async function lookupToken() {
      try {
        // Use the injected provider when available; otherwise use a chain-aware
        // RPC endpoint instead of ethers.getDefaultProvider (which can hit the wrong chain).
        let name = 'Unknown Token';
        let symbol = '???';

        if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).ethereum) {
          const provider = new ethers.BrowserProvider(
            (window as unknown as Record<string, unknown>).ethereum as ethers.Eip1193Provider,
          );
          const result = await readTokenMetadata(provider);
          name = result.name || 'Unknown Token';
          symbol = result.symbol || '???';
        } else {
          const fallbackChainId = chainId ?? DEFAULT_CHAIN_ID;
          const endpoints = getRpcEndpoints(fallbackChainId);
          const primaryEndpoint = getPrimaryRpcUrl(fallbackChainId);
          const orderedEndpoints = [
            primaryEndpoint,
            ...endpoints.filter((url) => url !== primaryEndpoint),
          ];

          let lastError: unknown;
          let resolved = false;

          for (const endpoint of orderedEndpoints) {
            try {
              const provider = new ethers.JsonRpcProvider(endpoint);
              const result = await readTokenMetadata(provider);
              reportRpcEndpointSuccess(fallbackChainId, endpoint);
              name = result.name || 'Unknown Token';
              symbol = result.symbol || '???';
              resolved = true;
              break;
            } catch (error) {
              reportRpcEndpointFailure(fallbackChainId, endpoint);
              lastError = error;
            }
          }

          if (!resolved) {
            throw lastError ?? new Error('Unable to query token metadata from configured RPC endpoints');
          }
        }

        if (cancelled) return;

        setAddressSearchResult({
          address,
          name,
          symbol,
          totalSupply: '0',
          balance: '0',
          documentHash: '',
          documentType: '',
          originalValue: '0',
        });
        setAddressSearchError(null);
      } catch {
        if (cancelled) return;
        setAddressSearchResult(null);
        setAddressSearchError('Could not find a valid ERC-20 token at this address');
      } finally {
        if (!cancelled) setAddressSearchLoading(false);
      }
    }

    // Debounce the lookup slightly
    const timer = setTimeout(() => void lookupToken(), 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, searchIsAddress, knownAddresses, chainId]);

  // ---- Position the portal dropdown relative to the trigger ----------------

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // On mobile (< 640px), use nearly full viewport width for the dropdown
    const isMobile = window.innerWidth < 640;
    const dropdownWidth = isMobile
      ? Math.min(window.innerWidth - 32, 400)
      : Math.max(rect.width, 340);
    const dropdownLeft = isMobile
      ? 16 + window.scrollX
      : rect.left + window.scrollX;
    setDropdownPos({
      top: rect.bottom + 8 + window.scrollY,
      left: dropdownLeft,
      width: dropdownWidth,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  // ---- Close on outside click or Escape key --------------------------------

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // ---- Focus search on open -----------------------------------------------

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // preventScroll stops the browser from scrolling to the portal-rendered
      // dropdown element when the search input receives focus.
      searchInputRef.current.focus({ preventScroll: true });
    }
  }, [isOpen]);

  // ---- Handlers -----------------------------------------------------------

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    setSearch('');
    setAddressSearchResult(null);
    setAddressSearchError(null);
  }, []);

  const handleSelect = useCallback(
    (address: string) => {
      // Find the asset to record in recent tokens
      const asset =
        allEntries.find((a) => a.address === address) ??
        (addressSearchResult?.address === address ? addressSearchResult : null);

      if (asset) {
        saveRecentToken({
          address: asset.address,
          symbol: asset.symbol,
          name: asset.name,
        });
      }

      onSelect(address);
      setIsOpen(false);
      setSearch('');
      setAddressSearchResult(null);
      setAddressSearchError(null);
    },
    [onSelect, allEntries, addressSearchResult],
  );

  const handleRecentSelect = useCallback(
    (address: string) => {
      handleSelect(address);
    },
    [handleSelect],
  );

  // ---- Helpers: is a token verified (known) or unverified -----------------

  const isVerified = useCallback(
    (address: string): boolean => {
      return knownAddresses.has(address.toLowerCase());
    },
    [knownAddresses],
  );

  // ---- Render helpers for balance -----------------------------------------

  const renderBalance = useCallback(
    (asset: WrappedAsset) => {
      if (!isConnected) {
        return (
          <span className="font-mono text-xs text-gray-600">
            Balance: --
          </span>
        );
      }
      const balStr = formatBalance(asset.balance, 18, 4);
      const isZero = balStr === '0.0000' || parseFloat(balStr) === 0;
      return (
        <span
          className={clsx(
            'font-mono text-xs',
            isZero ? 'text-gray-600' : 'text-gray-400',
          )}
        >
          {balStr}
        </span>
      );
    },
    [isConnected],
  );

  // ---- Portal dropdown content --------------------------------------------

  const dropdownContent = isOpen
    ? createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
          }}
          className={clsx(
            'rounded-xl',
            'bg-[#0D0F14]/95 backdrop-blur-2xl',
            'border border-white/[0.08]',
            'shadow-[0_16px_48px_rgba(0,0,0,0.6)]',
          )}
        >
          {/* Search input */}
          <div className="border-b border-white/[0.06] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search name, symbol, or paste address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={clsx(
                  'w-full rounded-lg py-3 pl-10 pr-8 text-sm text-gray-200',
                  'bg-[#0D0F14] border border-white/[0.06]',
                  'placeholder:text-gray-600',
                  'focus:border-white/[0.12] focus:outline-none focus:ring-1 focus:ring-white/[0.08]',
                )}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setAddressSearchResult(null);
                    setAddressSearchError(null);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-500 transition-colors hover:text-gray-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Address search loading indicator */}
          {searchIsAddress && addressSearchLoading && (
            <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
              <span className="text-xs text-gray-400">Searching by address...</span>
            </div>
          )}

          {/* Address search error */}
          {searchIsAddress && addressSearchError && !addressSearchLoading && (
            <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400/70" />
              <span className="text-xs text-amber-400/70">{addressSearchError}</span>
            </div>
          )}

          {/* Recent tokens section -- shown when search is empty */}
          {!search && recentTokens.length > 0 && (
            <div className="border-b border-white/[0.06] px-4 py-3">
              <div className="mb-2.5 flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-gray-600" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-600">
                  Recent
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentTokens.map((recent) => (
                  <button
                    key={recent.address}
                    type="button"
                    onClick={() => handleRecentSelect(recent.address)}
                    className={clsx(
                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-all duration-150',
                      'bg-white/[0.04] border border-white/[0.06]',
                      'text-gray-400 hover:text-white hover:bg-white/[0.08] hover:border-white/[0.10]',
                      recent.address === selectedToken &&
                        'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
                    )}
                  >
                    <span
                      className={clsx(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[8px] font-bold text-white',
                        isETH(recent.address)
                          ? 'from-blue-400 to-indigo-500'
                          : tokenColor(recent.symbol),
                      )}
                    >
                      {isETH(recent.address) ? 'E' : recent.symbol.slice(0, 1)}
                    </span>
                    <span className="font-semibold">{recent.symbol}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Token list */}
          <div role="listbox" aria-label={`${label} options`} className="max-h-72 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {filtered.length === 0 && !addressSearchLoading ? (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04]">
                  <Search className="h-4 w-4 text-gray-600" />
                </div>
                <p className="text-sm text-gray-500">No tokens available</p>
                {search && !searchIsAddress && (
                  <p className="mt-1 text-xs text-gray-600">
                    Try a different search term
                  </p>
                )}
                {search && searchIsAddress && (
                  <p className="mt-1 text-xs text-gray-600">
                    Paste a valid token contract address to search on-chain
                  </p>
                )}
              </div>
            ) : (
              filtered.map((asset) => {
                const isSelected = asset.address === selectedToken;
                const isEthEntry = isETH(asset.address);
                const verified = isVerified(asset.address);
                const isFromAddressSearch =
                  addressSearchResult?.address.toLowerCase() ===
                  asset.address.toLowerCase();
                const balStr = formatBalance(asset.balance, 18, 4);
                const hasZeroBalance =
                  isConnected && (balStr === '0.0000' || parseFloat(balStr) === 0);

                return (
                  <button
                    key={asset.address}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(asset.address)}
                    className={clsx(
                      'flex w-full items-center gap-3 sm:gap-3.5 px-4 py-3.5 text-left text-sm transition-colors',
                      'min-h-[44px]',
                      isSelected
                        ? 'bg-white/[0.06] text-white'
                        : hasZeroBalance
                          ? 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'
                          : 'text-gray-300 hover:bg-white/[0.04] hover:text-white',
                    )}
                  >
                    {/* Token avatar */}
                    {isEthEntry ? (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-xs font-bold text-white">
                        E
                      </span>
                    ) : (
                      <span
                        className={clsx(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white',
                          isSelected || !hasZeroBalance
                            ? tokenColor(asset.symbol)
                            : 'from-gray-600 to-gray-700',
                        )}
                      >
                        {asset.symbol.slice(0, 2)}
                      </span>
                    )}

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{asset.symbol}</span>
                        {/* Verification badge */}
                        {verified && !isFromAddressSearch ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-400" aria-label="Verified token" />
                        ) : isFromAddressSearch ? (
                          <span className="flex items-center gap-0.5" title="Unverified - found by address">
                            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400/70" />
                          </span>
                        ) : null}
                        <span className="truncate text-xs text-gray-500">
                          {asset.name}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-gray-600">
                          {isEthEntry ? 'Native ETH' : formatAddress(asset.address)}
                        </span>
                        {isFromAddressSearch && (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-400/70 border border-amber-500/20">
                            Not verified
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Balance */}
                    <div className="ml-auto shrink-0 text-right">
                      {renderBalance(asset)}
                    </div>

                    {/* Selected indicator */}
                    {isSelected && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  // ---- Render -------------------------------------------------------------

  return (
    <div className="relative">
      {/* Label */}
      <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-gray-500">
        {label}
      </label>

      {/* Trigger button -- 44px min height for touch target */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`${label}: ${selectedAsset ? selectedAsset.symbol : 'Select token'}`}
        className={clsx(
          'flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm transition-all duration-200',
          'min-h-[44px]',
          'bg-[#0D0F14]/80 backdrop-blur-xl',
          'border border-white/[0.06]',
          'hover:border-white/[0.12] hover:bg-[#0D0F14]',
          'focus:outline-none focus:ring-1 focus:ring-white/[0.12]',
        )}
      >
        {selectedAsset ? (
          <div className="flex items-center gap-3 overflow-hidden">
            {isETH(selectedAsset.address) ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-[10px] font-bold text-white">
                E
              </span>
            ) : (
              <span
                className={clsx(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white',
                  tokenColor(selectedAsset.symbol),
                )}
              >
                {selectedAsset.symbol.slice(0, 2)}
              </span>
            )}
            <span className="truncate font-semibold text-white">
              {selectedAsset.symbol}
            </span>
            {/* Verification indicator in trigger */}
            {isVerified(selectedAsset.address) ? (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-blue-400" />
            ) : null}
            <span className="truncate font-mono text-[11px] text-gray-500">
              {isETH(selectedAsset.address)
                ? 'Native'
                : formatAddress(selectedAsset.address)}
            </span>
          </div>
        ) : (
          <span className="text-gray-500">Select token</span>
        )}
        <ChevronDown
          className={clsx(
            'h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown via portal -- renders in document.body, never clipped */}
      {dropdownContent}
    </div>
  );
}
