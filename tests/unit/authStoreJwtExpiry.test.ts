import test from 'node:test';
import assert from 'node:assert/strict';
import { isJwtExpired, parseJwtExpiryMs } from '../../src/lib/auth/jwt';

function buildJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url');
  return `${header}.${payload}.signature`;
}

test('parseJwtExpiryMs returns milliseconds for a valid JWT payload', () => {
  const expSeconds = 1_900_000_000;
  const token = buildJwt(expSeconds);
  assert.equal(parseJwtExpiryMs(token), expSeconds * 1000);
});

test('isJwtExpired returns true for expired tokens', () => {
  const token = buildJwt(Math.floor(Date.now() / 1000) - 120);
  assert.equal(isJwtExpired(token), true);
});

test('isJwtExpired returns false for tokens that are still valid', () => {
  const token = buildJwt(Math.floor(Date.now() / 1000) + 600);
  assert.equal(isJwtExpired(token), false);
});

test('isJwtExpired returns false when token payload is malformed', () => {
  assert.equal(isJwtExpired('not-a-jwt'), false);
});
