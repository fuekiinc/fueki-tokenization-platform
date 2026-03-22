import axios from 'axios';
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { clearPersistedAuth } from '../authStorage';
import { clearAccessToken, getAccessToken, setAccessToken } from '../authSession';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CLOUD_RUN_BACKEND_URL = 'https://fueki-backend-114394197024.us-central1.run.app';

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function deriveApiUrlFromRuntimeHost(): string | null {
  if (typeof window === 'undefined') return null;
  const { origin, hostname } = window.location;

  // Highest priority at runtime: explicit injected environment override.
  const runtimeInjected = (window as Window & {
    __FUEKI_RUNTIME_ENV__?: Record<string, string>;
  }).__FUEKI_RUNTIME_ENV__?.VITE_API_URL;
  if (runtimeInjected && runtimeInjected.trim()) {
    return runtimeInjected.trim();
  }

  // Local development defaults to the backend's documented dev port.
  if (isLocalhost(hostname)) {
    return 'http://localhost:8080';
  }

  // Cloud Run service URL mapping: fueki-frontend* -> fueki-backend*
  if (hostname.includes('run.app') && hostname.includes('fueki-frontend')) {
    const backendHost = hostname.replace('fueki-frontend', 'fueki-backend');
    return origin.replace(hostname, backendHost);
  }

  // Custom production domain fallback.
  if (hostname === 'fueki-tech.com' || hostname.endsWith('.fueki-tech.com')) {
    return DEFAULT_CLOUD_RUN_BACKEND_URL;
  }

  return null;
}

const envBaseURL = import.meta.env.VITE_API_URL as string | undefined;
const runtimeBaseURL = deriveApiUrlFromRuntimeHost();
const baseURL = envBaseURL || runtimeBaseURL || DEFAULT_CLOUD_RUN_BACKEND_URL;

if (!envBaseURL) {
  console.warn(
    `[api/client] VITE_API_URL is not set. Using fallback API base URL: ${baseURL}`,
  );
}

const apiClient = axios.create({
  baseURL: baseURL || '/api',
  timeout: 15_000,
  withCredentials: true, // Send httpOnly refresh token cookie automatically
});

// ---------------------------------------------------------------------------
// Request interceptor -- set Content-Type (skip for FormData so axios can
// auto-set multipart/form-data with the correct boundary)
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use((config) => {
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal check that a JWT string has the expected three-part structure.
 * This does NOT verify the signature -- it only rejects obviously invalid
 * strings (empty, truncated, non-JWT) before attaching them to requests.
 */
function isPlausibleJWT(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

const AUTH_REFRESH_EXCLUDED_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

export function shouldAttemptSilentRefresh(
  status: number | undefined,
  requestUrl: string | undefined,
  hasStoredSession: boolean,
): boolean {
  if (status !== 401 || !hasStoredSession) {
    return false;
  }

  const normalizedUrl = (requestUrl ?? '').toLowerCase();
  return !AUTH_REFRESH_EXCLUDED_PATHS.some((path) => normalizedUrl.includes(path));
}

// ---------------------------------------------------------------------------
// Request interceptor -- attach access token to every outgoing request
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken = getAccessToken();
    if (accessToken && isPlausibleJWT(accessToken)) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error),
);

// ---------------------------------------------------------------------------
// Response interceptor -- handle 401 by attempting a silent token refresh
// ---------------------------------------------------------------------------

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });
  failedQueue = [];
}

// Extend AxiosRequestConfig to track retry state without using `any`.
interface RetryableRequestConfig extends AxiosRequestConfig {
  _retry?: boolean;
  skipAuthRefresh?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    // Type-narrow the Axios error so we can safely access its properties.
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as RetryableRequestConfig & InternalAxiosRequestConfig;

    // Only attempt refresh on 401 and if this request has not already been retried.
    if (
      error.response?.status !== 401
      || originalRequest._retry
      || originalRequest.skipAuthRefresh
    ) {
      return Promise.reject(error);
    }

    // If a refresh is already in flight, queue this request.
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // The refresh token is sent automatically via httpOnly cookie
      // (withCredentials: true). We use a fresh axios instance to avoid
      // the interceptor loop — the refresh request must not trigger
      // another 401 retry.
      //
      // Use a bare axios instance (no interceptors) with the same baseURL
      // as the main client so the refresh path is identical to all other
      // API calls. This avoids fragile URL manipulation.
      const { data } = await axios.post<{ accessToken: string }>(
        '/api/auth/refresh',
        {},
        {
          baseURL: apiClient.defaults.baseURL,
          headers: { 'Content-Type': 'application/json' },
          timeout: 15_000,
          withCredentials: true,
        },
      );

      // Validate the response shape before persisting.
      if (!data || typeof data.accessToken !== 'string') {
        throw new Error('Invalid refresh response shape');
      }

      setAccessToken(data.accessToken);

      // Retry the original request and flush the queue.
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      processQueue(null, data.accessToken);

      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);

      // Clear in-memory token but let the app react via auth store state
      // change rather than performing a jarring hard redirect.
      clearAccessToken();
      clearPersistedAuth();

      // Dispatch a custom event so the auth store (or any listener) can
      // react and show a "session expired" message instead of silently
      // dumping the user to /login.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('fueki:session-expired', {
            detail: { reason: 'refresh_failed' },
          }),
        );
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;
