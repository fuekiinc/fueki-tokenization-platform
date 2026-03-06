/**
 * Run async work in deterministic batches to avoid unbounded Promise fan-out.
 *
 * Useful for RPC-heavy pages where firing hundreds of requests at once can
 * trigger provider throttling under load.
 */
export async function mapInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const results: R[] = [];

  for (let start = 0; start < items.length; start += safeBatchSize) {
    const chunk = items.slice(start, start + safeBatchSize);
    const chunkResults = await Promise.all(
      chunk.map((item, offset) => mapper(item, start + offset)),
    );
    results.push(...chunkResults);
  }

  return results;
}
