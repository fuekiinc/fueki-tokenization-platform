/**
 * Consistent number and display formatting utilities for the Fueki platform.
 *
 * All user-facing numbers should flow through one of these helpers so that
 * currency, token amounts, percentages, and addresses look uniform across
 * every page and component.
 */

import { formatUnits } from 'ethers';

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

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    // Fallback for non-ISO currency codes (e.g. ETH, BTC)
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
    return `${formatted} ${currency}`;
  }
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

/**
 * Formats a raw wei/token amount using ethers formatUnits for proper
 * big-number precision, then applies display formatting.
 *
 * @param weiValue - Raw token amount as bigint or decimal string (wei).
 * @param unitDecimals - Token decimals (default 18).
 * @param displayDecimals - Maximum display decimals (default 4).
 * @returns e.g. "1,234.5678"
 */
export function formatWeiAmount(
  weiValue: bigint | string,
  unitDecimals: number = 18,
  displayDecimals: number = 4,
): string {
  try {
    const formatted = formatUnits(weiValue, unitDecimals);
    return formatTokenAmount(formatted, displayDecimals);
  } catch {
    return '0';
  }
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

/**
 * Formats a number as a signed percentage string (with +/- prefix).
 *
 * @param value - The percentage value.
 * @returns e.g. "+12.35%", "-3.1%", "0%"
 */
export function formatSignedPercent(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(num)) return '0%';

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(num));

  if (num > 0) return `+${formatted}%`;
  if (num < 0) return `-${formatted}%`;
  return `${formatted}%`;
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
  const sign = num < 0 ? '-' : '';

  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2).replace(/\.?0+$/, '')}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2).replace(/\.?0+$/, '')}K`;

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
 * Formats a date value intelligently -- uses relative format for recent
 * dates and absolute format for older ones.
 *
 * @param date - Date object, timestamp (ms), or ISO string.
 * @param relativeThresholdMs - Threshold in ms for relative formatting
 *   (default 7 days). Dates older than this use absolute format.
 * @returns e.g. "just now", "5m ago", "3h ago", "2d ago", "Feb 16, 2026"
 */
export function formatRelativeDate(
  date: Date | number | string,
  relativeThresholdMs: number = 7 * 24 * 60 * 60 * 1000,
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const now = Date.now();
  const diff = now - d.getTime();

  if (diff < 0 || diff > relativeThresholdMs) {
    return formatDate(d);
  }

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

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
