import type { ParsedDocument, SupportedFileType } from '../../types';
import { parseJsonFile } from './jsonParser';
import { parseCsvFile } from './csvParser';
import { parseXmlFile } from './xmlParser';
import { parsePdfFile } from './pdfParser';

/** Maximum file size we allow the browser to parse (10 MB). */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Determine the file type from its extension.
 * Returns null when the extension is not supported.
 *
 * Handles edge cases such as dot-files (e.g. ".csv"), names with no
 * extension, and compound extensions (e.g. "archive.tar.csv").
 */
export function detectFileType(fileName: string): SupportedFileType | null {
  // Ensure there is a real extension (at least one dot that is not the
  // first character of the basename).
  const dotIdx = fileName.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === fileName.length - 1) return null;

  const ext = fileName.substring(dotIdx + 1).toLowerCase();
  if (ext === 'json') return 'json';
  if (ext === 'csv') return 'csv';
  if (ext === 'xml') return 'xml';
  if (ext === 'pdf') return 'pdf';
  return null;
}

/**
 * Parse a File into a ParsedDocument.
 * Selects the correct parser based on the file extension.
 * Throws when the file type is unsupported, the file is too large / empty,
 * or parsing fails.
 */
export async function parseFile(file: File): Promise<ParsedDocument> {
  // --- Validate file size ------------------------------------------------
  if (file.size === 0) {
    throw new Error(
      'The uploaded file is empty. Please select a file that contains transaction data.',
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `File is too large (${sizeMB} MB). Maximum allowed size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
    );
  }

  // --- Validate file type ------------------------------------------------
  const fileType = detectFileType(file.name);

  if (!fileType) {
    throw new Error(
      `Unsupported file type: "${file.name.split('.').pop()}". Supported types: .json, .csv, .xml, .pdf`,
    );
  }

  // --- Delegate to the correct parser ------------------------------------
  try {
    switch (fileType) {
      case 'json':
        return await parseJsonFile(file);
      case 'csv':
        return await parseCsvFile(file);
      case 'xml':
        return await parseXmlFile(file);
      case 'pdf':
        return await parsePdfFile(file);
    }
  } catch (err) {
    // Re-throw errors that already carry a user-friendly message from
    // the individual parsers.  All parser modules throw plain Error
    // instances with descriptive messages, so we propagate them as-is
    // and only wrap truly unexpected / third-party errors.
    if (err instanceof Error) {
      // Parser errors are identified by checking whether they originate
      // from our own parser modules.  We maintain a list of known
      // user-facing error message prefixes used in our parsers.  This is
      // more robust than checking arbitrary string prefixes because we
      // match against the full set of messages our parsers actually emit.
      const msg = err.message;
      const parserErrorPrefixes = [
        'The JSON file is empty',
        'The file does not contain valid JSON',
        'The CSV file is empty',
        'The CSV file could not be parsed',
        'CSV parse error',
        'The XML file is empty',
        'The file does not contain valid XML',
        'File is too large',
        'The uploaded file is empty',
        'Unsupported file type',
        'An unexpected error occurred while processing the CSV file',
        'Failed to generate document hash',
        'The PDF file is empty',
        'The file does not contain a valid PDF',
        'The PDF file contains no extractable text',
      ];
      const isParserError = parserErrorPrefixes.some((prefix) =>
        msg.startsWith(prefix),
      );
      if (isParserError) throw err;
    }

    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to parse the ${fileType.toUpperCase()} file. Please verify the file is valid ${fileType.toUpperCase()}. (${detail})`,
    );
  }
}

// NOTE: Individual parsers (parseJsonFile, parseCsvFile, parseXmlFile) are
// intentionally NOT re-exported.  All external consumers must use parseFile()
// so that file-size and file-type validation cannot be bypassed.
