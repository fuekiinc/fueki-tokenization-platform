import { describe, expect, it } from 'vitest';
import { buildTokenLookupCandidates, hashToken } from '../../src/services/tokenHash';

describe('token hash helpers', () => {
  it('hashes tokens deterministically to SHA-256 hex', () => {
    expect(hashToken('opaque-token')).toBe(
      '84d3f23da9b5f51b3269566eff05d3fb23607eeef89567f9cd280b90ca0dbc5c',
    );
  });

  it('returns hashed-first lookup candidates with legacy raw fallback', () => {
    expect(buildTokenLookupCandidates('opaque-token')).toEqual([
      '84d3f23da9b5f51b3269566eff05d3fb23607eeef89567f9cd280b90ca0dbc5c',
      'opaque-token',
    ]);
  });
});
