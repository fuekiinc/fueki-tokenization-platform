import { Router } from 'express';
import { ethers } from 'ethers';
import { z } from 'zod';
import { getPairCandles, type TimeInterval } from '../services/marketData';
import { getSupportedChainId } from '../services/rpcRegistry';

const router = Router();
const ALLOWED_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;

const querySchema = z.object({
  chainId: z.coerce.number().int().refine((value) => getSupportedChainId(value) !== null, {
    message: 'Unsupported chain id',
  }),
  tokenSell: z.string().trim().refine((value) => ethers.isAddress(value), {
    message: 'Invalid sell token address',
  }),
  tokenBuy: z.string().trim().refine((value) => ethers.isAddress(value), {
    message: 'Invalid buy token address',
  }),
  interval: z.enum(ALLOWED_INTERVALS),
});

router.get('/candles', async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid candle query parameters',
        issues: parsed.error.flatten(),
      },
    });
    return;
  }

  const { chainId, tokenSell, tokenBuy, interval } = parsed.data;
  if (tokenSell.toLowerCase() === tokenBuy.toLowerCase()) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Trading pair must use two distinct token addresses',
      },
    });
    return;
  }

  try {
    const result = await getPairCandles(chainId, tokenSell, tokenBuy, interval as TimeInterval);
    res.json(result);
  } catch {
    res.status(502).json({
      error: {
        code: 'RPC_UNAVAILABLE',
        message: 'Unable to load market candles from upstream RPC providers',
      },
    });
  }
});

export default router;
