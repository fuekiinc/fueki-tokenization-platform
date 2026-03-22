import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKGROUND_POLLING_MULTIPLIER,
  createAdaptivePollingLoop,
  getPollingIntervalMs,
} from '../../src/lib/rpc/polling';

describe('rpc polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  it('multiplies polling intervals when the tab is hidden', () => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });

    expect(getPollingIntervalMs('high')).toBe(8_000 * BACKGROUND_POLLING_MULTIPLIER);
    expect(getPollingIntervalMs('medium')).toBe(12_000 * BACKGROUND_POLLING_MULTIPLIER);
  });

  it('runs adaptive polling immediately on visible tabs and can be triggered on demand', async () => {
    const poll = vi.fn(async () => {});
    const poller = createAdaptivePollingLoop({
      tier: 'high',
      poll,
    });

    await vi.runAllTicks();
    expect(poll).toHaveBeenCalledTimes(1);

    poller.triggerNow();
    await vi.runAllTicks();
    expect(poll).toHaveBeenCalledTimes(2);

    poller.cancel();
  });
});
