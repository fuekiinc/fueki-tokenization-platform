/**
 * Shared Text Value Extraction Module
 *
 * Provides the core pipeline for extracting monetary values from plain text
 * lines.  Used by both the PDF parser (after pdf.js text reconstruction) and
 * the image parser (after Tesseract.js OCR).
 *
 * Pipeline:
 *   1. Extract raw monetary amounts from text lines (regex-based)
 *   2. Classify the document using the intelligence module
 *   3. Score each amount by proximity to value-indicating keywords
 *   4. Select the primary stated value
 *   5. Build ParsedTransaction[] and totalValue
 */

import type { ParsedTransaction } from '../../types';
import { generateId, roundCurrency } from '../utils/helpers';
import {
  classifyDocument,
  type DocumentClassification,
  type PrimaryValueResult,
  scoreAmounts,
  selectPrimaryValue,
} from './documentIntelligence';

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export interface TextExtractionResult {
  transactions: ParsedTransaction[];
  totalValue: number;
  currency: string;
  documentClassification?: string;
  valueExtractionMethod?: string;
  valueConfidence?: number;
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
// Magnitude WORDS  ("767.5 billion" = 767,500,000,000)
// ---------------------------------------------------------------------------

const MAGNITUDE_WORD_MAP: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
  trillion: 1_000_000_000_000,
};

/**
 * Regex to detect a magnitude word immediately after a matched number.
 * Used to handle forms like "$767.5 billion" or "3.925 trillion".
 */
const TRAILING_MAG_WORD_RE = /^\s+(hundred|thousand|million|billion|trillion)\b/i;

/**
 * Check for a trailing magnitude word after a regex match and return
 * the multiplier.  Returns 1 when no magnitude word is found.
 */
function getTrailingMagnitudeWordMultiplier(line: string, matchEnd: number): number {
  const after = line.substring(matchEnd);
  const wordMatch = after.match(TRAILING_MAG_WORD_RE);
  if (!wordMatch) return 1;
  return MAGNITUDE_WORD_MAP[wordMatch[1].toLowerCase()] ?? 1;
}

/**
 * Dedicated pattern for "number + magnitude word" (e.g. "767.5 billion",
 * "3,925 million").  Allows any number of decimal places since the
 * presence of a magnitude word gives high confidence this is a value.
 * Does NOT require a currency symbol -- the word itself is the signal.
 */
const NUMBER_MAG_WORD_RE = new RegExp(
  '(?<paren>\\()?'                                  +
  '(?<neg>-)?\\s*'                                   +
  '(?<amt>\\d[\\d,]*(?:\\.\\d+)?)'                   +
  '\\s+(?<magword>hundred|thousand|million|billion|trillion)' +
  '\\b',
  'gi',
);

// ---------------------------------------------------------------------------
// Amount extraction patterns
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS = ['$', '\u20AC', '\u00A3', '\u00A5', '\u20B9', '\u20A9', '\u20BF'];
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
 */
const CURRENCY_AMOUNT_RE = new RegExp(
  '(?<paren>\\()?'                              +
  '(?<neg>-)?\\s*'                               +
  '(?:'                                          +
    `(?:${CURRENCY_SYM_ESCAPED})\\s*`            +
    '(?<amt1>[\\d,]+(?:\\.\\d+)?)'               +
    '(?<mag1>[KkMmBbTt](?:[MmNn])?)?'           +
  '|'                                            +
    `(?:${CURRENCY_CODE_ALT})\\s+`               +
    '(?<amt2>[\\d,]+(?:\\.\\d+)?)'               +
    '(?<mag2>[KkMmBbTt](?:[MmNn])?)?'           +
  '|'                                            +
    '(?<amt3>[\\d,]+(?:\\.\\d+)?)'               +
    '(?<mag3>[KkMmBbTt](?:[MmNn])?)?'           +
    `\\s*(?:${CURRENCY_CODE_ALT})`               +
  ')'                                            +
  '\\)?',
  'g',
);

/**
 * Fallback pattern -- plain decimal numbers (e.g. "1234.56").
 */
const PLAIN_DECIMAL_RE =
  /(?<paren>\()?(?<neg>-)?(?<amt>\d[\d,]*\.\d{1,2})(?<mag>[KkMmBbTt](?:[MmNn])?)?\)?/g;

/**
 * Lines to skip -- headers, footers, page numbers, etc.
 */
