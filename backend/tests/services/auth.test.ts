import { describe, expect, it } from 'vitest';
import {
  generateAccessToken,
  hashPassword,
  verifyAccessToken,
  verifyPassword,
} from '../../src/services/auth';

describe('auth service primitives', () => {
  it('hashes passwords and verifies valid/invalid candidates', async () => {
    const plainPassword = 'StrongPass1!';
    const hash = await hashPassword(plainPassword);

    expect(hash).not.toBe(plainPassword);
    await expect(verifyPassword(plainPassword, hash)).resolves.toBe(true);
    await expect(verifyPassword('WrongPass1!', hash)).resolves.toBe(false);
  });

  it('generates and verifies access tokens', () => {
    const token = generateAccessToken('user-123');
    const payload = verifyAccessToken(token);

    expect(payload.userId).toBe('user-123');
  });
});
