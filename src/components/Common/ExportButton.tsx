/**
 * ExportButton
 *
 * A dropdown button that lets users export tabular data as CSV or open the
 * browser print dialog (for saving as PDF). The dropdown closes when the
 * user clicks outside or selects an option.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Download, FileSpreadsheet, Printer, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { exportToCSV, exportToPDF } from '../../lib/exportUtils.ts';
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

  // Close on Escape key.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleCSV = useCallback(() => {
    exportToCSV(data, filename, columns);
    setOpen(false);
  }, [data, filename, columns]);

  const handlePDF = useCallback(() => {
    exportToPDF(data, filename, columns);
    setOpen(false);
  }, [data, filename, columns]);

  const isEmpty = data.length === 0;

  return (
    <div ref={containerRef} className={clsx('relative inline-block', className)}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={isEmpty}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        className={clsx(
          'inline-flex items-center gap-2',
          'h-9 px-4 rounded-xl text-xs font-semibold',
          'bg-[var(--bg-tertiary,rgba(255,255,255,0.04))]',
          'border border-[var(--border-primary,rgba(255,255,255,0.08))]',
          'text-gray-300 hover:text-white',
          'hover:bg-white/[0.08] hover:border-white/[0.14]',
          'transition-all duration-200',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
        )}
      >
        <Download className="h-3.5 w-3.5" />
        <span>Export</span>
        <ChevronDown
          className={clsx(
            'h-3.5 w-3.5 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          role="menu"
          className={clsx(
            'absolute right-0 mt-2 w-52 z-50',
            'rounded-xl overflow-hidden',
            'border border-white/[0.08]',
            'bg-[#0D0F14]/95 backdrop-blur-xl',
            'shadow-[0_8px_32px_-6px_rgba(0,0,0,0.5)]',
            'animate-in fade-in zoom-in-95',
            'py-1',
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleCSV}
            className={clsx(
              'flex items-center gap-3 w-full px-4 py-2.5 text-left',
              'text-xs text-gray-300 hover:text-white hover:bg-white/[0.06]',
              'transition-colors duration-150',
            )}
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
            <div>
              <div className="font-medium">Export as CSV</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Spreadsheet-compatible format
              </div>
            </div>
          </button>

          <div className="mx-3 border-t border-white/[0.06]" />

          <button
            type="button"
            role="menuitem"
            onClick={handlePDF}
            className={clsx(
              'flex items-center gap-3 w-full px-4 py-2.5 text-left',
              'text-xs text-gray-300 hover:text-white hover:bg-white/[0.06]',
              'transition-colors duration-150',
            )}
          >
            <Printer className="h-4 w-4 text-indigo-400" />
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
