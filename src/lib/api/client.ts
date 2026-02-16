import axios from 'axios';
import type { AuthTokens } from '../../types/auth';

const AUTH_STORAGE_KEY = 'fueki-auth-tokens';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'https://fueki-wallet-backend-production.up.railway.app',
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
});

// ---------------------------------------------------------------------------
// Request interceptor -- attach access token to every outgoing request
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use(
  (config) => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const tokens: AuthTokens = JSON.parse(raw);
        if (tokens.accessToken) {
          config.headers.Authorization = `Bearer ${tokens.accessToken}`;
        }
      }
    } catch {
      // Malformed JSON in storage -- ignore silently
    }
    return config;
  },
  (error) => Promise.reject(error),
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
    } else {
      promise.resolve(token!);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh on 401 and if this request has not already been retried
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // If a refresh is already in flight, queue this request
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
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        throw new Error('No auth tokens in storage');
      }

      const tokens: AuthTokens = JSON.parse(raw);
      if (!tokens.refreshToken) {
        throw new Error('No refresh token available');
      }

      const { data } = await axios.post<AuthTokens>(
        `${apiClient.defaults.baseURL}/api/auth/refresh`,
        { refreshToken: tokens.refreshToken },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15_000,
        },
      );

      // Persist the new token pair
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));

      // Retry the original request and flush the queue
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      processQueue(null, data.accessToken);

      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);

      // Clear auth state and redirect to login
      localStorage.removeItem(AUTH_STORAGE_KEY);
      window.location.href = '/login';

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;
