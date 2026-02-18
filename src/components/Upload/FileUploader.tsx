import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  FileJson,
  FileSpreadsheet,
  FileCode,
  CloudUpload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileIcon,
  X,
  RotateCcw,
  Sparkles,
  FileText,
  Image,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { parseFile } from '../../lib/parsers';
import { useDocumentStore } from '../../store/documentStore.ts';
import { formatCurrency } from '../../lib/utils/helpers';
import type { ParsedDocument, SupportedFileType } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCEPTED_TYPES: Record<string, string[]> = {
  'application/json': ['.json'],
  'text/csv': ['.csv'],
  'text/xml': ['.xml'],
  'application/xml': ['.xml'],
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
};

const FORMAT_BADGES: { label: string; color: string }[] = [
  { label: 'JSON', color: 'text-amber-400 border-amber-400/30 bg-amber-400/5' },
  { label: 'CSV', color: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5' },
  { label: 'XML', color: 'text-sky-400 border-sky-400/30 bg-sky-400/5' },
  { label: 'PDF', color: 'text-rose-400 border-rose-400/30 bg-rose-400/5' },
  { label: 'PNG', color: 'text-purple-400 border-purple-400/30 bg-purple-400/5' },
  { label: 'JPG', color: 'text-orange-400 border-orange-400/30 bg-orange-400/5' },
];

function fileTypeIcon(name: string, size: string = 'h-8 w-8') {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'json':
      return <FileJson className={`${size} text-amber-400`} />;
    case 'csv':
      return <FileSpreadsheet className={`${size} text-emerald-400`} />;
    case 'xml':
      return <FileCode className={`${size} text-sky-400`} />;
    case 'pdf':
      return <FileText className={`${size} text-rose-400`} />;
    case 'png':
      return <Image className={`${size} text-purple-400`} />;
    case 'jpg':
    case 'jpeg':
      return <Image className={`${size} text-orange-400`} />;
    default:
      return <FileIcon className={`${size} text-gray-400`} />;
  }
}

function fileTypeBadgeColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'json':
      return 'text-amber-400 border-amber-400/30 bg-amber-400/10';
    case 'csv':
      return 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10';
    case 'xml':
      return 'text-sky-400 border-sky-400/30 bg-sky-400/10';
    case 'pdf':
      return 'text-rose-400 border-rose-400/30 bg-rose-400/10';
    case 'png':
      return 'text-purple-400 border-purple-400/30 bg-purple-400/10';
    case 'jpg':
    case 'jpeg':
      return 'text-orange-400 border-orange-400/30 bg-orange-400/10';
    default:
      return 'text-gray-400 border-gray-400/30 bg-gray-400/10';
  }
}

