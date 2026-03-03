/**
 * TokenSelector -- Dropdown for selecting which security token to manage.
 *
 * Lists all security tokens the connected wallet has deployed (via the
 * SecurityTokenFactory) and allows switching between them. Includes a
 * "Deploy New Token" link to the deploy page.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ethers } from 'ethers';
import clsx from 'clsx';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Shield,
} from 'lucide-react';
import { SecurityTokenFactoryABI } from '../../contracts/abis/SecurityTokenFactory';
import { getProvider, useWalletStore } from '../../store/walletStore';
import { getNetworkConfig } from '../../contracts/addresses';
import { truncateAddress } from '../../lib/formatters';
import { parseContractError } from '../../lib/blockchain/contracts';
import { retryAsync } from '../../lib/utils/retry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
}

interface TokenSelectorProps {
  selectedToken: string | null;
  onSelectToken: (address: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TokenSelector({
  selectedToken,
  onSelectToken,
}: TokenSelectorProps) {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const address = useWalletStore((s) => s.wallet.address);
  const chainId = useWalletStore((s) => s.wallet.chainId);

  // -----------------------------------------------------------------------
  // Fetch user tokens from the factory
  // -----------------------------------------------------------------------

  const fetchTokens = useCallback(async () => {
    if (!address || !chainId) {
      setTokens([]);
      setLoading(false);
      return;
    }

    const provider = getProvider();
    if (!provider) {
      setTokens([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const config = getNetworkConfig(chainId);
      if (!config?.securityTokenFactoryAddress) {
        setTokens([]);
        setLoading(false);
        return;
      }

      const factory = new ethers.Contract(
        config.securityTokenFactoryAddress,
        SecurityTokenFactoryABI,
        provider,
      );

      const tokenAddresses: string[] = await retryAsync(
        () => factory.getUserTokens(address) as Promise<string[]>,
        { maxAttempts: 3, baseDelayMs: 1_500, label: 'securityToken:getUserTokens' },
      );

      if (tokenAddresses.length === 0) {
        setTokens([]);
        setLoading(false);
        return;
      }

      // Fetch name and symbol for each token in parallel
      const tokenInfoPromises = tokenAddresses.map(async (addr) => {
        try {
          const details = await factory.getTokenDetails(addr);
          return {
            address: addr,
            name: details.name || 'Unknown Token',
            symbol: details.symbol || '???',
          } satisfies TokenInfo;
        } catch {
          return {
            address: addr,
            name: 'Unknown Token',
            symbol: '???',
          } satisfies TokenInfo;
        }
      });

      const resolved = await Promise.all(tokenInfoPromises);
      setTokens(resolved);

      // Auto-select the first token if nothing is selected
      if (!selectedToken && resolved.length > 0) {
        onSelectToken(resolved[0].address);
      }
    } catch (err) {
      const isNetwork =
        err instanceof Error &&
        /network|timeout|fetch|rpc|connect|server/i.test(err.message);
      setError(
        isNetwork
          ? 'Network error — unable to reach the RPC node. Please try again in a moment.'
          : parseContractError(err),
      );
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }, [address, chainId, selectedToken, onSelectToken]);

  useEffect(() => {
    void fetchTokens();
  }, [fetchTokens]);

  // -----------------------------------------------------------------------
  // Close dropdown on outside click
  // -----------------------------------------------------------------------

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  const selectedInfo = tokens.find((t) => t.address === selectedToken);

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
        <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" aria-hidden="true" />
        <span className="text-sm text-gray-400">Loading tokens...</span>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
        <AlertCircle className="h-4 w-4 text-red-400 shrink-0" aria-hidden="true" />
        <span className="text-sm text-red-300">{error}</span>
        <button
          type="button"
          onClick={() => void fetchTokens()}
          className="ml-auto text-xs text-red-400 hover:text-red-300 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // No tokens state
  // -----------------------------------------------------------------------

  if (tokens.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-[#0D0F14]/80 border border-white/[0.06] p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/[0.08]">
          <Shield className="h-6 w-6 text-indigo-400" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">No Security Tokens</p>
          <p className="text-xs text-gray-500 mt-1">
            You have not deployed any security tokens yet.
          </p>
        </div>
        <Link
          to="/security-tokens/deploy"
          className={clsx(
            'inline-flex items-center gap-2 rounded-xl px-5 py-2.5',
            'text-sm font-medium text-white',
            'bg-indigo-600 hover:bg-indigo-500',
            'transition-colors duration-200',
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Deploy New Token
        </Link>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Single token (no dropdown needed)
  // -----------------------------------------------------------------------

  if (tokens.length === 1) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3 flex-1 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 shrink-0">
            <Shield className="h-4 w-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">
              {selectedInfo?.name ?? tokens[0].name}
            </p>
            <p className="text-xs text-gray-500 font-mono">
              {selectedInfo?.symbol ?? tokens[0].symbol} -- {truncateAddress(tokens[0].address)}
            </p>
          </div>
        </div>
        <Link
          to="/security-tokens/deploy"
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-xl shrink-0',
            'bg-white/[0.03] border border-white/[0.06]',
            'text-gray-400 hover:text-white hover:border-white/[0.12]',
            'transition-all duration-200',
          )}
          title="Deploy New Token"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Multi-token dropdown
  // -----------------------------------------------------------------------

  return (
    <div className="relative flex items-center gap-3" ref={dropdownRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-3 rounded-xl px-4 py-3 flex-1 min-w-0',
          'bg-white/[0.03] border border-white/[0.06]',
          'hover:border-white/[0.12] transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
          isOpen && 'border-indigo-500/40',
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 shrink-0">
          <Shield className="h-4 w-4 text-indigo-400" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-medium text-white truncate">
            {selectedInfo?.name ?? 'Select Token'}
          </p>
          {selectedInfo && (
            <p className="text-xs text-gray-500 font-mono">
              {selectedInfo.symbol} -- {truncateAddress(selectedInfo.address)}
            </p>
          )}
        </div>
        <ChevronDown
          className={clsx(
            'h-4 w-4 text-gray-400 shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {/* Deploy new token button */}
      <Link
        to="/security-tokens/deploy"
        className={clsx(
          'flex h-10 w-10 items-center justify-center rounded-xl shrink-0',
          'bg-white/[0.03] border border-white/[0.06]',
          'text-gray-400 hover:text-white hover:border-white/[0.12]',
          'transition-all duration-200',
        )}
        title="Deploy New Token"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </Link>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Security tokens"
          className={clsx(
            'absolute left-0 right-10 top-full mt-2 z-50',
            'rounded-xl overflow-hidden',
            'bg-[#0D0F14]/95 backdrop-blur-xl',
            'border border-white/[0.08]',
            'shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)]',
            'max-h-64 overflow-y-auto',
          )}
        >
          {tokens.map((token) => {
            const isSelected = token.address === selectedToken;
            return (
              <button
                key={token.address}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onSelectToken(token.address);
                  setIsOpen(false);
                }}
                className={clsx(
                  'flex items-center gap-3 w-full px-4 py-3 text-left',
                  'transition-colors duration-150',
                  isSelected
                    ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500'
                    : 'hover:bg-white/[0.04] border-l-2 border-l-transparent',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={clsx(
                      'text-sm font-medium truncate',
                      isSelected ? 'text-white' : 'text-gray-300',
                    )}
                  >
                    {token.name}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    {token.symbol} -- {truncateAddress(token.address)}
                  </p>
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 text-indigo-400 shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
