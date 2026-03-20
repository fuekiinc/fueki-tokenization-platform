import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('../../../src/lib/api/client', () => ({
  default: {
    get: getMock,
    post: postMock,
  },
}));

import {
  getSecurityTokenApprovalStatus,
  listSecurityTokenApprovalRequests,
  submitSecurityTokenApprovalRequest,
} from '../../../src/lib/api/securityTokenRequests';

describe('securityTokenRequests API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes wallet ownership to status and list requests', async () => {
    getMock.mockResolvedValue({ data: { status: 'none' } });

    await getSecurityTokenApprovalStatus({
      tokenName: 'Security Token',
      tokenSymbol: 'STK',
      decimals: 18,
      totalSupply: '1000',
      maxTotalSupply: '2000',
      minTimelockAmount: '1',
      maxReleaseDelayDays: 365,
      originalValue: '100',
      documentHash: '0x' + '11'.repeat(32),
      documentType: 'Prospectus',
      chainId: 1,
      requesterWalletAddress: '0x2222222222222222222222222222222222222222',
    });
    await listSecurityTokenApprovalRequests({
      limit: 10,
      walletAddress: '0x3333333333333333333333333333333333333333',
    });

    expect(getMock).toHaveBeenNthCalledWith(
      1,
      '/api/security-token-requests/status',
      {
        params: expect.objectContaining({
          requesterWalletAddress: '0x2222222222222222222222222222222222222222',
        }),
      },
    );
    expect(getMock).toHaveBeenNthCalledWith(2, '/api/security-token-requests/list', {
      params: expect.objectContaining({
        walletAddress: '0x3333333333333333333333333333333333333333',
      }),
    });
  });

  it('includes requesterWalletAddress in submit payloads', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        reused: false,
        requestId: 'req-1',
        status: 'pending',
        reviewNotes: null,
        submittedAt: new Date().toISOString(),
        reviewedAt: null,
      },
    });

    const payload = {
      tokenName: 'Security Token',
      tokenSymbol: 'STK',
      decimals: 18,
      totalSupply: '1000',
      maxTotalSupply: '2000',
      minTimelockAmount: '1',
      maxReleaseDelayDays: 365,
      originalValue: '100',
      documentHash: '0x' + '11'.repeat(32),
      documentType: 'Prospectus',
      hashSource: 'file',
      chainId: 1,
      requesterWalletAddress: '0x2222222222222222222222222222222222222222',
      file: new File(['prospectus'], 'prospectus.pdf', { type: 'application/pdf' }),
    } satisfies Parameters<typeof submitSecurityTokenApprovalRequest>[0];

    await submitSecurityTokenApprovalRequest(payload);

    const [, formData] = postMock.mock.calls[0] ?? [];
    expect(formData).toBeInstanceOf(FormData);
    expect((formData as FormData).get('requesterWalletAddress')).toBe(
      payload.requesterWalletAddress,
    );
  });
});
