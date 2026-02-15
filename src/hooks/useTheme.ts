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
// Initialise theme from localStorage or system preference (runs once)
// ---------------------------------------------------------------------------

function initTheme(): void {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;

  if (stored === 'light' || stored === 'dark') {
    currentTheme = stored;
  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    currentTheme = 'light';
  } else {
    currentTheme = 'dark';
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
