import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import { parseContractError } from '../../src/lib/blockchain/contracts';

describe('parseContractError', () => {
  it('surfaces backend API error messages for validation failures', () => {
    const error = new AxiosError(
      'Request failed with status code 400',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: { headers: {} },
        data: {
          error: {
            code: 'NAV_ORACLE_TOKEN_MISMATCH',
            message: 'The NAV oracle is configured for a different security token.',
          },
        },
      },
    );

    expect(parseContractError(error)).toBe(
      'The NAV oracle is configured for a different security token.',
    );
  });

  it('falls back to backend validation issue arrays when no top-level message is provided', () => {
    const error = new AxiosError(
      'Request failed with status code 400',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: { headers: {} },
        data: {
          error: {
            code: 'INVALID_NAV_ATTESTATION',
            issues: {
              errors: [
                'NAV per token must be greater than zero.',
                'Total NAV must be greater than zero.',
              ],
            },
          },
        },
      },
    );

    expect(parseContractError(error)).toBe(
      'NAV per token must be greater than zero. Total NAV must be greater than zero.',
    );
  });

  it('preserves AccessControl missing-role errors so the UI can explain oracle admin requirements', () => {
    const error = new Error(
      'execution reverted: AccessControl: account 0x1111111111111111111111111111111111111111 is missing role 0x0000000000000000000000000000000000000000000000000000000000000000',
    );

    expect(parseContractError(error)).toBe(
      'Transaction reverted: AccessControl: account 0x1111111111111111111111111111111111111111 is missing role 0x0000000000000000000000000000000000000000000000000000000000000000',
    );
  });
});
