/**
 * Live API tests for gas estimation endpoint.
 *
 * Uses non-destructive estimation calls for each supported chain fixture.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { API_PREFIX, BASE_URL, EXPECT_CONTRACT_APIS, EXPECT_GAS_STATUS } from './setup';
import { CHAIN_FIXTURES } from '../fixtures/chains';
import { SAMPLE_GAS_REQUEST } from '../fixtures/sample-data';

const liveDescribe = process.env.FUEKI_ENABLE_LIVE_API === 'true' ? describe : describe.skip;

liveDescribe('Gas Estimation API (live)', () => {
  for (const chain of CHAIN_FIXTURES.filter((c) => c.chainId !== 31337)) {
    it(`estimates gas for chain ${chain.chainId} (${chain.name})`, async () => {
      const response = await request(BASE_URL)
        .post(`${API_PREFIX}/gas/estimate`)
        .send({
          ...SAMPLE_GAS_REQUEST,
          chainId: chain.chainId,
        })
        .set('Content-Type', 'application/json');

      if (EXPECT_CONTRACT_APIS) {
        expect(response.status).toBeLessThan(500);
        expect(response.body).toBeTypeOf('object');
        expect(
          response.body.gasLimit !== undefined ||
            response.body.estimatedGas !== undefined ||
            response.body.estimate !== undefined,
        ).toBe(true);
        return;
      }

      expect(response.status).toBe(EXPECT_GAS_STATUS);
      expect(response.text || JSON.stringify(response.body)).toContain('/gas/estimate');
    });
  }

  it('rejects unsupported chain IDs', async () => {
    const response = await request(BASE_URL)
      .post(`${API_PREFIX}/gas/estimate`)
      .send({
        ...SAMPLE_GAS_REQUEST,
        chainId: 99_999_999,
      })
      .set('Content-Type', 'application/json');

    if (EXPECT_CONTRACT_APIS) {
      expect([400, 404, 422]).toContain(response.status);
      expect(response.status).toBeLessThan(500);
      return;
    }

    expect(response.status).toBe(EXPECT_GAS_STATUS);
    expect(response.text || JSON.stringify(response.body)).toContain('/gas/estimate');
  });
});
