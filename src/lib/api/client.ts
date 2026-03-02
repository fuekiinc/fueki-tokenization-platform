import axios from 'axios';
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import type { AuthTokens } from '../../types/auth';
import {
  clearPersistedAuth,
  persistTokens,
  readAuthSnapshot,
  resolveActiveStorageMode,
} from '../authStorage';
import type { AuthStorageMode } from '../authStorage';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CLOUD_RUN_BACKEND_URL = 'https://fueki-backend-pojr5zp2oq-uc.a.run.app';

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function deriveApiUrlFromRuntimeHost(): string | null {
  if (typeof window === 'undefined') return null;
  const { origin, hostname } = window.location;

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
 * Reads auth tokens from localStorage with validation.
 * Returns null if tokens are missing or malformed.
 */
function getStoredTokens(): AuthTokens | null {
  return readAuthSnapshot()?.tokens ?? null;
}

function getActiveStorageMode(): AuthStorageMode {
  return resolveActiveStorageMode() ?? 'local';
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

      // Persist the new access token (refresh token stays in httpOnly cookie).
      persistTokens(getActiveStorageMode(), { accessToken: data.accessToken });

      // Retry the original request and flush the queue.
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      processQueue(null, data.accessToken);

      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);

      // Clear auth state and redirect to login.
      clearPersistedAuth();
      window.location.href = '/login';

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;
