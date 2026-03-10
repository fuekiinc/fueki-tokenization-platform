import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock, getMock, putMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  getMock: vi.fn(),
  putMock: vi.fn(),
}));

vi.mock('../../src/lib/api/client', () => ({
  default: {
    post: postMock,
    get: getMock,
    put: putMock,
  },
}));

import { logout, refreshToken } from '../../src/lib/api/auth';

describe('auth api logout', () => {
  beforeEach(() => {
    postMock.mockReset();
    getMock.mockReset();
    putMock.mockReset();
    postMock.mockResolvedValue({ data: undefined });
  });

  it('marks logout requests to skip refresh retries', async () => {
    await logout('header.payload.signature');

    expect(postMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      {},
      expect.objectContaining({
        skipAuthRefresh: true,
        headers: {
          Authorization: 'Bearer header.payload.signature',
        },
      }),
    );
  });

  it('skips refresh retries even when no bearer is available', async () => {
    await logout();

    expect(postMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      {},
      expect.objectContaining({
        skipAuthRefresh: true,
      }),
    );
  });

  it('passes through refresh retry controls for explicit refresh calls', async () => {
    postMock.mockResolvedValue({ data: { accessToken: 'header.payload.signature' } });

    await refreshToken({ skipAuthRefresh: true });

    expect(postMock).toHaveBeenCalledWith(
      '/api/auth/refresh',
      {},
      expect.objectContaining({
        skipAuthRefresh: true,
      }),
    );
  });
});
