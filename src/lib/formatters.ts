/**
 * Consistent number and display formatting utilities for the Fueki platform.
 *
 * All user-facing numbers should flow through one of these helpers so that
 * currency, token amounts, percentages, and addresses look uniform across
 * every page and component.
 */

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

/**
 * Formats a number as a currency string with 2 decimal places and
 * thousands separators.
 *
 * @param value  - Numeric value (number or parseable string).
 * @param currency - ISO 4217 currency code (default "USD").
 * @returns e.g. "$1,234.50"
 */
export function formatCurrency(
  value: number | string,
  currency: string = 'USD',
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(num)) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// ---------------------------------------------------------------------------
// Token amounts
// ---------------------------------------------------------------------------

/**
 * Formats a raw token amount for display. Removes trailing zeros and caps
 * at the given number of decimal places.
 *
 * @param value    - Numeric value (number or parseable string).
 * @param decimals - Maximum fraction digits (default 4).
 * @returns e.g. "1,234.5678", "0.0001", "1,000"
 */
export function formatTokenAmount(
  value: number | string,
  decimals: number = 4,
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(num)) return '0';

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(num);
}

// ---------------------------------------------------------------------------
// Percentages
// ---------------------------------------------------------------------------

/**
 * Formats a number as a percentage string with up to 2 decimal places.
 *
 * @param value - The percentage value (e.g. 12.345 becomes "12.35%").
 * @returns e.g. "12.35%", "0%", "-3.1%"
 */
export function formatPercent(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(num)) return '0%';

  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num)}%`;
}

// ---------------------------------------------------------------------------
// Compact (abbreviated) numbers
// ---------------------------------------------------------------------------

/**
 * Formats large numbers with SI-style suffixes (K, M, B, T).
 *
 * @param value - Numeric value (number or parseable string).
 * @returns e.g. "1.23M", "456K", "1.5B"
 */
export function formatCompact(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(num)) return '0';

  const abs = Math.abs(num);

  if (abs >= 1e12) return `${(num / 1e12).toFixed(2).replace(/\.?0+$/, '')}T`;
  if (abs >= 1e9) return `${(num / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (abs >= 1e6) return `${(num / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (abs >= 1e3) return `${(num / 1e3).toFixed(2).replace(/\.?0+$/, '')}K`;

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/**
 * Truncates an Ethereum address to `0x1234...5678` form.
 *
 * @param address - Full hex address string.
 * @param chars   - Number of characters to keep on each side (default 4).
 * @returns e.g. "0x1234...5678"
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Formats a date value as a short human-readable string.
 *
 * @param date - Date object, timestamp (ms), or ISO string.
 * @returns e.g. "Feb 16, 2026"
 */
export function formatDate(date: Date | number | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats a date value as a short human-readable string with time.
 *
 * @param date - Date object, timestamp (ms), or ISO string.
 * @returns e.g. "Feb 16, 2026 3:45 PM"
 */
export function formatDateTime(date: Date | number | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  return `${d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} ${d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })}`;
}

// ---------------------------------------------------------------------------
// Price formatting (high-precision for exchange/trading contexts)
// ---------------------------------------------------------------------------

/**
 * Formats a price value with higher precision suitable for exchange UIs.
 *
 * @param value    - Price value (number or parseable string).
 * @param decimals - Decimal places (default 6).
 * @returns e.g. "0.001234", "1,234.567890"
 */
export function formatPrice(
  value: number | string,
  decimals: number = 6,
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(num)) return '0';

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}
