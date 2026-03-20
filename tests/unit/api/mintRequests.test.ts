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
  getMintApprovalStatus,
  listMintApprovalRequests,
  markMintApprovalRequestMinted,
  submitMintApprovalRequest,
} from '../../../src/lib/api/mintRequests';

describe('mintRequests API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes wallet ownership to status and list requests', async () => {
    getMock.mockResolvedValue({ data: { status: 'none' } });

    await getMintApprovalStatus({
      tokenName: 'Invoice',
      tokenSymbol: 'INV',
      mintAmount: '100',
      recipient: '0x1111111111111111111111111111111111111111',
      documentHash: '0x' + '11'.repeat(32),
      chainId: 1,
      requesterWalletAddress: '0x2222222222222222222222222222222222222222',
    });
    await listMintApprovalRequests({
      limit: 10,
      walletAddress: '0x3333333333333333333333333333333333333333',
    });

    expect(getMock).toHaveBeenNthCalledWith(1, '/api/mint-requests/status', {
      params: expect.objectContaining({
        requesterWalletAddress: '0x2222222222222222222222222222222222222222',
      }),
    });
    expect(getMock).toHaveBeenNthCalledWith(2, '/api/mint-requests/list', {
      params: expect.objectContaining({
        walletAddress: '0x3333333333333333333333333333333333333333',
      }),
    });
  });

  it('includes requesterWalletAddress and the uploaded document in submit payloads', async () => {
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
      tokenName: 'Invoice',
      tokenSymbol: 'INV',
      mintAmount: '100',
      recipient: '0x1111111111111111111111111111111111111111',
      documentHash: '0x' + '11'.repeat(32),
      chainId: 1,
      requesterWalletAddress: '0x2222222222222222222222222222222222222222',
      documentType: 'PDF',
      originalValue: '100',
      currency: 'USD',
      file: new File(['invoice'], 'invoice.pdf', { type: 'application/pdf' }),
    } satisfies Parameters<typeof submitMintApprovalRequest>[0];

    await submitMintApprovalRequest(payload);

    const [, formData] = postMock.mock.calls[0] ?? [];
    expect(formData).toBeInstanceOf(FormData);
    expect((formData as FormData).get('requesterWalletAddress')).toBe(
      payload.requesterWalletAddress,
    );
    expect((formData as FormData).get('document')).toBe(payload.file);
  });

  it('posts the normalized txHash plus wallet ownership to the mark-minted endpoint', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        requestId: 'req-1',
        status: 'minted',
        reviewNotes: null,
        reviewedAt: null,
        canMint: false,
        alreadyMinted: false,
      },
    });

    const result = await markMintApprovalRequestMinted(
      'req-1',
      `  0x${'ab'.repeat(32)}  `,
      '0x1111111111111111111111111111111111111111',
    );

    expect(postMock).toHaveBeenCalledWith(
      '/api/mint-requests/req-1/mark-minted',
      {
        txHash: `0x${'ab'.repeat(32)}`,
        walletAddress: '0x1111111111111111111111111111111111111111',
      },
    );
    expect(result).toMatchObject({
      success: true,
      requestId: 'req-1',
      status: 'minted',
    });
  });

  it('rejects malformed tx hashes before sending the request', async () => {
    await expect(
      markMintApprovalRequestMinted(
        'req-1',
        'not-a-tx-hash',
        '0x1111111111111111111111111111111111111111',
      ),
    ).rejects.toThrow(
      'Transaction hash must be a valid 0x-prefixed 32-byte hex string.',
    );

    expect(postMock).not.toHaveBeenCalled();
  });
});