function friendlyType(name: string): SupportedFileType | string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'json' || ext === 'csv' || ext === 'xml' || ext === 'pdf' || ext === 'png') return ext.toUpperCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'JPG';
  return ext ?? 'Unknown';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FileUploader() {
  const setCurrentDocument = useDocumentStore((s) => s.setCurrentDocument);
  const addDocument = useDocumentStore((s) => s.addDocument);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedDoc, setParsedDoc] = useState<ParsedDocument | null>(null);

  // Generation counter used to detect when a new file is dropped while a
  // parse is still in-flight. Each new drop increments the generation so
  // that the completing parse can check whether its result is still relevant.
  const parseGenerationRef = useRef(0);

  // ---- Drop handler -------------------------------------------------------

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Increment generation to invalidate any in-flight parse result.
    parseGenerationRef.current += 1;

    setParseError(null);
    setParsedDoc(null);
    setCurrentDocument(null);

    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setSelectedFile(file);
  }, [setCurrentDocument]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    multiple: false,
    disabled: isParsing,
    noClick: isParsing,
    noDrag: isParsing,
    maxSize: 10 * 1024 * 1024, // 10 MB -- matches MAX_FILE_SIZE_BYTES in parsers
    onDropRejected: (rejections) => {
      const errorCode = rejections[0]?.errors[0]?.code;
      let msg = rejections[0]?.errors[0]?.message ?? 'File type not supported';
      // Provide more user-friendly messages for common rejection reasons
      if (errorCode === 'file-too-large') {
        msg = 'File exceeds the 10 MB size limit. Please upload a smaller file.';
      } else if (errorCode === 'file-invalid-type') {
        msg = 'Unsupported file type. Please upload a JSON, CSV, XML, PDF, PNG, or JPG file.';
      }
      setSelectedFile(null);
      setParsedDoc(null);
      setParseError(msg);
      toast.error(msg);
    },
  });

  // ---- Parse handler ------------------------------------------------------

  const handleParse = async () => {
    if (!selectedFile) return;

    // Capture the current generation so we can detect if a new file was
    // dropped while this parse is running (which would make our result stale).
    const generation = parseGenerationRef.current;

    setIsParsing(true);
    setParseError(null);
    setParsedDoc(null);
    // Defensively clear the store so no stale document persists if this
    // parse fails or is superseded by a new drop.
    setCurrentDocument(null);

    try {
      const doc = await parseFile(selectedFile);

      // If the user dropped a different file while we were parsing,
      // discard this now-stale result silently.
      if (generation !== parseGenerationRef.current) {
        return;
      }

      if (doc.transactions.length === 0) {
        throw new Error(
          'No valid transactions found in this file. Please check the file structure.',
        );
      }

      if (doc.totalValue <= 0) {
        throw new Error(
          'The document has no positive monetary value to tokenize. ' +
          'The total of all transaction amounts must be greater than zero.',
        );
      }

      setParsedDoc(doc);
      setCurrentDocument(doc);
      addDocument(doc);
      toast.success(
        `Parsed ${doc.transactions.length} transaction${doc.transactions.length === 1 ? '' : 's'} successfully`,
      );
    } catch (err: unknown) {
      // If superseded by a new drop, do not display error for stale parse.
      if (generation !== parseGenerationRef.current) {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Failed to parse file';
      setParseError(message);
      toast.error(message);
    } finally {
      // Only clear isParsing if this is still the active parse generation.
      // Otherwise the new file's UI state should not be affected.
      if (generation === parseGenerationRef.current) {
        setIsParsing(false);
      }
    }
  };

  // ---- Reset --------------------------------------------------------------

  const handleReset = () => {
    setSelectedFile(null);
    setParsedDoc(null);
    setParseError(null);
    setCurrentDocument(null);
  };

  // ---- Render -------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Drop zone                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div
        {...getRootProps()}
        role="button"
        aria-label="Upload document - drag and drop or click to browse"
        tabIndex={isParsing ? -1 : 0}
        className={[
          'group relative flex cursor-pointer flex-col items-center justify-center',
          'rounded-2xl border-2 border-dashed p-10 sm:p-14',
          'transition-all duration-300 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
          isDragActive
            ? 'border-indigo-500/40 bg-indigo-500/[0.06] shadow-[0_0_60px_-12px_rgba(99,102,241,0.2)]'
            : [
                'border-white/[0.08] bg-[#0D0F14]/80 backdrop-blur-xl',
                'hover:border-white/[0.15]',
                'hover:shadow-[0_0_40px_-12px_rgba(99,102,241,0.08)]',
              ].join(' '),
          isParsing && 'opacity-50 cursor-not-allowed',
        ].join(' ')}
      >
        <input {...getInputProps()} />

        {isDragActive ? (
          <>
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/25">
              <CloudUpload className="h-8 w-8 text-indigo-400 animate-bounce" />
            </div>
            <p className="text-base font-semibold text-indigo-300">
              Drop your file here
            </p>
            <p className="mt-2 text-sm text-indigo-400/60">
              Release to upload
            </p>
          </>
        ) : (
          <>
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] transition-all duration-300 group-hover:bg-indigo-500/[0.08] group-hover:ring-indigo-500/20">
              <CloudUpload className="h-8 w-8 text-gray-500 transition-colors duration-300 group-hover:text-indigo-400" />
            </div>
            <p className="text-base font-semibold text-gray-200">
              Drag & drop your document
            </p>
            <p className="mt-2.5 text-sm text-gray-500">
              or{' '}
              <span className="text-indigo-400 underline decoration-indigo-400/30 underline-offset-4 transition-colors group-hover:text-indigo-300 group-hover:decoration-indigo-300/50">
                click to browse
              </span>
            </p>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Format badges & size limit                                         */}
      {/* ------------------------------------------------------------------ */}
      {!selectedFile && !parsedDoc && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 flex-wrap">
            {FORMAT_BADGES.map((fmt) => (
              <span
                key={fmt.label}
                className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${fmt.color}`}
              >
                {fmt.label}
              </span>
            ))}
          </div>
          <span className="text-xs text-gray-500 shrink-0 ml-3">
            Max 10 MB
          </span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Selected file card                                                 */}
      {/* ------------------------------------------------------------------ */}
      {selectedFile && !parsedDoc && (
        <div className="animate-fade-in rounded-2xl bg-[#0D0F14]/80 backdrop-blur-xl border border-white/[0.06] p-6">
          <div className="flex items-center gap-5">
            {/* File icon with colored background */}
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]">
              {fileTypeIcon(selectedFile.name)}
            </div>

            {/* File details */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-100">
                {selectedFile.name}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold tracking-wider ${fileTypeBadgeColor(selectedFile.name)}`}
                >
                  {friendlyType(selectedFile.name)}
                </span>
                <span className="text-xs text-gray-500">
                  {formatBytes(selectedFile.size)}
                </span>
              </div>
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleReset();
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-all hover:bg-red-500/10 hover:text-red-400"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Parse error                                                        */}
      {/* ------------------------------------------------------------------ */}
      {parseError && (
        <div className="animate-fade-in rounded-2xl border border-red-500/15 bg-red-500/[0.05] p-7" role="alert">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/20">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-300">
                Parsing Error
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-red-300/60">
                {parseError}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/15 bg-red-500/[0.06] px-4 py-3 text-sm font-medium text-red-400 transition-colors hover:border-red-500/25 hover:bg-red-500/10"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try Again
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Parse button                                                       */}
      {/* ------------------------------------------------------------------ */}
      {selectedFile && !parsedDoc && (
        <button
          type="button"
          onClick={() => { void handleParse(); }}
          disabled={isParsing}
          className={[
            'relative flex w-full items-center justify-center gap-2.5 overflow-hidden',
            'rounded-2xl px-6 py-4 text-sm font-semibold text-white',
            'transition-all duration-300',
            'disabled:cursor-not-allowed disabled:opacity-50',
            isParsing
              ? 'bg-indigo-600/80'
              : [
                  'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600',
                  'bg-[length:200%_100%] animate-gradient-shift',
                  'shadow-lg shadow-indigo-500/20',
                  'hover:shadow-xl hover:shadow-indigo-500/30',
                ].join(' '),
          ].join(' ')}
        >
          {isParsing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Analyzing document...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>Parse & Analyze Document</span>
            </>
          )}
        </button>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Success state                                                      */}
      {/* ------------------------------------------------------------------ */}
      {parsedDoc && (
        <div className="animate-fade-in space-y-4" role="status" aria-live="polite">
          {/* Success card */}
          <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-7">
            <div className="flex items-start gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-emerald-300">
                  Document parsed successfully
                </p>
                <p className="mt-1 text-xs text-emerald-400/50">
                  {parsedDoc.transactions.length} transaction{parsedDoc.transactions.length === 1 ? '' : 's'} extracted
                </p>

                {/* Stats grid */}
                <div className="mt-5 grid grid-cols-3 gap-4">
                  <div className="rounded-xl bg-[#0D0F14]/60 px-4 py-3.5 ring-1 ring-white/[0.04]">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                      Transactions
                    </p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums text-gray-100">
                      {parsedDoc.transactions.length}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#0D0F14]/60 px-4 py-3.5 ring-1 ring-white/[0.04]">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                      Total Value
                    </p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums text-gray-100">
                      {formatCurrency(parsedDoc.totalValue, parsedDoc.currency)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#0D0F14]/60 px-4 py-3.5 ring-1 ring-white/[0.04]">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                      Currency
                    </p>
                    <p className="mt-1.5 text-lg font-bold text-gray-100">
                      {parsedDoc.currency}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Upload another */}
          <button
            type="button"
            onClick={handleReset}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-3.5 text-sm font-medium text-gray-400 transition-all hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-gray-300"
          >
            <FileText className="h-4 w-4" />
            Upload Another File
          </button>
        </div>
      )}
    </div>
  );
}
