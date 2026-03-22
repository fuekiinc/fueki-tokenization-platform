import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  type ChartCandle,
  type ChartDataSource,
  type ChartInterval,
  fetchHistoricalCandles,
  mergeCandleSets,
  subscribeToLiveCandleUpdates,
} from '../lib/chart/dataFeed';
import { queryKeys } from '../lib/queryClient';
import { useWalletStore } from '../store/walletStore';

export type CandlestickDataPoint = ChartCandle;
export type TimeInterval = ChartInterval;

export interface PriceHistoryResult {
  data: CandlestickDataPoint[];
  isLoading: boolean;
  isRealData: boolean;
  source: ChartDataSource;
}

export function usePriceHistory(
  tokenSell: string,
  tokenBuy: string,
  interval: TimeInterval,
): PriceHistoryResult {
  const chainId = useWalletStore((state) => state.wallet.chainId);
  const [liveCandles, setLiveCandles] = useState<CandlestickDataPoint[]>([]);
  const [liveSource, setLiveSource] = useState<ChartDataSource>('none');

  const hasDistinctPair =
    Boolean(tokenSell) &&
    Boolean(tokenBuy) &&
    tokenSell.toLowerCase() !== tokenBuy.toLowerCase();

  const historicalQuery = useQuery({
    queryKey: queryKeys.priceHistory(tokenSell, tokenBuy, chainId, interval),
    enabled: Boolean(chainId) && hasDistinctPair,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!chainId) {
        return { candles: [], source: 'none' as ChartDataSource };
      }

      return fetchHistoricalCandles({
        chainId,
        tokenSell,
        tokenBuy,
        interval,
      });
    },
  });

  useEffect(() => {
    if (!chainId || !hasDistinctPair || !historicalQuery.data) {
      setLiveCandles([]);
      setLiveSource('none');
      return;
    }

    let cancelled = false;
    setLiveCandles([]);
    setLiveSource(historicalQuery.data.source);

    const unsubscribeLive = subscribeToLiveCandleUpdates({
      chainId,
      tokenSell,
      tokenBuy,
      interval,
      historicalCandles: historicalQuery.data.candles,
      onCandles: (nextLiveCandles) => {
        if (cancelled) {
          return;
        }

        setLiveCandles(nextLiveCandles);
        setLiveSource((currentSource) =>
          currentSource === 'backend' || nextLiveCandles.length === 0
            ? currentSource
            : 'rpc',
        );
      },
    });

    return () => {
      cancelled = true;
      unsubscribeLive();
    };
  }, [chainId, hasDistinctPair, historicalQuery.data, interval, tokenBuy, tokenSell]);

  const candles = useMemo(
    () => mergeCandleSets(historicalQuery.data?.candles ?? [], liveCandles),
    [historicalQuery.data?.candles, liveCandles],
  );

  const source = historicalQuery.data
    ? historicalQuery.data.source === 'backend' || liveCandles.length === 0
      ? historicalQuery.data.source
      : liveSource
    : 'none';

  return useMemo(
    () => ({
      data: candles,
      isLoading: historicalQuery.isLoading,
      isRealData: candles.length > 0,
      source,
    }),
    [candles, historicalQuery.isLoading, source],
  );
}
