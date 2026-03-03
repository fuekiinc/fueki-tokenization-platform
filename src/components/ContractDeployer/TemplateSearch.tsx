/**
 * TemplateSearch -- search input + category filter pills for the template browser.
 *
 * The search input is debounced (300ms) so rapid keystrokes don't trigger
 * unnecessary filter passes. Category pills use the platform's standard
 * FILTER_PILL_CLASSES for consistent styling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Search, X } from 'lucide-react';
import type { TemplateCategory } from '../../types/contractDeployer';
import { FILTER_PILL_CLASSES, INPUT_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;

const CATEGORIES: { value: TemplateCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'tokens', label: 'Tokens' },
  { value: 'nfts', label: 'NFTs' },
  { value: 'staking', label: 'Staking' },
  { value: 'trading', label: 'Trading' },
  { value: 'utility', label: 'Utility' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TemplateSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: TemplateCategory | 'all';
  onCategoryChange: (category: TemplateCategory | 'all') => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateSearch({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
}: TemplateSearchProps) {
  // Local value drives the input immediately; debounced value is emitted upstream.
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync local state when the parent resets the query externally.
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  // Debounced propagation
  const handleInputChange = useCallback(
    (value: string) => {
      setLocalQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearchChange(value);
      }, DEBOUNCE_MS);
    },
    [onSearchChange],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleClear = useCallback(() => {
    setLocalQuery('');
    onSearchChange('');
    inputRef.current?.focus();
  }, [onSearchChange]);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* Search input                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={localQuery}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Search templates by name, tag, or description..."
          className={clsx(INPUT_CLASSES.base, 'pl-11 pr-10')}
          aria-label="Search contract templates"
        />
        {localQuery.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className={clsx(
              'absolute right-3 top-1/2 -translate-y-1/2',
              'flex h-6 w-6 items-center justify-center rounded-md',
              'text-gray-600 hover:text-gray-300 hover:bg-white/[0.06]',
              'transition-all duration-150',
              'focus-visible:ring-2 focus-visible:ring-indigo-400 outline-none',
            )}
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Category filter pills                                              */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={FILTER_PILL_CLASSES.containerWide}
        role="tablist"
        aria-label="Filter templates by category"
      >
        {CATEGORIES.map(({ value, label }) => {
          const isActive = selectedCategory === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onCategoryChange(value)}
              className={clsx(
                FILTER_PILL_CLASSES.pillWide,
                isActive ? FILTER_PILL_CLASSES.active : FILTER_PILL_CLASSES.inactive,
              )}
            >
              {isActive && (
                <span
                  className={FILTER_PILL_CLASSES.activeHighlight}
                  aria-hidden="true"
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TemplateSearch;
