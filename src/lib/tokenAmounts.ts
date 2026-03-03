/**
 * Amount parsing helpers shared between browser UI and node-based tests.
 *
 * Integer strings are treated as raw base units (e.g. wei for 18-decimal
 * tokens). Decimal strings are treated as already human-readable amounts.
 */
export function parseTokenAmount(
  amount: string | bigint,
  decimals: number = 18,
): number {
  if (typeof amount === 'bigint') {
    return baseUnitsToNumber(amount, decimals);
  }

  const normalized = (amount ?? '').replace(/,/g, '').trim();
  if (!normalized) return 0;

  if (/^-?\d+$/.test(normalized)) {
    try {
      return baseUnitsToNumber(BigInt(normalized), decimals);
    } catch {
      return 0;
    }
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function baseUnitsToNumber(value: bigint, decimals: number): number {
  if (decimals <= 0) return Number(value);

  const divisor = 10n ** BigInt(decimals);
  const abs = value < 0n ? -value : value;
  const whole = Number(abs / divisor);
  const fraction = Number(abs % divisor) / 10 ** decimals;
  const result = whole + fraction;
  return value < 0n ? -result : result;
}
