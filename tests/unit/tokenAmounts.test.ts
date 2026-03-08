import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseTokenAmount } from '../../src/lib/tokenAmounts';

function assertClose(actual: number, expected: number, tolerance = 1e-12): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('parseTokenAmount converts base-unit integers to human units', () => {
  assertClose(parseTokenAmount('1000000000000000000'), 1);
  assertClose(parseTokenAmount('250000000000000000'), 0.25);
  assertClose(parseTokenAmount('12345', 2), 123.45);
});

test('parseTokenAmount accepts human-readable decimal strings', () => {
  assertClose(parseTokenAmount('1.5'), 1.5);
  assertClose(parseTokenAmount('1,234.56'), 1234.56);
});

test('parseTokenAmount handles bigint and invalid input safely', () => {
  assertClose(parseTokenAmount(500000000000000000n), 0.5);
  assert.equal(parseTokenAmount(''), 0);
  assert.equal(parseTokenAmount('not-a-number'), 0);
});