const NOISE_LINE_RE =
  /^(page\s+\d|confidential|disclaimer|©|all rights reserved|\d{1,3}$)/i;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function looksLikeNonAmount(raw: string, fullLine: string, matchIndex: number): boolean {
  const afterMatch = fullLine.substring(matchIndex + raw.length);
  if (/^\s*%/.test(afterMatch)) return true;

  const cleaned = raw.replace(/,/g, '');

  if (/^20\d{2}\.\d{2}$/.test(cleaned)) return true;

  if (/^\d{1,2}\.\d{2}$/.test(cleaned)) {
    const intPart = parseInt(cleaned, 10);
    if (intPart >= 1 && intPart <= 31) return true;
  }

  const before = fullLine.substring(0, matchIndex);
  if (/(?:#|no\.?\s*|ref\.?\s*|id:?\s*)$/i.test(before)) return true;

  return false;
}

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

function parseAmountFull(
  raw: string,
  neg: string | undefined,
  paren: string | undefined,
  mag: string | undefined,
): number | null {
  const value = resolveMagnitude(raw, mag);
  if (value === null || value === 0) return null;
  const isNeg = !!neg || !!paren;
  return isNeg ? -value : value;
}

function hasFinancialContext(line: string): boolean {
  return /\b(transaction|payment|invoice|debit|credit|deposit|withdrawal|transfer|remittance|fee|charge|refund|amount|total|subtotal|balance|net|gross|due|paid|received|outstanding|value|price|cost|revenue|income|expense|profit|loss|asset|liability|equity|dividend|interest|principal|loan|mortgage|rent|salary|wage|commission|bonus|tax|vat|gst|settlement|closing|opening|market|face|par|notional|coupon|yield|maturity|redemption|proceeds|disbursement|allocation|appraisal|valuation|assessment|worth|estimated)\b/i.test(line);
}

export function extractDate(line: string): string {
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
// Raw amount extraction
// ---------------------------------------------------------------------------

interface RawAmount {
  amount: number;
  line: string;
  lineIndex: number;
}

/**
 * Extract all monetary amounts from text lines using a two-pass regex strategy.
 */
export function extractRawAmounts(lines: string[]): RawAmount[] {
  const amounts: RawAmount[] = [];
  const seenKeys = new Set<string>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const trimmed = lines[lineIndex].trim();
    if (!trimmed || trimmed.length < 2) continue;
    if (NOISE_LINE_RE.test(trimmed)) continue;

    // Pass 1: Currency-annotated amounts (highest confidence)
    let foundCurrencyAmount = false;
    for (const m of trimmed.matchAll(CURRENCY_AMOUNT_RE)) {
      const raw = m.groups?.amt1 ?? m.groups?.amt2 ?? m.groups?.amt3;
      const mag = m.groups?.mag1 ?? m.groups?.mag2 ?? m.groups?.mag3;
      if (!raw) continue;

      if (looksLikeNonAmount(raw, trimmed, m.index ?? 0)) continue;

      let amount = parseAmountFull(raw, m.groups?.neg, m.groups?.paren, mag);
      if (amount === null) continue;

      // When no inline suffix was captured, check for a trailing magnitude
      // word (e.g. "$767.5 billion") and apply the multiplier.
      if (!mag) {
        const matchEnd = (m.index ?? 0) + m[0].length;
        const magWordMultiplier = getTrailingMagnitudeWordMultiplier(trimmed, matchEnd);
        amount = amount * magWordMultiplier;
      }

      const key = `${trimmed}|${amount}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      amounts.push({ amount: roundCurrency(amount), line: trimmed, lineIndex });
      foundCurrencyAmount = true;
    }
    if (foundCurrencyAmount) continue;

    // Pass 1.5: "number + magnitude word" without currency symbol
    // (e.g. "767.5 billion", "3,925 million").  The magnitude word itself
    // is strong evidence that this is a monetary value, so no currency
    // symbol is required and any number of decimal places is accepted.
    let foundMagWord = false;
    for (const m of trimmed.matchAll(NUMBER_MAG_WORD_RE)) {
      const raw = m.groups?.amt;
      const magWord = m.groups?.magword;
      if (!raw || !magWord) continue;

      if (looksLikeNonAmount(raw, trimmed, m.index ?? 0)) continue;

      const baseAmount = parseAmountFull(raw, m.groups?.neg, m.groups?.paren, undefined);
      if (baseAmount === null) continue;

      const multiplier = MAGNITUDE_WORD_MAP[magWord.toLowerCase()] ?? 1;
      const amount = baseAmount * multiplier;

      const key = `${trimmed}|${amount}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      amounts.push({ amount: roundCurrency(amount), line: trimmed, lineIndex });
      foundMagWord = true;
    }
    if (foundMagWord) continue;

    // Pass 2: Plain decimal numbers (lower confidence)
    for (const m of trimmed.matchAll(PLAIN_DECIMAL_RE)) {
      const raw = m.groups?.amt;
      const mag = m.groups?.mag;
      if (!raw) continue;

      if (looksLikeNonAmount(raw, trimmed, m.index ?? 0)) continue;

      let amount = parseAmountFull(raw, m.groups?.neg, m.groups?.paren, mag);
      if (amount === null) continue;

      // Check for trailing magnitude word (e.g. "1234.56 million")
      if (!mag) {
        const matchEnd = (m.index ?? 0) + m[0].length;
        const magWordMultiplier = getTrailingMagnitudeWordMultiplier(trimmed, matchEnd);
        amount = amount * magWordMultiplier;
      }

      const absVal = Math.abs(amount);
      if (absVal < 1 && !hasFinancialContext(trimmed)) continue;

      const key = `${trimmed}|${amount}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      amounts.push({ amount: roundCurrency(amount), line: trimmed, lineIndex });
    }
  }

  return amounts;
}

// ---------------------------------------------------------------------------
// Currency detection
// ---------------------------------------------------------------------------

export function detectCurrency(fullText: string): string {
  for (const code of CURRENCY_CODES) {
    const re = new RegExp(`\\b${code}\\b`, 'i');
    if (re.test(fullText)) return code.toUpperCase();
  }
  if (fullText.includes('$')) return 'USD';
  if (fullText.includes('\u20AC')) return 'EUR';
  if (fullText.includes('\u00A3')) return 'GBP';
  if (fullText.includes('\u00A5')) return 'JPY';
  if (fullText.includes('\u20B9')) return 'INR';
  return 'USD';
}

// ---------------------------------------------------------------------------
// High-level pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full intelligent value extraction pipeline on a set of text lines.
 *
 * This is the primary entry point shared by both the PDF and image parsers.
 * It handles:
 *   - Raw amount extraction (regex-based)
 *   - Document classification
 *   - Amount scoring via document intelligence
 *   - Primary value selection with multi-strategy fallback
 *   - Currency detection
 *   - Transaction building
 */
export function extractValueFromText(
  lines: string[],
  fullText: string,
): TextExtractionResult {
  // Phase 1: Classify the document
  const classification: DocumentClassification = classifyDocument(fullText);

  // Phase 2: Extract all raw amounts with their line context
  const rawAmounts = extractRawAmounts(lines);

  // Phase 3: Score amounts using document intelligence
  const scoredAmounts = scoreAmounts(rawAmounts, lines, classification);

  // Phase 4: Select primary stated value
  const primaryResult: PrimaryValueResult | null = selectPrimaryValue(scoredAmounts);

  // Phase 5: Build transactions & totalValue
  let transactions: ParsedTransaction[];
  let totalValue: number;

  const CONFIDENCE_THRESHOLD = 0.4;

  if (primaryResult && primaryResult.confidence >= CONFIDENCE_THRESHOLD) {
    const primaryScored = scoredAmounts.find(
      (s) =>
        s.amount === primaryResult.value &&
        s.matchedIndicator === primaryResult.indicator,
    );

    const descParts: string[] = [];
    if (primaryResult.indicator && !primaryResult.indicator.startsWith('none')) {
      descParts.push(
        primaryResult.indicator.charAt(0).toUpperCase() +
          primaryResult.indicator.slice(1),
      );
    }
    if (primaryScored) {
      descParts.push(primaryScored.line.substring(0, 200));
    }
    const description =
      descParts.length > 0
        ? descParts.join(' \u2014 ')
        : 'Extracted document value';

    transactions = [
      {
        id: generateId(),
        type: primaryResult.value >= 0 ? 'credit' : 'debit',
        amount: roundCurrency(Math.abs(primaryResult.value)),
        currency: '',
        description,
        date: extractDate(primaryScored?.line ?? ''),
        isPrimaryValue: true,
        confidence: primaryResult.confidence,
      },
    ];

    totalValue = roundCurrency(Math.abs(primaryResult.value));
  } else {
    transactions = rawAmounts.map(({ amount, line }) => ({
      id: generateId(),
      type: amount < 0 ? 'debit' : 'credit',
      amount: roundCurrency(amount),
      currency: '',
      description: line.substring(0, 200),
      date: extractDate(line),
    }));
    totalValue = roundCurrency(
      transactions.reduce((sum, t) => sum + t.amount, 0),
    );
  }

  // Phase 6: Currency detection
  const currency = detectCurrency(fullText);
  for (const t of transactions) {
    t.currency = currency;
  }

  return {
    transactions,
    totalValue,
    currency,
    documentClassification:
      classification.category !== 'unknown'
        ? classification.category
        : undefined,
    valueExtractionMethod: primaryResult?.method,
    valueConfidence: primaryResult?.confidence,
  };
}
