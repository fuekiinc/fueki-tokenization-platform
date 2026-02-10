import type { ParsedTransaction, ParsedDocument } from '../../types';
import { generateDocumentHash, generateId, roundCurrency } from '../utils/helpers';

export async function parseJsonFile(file: File): Promise<ParsedDocument> {
  const text = await file.text();

  if (!text.trim()) {
    throw new Error(
      'The JSON file is empty. Please upload a file that contains transaction data.',
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'The file does not contain valid JSON. Please check for syntax errors such as missing commas, brackets, or quotes.',
    );
  }

  const transactions = extractTransactions(data);
  const totalValue = roundCurrency(
    transactions.reduce((sum, t) => sum + t.amount, 0),
  );
  const currency = determineCurrency(transactions);
  const documentHash = await generateDocumentHash(text);

  return {
    fileName: file.name,
    fileType: 'json',
    transactions,
    totalValue,
    currency,
    parsedAt: new Date().toISOString(),
    documentHash,
  };
}

function extractTransactions(data: unknown): ParsedTransaction[] {
  // Handle a top-level array of transactions
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    return data
      .map(normalizeTransaction)
      .filter(Boolean) as ParsedTransaction[];
  }

  if (!data || typeof data !== 'object') return [];

  const record = data as Record<string, unknown>;

  // Look for common transaction array keys
  const txKeys = [
    'transactions',
    'trades',
    'orders',
    'items',
    'entries',
    'records',
    'payments',
    'transfers',
    'data',
  ];
  for (const key of txKeys) {
    if (record[key] && Array.isArray(record[key])) {
      return (record[key] as unknown[])
        .map(normalizeTransaction)
        .filter(Boolean) as ParsedTransaction[];
    }
  }

  // Single transaction object
  const single = normalizeTransaction(record);
  return single ? [single] : [];
}

function normalizeTransaction(item: unknown): ParsedTransaction | null {
  if (!item || typeof item !== 'object') return null;

  const record = item as Record<string, unknown>;

  // Try to extract amount from various field names.
  // Guard against empty strings and values that coerce to NaN.
  const amountFields = [
    'amount',
    'value',
    'total',
    'price',
    'sum',
    'quantity',
    'cost',
    'balance',
  ];
  let amount: number | null = null;
  for (const field of amountFields) {
    if (
      record[field] !== undefined &&
      record[field] !== '' &&
      record[field] !== null
    ) {
      const parsed = Number(record[field]);
      // Reject NaN, Infinity, and -Infinity.  Only finite numbers are
      // valid monetary amounts.
      if (Number.isFinite(parsed)) {
        amount = parsed;
        break;
      }
    }
  }

  // Skip entries where no amount field was found at all.
  // Note: zero-amount transactions are preserved -- they are legitimate
  // in financial data (fee waivers, zero-cost transfers, etc.).
  if (amount === null) return null;

  // Currency detection: coerce to string before checking, so that
  // numeric-looking values (e.g. from dynamic typing) are handled.
  const currencyFields = [
    'currency',
    'coin',
    'token',
    'asset',
    'unit',
    'denomination',
  ];
  let currency = 'USD';
  for (const field of currencyFields) {
    if (record[field] != null && record[field] !== '') {
      currency = String(record[field]).toUpperCase();
      break;
    }
  }

  const fromVal = record.from ?? record.sender ?? record.source;
  const toVal = record.to ?? record.recipient ?? record.destination;
  const refVal =
    record.reference ?? record.ref ?? record.id ?? record.txId ?? record.hash;

  // Validate date: fall back to current time if the value cannot be parsed.
  const rawDate =
    record.date ?? record.timestamp ?? record.created_at ?? record.time;
  const dateStr = rawDate != null ? String(rawDate) : '';
  const parsedDate = dateStr ? new Date(dateStr) : new Date();
  const validDate = isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  return {
    id: generateId(),
    type: String(
      record.type ?? record.transaction_type ?? record.txType ?? 'transfer',
    ),
    amount: roundCurrency(amount),
    currency,
    description: String(
      record.description ??
        record.memo ??
        record.note ??
        record.label ??
        `Transaction ${amount} ${currency}`,
    ),
    date: validDate,
    from: fromVal != null ? String(fromVal) : undefined,
    to: toVal != null ? String(toVal) : undefined,
    reference: refVal != null ? String(refVal) : undefined,
    metadata: record as Record<string, unknown>,
  };
}

/**
 * Return the most-common currency across all transactions.
 * Falls back to 'USD' when the list is empty.
 */
export function determineCurrency(transactions: ParsedTransaction[]): string {
  if (transactions.length === 0) return 'USD';
  const counts: Record<string, number> = {};
  for (const t of transactions) {
    counts[t.currency] = (counts[t.currency] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : 'USD';
}
