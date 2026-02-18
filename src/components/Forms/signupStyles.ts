import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Shared style tokens for signup form steps (mirroring LoginPage)
// ---------------------------------------------------------------------------

export const INPUT_BASE = clsx(
  'w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
  'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
  'rounded-xl px-4 py-3 pl-11',
  'outline-none transition-all duration-200',
  'focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

export const INPUT_NO_ICON = clsx(
  'w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
  'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
  'rounded-xl px-4 py-3',
  'outline-none transition-all duration-200',
  'focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

export const SELECT_BASE = clsx(
  'w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
  'text-[var(--text-primary)]',
  'rounded-xl px-4 py-3 pl-11',
  'outline-none transition-all duration-200 appearance-none',
  'focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

export const ICON_LEFT =
  'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[var(--text-muted)]';

export const LABEL =
  'block text-sm font-medium text-[var(--text-secondary)] mb-1.5';

export const ERROR_TEXT = 'mt-1.5 text-xs text-[var(--danger)]';

export const CONTINUE_BUTTON = clsx(
  'flex-1 flex items-center justify-center gap-2',
  'bg-gradient-to-r from-indigo-600 to-purple-600',
  'hover:from-indigo-500 hover:to-purple-500',
  'text-white font-semibold',
  'rounded-xl px-4 py-3',
  'transition-all duration-200',
  'shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

export const BACK_BUTTON = clsx(
  'flex items-center justify-center gap-2',
  'bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
  'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
  'hover:border-[var(--border-hover)]',
  'font-semibold rounded-xl px-5 py-3',
  'transition-all duration-200',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);
