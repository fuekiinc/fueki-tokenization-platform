/**
 * WriteFunction -- renders a single state-changing (nonpayable/payable) contract function.
 *
 * Displays a collapsible accordion with typed input fields, an optional ETH
 * value input for payable functions, an "Execute" button, and transaction
 * status feedback including a block explorer link.
 *
 * Uses the module-level `getSigner()` from walletStore to send transactions.
 */

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import type { ABIFunction, ABIParam } from '../../types/contractDeployer';
import { getSigner } from '../../store/walletStore';
import { useWalletStore } from '../../store/walletStore';
import { SUPPORTED_NETWORKS } from '../../contracts/addresses';
import { INPUT_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  func: ABIFunction;
  contractAddress: string;
  abi: readonly Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the label for a function parameter input. */
function paramLabel(param: ABIParam, index: number): string {
  const name = param.name || `param${index}`;
  return `${name} (${param.type})`;
}

/** Build an explorer URL for a transaction hash on the given chain. */
function getExplorerTxUrl(chainId: number | null, txHash: string): string | null {
  if (!chainId) return null;
  const network = SUPPORTED_NETWORKS[chainId];
  if (!network?.blockExplorer) return null;
  return `${network.blockExplorer}/tx/${txHash}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WriteFunction({ func, contractAddress, abi }: Props) {
  const chainId = useWalletStore((s) => s.wallet.chainId);

  const [isOpen, setIsOpen] = useState(false);
  const [args, setArgs] = useState<string[]>(() => func.inputs.map(() => ''));
  const [ethValue, setEthValue] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPayable = func.stateMutability === 'payable';

  const handleArgChange = useCallback((index: number, value: string) => {
    setArgs((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleExecute = useCallback(async () => {
    setError(null);
    setTxHash(null);
    setIsLoading(true);

    try {
      const signer = getSigner();
      if (!signer) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }

      const contract = new ethers.Contract(contractAddress, abi as ethers.InterfaceAbi, signer);

      // Encode arguments according to their types
      const encodedArgs = func.inputs.map((input, i) => encodeArg(args[i], input.type));

      // Build transaction overrides for payable functions
      const overrides: Record<string, unknown> = {};
      if (isPayable && ethValue.trim()) {
        overrides.value = ethers.parseEther(ethValue.trim());
      }

      const tx = await contract[func.name](...encodedArgs, overrides);
      setTxHash(tx.hash);

      // Wait for one confirmation so the user sees the tx is mined
      await tx.wait(1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      // Shorten common MetaMask rejection messages
      if (message.includes('user rejected') || message.includes('ACTION_REJECTED')) {
        setError('Transaction rejected by user.');
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [contractAddress, abi, func, args, ethValue, isPayable]);

  const explorerUrl = txHash ? getExplorerTxUrl(chainId, txHash) : null;

  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden transition-colors duration-200 hover:border-white/[0.10]">
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors duration-150 hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${
              isPayable
                ? 'bg-amber-500/10 text-amber-400'
                : 'bg-indigo-500/10 text-indigo-400'
            }`}
          >
            W
          </span>
          <span className="text-sm font-medium text-white">{func.name}</span>
          {isPayable && (
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/20">
              payable
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Accordion body */}
      {isOpen && (
        <div className="border-t border-white/[0.04] bg-white/[0.01] px-5 py-4 space-y-4">
          {/* Input fields */}
          {func.inputs.length > 0 && (
            <div className="space-y-3">
              {func.inputs.map((input, index) => (
                <div key={`${input.name}-${index}`}>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    {paramLabel(input, index)}
                  </label>
                  <input
                    type="text"
                    value={args[index]}
                    onChange={(e) => handleArgChange(index, e.target.value)}
                    placeholder={`Enter ${input.type}`}
                    className={INPUT_CLASSES.light}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ETH value input for payable functions */}
          {isPayable && (
            <div>
              <label className="block text-xs font-medium text-amber-400/80 mb-1.5">
                ETH Value
              </label>
              <input
                type="text"
                value={ethValue}
                onChange={(e) => setEthValue(e.target.value)}
                placeholder="0.0"
                className={`${INPUT_CLASSES.light} !border-amber-500/20 focus:!border-amber-500/40 focus:!ring-amber-500/20`}
              />
              <p className="mt-1 text-[11px] text-gray-600">
                Amount of ETH to send with this transaction
              </p>
            </div>
          )}

          {/* Execute button */}
          <button
            type="button"
            onClick={handleExecute}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500/15 px-4 py-2 text-sm font-medium text-indigo-400 transition-all duration-200 hover:bg-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-500/20"
          >
            {isLoading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Executing...
              </>
            ) : (
              'Execute'
            )}
          </button>

          {/* Transaction hash display */}
          {txHash && (
            <div className="rounded-lg bg-indigo-500/[0.06] border border-indigo-500/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400/60 mb-1.5">
                Transaction Hash
              </p>
              <div className="flex items-center gap-2">
                <code className="break-all font-mono text-sm text-indigo-300/90">{txHash}</code>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 rounded-md bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors border border-indigo-500/15"
                  >
                    View
                  </a>
                )}
              </div>
              {!isLoading && (
                <p className="mt-2 text-[11px] text-emerald-400/80">Transaction confirmed.</p>
              )}
              {isLoading && (
                <p className="mt-2 text-[11px] text-amber-400/80">Waiting for confirmation...</p>
              )}
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="rounded-lg bg-red-500/[0.06] border border-red-500/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400/60 mb-1.5">
                Error
              </p>
              <p className="text-sm text-red-300/90 break-all">{error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Argument encoding
// ---------------------------------------------------------------------------

/**
 * Encode a raw string input into the appropriate JS type for ethers.js.
 *
 * - Numeric types (uint*, int*) -> BigInt
 * - Boolean -> true / false
 * - Array types (type[]) -> JSON parsed array
 * - Everything else -> string (addresses, bytes, strings)
 */
function encodeArg(raw: string, type: string): unknown {
  const trimmed = raw.trim();

  // Boolean
  if (type === 'bool') {
    const lower = trimmed.toLowerCase();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }

  // Unsigned / signed integers
  if (type.match(/^u?int\d*$/)) {
    return BigInt(trimmed || '0');
  }

  // Fixed-size or dynamic arrays (e.g. address[], uint256[], uint256[5])
  if (type.endsWith(']')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  // Default: pass as string (address, string, bytes, bytes32, etc.)
  return trimmed;
}
