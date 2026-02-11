/**
 * Image Parser -- OCR-based value extraction for PNG and JPG documents.
 *
 * Uses Tesseract.js to perform optical character recognition on uploaded
 * images, then feeds the extracted text through the shared intelligent
 * value extraction pipeline.
 */

import type { ParsedDocument, SupportedFileType } from '../../types';
import { extractValueFromText } from './textValueExtraction';

// ---------------------------------------------------------------------------
// Tesseract.js -- lazy-loaded to avoid blocking initial page load
// ---------------------------------------------------------------------------

let tesseractLoaded: typeof import('tesseract.js') | null = null;

async function getTesseract() {
  if (tesseractLoaded) return tesseractLoaded;
  tesseractLoaded = await import('tesseract.js');
  return tesseractLoaded;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseImageFile(
  file: File,
  fileType: SupportedFileType,
): Promise<ParsedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error(
      'The image file is empty. Please upload a file that contains document data.',
    );
  }

  const rawBytes = new Uint8Array(arrayBuffer);

  // --- OCR via Tesseract.js ------------------------------------------------

  const Tesseract = await getTesseract();

  let ocrText: string;
  try {
    // Convert the file to a blob URL that Tesseract can consume.
    const blob = new Blob([rawBytes], { type: file.type });
    const imageUrl = URL.createObjectURL(blob);

    try {
      const result = await Tesseract.recognize(imageUrl, 'eng');
      ocrText = result.data.text;
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `OCR failed on the image file. The image may be corrupted or in an unsupported format. (${detail})`,
    );
  }

  if (!ocrText.trim()) {
    throw new Error(
      'No text could be extracted from the image. The image may be blank, ' +
        'too low-resolution, or contain only non-text content (photos, drawings). ' +
        'Please upload a clear image of a document with readable text.',
    );
  }

  // --- Value extraction ----------------------------------------------------

  // Split OCR output into lines (Tesseract returns newline-separated text)
  const allLines = ocrText.split('\n').filter((l) => l.trim().length > 0);
  const fullText = ocrText;

  const result = extractValueFromText(allLines, fullText);

  // --- Document hash -------------------------------------------------------

  const hashArrayBuffer = await crypto.subtle.digest('SHA-256', rawBytes);
  const hashArray = Array.from(new Uint8Array(hashArrayBuffer));
  const documentHash =
    '0x' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return {
    fileName: file.name,
    fileType,
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
