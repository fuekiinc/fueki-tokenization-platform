const DEFAULT_SUPPRESS_OPTIONAL_REQUESTS = true;

function shouldSuppressOptionalThirdwebRequests(): boolean {
  const raw = (import.meta.env.VITE_THIRDWEB_SUPPRESS_OPTIONAL_REQUESTS ?? '').trim();
  if (!raw) return DEFAULT_SUPPRESS_OPTIONAL_REQUESTS;
  return !['0', 'false', 'no', 'off'].includes(raw.toLowerCase());
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isThirdwebAnalyticsEvent(url: string): boolean {
  return /^https:\/\/c\.thirdweb\.com\/event(?:[/?#]|$)/i.test(url);
}

function isThirdwebSocialProfileLookup(url: string): boolean {
  return /^https:\/\/social\.thirdweb\.com\/v1\/profiles\//i.test(url);
}

declare global {
  interface Window {
    __fuekiThirdwebGuardInstalled?: boolean;
  }
}

/**
 * thirdweb SDK can issue optional telemetry/profile requests that return 401/400
 * on restricted client IDs. Those requests are not required for core wallet usage.
 */
export function installThirdwebNetworkGuard(): void {
  if (typeof window === 'undefined') return;
  if (!shouldSuppressOptionalThirdwebRequests()) return;
  if (window.__fuekiThirdwebGuardInstalled) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = getRequestUrl(input);

    if (isThirdwebAnalyticsEvent(url)) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }

    if (isThirdwebSocialProfileLookup(url)) {
      return Promise.resolve(
        new Response('[]', {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }),
      );
    }

    return originalFetch(input, init);
  }) as typeof window.fetch;

  window.__fuekiThirdwebGuardInstalled = true;
}
