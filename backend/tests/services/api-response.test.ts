import { describe, expect, it, vi } from 'vitest';
import { apiEnvelope } from '../../src/lib/apiResponse';
import { HttpError } from '../../src/lib/httpErrors';
import { errorHandler } from '../../src/middleware/errorHandler';
import { createMockReq, createMockRes } from '../helpers/routeHarness';

describe('api envelope middleware', () => {
  it('wraps legacy success payloads into a success/data envelope while preserving top-level fields', () => {
    const req = createMockReq();
    const res = createMockRes();
    let nextCalled = false;

    apiEnvelope(req as never, res as never, () => {
      nextCalled = true;
    });

    res.json({ user: { id: 'user-1' } });

    expect(nextCalled).toBe(true);
    expect(res.body).toEqual({
      success: true,
      data: {
        user: { id: 'user-1' },
      },
      user: { id: 'user-1' },
    });
  });

  it('adds success=false to legacy error payloads', () => {
    const req = createMockReq();
    const res = createMockRes();

    apiEnvelope(req as never, res as never, () => {});

    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      },
    });
  });
});

describe('error handler middleware', () => {
  it('logs and returns a sanitized HTTP error payload', () => {
    const req = createMockReq({
      method: 'GET',
      originalUrl: '/api/deployments?id=123',
      ip: '127.0.0.1',
      query: { id: '123' },
      params: {},
      body: {},
      userId: 'user-1',
    });
    const res = createMockRes();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler(
      new HttpError(404, 'NOT_FOUND', 'Deployment not found'),
      req as never,
      res as never,
      (() => {}) as never,
    );

    expect(errorSpy).toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Deployment not found',
      },
    });

    errorSpy.mockRestore();
  });
});
