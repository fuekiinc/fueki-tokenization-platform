/**
 * Live API tests for contract compilation endpoint.
 *
 * Calls are non-destructive and validate compiler behavior under valid and
 * invalid source submissions.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { API_PREFIX, BASE_URL, EXPECT_COMPILE_STATUS, EXPECT_CONTRACT_APIS } from './setup';
import { SAMPLE_SOLIDITY_SOURCE } from '../fixtures/sample-data';

const liveDescribe = process.env.FUEKI_ENABLE_LIVE_API === 'true' ? describe : describe.skip;

liveDescribe('Contracts API (live)', () => {
  it('returns expected status for valid Solidity source', async () => {
    const response = await request(BASE_URL)
      .post(`${API_PREFIX}/contracts/compile`)
      .send({
        sourceCode: SAMPLE_SOLIDITY_SOURCE,
        contractName: 'SampleToken',
        solidityVersion: '0.8.20',
        optimizerEnabled: true,
        optimizerRuns: 200,
      })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(EXPECT_COMPILE_STATUS);

    if (EXPECT_CONTRACT_APIS) {
      expect(response.body.success).toBe(true);
      expect(typeof response.body.bytecode === 'string' || response.body.bytecode === undefined).toBe(true);
      expect(Array.isArray(response.body.abi) || response.body.abi === undefined).toBe(true);
    } else {
      expect(response.text || JSON.stringify(response.body)).toContain('/contracts/compile');
    }
  });

  it('returns expected malformed-source behavior', async () => {
    const response = await request(BASE_URL)
      .post(`${API_PREFIX}/contracts/compile`)
      .send({
        sourceCode: 'contract Broken { function x( public {}',
        contractName: 'Broken',
      })
      .set('Content-Type', 'application/json');

    if (EXPECT_CONTRACT_APIS) {
      expect([200, 400, 422]).toContain(response.status);
      expect(response.body.success).toBe(false);
      expect(Array.isArray(response.body.errors) || typeof response.body.error === 'string').toBe(true);
      return;
    }

    expect(response.status).toBe(EXPECT_COMPILE_STATUS);
    expect(response.text || JSON.stringify(response.body)).toContain('/contracts/compile');
  });
});
