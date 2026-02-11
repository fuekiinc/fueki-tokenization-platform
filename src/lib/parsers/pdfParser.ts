import type { ParsedDocument } from '../../types';
import { extractValueFromText } from './textValueExtraction';

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

  const yThreshold = 3; // pixels
  const rows: { y: number; items: TextItem[] }[] = [];

  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = item.transform[5];
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

  const lines: string[] = [];
  for (const row of rows) {
    row.items.sort((a, b) => a.transform[4] - b.transform[4]);

    let line = '';
    for (let i = 0; i < row.items.length; i++) {
      const item = row.items[i];
      if (i > 0) {
        const prev = row.items[i - 1];
        const gap = item.transform[4] - (prev.transform[4] + prev.width);
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

    const textItems = textContent.items.filter(
      (item): item is TextItem => 'str' in item && 'transform' in item,
    );

    const pageLines = reconstructLines(textItems);
    allLines.push(...pageLines);

    fullText += pageLines.join('\n') + '\n';
  }

  if (!fullText.trim()) {
    throw new Error(
      'The PDF file contains no extractable text. It may be a scanned image. ' +
        'Please upload a text-based PDF with transaction data.',
    );
  }

  // Run the shared intelligent value extraction pipeline
  const result = extractValueFromText(allLines, fullText);

  // Generate document hash
  const hashArrayBuffer = await crypto.subtle.digest('SHA-256', rawBytes);
  const hashArray = Array.from(new Uint8Array(hashArrayBuffer));
  const documentHash =
    '0x' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return {
    fileName: file.name,
    fileType: 'pdf',
    transactions: result.transactions,
    totalValue: result.totalValue,
    currency: result.currency,
    parsedAt: new Date().toISOString(),
    documentHash,
    documentClassification: result.documentClassification,
    valueExtractionMethod: result.valueExtractionMethod,
    valueConfidence: result.valueConfidence,
  };
}
