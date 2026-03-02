import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeKycStatus } from '../../src/lib/auth/kycStatus';

test('normalizeKycStatus keeps canonical statuses intact', () => {
  assert.equal(normalizeKycStatus('approved'), 'approved');
  assert.equal(normalizeKycStatus('pending'), 'pending');
  assert.equal(normalizeKycStatus('rejected'), 'rejected');
  assert.equal(normalizeKycStatus('not_submitted'), 'not_submitted');
});

test('normalizeKycStatus maps legacy/variant approved statuses', () => {
  assert.equal(normalizeKycStatus('APPROVED'), 'approved');
  assert.equal(normalizeKycStatus(' verified '), 'approved');
  assert.equal(normalizeKycStatus('kyc_complete'), 'approved');
  assert.equal(normalizeKycStatus('active_user'), 'approved');
});

test('normalizeKycStatus maps fallback statuses safely', () => {
  assert.equal(normalizeKycStatus('PENDING_REVIEW'), 'pending');
  assert.equal(normalizeKycStatus('REJECTED_BY_ADMIN'), 'rejected');
  assert.equal(normalizeKycStatus(undefined), 'not_submitted');
  assert.equal(normalizeKycStatus(''), 'not_submitted');
});
