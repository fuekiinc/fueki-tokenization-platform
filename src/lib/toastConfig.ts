import type { ToasterProps } from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Shared Toaster configuration
//
// Both Layout.tsx and AuthLayout.tsx render a <Toaster /> with identical
// settings.  This module centralises the configuration so changes only need
// to be made in one place.
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
    position: 'bottom-right',
    gutter: 12,
    containerStyle: { bottom: 24, right: 24 },
    toastOptions: {
      duration: 5000,
      style: isDark
        ? {
            background: 'rgba(17, 17, 24, 0.95)',
            color: '#ededf2',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '16px',
            backdropFilter: 'blur(16px)',
            padding: '14px 18px',
            fontSize: '14px',
            boxShadow:
              '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03)',
          }
        : {
            background: 'rgba(255, 255, 255, 0.95)',
            color: '#0F172A',
            border: '1px solid rgba(15, 23, 42, 0.08)',
            borderRadius: '16px',
            backdropFilter: 'blur(16px)',
            padding: '14px 18px',
            fontSize: '14px',
            boxShadow:
              '0 10px 30px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)',
          },
      success: {
        iconTheme: {
          primary: isDark ? '#6366f1' : '#4F46E5',
          secondary: '#fff',
        },
      },
      error: {
        iconTheme: {
          primary: isDark ? '#ef4444' : '#DC2626',
          secondary: '#fff',
        },
      },
    },
  };
}
