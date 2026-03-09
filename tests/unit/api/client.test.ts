import { describe, expect, it } from 'vitest';
import { shouldAttemptSilentRefresh } from '../../../src/lib/api/client';

describe('shouldAttemptSilentRefresh', () => {
  it('skips refresh when there is no persisted session', () => {
    expect(shouldAttemptSilentRefresh(401, '/api/auth/me', false)).toBe(false);
  });

  it('skips refresh for auth endpoints that should fail fast', () => {
    expect(shouldAttemptSilentRefresh(401, '/api/auth/login', true)).toBe(false);
    expect(shouldAttemptSilentRefresh(401, '/api/auth/refresh', true)).toBe(false);
  });

  it('allows refresh only for authenticated non-auth requests', () => {
    expect(shouldAttemptSilentRefresh(401, '/api/auth/me', true)).toBe(true);
    expect(shouldAttemptSilentRefresh(400, '/api/auth/me', true)).toBe(false);
  });
});
