/**
 * ReadFunction -- renders a single read-only (view/pure) contract function.
 *
 * Displays a collapsible accordion with typed input fields, a "Call" button,
 * and a formatted result area. Uses the module-level `getProvider()` from
 * walletStore so no signer (and therefore no gas) is required.
 */

import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import type { ABIFunction, ABIParam } from '../../types/contractDeployer';
import { getProvider } from '../../store/walletStore';
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

/** Format a single return value into a human-readable string. */
function formatValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return 'null';

  // BigInt / BigNumber
  if (typeof value === 'bigint') {
    return value.toLocaleString();
  }

  // Boolean
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  // Address -- return checksummed form
  if (typeof value === 'string' && type === 'address') {
    try {
      return ethers.getAddress(value);
    } catch {
      return value;
    }
  }

  // Bytes
  if (typeof value === 'string' && type.startsWith('bytes')) {
    return value;
  }

  // Arrays
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatValue(v, type.replace('[]', ''))).join(', ')}]`;
  }

  return String(value);
}

/** Build the label for a function parameter input. */
function paramLabel(param: ABIParam, index: number): string {
  const name = param.name || `param${index}`;
  return `${name} (${param.type})`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReadFunction({ func, contractAddress, abi }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [args, setArgs] = useState<string[]>(() => func.inputs.map(() => ''));
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleArgChange = useCallback((index: number, value: string) => {
    setArgs((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleCall = useCallback(async () => {
    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      const provider = getProvider();
      if (!provider) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }

      const contract = new ethers.Contract(contractAddress, abi as ethers.InterfaceAbi, provider);

      // Encode arguments according to their types
      const encodedArgs = func.inputs.map((input, i) => encodeArg(args[i], input.type));

      const raw = await contract[func.name](...encodedArgs);

      // Format result(s)
      if (func.outputs.length === 0) {
        setResult('(void)');
      } else if (func.outputs.length === 1) {
        setResult(formatValue(raw, func.outputs[0].type));
      } else {
        // Multiple return values -- format each on its own line
        const lines = func.outputs.map((output, i) => {
          const label = output.name || `[${i}]`;
          return `${label}: ${formatValue(raw[i], output.type)}`;
        });
        setResult(lines.join('\n'));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [contractAddress, abi, func, args]);

  // Determine if the function can be called without arguments
  const hasInputs = func.inputs.length > 0;

  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden transition-colors duration-200 hover:border-white/[0.10]">
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors duration-150 hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-[10px] font-bold text-emerald-400">
            R
          </span>
          <span className="text-sm font-medium text-white">{func.name}</span>
          {func.outputs.length > 0 && (
            <span className="text-[11px] text-gray-600">
              &rarr; {func.outputs.map((o) => o.type).join(', ')}
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
          {hasInputs && (
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

          {/* Call button */}
          <button
            type="button"
            onClick={handleCall}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-400 transition-all duration-200 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500/20"
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
                Calling...
              </>
            ) : (
              'Call'
            )}
          </button>

          {/* Result display */}
          {result !== null && (
            <div className="rounded-lg bg-emerald-500/[0.06] border border-emerald-500/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 mb-1.5">
                Result
              </p>
              <pre className="whitespace-pre-wrap break-all font-mono text-sm text-emerald-300/90">
                {result}
              </pre>
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
      // Fall through to raw string if not valid JSON
      return trimmed;
    }
  }

  // Default: pass as string (address, string, bytes, bytes32, etc.)
  return trimmed;
}
