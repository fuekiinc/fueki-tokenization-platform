import { invalidateQueriesForTopics } from '../queryClient';

export type RpcRefetchTopic =
  | 'balances'
  | 'allowances'
  | 'orders'
  | 'pool'
  | 'pending-transactions'
  | 'history'
  | 'market-data'
  | 'gas';

export interface RpcRefetchEventDetail {
  topics: RpcRefetchTopic[];
}

const RPC_REFETCH_EVENT = 'fueki:rpc-refetch';

export function emitRpcRefetch(topics: RpcRefetchTopic[]): void {
  if (topics.length === 0) {
    return;
  }

  const uniqueTopics = Array.from(new Set(topics));
  invalidateQueriesForTopics(uniqueTopics);

  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<RpcRefetchEventDetail>(RPC_REFETCH_EVENT, {
      detail: { topics: uniqueTopics },
    }),
  );
}

export function subscribeToRpcRefetch(
  topics: RpcRefetchTopic[],
  listener: (detail: RpcRefetchEventDetail) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const allowedTopics = new Set(topics);
  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<RpcRefetchEventDetail>).detail;
    if (!detail?.topics?.some((topic) => allowedTopics.has(topic))) {
      return;
    }
    listener(detail);
  };

  window.addEventListener(RPC_REFETCH_EVENT, handleEvent as EventListener);
  return () => {
    window.removeEventListener(RPC_REFETCH_EVENT, handleEvent as EventListener);
  };
}
