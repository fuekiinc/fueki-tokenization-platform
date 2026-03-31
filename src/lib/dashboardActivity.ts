import type { TradeHistory } from '../types';

export const MAX_PERSISTED_TRADE_HISTORY = 1000;

function normalizeKeyPart(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function preferTrade(existing: TradeHistory, next: TradeHistory): TradeHistory {
  if (existing.status !== 'confirmed' && next.status === 'confirmed') {
    return next;
  }

  if (existing.status === 'confirmed' && next.status !== 'confirmed') {
    return existing;
  }

  if (next.timestamp > existing.timestamp) {
    return next;
  }

  return existing;
}

export function getTradeHistoryKey(trade: TradeHistory): string {
  return [
    normalizeKeyPart(trade.type),
    normalizeKeyPart(trade.txHash),
    normalizeKeyPart(trade.assetAddress),
    normalizeKeyPart(trade.from),
    normalizeKeyPart(trade.to),
  ].join('|');
}

export function mergeTradeHistoryEntries(
  ...tradeLists: Array<TradeHistory[] | undefined>
): TradeHistory[] {
  const merged = new Map<string, TradeHistory>();

  for (const trades of tradeLists) {
    if (!trades) continue;

    for (const trade of trades) {
      const key = getTradeHistoryKey(trade);
      const existing = merged.get(key);
      merged.set(key, existing ? preferTrade(existing, trade) : trade);
    }
  }

  return Array.from(merged.values())
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, MAX_PERSISTED_TRADE_HISTORY);
}
