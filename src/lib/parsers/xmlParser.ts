import { XMLParser } from 'fast-xml-parser';
import type { ParsedDocument, ParsedTransaction } from '../../types';
import { generateDocumentHash, generateId, roundCurrency } from '../utils/helpers';
import { determineCurrency } from './jsonParser';

export async function parseXmlFile(file: File): Promise<ParsedDocument> {
  const text = await file.text();

  if (!text.trim()) {
    throw new Error(
      'The XML file is empty. Please upload a file that contains transaction data.',
    );
  }

  // fast-xml-parser v5 options:
  // - `parseAttributeValue` is intentionally left at the default (false) so
  //   that attribute values remain strings.  Enabling it would auto-convert
  //   numeric-looking attributes (e.g. currency="123") to numbers, breaking
  //   downstream `typeof === 'string'` checks.
  // - Tag text values are still auto-parsed via `parseTagValue: true`
  //   (the default), which is what we want for numeric amount fields.
  // - `trimValues` trims whitespace from text and attribute values.
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    trimValues: true,
    // Disable DOCTYPE entity processing to prevent entity-expansion
    // attacks (e.g. "billion laughs" / XML bombs).  The platform parses
    // financial transaction data and has no legitimate need for custom
    // entity definitions.  Standard XML entities (&amp; &lt; etc.) are
    // handled by the parser regardless of this setting.
    processEntities: false,
    // Ensure arrays are not collapsed to single values for known
    // collection element names so that single-transaction files still
    // produce arrays in extractTransactions().
    isArray: (_name: string, jpath: string) => {
      const leaf = jpath.split('.').pop() ?? '';
      return [
        'transaction', 'transactions',
        'entry', 'entries',
        'record', 'records',
        'item', 'items',
        'payment', 'payments',
        'trade', 'trades',
      ].includes(leaf);
    },
  });

  let data: unknown;
  try {
    // fast-xml-parser v5: pass `true` as the second argument to enable
    // built-in XML validation before parsing.  Invalid XML will cause
    // an exception with a descriptive message.
    data = parser.parse(text, true);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `The file does not contain valid XML. Please check for malformed tags or encoding issues. (${detail})`,
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
    fileType: 'xml',
    transactions,
    totalValue,
    currency,
    parsedAt: new Date().toISOString(),
    documentHash,
  };
}

/**
 * Maximum nesting depth to traverse when searching for a transaction
 * collection.  Prevents stack overflow from adversarially deep XML.
 */
const MAX_TRAVERSAL_DEPTH = 20;

function extractTransactions(
  data: unknown,
  depth: number = 0,
): ParsedTransaction[] {
  if (!data || typeof data !== 'object') return [];
  if (depth > MAX_TRAVERSAL_DEPTH) return [];

  const record = data as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    const child = record[key];
    if (child && typeof child === 'object') {
      const childRecord = child as Record<string, unknown>;

      const collectionKeys = [
        'transaction',
        'transactions',
        'entry',
        'entries',
        'record',
        'records',
        'item',
        'items',
        'payment',
        'payments',
        'trade',
        'trades',
      ];

      for (const ck of collectionKeys) {
        if (childRecord[ck]) {
          const items = Array.isArray(childRecord[ck])
            ? (childRecord[ck] as unknown[])
            : [childRecord[ck]];
          return items
            .map((item) => normalizeXmlTransaction(item))
            .filter(Boolean) as ParsedTransaction[];
        }
      }

      const deeper = extractTransactions(child, depth + 1);
      if (deeper.length > 0) return deeper;
    }
  }

  return [];
}

function normalizeXmlTransaction(item: unknown): ParsedTransaction | null {
  if (!item || typeof item !== 'object') return null;

  const r = item as Record<string, unknown>;

  const amountFields = [
    'amount',
    'value',
    'total',
    'price',
    'sum',
    'cost',
    '@_amount',
    '@_value',
  ];
  let amount: number | null = null;
  for (const field of amountFields) {
    if (r[field] !== undefined && r[field] !== '') {
      const parsed = Number(r[field]);
      // Reject NaN, Infinity, and -Infinity.  Only finite numbers are
      // valid monetary amounts.
      if (Number.isFinite(parsed)) {
        amount = parsed;
        break;
      }
    }
  }

  // Skip entries where no amount field was found at all.
  // Zero-amount transactions are preserved as they are legitimate in
  // financial data.
  if (amount === null) return null;

  // Currency can come as a string or (if parseAttributeValue were ever
  // re-enabled) as a number.  Coerce to string before the uppercase
  // transform so that numeric-looking codes don't slip through.
  const currencyFields = [
    'currency',
    'coin',
    'token',
    '@_currency',
    '@_coin',
  ];
  let currency = 'USD';
  for (const field of currencyFields) {
    if (r[field] != null && r[field] !== '') {
      currency = String(r[field]).toUpperCase();
      break;
    }
  }

  const fromVal = r.from ?? r.sender ?? r.source;
  const toVal = r.to ?? r.recipient ?? r.destination;
  const refVal = r.reference ?? r.ref ?? r.id ?? r['@_id'];

  // Validate date: fall back to current time if the value cannot be parsed.
  const rawDate = r.date ?? r.timestamp ?? r.time;
  const dateStr = rawDate != null ? String(rawDate) : '';
  const parsedDate = dateStr ? new Date(dateStr) : new Date();
  const validDate = isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  return {
    id: generateId(),
    type: String(r.type ?? r['@_type'] ?? 'transfer'),
    // Round to 2 decimal places at the transaction level so that
    // floating-point drift does not accumulate across many transactions.
    amount: roundCurrency(amount),
    currency,
    description: String(
      r.description ?? r.memo ?? r.note ?? `XML entry: ${amount} ${currency}`,
    ),
    date: validDate,
    from: fromVal != null ? String(fromVal) : undefined,
    to: toVal != null ? String(toVal) : undefined,
    reference: refVal != null ? String(refVal) : undefined,
    metadata: r as Record<string, unknown>,
  };
}
