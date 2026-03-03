/**
 * ExportButton
 *
 * A dropdown button that lets users export tabular data as CSV, JSON, or open
 * the browser print dialog (for saving as PDF). The dropdown closes when the
 * user clicks outside, selects an option, or presses Escape.
 *
 * Accessibility:
 *   - aria-haspopup/aria-expanded on trigger
 *   - role="menu" / role="menuitem" on dropdown items
 *   - Keyboard navigation: Arrow keys, Enter, Escape
 *   - Focus management: focus trapped in menu when open
 *   - Visible focus rings (WCAG 2.1 AA)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileJson, FileSpreadsheet, Printer } from 'lucide-react';
import clsx from 'clsx';
import { exportToCSV, exportToJSON, exportToPDF } from '../../lib/exportUtils.ts';
import type { ColumnDef } from '../../lib/exportUtils.ts';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExportButtonProps {
  /** The data rows to export. */
  data: Record<string, unknown>[];
  /** Base filename used for downloads (date is appended automatically). */
  filename: string;
  /** Optional column definitions for ordering / labelling. */
  columns?: ColumnDef[];
  /** Additional CSS classes for the outer wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExportButton({
  data,
  filename,
  columns,
  className,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const menuItems = ['csv', 'json', 'pdf'] as const;

  // Close dropdown when clicking outside.
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on Escape key and handle arrow key navigation.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev < menuItems.length - 1 ? prev + 1 : 0;
            menuItemsRef.current[next]?.focus();
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev > 0 ? prev - 1 : menuItems.length - 1;
            menuItemsRef.current[next]?.focus();
            return next;
          });
          break;
        case 'Tab':
          setOpen(false);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, menuItems.length]);

  // Focus first menu item when dropdown opens
  useEffect(() => {
    if (open) {
      setFocusedIndex(0);
      // Delay focus to allow DOM to render
      requestAnimationFrame(() => {
        menuItemsRef.current[0]?.focus();
      });
    } else {
      setFocusedIndex(-1);
    }
  }, [open]);

  const handleCSV = useCallback(() => {
    exportToCSV(data, filename, columns);
    setOpen(false);
    triggerRef.current?.focus();
  }, [data, filename, columns]);

  const handleJSON = useCallback(() => {
    exportToJSON(data, filename);
    setOpen(false);
    triggerRef.current?.focus();
  }, [data, filename]);

  const handlePDF = useCallback(() => {
    exportToPDF(data, filename, columns);
    setOpen(false);
    triggerRef.current?.focus();
  }, [data, filename, columns]);

  const handlers = [handleCSV, handleJSON, handlePDF];

  const isEmpty = data.length === 0;

  return (
    <div ref={containerRef} className={clsx('relative inline-block', className)}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={isEmpty}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Export ${data.length} records`}
        className={clsx(
          'inline-flex items-center gap-2',
          'h-9 min-h-[44px] px-4 rounded-xl text-xs font-semibold',
          'bg-[var(--bg-tertiary,rgba(255,255,255,0.04))]',
          'border border-[var(--border-primary,rgba(255,255,255,0.08))]',
          'text-gray-300 hover:text-white',
          'hover:bg-white/[0.08] hover:border-white/[0.14]',
          'transition-all duration-200',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070A]',
        )}
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Export</span>
        <ChevronDown
          className={clsx(
            'h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          role="menu"
          aria-label="Export format options"
          className={clsx(
            'absolute right-0 mt-2 w-52 z-50',
            'rounded-xl overflow-hidden',
            'border border-white/[0.08]',
            'bg-[#0D0F14]/95 backdrop-blur-xl',
            'shadow-[0_8px_32px_-6px_rgba(0,0,0,0.5)]',
            'animate-in fade-in zoom-in-95 motion-reduce:animate-none',
            'py-1',
          )}
        >
          {/* CSV option */}
          <button
            ref={(el) => { menuItemsRef.current[0] = el; }}
            type="button"
            role="menuitem"
            tabIndex={focusedIndex === 0 ? 0 : -1}
            onClick={handlers[0]}
            className={clsx(
              'flex items-center gap-3 w-full px-4 py-2.5 text-left min-h-[44px]',
              'text-xs text-gray-300 hover:text-white hover:bg-white/[0.06]',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:bg-white/[0.08] focus-visible:text-white',
            )}
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <div>
              <div className="font-medium">Export as CSV</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Spreadsheet-compatible format
              </div>
            </div>
          </button>

          <div className="mx-3 border-t border-white/[0.06]" role="separator" />

          {/* JSON option */}
          <button
            ref={(el) => { menuItemsRef.current[1] = el; }}
            type="button"
            role="menuitem"
            tabIndex={focusedIndex === 1 ? 0 : -1}
            onClick={handlers[1]}
            className={clsx(
              'flex items-center gap-3 w-full px-4 py-2.5 text-left min-h-[44px]',
              'text-xs text-gray-300 hover:text-white hover:bg-white/[0.06]',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:bg-white/[0.08] focus-visible:text-white',
            )}
          >
            <FileJson className="h-4 w-4 text-amber-400" aria-hidden="true" />
            <div>
              <div className="font-medium">Export as JSON</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Machine-readable structured data
              </div>
            </div>
          </button>

          <div className="mx-3 border-t border-white/[0.06]" role="separator" />

          {/* PDF option */}
          <button
            ref={(el) => { menuItemsRef.current[2] = el; }}
            type="button"
            role="menuitem"
            tabIndex={focusedIndex === 2 ? 0 : -1}
            onClick={handlers[2]}
            className={clsx(
              'flex items-center gap-3 w-full px-4 py-2.5 text-left min-h-[44px]',
              'text-xs text-gray-300 hover:text-white hover:bg-white/[0.06]',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:bg-white/[0.08] focus-visible:text-white',
            )}
          >
            <Printer className="h-4 w-4 text-indigo-400" aria-hidden="true" />
            <div>
              <div className="font-medium">Print / Save as PDF</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Opens browser print dialog
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
