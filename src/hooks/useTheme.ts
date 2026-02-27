import { useCallback, useEffect, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Theme types
// ---------------------------------------------------------------------------

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'fueki-theme';

// ---------------------------------------------------------------------------
// External store for theme state (shared across all consumers)
// ---------------------------------------------------------------------------

let currentTheme: Theme = 'dark';
const listeners = new Set<() => void>();

function getSnapshot(): Theme {
  return currentTheme;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function applyTheme(theme: Theme): void {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
  emitChange();
}

// ---------------------------------------------------------------------------
// Initialise theme from localStorage (runs once)
//
// A one-time migration resets every user to dark mode.  After the migration
// key is written, subsequent visits honour the user's saved preference.
// Bump THEME_VERSION to force-reset everyone to dark again in the future.
// ---------------------------------------------------------------------------

const THEME_VERSION_KEY = 'fueki-theme-v';
const THEME_VERSION = '2'; // bump to force-reset to dark

function initTheme(): void {
  const migrated = localStorage.getItem(THEME_VERSION_KEY);

  if (migrated !== THEME_VERSION) {
    // Force dark and mark migration as done
    localStorage.setItem(STORAGE_KEY, 'dark');
    localStorage.setItem(THEME_VERSION_KEY, THEME_VERSION);
    currentTheme = 'dark';
  } else {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    currentTheme = stored === 'light' ? 'light' : 'dark';
  }

  document.documentElement.setAttribute('data-theme', currentTheme);
}

// Run init immediately on module load so there is no flash of wrong theme.
initTheme();

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'dark' as Theme);

  // Re-apply on mount in case SSR/hydration needs it
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }, []);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
  }, []);

  return { theme, toggleTheme, setTheme, isDark: theme === 'dark' } as const;
}