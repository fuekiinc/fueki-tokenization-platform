/**
 * formatters utility tests.
 *
 * Verifies currency, percentage, address, and relative-date formatting.
 */
import { describe, expect, it } from 'vitest';
import {
  formatCompact,
  formatCurrency,
  formatPercent,
  formatRelativeDate,
  formatSignedPercent,
  truncateAddress,
} from '../../../src/lib/formatters';

describe('formatters', () => {
  it('formats currency and compact values deterministically', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
    expect(formatCompact(1_230_000)).toBe('1.23M');
  });

  it('formats percent values with signs', () => {
    expect(formatPercent(1.2345)).toBe('1.23%');
    expect(formatSignedPercent(1.2345)).toBe('+1.23%');
    expect(formatSignedPercent(-1.2345)).toBe('-1.23%');
  });

  it('truncates addresses and formats relative dates', () => {
    expect(
      truncateAddress('0x1234567890abcdef1234567890abcdef12345678', 4),
    ).toBe('0x1234...5678');

    const date = new Date(Date.now() - 3 * 60 * 1000);
    const formatted = formatRelativeDate(date);
    expect(formatted).toMatch(/3m ago|2m ago|4m ago/);
  });
});
