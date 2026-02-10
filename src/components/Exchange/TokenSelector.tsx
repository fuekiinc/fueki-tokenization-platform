/**
 * TokenSelector -- glass-morphism dropdown for choosing a wrapped asset token.
 *
 * Uses a React Portal so the dropdown menu renders directly in document.body,
 * escaping all parent overflow/stacking-context clipping. The dropdown is
 * positioned dynamically relative to the trigger button.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Search } from 'lucide-react';
import clsx from 'clsx';
import type { WrappedAsset } from '../../types';
import { formatAddress, formatBalance } from '../../lib/utils/helpers';
import { ETH_SENTINEL, isETH } from '../../lib/blockchain/contracts';

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

  const selectedAsset = allEntries.find((a) => a.address === selectedToken) ?? null;

  const filtered = allEntries.filter((asset) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      asset.name.toLowerCase().includes(q) ||
      asset.symbol.toLowerCase().includes(q) ||
      asset.address.toLowerCase().includes(q)
    );
  });

  // ---- Position the portal dropdown relative to the trigger ----------------

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 8 + window.scrollY,
      left: rect.left + window.scrollX,
      width: Math.max(rect.width, 340),
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
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // ---- Handlers -----------------------------------------------------------

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    setSearch('');
  }, []);

  const handleSelect = useCallback(
    (address: string) => {
      onSelect(address);
      setIsOpen(false);
      setSearch('');
    },
    [onSelect],
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
                placeholder="Search name, symbol, or address..."
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
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-500 transition-colors hover:text-gray-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Token list */}
          <div className="max-h-72 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04]">
                  <Search className="h-4 w-4 text-gray-600" />
                </div>
                <p className="text-sm text-gray-500">No tokens available</p>
                {search && (
                  <p className="mt-1 text-xs text-gray-600">
                    Try a different search term
                  </p>
                )}
              </div>
            ) : (
              filtered.map((asset) => {
                const isSelected = asset.address === selectedToken;
                const isEthEntry = isETH(asset.address);
                return (
                  <button
                    key={asset.address}
                    type="button"
                    onClick={() => handleSelect(asset.address)}
                    className={clsx(
                      'flex w-full items-center gap-3.5 px-4 py-3.5 text-left text-sm transition-colors',
                      isSelected
                        ? 'bg-white/[0.06] text-white'
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
                          isSelected
                            ? tokenColor(asset.symbol)
                            : 'from-gray-600 to-gray-700',
                        )}
                      >
                        {asset.symbol.slice(0, 2)}
                      </span>
                    )}

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{asset.symbol}</span>
                        <span className="truncate text-xs text-gray-500">
                          {asset.name}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-gray-600">
                        {isEthEntry ? 'Native ETH' : formatAddress(asset.address)}
                      </div>
                    </div>

                    {/* Balance */}
                    <div className="ml-auto shrink-0 text-right">
                      <span className="font-mono text-xs text-gray-400">
                        {formatBalance(asset.balance, 18, 4)}
                      </span>
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

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={clsx(
          'flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm transition-all duration-200',
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
