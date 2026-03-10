import { beforeEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();

vi.mock('../../../src/lib/api/client', () => ({
  default: {
    post: postMock,
  },
}));

import { markMintApprovalRequestMinted } from '../../../src/lib/api/mintRequests';

describe('markMintApprovalRequestMinted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts the normalized txHash to the mark-minted endpoint', async () => {
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
    );

    expect(postMock).toHaveBeenCalledWith(
      '/api/mint-requests/req-1/mark-minted',
      { txHash: `0x${'ab'.repeat(32)}` },
    );
    expect(result).toMatchObject({
      success: true,
      requestId: 'req-1',
      status: 'minted',
    });
  });

  it('rejects malformed tx hashes before sending the request', async () => {
    await expect(
      markMintApprovalRequestMinted('req-1', 'not-a-tx-hash'),
    ).rejects.toThrow(
      'Transaction hash must be a valid 0x-prefixed 32-byte hex string.',
    );

    expect(postMock).not.toHaveBeenCalled();
  });
});
