/**
 * validation utility tests.
 *
 * Verifies security-critical input validation and sanitization behavior.
 */
import { describe, expect, it } from 'vitest';
import {
  isValidAddress,
  isValidAmount,
  isValidChainId,
  isValidEmail,
  isValidPassword,
  isValidTokenSymbol,
  sanitizeInput,
  validatePositiveAmount,
  validateTokenSymbol,
} from '../../../src/lib/utils/validation';

describe('validation utils', () => {
  it('validates addresses, chain IDs, and token amounts', () => {
    expect(isValidAddress('0x0000000000000000000000000000000000000001')).toBe(true);
    expect(isValidAddress('not-an-address')).toBe(false);

    expect(isValidChainId(1)).toBe(true);
    expect(isValidChainId(999_999_999)).toBe(false);

    expect(isValidAmount('12.5', 18)).toBe(true);
    expect(isValidAmount('-1', 18)).toBe(false);
    expect(isValidAmount('1.1234', 2)).toBe(false);
  });

  it('enforces email/password/symbol constraints', () => {
    expect(isValidEmail('user@fueki.tech')).toBe(true);
    expect(isValidEmail('bad-email')).toBe(false);

    const strong = isValidPassword('StrongPass123!');
    const weak = isValidPassword('weak');
    expect(strong.valid).toBe(true);
    expect(weak.valid).toBe(false);
    expect(weak.errors.length).toBeGreaterThan(0);

    expect(isValidTokenSymbol('FUEKI1')).toBe(true);
    expect(isValidTokenSymbol('fueki')).toBe(false);
    expect(validateTokenSymbol('')).toContain('required');
  });

  it('sanitizes HTML and validates positive amounts with errors', () => {
    expect(sanitizeInput('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;',
    );

    expect(validatePositiveAmount('', 'Amount')).toBe('Amount is required');
    expect(validatePositiveAmount('0', 'Amount')).toContain('greater than zero');
    expect(validatePositiveAmount('12.5', 'Amount')).toBeNull();
  });
});
