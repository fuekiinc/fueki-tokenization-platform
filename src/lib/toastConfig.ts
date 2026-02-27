/**
 * Shared Toaster configuration
 *
 * Both Layout.tsx and AuthLayout.tsx render a <Toaster /> with identical
 * settings. This module centralises the configuration so changes only need
 * to be made in one place.
 *
 * Features:
 *   - Consistent top-right positioning
 *   - Duration scaled by severity (success / error / loading)
 *   - Custom glass-morphism styling matching the Fueki design system
 *   - Accessibility: toasts are announced to screen readers
 */

import type { ToasterProps } from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Duration constants (ms)
// ---------------------------------------------------------------------------

/** Standard success toast duration. */
export const TOAST_DURATION_SUCCESS = 3_000;

/** Standard error toast duration -- slightly longer so users can read. */
export const TOAST_DURATION_ERROR = 5_000;

/** Default duration for generic toasts. */
export const TOAST_DURATION_DEFAULT = 4_000;

/** Loading toasts persist until explicitly dismissed. */
export const TOAST_DURATION_LOADING = Infinity;

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function darkToastStyle(): React.CSSProperties {
  return {
    background: 'rgba(17, 17, 24, 0.95)',
    color: '#ededf2',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '16px',
    backdropFilter: 'blur(16px)',
    padding: '14px 18px',
    fontSize: '14px',
    lineHeight: '1.5',
    maxWidth: '420px',
    boxShadow:
      '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03)',
  };
}

function lightToastStyle(): React.CSSProperties {
  return {
    background: 'rgba(255, 255, 255, 0.95)',
    color: '#0F172A',
    border: '1px solid rgba(15, 23, 42, 0.08)',
    borderRadius: '16px',
    backdropFilter: 'blur(16px)',
    padding: '14px 18px',
    fontSize: '14px',
    lineHeight: '1.5',
    maxWidth: '420px',
    boxShadow:
      '0 10px 30px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the full set of props to spread onto `<Toaster />`.
 *
 * @param isDark - Whether the application is currently using the dark theme.
 *
 * @example
 * ```tsx
 * import { Toaster } from 'react-hot-toast';
 * import { getToasterProps } from '../../lib/toastConfig';
 *
 * <Toaster {...getToasterProps(isDark)} />
 * ```
 */
export function getToasterProps(isDark: boolean): ToasterProps {
  return {
    position: 'top-right',
    gutter: 12,
    containerStyle: { top: 24, right: 24 },
    toastOptions: {
      duration: TOAST_DURATION_DEFAULT,
      style: isDark ? darkToastStyle() : lightToastStyle(),

      success: {
        duration: TOAST_DURATION_SUCCESS,
        iconTheme: {
          primary: isDark ? '#10B981' : '#059669',
          secondary: '#fff',
        },
      },

      error: {
        duration: TOAST_DURATION_ERROR,
        iconTheme: {
          primary: isDark ? '#EF4444' : '#DC2626',
          secondary: '#fff',
        },
      },

      loading: {
        duration: TOAST_DURATION_LOADING,
        iconTheme: {
          primary: isDark ? '#6366F1' : '#4F46E5',
          secondary: '#fff',
        },
      },
    },
  };
}
