import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, getRouteHandlers, invokeHandler } from '../helpers/routeHarness';

const mocks = vi.hoisted(() => ({
  getPairCandles: vi.fn(),
}));

vi.mock('../../src/services/marketData', () => ({
  getPairCandles: mocks.getPairCandles,
}));

import marketDataRoutes from '../../src/routes/marketData';

const [candlesHandler] = getRouteHandlers(marketDataRoutes, 'get', '/candles');

describe('GET /api/market-data/candles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPairCandles.mockResolvedValue({
      candles: [
        {
          time: 1_700_000_000,
          open: 1,
          high: 1.1,
          low: 0.9,
          close: 1.05,
          volume: 123,
        },
      ],
      source: 'cache',
    });
  });

  it('returns candle data for a valid query', async () => {
    const req = createMockReq({
      query: {
        chainId: '421614',
        tokenSell: '0x00000000000000000000000000000000000000A1',
        tokenBuy: '0x00000000000000000000000000000000000000B2',
        interval: '1h',
      },
    });
    const res = createMockRes();

    await invokeHandler(candlesHandler, req, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.getPairCandles).toHaveBeenCalledWith(
      421614,
      '0x00000000000000000000000000000000000000A1',
      '0x00000000000000000000000000000000000000B2',
      '1h',
    );
    expect((res.body as { source: string }).source).toBe('cache');
  });

  it('rejects invalid token pairs', async () => {
    const req = createMockReq({
      query: {
        chainId: '421614',
        tokenSell: 'not-an-address',
        tokenBuy: '0x00000000000000000000000000000000000000B2',
        interval: '1h',
      },
    });
    const res = createMockRes();

    await invokeHandler(candlesHandler, req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
    expect(mocks.getPairCandles).not.toHaveBeenCalled();
  });

  it('rejects same-token pairs', async () => {
    const req = createMockReq({
      query: {
        chainId: '421614',
        tokenSell: '0x00000000000000000000000000000000000000A1',
        tokenBuy: '0x00000000000000000000000000000000000000A1',
        interval: '1h',
      },
    });
    const res = createMockRes();

    await invokeHandler(candlesHandler, req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
    expect(mocks.getPairCandles).not.toHaveBeenCalled();
  });

  it('returns a generic upstream error without leaking provider details', async () => {
    mocks.getPairCandles.mockRejectedValue(new Error('https://rpc.example failed with 429'));

    const req = createMockReq({
      query: {
        chainId: '421614',
        tokenSell: '0x00000000000000000000000000000000000000A1',
        tokenBuy: '0x00000000000000000000000000000000000000B2',
        interval: '1h',
      },
    });
    const res = createMockRes();

    await invokeHandler(candlesHandler, req, res);

    expect(res.statusCode).toBe(502);
    expect((res.body as { error: { code: string; message: string } }).error).toEqual({
      code: 'RPC_UNAVAILABLE',
      message: 'Unable to load market candles from upstream RPC providers',
    });
  });
});
