import type { ParsedTransaction, ParsedDocument } from '../../types';
import { generateId, roundCurrency } from '../utils/helpers';

// ---------------------------------------------------------------------------
// pdf.js setup -- lazy-loaded to avoid blocking initial page load
// ---------------------------------------------------------------------------

let pdfJsLoaded: typeof import('pdfjs-dist') | null = null;

async function getPdfJs() {
  if (pdfJsLoaded) return pdfJsLoaded;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href;
  pdfJsLoaded = pdfjs;
  return pdfjs;
}

// ---------------------------------------------------------------------------
// Magnitude suffixes  ($2M = 2,000,000 etc.)
// ---------------------------------------------------------------------------

const MAGNITUDE_MAP: Record<string, number> = {
  k: 1_000,
  K: 1_000,
  m: 1_000_000,
  M: 1_000_000,
  mm: 1_000_000,
  MM: 1_000_000,
  b: 1_000_000_000,
  B: 1_000_000_000,
  bn: 1_000_000_000,
  Bn: 1_000_000_000,
  t: 1_000_000_000_000,
  T: 1_000_000_000_000,
};

// ---------------------------------------------------------------------------
// Amount extraction patterns
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS = ['$', '€', '£', '¥', '₹', '₩', '₿'];
const CURRENCY_CODES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR',
  'KRW', 'BTC', 'ETH', 'USDT', 'USDC',
];

const CURRENCY_SYM_ESCAPED = CURRENCY_SYMBOLS.map((s) => `\\${s}`).join('|');
const CURRENCY_CODE_ALT = CURRENCY_CODES.join('|');

/**
 * Primary pattern -- matches currency-annotated amounts including magnitude
 * suffixes.  Examples:
 *   $2M  |  $1,234.56  |  -€500K  |  USD 1,000  |  2.5B USD  |  ($300.00)
 *
 * Captures:
 *   paren  – '(' if the amount is wrapped in parens (accounting negative)
 *   neg    – '-' if preceded by a minus sign
 *   amt    – the numeric portion with optional commas / decimals
 *   mag    – optional magnitude suffix (K, M, B, T, MM, Bn, etc.)
 */
const CURRENCY_AMOUNT_RE = new RegExp(
  '(?<paren>\\()?'                              + // optional opening paren
  '(?<neg>-)?\\s*'                               + // optional negative sign
  '(?:'                                          +
    // $1,234.56K  or  €500M  (symbol prefix)
    `(?:${CURRENCY_SYM_ESCAPED})\\s*`            +
    '(?<amt1>[\\d,]+(?:\\.\\d+)?)'               +
    '(?<mag1>[KkMmBbTt](?:[MmNn])?)?'           +
  '|'                                            +
    // USD 1,234.56  (code prefix)
    `(?:${CURRENCY_CODE_ALT})\\s+`               +
    '(?<amt2>[\\d,]+(?:\\.\\d+)?)'               +
    '(?<mag2>[KkMmBbTt](?:[MmNn])?)?'           +
  '|'                                            +
    // 1,234.56 USD  or  1,234.56M USD  (code suffix)
    '(?<amt3>[\\d,]+(?:\\.\\d+)?)'               +
    '(?<mag3>[KkMmBbTt](?:[MmNn])?)?'           +
    `\\s*(?:${CURRENCY_CODE_ALT})`               +
  ')'                                            +
  '\\)?',                                          // optional closing paren
  'g',
);

/**
 * Fallback pattern -- plain decimal numbers (e.g. "1234.56") that appear
 * on any line.  We accept these more broadly than before because pdf.js
 * often strips context from table rows.
 */
const PLAIN_DECIMAL_RE =
  /(?<paren>\()?(?<neg>-)?(?<amt>\d[\d,]*\.\d{1,2})(?<mag>[KkMmBbTt](?:[MmNn])?)?\)?/g;

/**
 * Lines we should skip -- headers, footers, page numbers, purely
 * alphabetic content, etc.
 */
const NOISE_LINE_RE =
  /^(page\s+\d|confidential|disclaimer|©|all rights reserved|\d{1,3}$)/i;

/**
 * Patterns that indicate a value is NOT a monetary amount:
 *   - Percentages  ("5.25%")
 *   - Dates        ("01/15" at start, "2024.01")
 *   - Times        ("14:30")
 *   - Phone-like   ("555.1234")
 *   - IDs / refs   (preceded by "#" or "no." or "ref")
 */
