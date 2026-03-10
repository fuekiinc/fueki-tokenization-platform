import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../src/lib/api/client';

function getResponseErrorHandler(): (error: unknown) => Promise<unknown> {
  const handlers = (
    apiClient.interceptors.response as typeof apiClient.interceptors.response & {
      handlers?: Array<{ rejected?: (error: unknown) => Promise<unknown> }>;
    }
  ).handlers;

  const rejected = handlers?.find((handler) => typeof handler?.rejected === 'function')?.rejected;
  if (!rejected) {
    throw new Error('Response error interceptor was not registered');
  }

  return rejected;
}

describe('api client refresh handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not attempt token refresh for requests that opt out', async () => {
    const rejected = getResponseErrorHandler();
    const refreshSpy = vi.spyOn(axios, 'post');
    const error = {
      config: {
        headers: {},
        skipAuthRefresh: true,
        url: '/api/auth/logout',
      },
      isAxiosError: true,
      response: {
        status: 401,
      },
    };

    await expect(rejected(error)).rejects.toBe(error);
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
