import axios from 'axios';
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import type { AuthTokens } from '../../types/auth';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const AUTH_STORAGE_KEY = 'fueki-auth-tokens';

const baseURL = import.meta.env.VITE_API_URL as string | undefined;

// Fail-fast warning in development if the API URL env var is missing
// (security audit C-4: prevents silently falling back to production).
if (!baseURL && import.meta.env.DEV) {
  console.error(
    '[api/client] VITE_API_URL is not set. API requests will fall back to ' +
      'the production URL, which is unsafe in development. Set VITE_API_URL ' +
      'in your .env file.',
  );
}

const apiClient = axios.create({
  baseURL: baseURL ?? 'https://fueki-backend-114394197024.us-central1.run.app',
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send httpOnly refresh token cookie automatically
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reads auth tokens from localStorage with validation.
 * Returns null if tokens are missing or malformed.
 */
function getStoredTokens(): AuthTokens | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'accessToken' in parsed &&
      typeof (parsed as Record<string, unknown>).accessToken === 'string'
    ) {
      return parsed as AuthTokens;
    }
    return null;
  } catch {
    // Malformed JSON in storage -- treat as absent.
    return null;
  }
}

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

// ---------------------------------------------------------------------------
// Request interceptor -- attach access token to every outgoing request
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const tokens = getStoredTokens();
    if (tokens?.accessToken && isPlausibleJWT(tokens.accessToken)) {
      config.headers.Authorization = `Bearer ${tokens.accessToken}`;
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
    if (error.response?.status !== 401 || originalRequest._retry) {
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
      const { data } = await axios.post<{ accessToken: string }>(
        `${apiClient.defaults.baseURL}/api/auth/refresh`,
        {},
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15_000,
          withCredentials: true,
        },
      );

      // Validate the response shape before persisting.
      if (!data || typeof data.accessToken !== 'string') {
        throw new Error('Invalid refresh response shape');
      }

      // Persist the new access token (refresh token stays in httpOnly cookie).
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ accessToken: data.accessToken }));

      // Retry the original request and flush the queue.
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      processQueue(null, data.accessToken);

      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);

      // Clear auth state and redirect to login.
      localStorage.removeItem(AUTH_STORAGE_KEY);
      window.location.href = '/login';

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;
