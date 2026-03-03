import { Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '../../hooks/useTheme';

// ---------------------------------------------------------------------------
// ThemeToggle -- sun/moon icon button with smooth rotation transition
// ---------------------------------------------------------------------------

export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={clsx(
        'relative flex h-9 w-9 items-center justify-center rounded-xl',
        'border border-[var(--border-primary)]',
        'bg-[var(--bg-tertiary)]/60',
        'text-[var(--text-secondary)]',
        'transition-all duration-300 ease-out',
        'hover:border-[var(--border-hover)]',
        'hover:text-[var(--accent-primary)]',
        'hover:shadow-[0_0_12px_rgba(99,102,241,0.15)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]',
        className,
      )}
    >
      <span
        className={clsx(
          'absolute inset-0 flex items-center justify-center transition-all duration-300',
          isDark
            ? 'rotate-0 scale-100 opacity-100'
            : 'rotate-90 scale-0 opacity-0',
        )}
      >
        <Moon className="h-[18px] w-[18px]" />
      </span>

      <span
        className={clsx(
          'absolute inset-0 flex items-center justify-center transition-all duration-300',
          isDark
            ? '-rotate-90 scale-0 opacity-0'
            : 'rotate-0 scale-100 opacity-100',
        )}
      >
        <Sun className="h-[18px] w-[18px]" />
      </span>
    </button>
  );
}
