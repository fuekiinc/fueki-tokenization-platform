import Papa from 'papaparse';
import type { ParsedDocument, ParsedTransaction } from '../../types';
import { generateDocumentHash, generateId, roundCurrency } from '../utils/helpers';
import { determineCurrency } from './jsonParser';

export async function parseCsvFile(file: File): Promise<ParsedDocument> {
  const text = await file.text();

  if (!text.trim()) {
    throw new Error(
      'The CSV file is empty. Please upload a file that contains transaction data.',
    );
  }

  return new Promise((resolve, reject) => {
    // PapaParse v5: when parsing a string (not a File/stream), the `error`
    // callback is never invoked -- all errors are reported via
    // `results.errors` inside the `complete` callback.  We keep `complete`
    // synchronous and handle the async hash generation separately so that
    // unhandled-rejection edge cases are impossible.
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete(results) {
        try {
          // Surface Papa parse-level warnings (e.g. uneven column counts).
          if (results.errors.length > 0) {
            const firstErr = results.errors[0];
            // Only reject on critical errors; row-level warnings are tolerable.
            if (results.data.length === 0) {
              reject(
                new Error(
                  `CSV parse error on row ${firstErr.row ?? '?'}: ${firstErr.message}`,
                ),
              );
              return;
            }
          }

          const transactions = results.data
            .map((row) => normalizeRow(row as Record<string, unknown>))
            .filter(Boolean) as ParsedTransaction[];

          const totalValue = roundCurrency(
            transactions.reduce((sum, t) => sum + t.amount, 0),
          );
          const currency = determineCurrency(transactions);

          // Handle the async hash generation outside of the synchronous
          // callback to ensure rejections are always caught.
          generateDocumentHash(text)
            .then((documentHash) => {
              resolve({
                fileName: file.name,
                fileType: 'csv',
                transactions,
                totalValue,
                currency,
                parsedAt: new Date().toISOString(),
                documentHash,
              });
            })
            .catch((hashErr) => {
              reject(
                hashErr instanceof Error
                  ? hashErr
                  : new Error('Failed to generate document hash.'),
              );
            });
        } catch (err) {
          reject(
            err instanceof Error
              ? err
              : new Error(
                  'An unexpected error occurred while processing the CSV file.',
                ),
          );
        }
      },
      // PapaParse v5 string-parsing note: the `error` callback is only
      // triggered for File / ReadableStream inputs.  For string input it
      // is never called, but we keep it as a safety net in case the
      // implementation ever changes.
      error(err: Error) {
        reject(
          new Error(
            `The CSV file could not be parsed. Please verify it is a valid comma-separated file. (${err.message})`,
          ),
        );
      },
    });
  });
}

function normalizeRow(
  row: Record<string, unknown>,
): ParsedTransaction | null {
  if (!row || Object.keys(row).length === 0) return null;

  const getVal = (names: string[]): unknown => {
    for (const name of names) {
      const key = Object.keys(row).find((k) =>
        k.toLowerCase().includes(name),
      );
      if (
        key &&
        row[key] !== null &&
        row[key] !== undefined &&
        row[key] !== ''
      )
        return row[key];
    }
    return undefined;
  };

  const rawAmount = getVal([
    'amount',
    'value',
    'total',
    'price',
    'sum',
    'cost',
    'quantity',
    'balance',
  ]);
  const amount = Number(rawAmount);

  // Skip rows where no amount field was found, where the value is not a
  // valid number, or where it is non-finite (e.g. Infinity / -Infinity).
  // Zero-amount transactions are preserved as they are legitimate in
  // financial data.
  if (rawAmount === undefined || !Number.isFinite(amount)) return null;

  const fromVal = getVal(['from', 'sender', 'source', 'debit_account']);
  const toVal = getVal(['to', 'recipient', 'destination', 'credit_account']);
  const refVal = getVal([
    'reference',
    'ref',
    'id',
    'tx_id',
    'hash',
    'transaction_id',
  ]);

  const rawDate = getVal(['date', 'timestamp', 'time', 'created', 'datetime']);
  const dateStr = rawDate != null ? String(rawDate) : '';
  const parsedDate = dateStr ? new Date(dateStr) : new Date();
  const validDate = isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  return {
    id: generateId(),
    type: String(
      getVal(['type', 'transaction_type', 'tx_type', 'category']) || 'transfer',
    ),
    // Preserve the original sign so that debits (negative amounts) reduce
    // the totalValue rather than inflating it.  Using Math.abs() here would
    // convert outflows into inflows, allowing a CSV of refunds/withdrawals
    // to be minted as if they were deposits.
    amount: roundCurrency(amount),
    currency: String(
      getVal(['currency', 'coin', 'token', 'asset', 'unit']) || 'USD',
    ).toUpperCase(),
    description: String(
      getVal(['description', 'memo', 'note', 'label', 'narration']) ||
        `CSV entry: ${amount}`,
    ),
    date: validDate,
    from: fromVal != null ? String(fromVal) : undefined,
    to: toVal != null ? String(toVal) : undefined,
    reference: refVal != null ? String(refVal) : undefined,
    metadata: row as Record<string, unknown>,
  };
}
