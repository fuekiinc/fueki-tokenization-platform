const inFlightRequests = new Map<string, Promise<unknown>>();

export function dedupeRpcRequest<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const request = Promise.resolve()
    .then(loader)
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, request);
  return request;
}

export function getInFlightRpcRequestCount(): number {
  return inFlightRequests.size;
}
