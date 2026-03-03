/**
 * Generate a unique identifier for parsed transactions.
 *
 * Uses `crypto.randomUUID()` when available (all modern browsers and
 * Node 19+) for strong uniqueness guarantees.  Falls back to a
 * timestamp + random string combo only in environments where the
 * Web Crypto API is not present.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for legacy environments.
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export async function generateDocumentHash(content: string): Promise<string> {
  if (
    typeof crypto === 'undefined' ||
    typeof crypto.subtle === 'undefined' ||
    typeof crypto.subtle.digest !== 'function'
  ) {
    throw new Error(
      'Web Crypto API (crypto.subtle) is not available. ' +
        'Document hashing requires a secure context (HTTPS).',
    );
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Round to 2 decimal places to avoid floating-point drift in currency sums. */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address ?? '';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

export function formatBalance(
  balance: string | bigint,
  decimals: number = 18,
  displayDecimals: number = 4,
): string {
  const zero = `0.${'0'.repeat(displayDecimals)}`;

  // Normalise to bigint so the decimals parameter is always respected.
  // A string that looks like a raw integer (e.g. "1000000000000000000") is
  // treated as an unscaled value that must be divided by 10^decimals.
  let value: bigint;
  if (typeof balance === 'bigint') {
    value = balance;
  } else {
    const trimmed = (balance ?? '').trim();
    if (!trimmed || trimmed === '0') return zero;
    // If the string is a pure integer (no decimal point), convert directly.
    if (/^-?\d+$/.test(trimmed)) {
      value = BigInt(trimmed);
    } else {
      // Already a human-readable decimal string (e.g. "1.5") -- format as-is.
      const num = parseFloat(trimmed);
      if (!Number.isFinite(num)) return zero;
      return num.toFixed(displayDecimals);
    }
  }

  // Use BigInt exponentiation to avoid Number precision loss for large decimals.
  const divisor = 10n ** BigInt(decimals);
  const abs = value < 0n ? -value : value;
  const sign = value < 0n ? '-' : '';
  const whole = abs / divisor;
  const remainder = abs % divisor;
  const remainderStr = remainder
    .toString()
    .padStart(decimals, '0')
    .substring(0, displayDecimals);
  return `${sign}${whole}.${remainderStr}`;
}
export { parseTokenAmount } from '../tokenAmounts.ts';

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  const safeCurrency = (currency || 'USD').toUpperCase().trim();

  // Use compact notation for very large values to prevent layout overflow
  const abs = Math.abs(amount);
  const useCompact = abs >= 1_000_000;

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurrency,
      notation: useCompact ? 'compact' : 'standard',
      compactDisplay: 'short',
      minimumFractionDigits: useCompact ? 1 : 2,
      maximumFractionDigits: useCompact ? 1 : 2,
    }).format(amount);
  } catch {
    // Fallback for non-ISO-4217 codes (e.g. crypto tickers like ETH, BTC).
    // Format as a plain number with the code appended.
    return `${new Intl.NumberFormat('en-US', {
      notation: useCompact ? 'compact' : 'standard',
      compactDisplay: 'short',
      minimumFractionDigits: useCompact ? 1 : 2,
      maximumFractionDigits: useCompact ? 1 : 2,
    }).format(amount)} ${safeCurrency}`;
  }
}

export function formatDate(date: string | Date | number): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function classNames(
  ...classes: (string | boolean | undefined | null)[]
): string {
  return classes.filter(Boolean).join(' ');
}

export function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return Promise.reject(new Error('Clipboard API not available'));
  }
  return navigator.clipboard.writeText(text);
}

export function parseEther(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed || !/^-?\d*\.?\d*$/.test(trimmed)) {
    throw new Error(`Invalid ether value: "${value}"`);
  }
  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;
  const parts = abs.split('.');
  const whole = parts[0] || '0';
  const fraction = (parts[1] || '').padEnd(18, '0').substring(0, 18);
  const result = BigInt(whole) * 10n ** 18n + BigInt(fraction);
  return negative ? -result : result;
}

export function formatEther(value: bigint): string {
  const divisor = 10n ** 18n;
  const abs = value < 0n ? -value : value;
  const sign = value < 0n ? '-' : '';
  const whole = abs / divisor;
  const remainder = abs % divisor;
  const remainderStr = remainder.toString().padStart(18, '0').substring(0, 6);
  return `${sign}${whole}.${remainderStr}`;
}
