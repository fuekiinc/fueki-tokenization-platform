import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidAddress,
  isValidAmount,
  isValidChainId,
  isValidEmail,
  isValidPassword,
  isValidTokenSymbol,
  isZeroAddress,
  sanitizeInput,
  sanitizePastedAddress,
  validatePositiveAmount,
  validateTokenSymbol,
} from '../../src/lib/utils/validation';

test('ethereum address helpers validate and sanitize addresses', () => {
  const validAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
  const invalidAddress = '0x1234';
  const pasted = ' 0x742d35Cc6634C0532925a3b844Bc454e4438f44e \n';

  assert.equal(isValidAddress(validAddress), true);
  assert.equal(isValidAddress(invalidAddress), false);
  assert.equal(isZeroAddress('0x0000000000000000000000000000000000000000'), true);
  assert.equal(isZeroAddress(validAddress), false);

  const sanitized = sanitizePastedAddress(pasted);
  assert.equal(sanitized.value, validAddress);
  assert.equal(sanitized.valid, true);
});

test('amount validators reject zero/invalid values and enforce decimal precision', () => {
  assert.equal(isValidAmount('1,234.5678', 4), true);
  assert.equal(isValidAmount('0', 18), false);
  assert.equal(isValidAmount('10.12345', 4), false);
  assert.equal(isValidAmount('abc', 18), false);

  assert.equal(validatePositiveAmount('', 'Mint amount'), 'Mint amount is required');
  assert.equal(validatePositiveAmount('not-a-number', 'Mint amount'), 'Mint amount must be a valid number');
  assert.equal(validatePositiveAmount('-4.2', 'Mint amount'), 'Mint amount must be greater than zero');
  assert.equal(validatePositiveAmount('42', 'Mint amount'), null);
});

test('email and password validators enforce baseline auth quality requirements', () => {
  assert.equal(isValidEmail('issuer@fueki.example'), true);
  assert.equal(isValidEmail('bad-email'), false);

  const strongPassword = isValidPassword('Fueki123!');
  assert.equal(strongPassword.valid, true);
  assert.deepEqual(strongPassword.errors, []);

  const weakPassword = isValidPassword('weak');
  assert.equal(weakPassword.valid, false);
  assert.ok(weakPassword.errors.includes('Password must be at least 8 characters'));
  assert.ok(weakPassword.errors.includes('Password must contain at least one uppercase letter'));
  assert.ok(weakPassword.errors.includes('Password must contain at least one digit'));
});

test('input sanitization escapes HTML and strips null bytes', () => {
  const raw = `<script>alert("x")</script>\0'quoted'`;
  const escaped = sanitizeInput(raw);

  assert.equal(
    escaped,
    '&lt;script&gt;alert(&quot;x&quot;)&lt;&#x2F;script&gt;&#x27;quoted&#x27;',
  );
});

test('chain and symbol validation match supported platform constraints', () => {
  assert.equal(isValidChainId(1), true);
  assert.equal(isValidChainId(8453), true);
  assert.equal(isValidChainId(999999), false);
  assert.equal(isValidChainId(-1), false);

  assert.equal(isValidTokenSymbol('FUEKI1'), true);
  assert.equal(isValidTokenSymbol('fueki'), false);
  assert.equal(isValidTokenSymbol('TOO-LONG-SYMBOL'), false);

  assert.equal(validateTokenSymbol(''), 'Token symbol is required');
  assert.equal(
    validateTokenSymbol('TOO-LONG-SYMBOL'),
    'Symbol must be 11 characters or fewer',
  );
  assert.equal(
    validateTokenSymbol('fueki'),
    'Symbol must be uppercase letters and numbers only',
  );
  assert.equal(validateTokenSymbol('FUEKI'), null);
});
