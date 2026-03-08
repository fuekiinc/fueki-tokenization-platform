/**
 * Live API tests for KYC routes.
 *
 * These tests are non-destructive by default and target the deployed backend
 * configured via FUEKI_API_URL.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { API_PREFIX, BASE_URL } from './setup';

const liveDescribe = process.env.FUEKI_ENABLE_LIVE_API === 'true' ? describe : describe.skip;

liveDescribe('KYC API (live)', () => {
  it('rejects status requests without X-User-Id header', async () => {
    const response = await request(BASE_URL).get(`${API_PREFIX}/kyc/status`);

    expect(response.status).toBe(401);
    expect(response.body?.error?.code).toBe('AUTH_REQUIRED');
  });

  it('protects admin statistics endpoint from anonymous access', async () => {
    const response = await request(BASE_URL).get(`${API_PREFIX}/admin/stats`);

    expect(response.status).toBe(401);
    expect(response.body?.error?.code).toBe('AUTH_REQUIRED');
  });

  it('rejects malformed KYC submissions (validation boundary)', async () => {
    const response = await request(BASE_URL)
      .post(`${API_PREFIX}/kyc/submit`)
      .field('email', 'invalid-email-only')
      .field('firstName', 'Injected<script>alert(1)</script>');

    expect(response.status).toBe(401);
    expect(response.body?.error?.code).toBe('AUTH_REQUIRED');
  });
});