function looksLikeNonAmount(raw: string, fullLine: string, matchIndex: number): boolean {
  // Percentage directly after the number
  const afterMatch = fullLine.substring(matchIndex + raw.length);
  if (/^\s*%/.test(afterMatch)) return true;

  // The cleaned value
  const cleaned = raw.replace(/,/g, '');

  // Looks like a year (e.g. "2024.00" or "2025.01")
  if (/^20\d{2}\.\d{2}$/.test(cleaned)) return true;

  // Very small number that's likely a date fragment (1.01 - 12.31)
  if (/^\d{1,2}\.\d{2}$/.test(cleaned)) {
    const intPart = parseInt(cleaned, 10);
    if (intPart >= 1 && intPart <= 31) return true;
  }

  // Preceded by "#" or "no." or "ref" -- likely an ID
  const before = fullLine.substring(0, matchIndex);
  if (/(?:#|no\.?\s*|ref\.?\s*|id:?\s*)$/i.test(before)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Currency detection
// ---------------------------------------------------------------------------

function detectCurrency(fullText: string): string {
  for (const code of CURRENCY_CODES) {
    const re = new RegExp(`\\b${code}\\b`, 'i');
    if (re.test(fullText)) return code.toUpperCase();
  }
  if (fullText.includes('$')) return 'USD';
  if (fullText.includes('€')) return 'EUR';
  if (fullText.includes('£')) return 'GBP';
  if (fullText.includes('¥')) return 'JPY';
  if (fullText.includes('₹')) return 'INR';
  return 'USD';
}

// ---------------------------------------------------------------------------
// Resolve magnitude suffix
// ---------------------------------------------------------------------------

function resolveMagnitude(raw: string, mag: string | undefined): number | null {
  const cleaned = raw.replace(/,/g, '');
  const base = Number(cleaned);
  if (!Number.isFinite(base)) return null;
  if (mag) {
    const multiplier = MAGNITUDE_MAP[mag];
    if (multiplier) return base * multiplier;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Parse amount with paren/neg handling
// ---------------------------------------------------------------------------

function parseAmountFull(
  raw: string,
  neg: string | undefined,
  paren: string | undefined,
  mag: string | undefined,
): number | null {
  const value = resolveMagnitude(raw, mag);
  if (value === null || value === 0) return null;
  const isNeg = !!neg || !!paren; // (1,234.56) is negative in accounting
  return isNeg ? -value : value;
}

// ---------------------------------------------------------------------------
// Extract transactions from lines
// ---------------------------------------------------------------------------

function extractTransactionsFromLines(lines: string[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const seenKeys = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 2) continue;
    if (NOISE_LINE_RE.test(trimmed)) continue;

    // ------------------------------------------------------------------
    // Pass 1: Currency-annotated amounts (highest confidence)
    // ------------------------------------------------------------------
    let foundCurrencyAmount = false;
    for (const m of trimmed.matchAll(CURRENCY_AMOUNT_RE)) {
      const raw = m.groups?.amt1 ?? m.groups?.amt2 ?? m.groups?.amt3;
      const mag = m.groups?.mag1 ?? m.groups?.mag2 ?? m.groups?.mag3;
      if (!raw) continue;

      if (looksLikeNonAmount(raw, trimmed, m.index ?? 0)) continue;

      const amount = parseAmountFull(raw, m.groups?.neg, m.groups?.paren, mag);
      if (amount === null) continue;

      const key = `${trimmed}|${amount}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      transactions.push({
        id: generateId(),
        type: amount < 0 ? 'debit' : 'credit',
        amount: roundCurrency(amount),
        currency: '',
        description: trimmed.substring(0, 200),
        date: extractDate(trimmed),
      });
      foundCurrencyAmount = true;
    }
    if (foundCurrencyAmount) continue;

    // ------------------------------------------------------------------
    // Pass 2: Plain decimal numbers (lower confidence -- accept broadly)
    // PDF table rows often lose their column headers after text extraction.
    // ------------------------------------------------------------------
    for (const m of trimmed.matchAll(PLAIN_DECIMAL_RE)) {
      const raw = m.groups?.amt;
      const mag = m.groups?.mag;
      if (!raw) continue;

      if (looksLikeNonAmount(raw, trimmed, m.index ?? 0)) continue;

      const amount = parseAmountFull(raw, m.groups?.neg, m.groups?.paren, mag);
      if (amount === null) continue;

      // Skip very small amounts that are almost certainly not financial
      // data (font sizes, coordinates, etc.) unless the line has context.
      const absVal = Math.abs(amount);
      if (absVal < 1 && !hasFinancialContext(trimmed)) continue;

      const key = `${trimmed}|${amount}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      transactions.push({
        id: generateId(),
        type: amount < 0 ? 'debit' : 'credit',
        amount: roundCurrency(amount),
        currency: '',
        description: trimmed.substring(0, 200),
        date: extractDate(trimmed),
      });
    }
  }

  return transactions;
}

/**
 * Check whether a line has financial/transactional context words that
 * increase our confidence a decimal number is a monetary amount.
 */
function hasFinancialContext(line: string): boolean {
  return /\b(transaction|payment|invoice|debit|credit|deposit|withdrawal|transfer|remittance|fee|charge|refund|amount|total|subtotal|balance|net|gross|due|paid|received|outstanding|value|price|cost|revenue|income|expense|profit|loss|asset|liability|equity|dividend|interest|principal|loan|mortgage|rent|salary|wage|commission|bonus|tax|vat|gst|settlement|closing|opening|market|face|par|notional|coupon|yield|maturity|redemption|proceeds|disbursement|allocation|appraisal|valuation|assessment|worth|estimated)\b/i.test(line);
}

// ---------------------------------------------------------------------------
// Date extraction
// ---------------------------------------------------------------------------

function extractDate(line: string): string {
  const iso = line.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const slash = line.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  if (slash) return slash[1];
  const dash = line.match(/\b(\d{1,2}-\d{1,2}-\d{2,4})\b/);
  if (dash) return dash[1];
  const mon = line.match(
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s*\d{2,4})\b/i,
  );
  if (mon) return mon[1];
  return '';
}

// ---------------------------------------------------------------------------
// Text extraction from PDF -- position-aware line reconstruction
// ---------------------------------------------------------------------------

interface TextItem {
  str: string;
  transform: number[];  // [scaleX, skewX, skewY, scaleY, x, y]
  width: number;
  height: number;
}

/**
 * Reconstruct lines from pdf.js text items using Y-coordinate grouping.
 * pdf.js returns individual text spans with position info.  Items that
 * share a similar Y coordinate are on the same visual line.
 */
function reconstructLines(items: TextItem[]): string[] {
  if (items.length === 0) return [];

  // Group items by their Y coordinate (rounded to account for minor
  // baseline variations).  The Y coordinate is transform[5].
  const yThreshold = 3; // pixels
  const rows: { y: number; items: TextItem[] }[] = [];

  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = item.transform[5];
    // Find existing row within threshold
    let found = false;
    for (const row of rows) {
      if (Math.abs(row.y - y) < yThreshold) {
        row.items.push(item);
        found = true;
        break;
      }
    }
    if (!found) {
      rows.push({ y, items: [item] });
    }
  }

  // Sort rows top-to-bottom (highest Y first in PDF coordinate system)
  rows.sort((a, b) => b.y - a.y);

  // Within each row, sort items left-to-right by X coordinate (transform[4])
  const lines: string[] = [];
  for (const row of rows) {
    row.items.sort((a, b) => a.transform[4] - b.transform[4]);

    // Join items with appropriate spacing
    let line = '';
    for (let i = 0; i < row.items.length; i++) {
      const item = row.items[i];
      if (i > 0) {
        const prev = row.items[i - 1];
        const gap = item.transform[4] - (prev.transform[4] + prev.width);
        // Large gap = likely different column; use tab-like separator
        line += gap > 10 ? '   ' : ' ';
      }
      line += item.str;
    }
    lines.push(line);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parsePdfFile(file: File): Promise<ParsedDocument> {
  const pdfjs = await getPdfJs();

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error(
      'The PDF file is empty. Please upload a file that contains transaction data.',
    );
  }

  // Copy bytes before pdf.js detaches the buffer.
  const rawBytes = new Uint8Array(arrayBuffer.slice(0));

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch {
    throw new Error(
      'The file does not contain a valid PDF. Please check that it is not corrupted or password-protected.',
    );
  }

  // Extract text from all pages using position-aware line reconstruction
  const allLines: string[] = [];
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Cast items to our TextItem interface for position-aware processing
    const textItems = textContent.items.filter(
      (item): item is TextItem => 'str' in item && 'transform' in item,
    );

    // Reconstruct visual lines using Y-coordinate grouping
    const pageLines = reconstructLines(textItems);
    allLines.push(...pageLines);

    // Also build full text for currency detection
    fullText += pageLines.join('\n') + '\n';
  }

  if (!fullText.trim()) {
    throw new Error(
      'The PDF file contains no extractable text. It may be a scanned image. ' +
        'Please upload a text-based PDF with transaction data.',
    );
  }

  // Extract transactions from the reconstructed lines
  const transactions = extractTransactionsFromLines(allLines);

  const totalValue = roundCurrency(
    transactions.reduce((sum, t) => sum + t.amount, 0),
  );

  const currency = detectCurrency(fullText);
  for (const t of transactions) {
    t.currency = currency;
  }

  // Generate document hash
  const hashArrayBuffer = await crypto.subtle.digest('SHA-256', rawBytes);
  const hashArray = Array.from(new Uint8Array(hashArrayBuffer));
  const documentHash =
    '0x' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return {
    fileName: file.name,
    fileType: 'pdf',
    transactions,
    totalValue,
    currency,
    parsedAt: new Date().toISOString(),
    documentHash,
  };
}
