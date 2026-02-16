/**
 * Export Utilities
 *
 * Provides RFC 4180 compliant CSV generation and browser-print-based PDF
 * export. No external libraries are required.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnDef {
  key: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Generic download helper
// ---------------------------------------------------------------------------

/**
 * Trigger a browser file download from a Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// CSV helpers (RFC 4180)
// ---------------------------------------------------------------------------

/**
 * Escape a single cell value according to RFC 4180.
 *
 * A field MUST be enclosed in double-quotes if it contains:
 * - a comma
 * - a double-quote (escaped by doubling it)
 * - a newline (CR or LF)
 */
function escapeCSVField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Resolve a potentially nested key like "wallet.address" to a value.
 */
function resolveKey(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return '';
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Convert an array of objects to an RFC 4180 compliant CSV string.
 *
 * @param data    - Array of row objects
 * @param columns - Optional column definitions. When omitted, headers are
 *                  derived from the union of all keys in `data`.
 */
export function toCSVString(
  data: Record<string, unknown>[],
  columns?: ColumnDef[],
): string {
  if (data.length === 0) return '';

  // Determine headers.
  const cols: ColumnDef[] =
    columns ??
    Array.from(
      data.reduce<Set<string>>((keys, row) => {
        for (const k of Object.keys(row)) keys.add(k);
        return keys;
      }, new Set()),
    ).map((k) => ({ key: k, label: k }));

  const headerRow = cols.map((c) => escapeCSVField(c.label)).join(',');

  const bodyRows = data.map((row) =>
    cols.map((c) => escapeCSVField(resolveKey(row, c.key))).join(','),
  );

  // RFC 4180 specifies CRLF line endings.
  return [headerRow, ...bodyRows].join('\r\n');
}

/**
 * Export an array of objects as a CSV file download.
 *
 * @param data     - Array of row objects
 * @param filename - Base filename (without extension). A date suffix and
 *                   `.csv` extension are appended automatically.
 * @param columns  - Optional column definitions for ordering / labelling.
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  filename: string,
  columns?: ColumnDef[],
): void {
  const csv = toCSVString(data, columns);
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const fullFilename = `${filename}-${date}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, fullFilename);
}

// ---------------------------------------------------------------------------
// PDF / Print export
// ---------------------------------------------------------------------------

/**
 * Build a self-contained HTML document string containing a styled table
 * representation of the data suitable for the browser print dialog.
 */
function buildPrintHTML(
  data: Record<string, unknown>[],
  columns: ColumnDef[],
  title: string,
): string {
  const headerCells = columns
    .map((c) => `<th>${escapeHTML(c.label)}</th>`)
    .join('');

  const bodyRows = data
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => `<td>${escapeHTML(String(resolveKey(row, c.key) ?? ''))}</td>`)
          .join('')}</tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHTML(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #1a1a1a; }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
    .meta { font-size: 12px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; white-space: nowrap; }
    tr:nth-child(even) { background: #fafafa; }
    @media print {
      body { padding: 0; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHTML(title)}</h1>
  <p class="meta">Exported on ${new Date().toLocaleString()} &mdash; ${data.length} record${data.length !== 1 ? 's' : ''}</p>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Open the browser print dialog with a formatted table of the data.
 * The user can then choose "Save as PDF" from their system print dialog.
 *
 * @param data     - Array of row objects
 * @param filename - Title shown on the printed document
 * @param columns  - Optional column definitions. When omitted, headers are
 *                   derived from the union of all keys.
 */
export function exportToPDF(
  data: Record<string, unknown>[],
  filename: string,
  columns?: ColumnDef[],
): void {
  const cols: ColumnDef[] =
    columns ??
    Array.from(
      data.reduce<Set<string>>((keys, row) => {
        for (const k of Object.keys(row)) keys.add(k);
        return keys;
      }, new Set()),
    ).map((k) => ({ key: k, label: k }));

  const html = buildPrintHTML(data, cols, filename);
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for the document to fully render before triggering print.
  printWindow.addEventListener('load', () => {
    printWindow.focus();
    printWindow.print();
  });
}
