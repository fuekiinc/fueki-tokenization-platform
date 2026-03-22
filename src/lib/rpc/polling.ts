export type PollingTier = 'high' | 'medium' | 'low';

export const POLLING_INTERVALS_MS: Record<PollingTier, number> = Object.freeze({
  high: 8_000,
  medium: 12_000,
  low: 45_000,
});

export const BACKGROUND_POLLING_MULTIPLIER = 4;

function getGlobalDocument(): Document | null {
  return typeof document !== 'undefined' ? document : null;
}

export function isDocumentHidden(): boolean {
  return getGlobalDocument()?.hidden ?? false;
}

export function getPollingIntervalMs(tier: PollingTier): number {
  const baseInterval = POLLING_INTERVALS_MS[tier];
  return isDocumentHidden()
    ? baseInterval * BACKGROUND_POLLING_MULTIPLIER
    : baseInterval;
}

export function subscribeToVisibilityChange(listener: () => void): () => void {
  const doc = getGlobalDocument();
  if (!doc) {
    return () => {};
  }

  doc.addEventListener('visibilitychange', listener);
  return () => {
    doc.removeEventListener('visibilitychange', listener);
  };
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
  if (timer) {
    clearTimeout(timer);
  }
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
}

export function createAdaptivePollingLoop(params: {
  tier: PollingTier;
  poll: () => Promise<void> | void;
  immediate?: boolean;
}): {
  cancel: () => void;
  triggerNow: () => void;
} {
  const { tier, poll, immediate = true } = params;

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  const schedule = (): void => {
    clearTimer(timer);
    if (cancelled) return;

    timer = setTimeout(() => {
      void run();
    }, getPollingIntervalMs(tier));
    unrefTimer(timer);
  };

  const run = async (): Promise<void> => {
    if (cancelled || inFlight) {
      return;
    }

    inFlight = Promise.resolve(poll()).finally(() => {
      inFlight = null;
      if (!cancelled) {
        schedule();
      }
    });

    await inFlight;
  };

  const triggerNow = (): void => {
    clearTimer(timer);
    if (!cancelled) {
      void run();
    }
  };

  const unsubscribeVisibility = subscribeToVisibilityChange(() => {
    if (cancelled) return;

    if (!isDocumentHidden()) {
      triggerNow();
      return;
    }

    schedule();
  });

  if (immediate && !isDocumentHidden()) {
    void run();
  } else {
    schedule();
  }

  return {
    cancel: () => {
      cancelled = true;
      clearTimer(timer);
      unsubscribeVisibility();
    },
    triggerNow,
  };
}
