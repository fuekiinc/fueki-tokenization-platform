import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type FileRejection, useDropzone } from 'react-dropzone';
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocumentCategory = 'drivers_license' | 'passport' | 'national_id';

interface UploadedFile {
  file: File;
  previewUrl: string | null;
  label: string;
}

interface DocumentUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  documentType: DocumentCategory;
  error?: string;
  className?: string;
  /** Maximum number of files that can be uploaded. Defaults to 1. */
  maxFiles?: number;
  /** Callback for multi-file uploads */
  onMultiFileSelect?: (files: UploadedFile[]) => void;
  /** When using multi-file mode, the list of already-selected files */
  selectedFiles?: UploadedFile[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCEPTED_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/pdf': ['.pdf'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const DOCUMENT_LABELS: Record<DocumentCategory, string> = {
  drivers_license: "driver's license",
  passport: 'passport',
  national_id: 'national ID card',
};

const DOCUMENT_INSTRUCTIONS: Record<DocumentCategory, string> = {
  drivers_license:
    'Upload a clear photo of the front of your driver\'s license. Ensure all text and photo are visible.',
  passport:
    'Upload the photo page of your passport. The entire page must be visible including the MRZ code at the bottom.',
  national_id:
    'Upload a clear photo of the front of your national ID card. Ensure all text and photo are clearly readable.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file: File): boolean {
  return file.type === 'image/jpeg' || file.type === 'image/png';
}

function getSpecificErrorMessage(errorCode: string | undefined): string {
  switch (errorCode) {
    case 'file-too-large':
      return `File exceeds the ${formatFileSize(MAX_FILE_SIZE)} size limit. Please upload a smaller file.`;
    case 'file-invalid-type':
      return 'Unsupported file type. Please upload a JPG, PNG, or PDF file.';
    case 'too-many-files':
      return 'Only one file can be uploaded at a time.';
    default:
      return 'File could not be uploaded. Please try again.';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DocumentUpload({
  onFileSelect,
  selectedFile,
  documentType,
  error,
  className,
  maxFiles = 1,
  onMultiFileSelect,
  selectedFiles = [],
}: DocumentUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const mountedRef = useRef(true);

  const documentLabel = DOCUMENT_LABELS[documentType];
  const instructions = DOCUMENT_INSTRUCTIONS[documentType];
  const isMultiMode = maxFiles > 1 && !!onMultiFileSelect;

  // Track mounted state to prevent updates after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ---- Object URL lifecycle -----------------------------------------------
  useEffect(() => {
    if (selectedFile && isImageFile(selectedFile)) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);

      return () => {
        URL.revokeObjectURL(url);
      };
    }

    setPreviewUrl(null);
    return undefined;
  }, [selectedFile]);

  // ---- Simulated upload progress ------------------------------------------
  useEffect(() => {
    if (!selectedFile) {
      setUploadProgress(null);
      return;
    }

    // Simulate a brief processing animation when file is selected
    setUploadProgress(0);
    const steps = [20, 50, 75, 100];
    const timers: ReturnType<typeof setTimeout>[] = [];

    steps.forEach((value, i) => {
      timers.push(
        setTimeout(() => {
          if (mountedRef.current) {
            setUploadProgress(value);
          }
        }, (i + 1) * 150),
      );
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [selectedFile]);

  // ---- Drop handler -------------------------------------------------------
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      if (isMultiMode) {
        const newFiles: UploadedFile[] = acceptedFiles.map((file, idx) => ({
          file,
          previewUrl: isImageFile(file) ? URL.createObjectURL(file) : null,
          label: `Document ${selectedFiles.length + idx + 1}`,
        }));
        onMultiFileSelect([...selectedFiles, ...newFiles]);
      } else {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect, isMultiMode, onMultiFileSelect, selectedFiles],
  );

  const onDropRejected = useCallback(
    (rejections: FileRejection[]) => {
      const errorCode = rejections[0]?.errors[0]?.code;
      toast.error(getSpecificErrorMessage(errorCode));
    },
    [],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: ACCEPTED_TYPES,
    maxFiles: isMultiMode ? maxFiles - selectedFiles.length : 1,
    multiple: isMultiMode,
    maxSize: MAX_FILE_SIZE,
    disabled: isMultiMode && selectedFiles.length >= maxFiles,
  });

  // ---- Remove handler -----------------------------------------------------
  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFileSelect(null);
    },
    [onFileSelect],
  );

  const handleRemoveMulti = useCallback(
    (index: number) => {
      if (!onMultiFileSelect) return;
      const updated = selectedFiles.filter((_, i) => i !== index);
      // Revoke the URL for the removed file
      const removed = selectedFiles[index];
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      onMultiFileSelect(updated);
    },
    [onMultiFileSelect, selectedFiles],
  );

  // ---- Derived state ------------------------------------------------------
  const hasFile = selectedFile !== null;
  const hasMultiFiles = isMultiMode && selectedFiles.length > 0;
  const hasError = !!error;
  const isProcessing = uploadProgress !== null && uploadProgress < 100;

  const borderClass = useMemo(() => {
    if (hasError) return 'border-[var(--danger)]';
    if (isDragActive) return 'border-[var(--accent-primary)]';
    return 'border-[var(--border-primary)]';
  }, [hasError, isDragActive]);

  const borderStyle = hasFile || hasMultiFiles ? 'border-solid' : 'border-dashed';

  const fileSizeLabel = selectedFile
    ? `${formatFileSize(selectedFile.size)} / ${formatFileSize(MAX_FILE_SIZE)} max`
    : null;

  // ---- Render: multi-file list --------------------------------------------
  if (isMultiMode) {
    return (
      <div className={clsx('space-y-3', className)}>
        {/* Instructions */}
        <p className="text-xs text-[var(--text-muted)] px-1">{instructions}</p>

        {/* Already uploaded files */}
        {selectedFiles.map((uploaded, index) => (
          <div
            key={`${uploaded.file.name}-${index}`}
            className={clsx(
              'relative rounded-xl border overflow-hidden transition-colors duration-200',
              'border-solid border-[var(--border-primary)]',
              'bg-[var(--bg-secondary)]',
            )}
          >
            <div className="flex items-center gap-4 p-4">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center">
                {uploaded.previewUrl ? (
                  <img
                    src={uploaded.previewUrl}
                    alt={`Preview of ${uploaded.file.name}`}
                    className="h-full w-full object-cover"
                    width={48}
                    height={48}
                  />
                ) : (
                  <FileText className="h-6 w-6 text-[var(--text-muted)]" aria-hidden="true" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {uploaded.file.name}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {formatFileSize(uploaded.file.size)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => handleRemoveMulti(index)}
                  className={clsx(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    'text-[var(--text-muted)] transition-colors duration-150',
                    'hover:bg-[var(--bg-tertiary)] hover:text-[var(--danger)]',
                  )}
                  aria-label={`Remove ${uploaded.file.name}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Drop zone for additional files */}
        {selectedFiles.length < maxFiles && (
          <div
            {...getRootProps()}
            className={clsx(
              'group relative flex cursor-pointer flex-col items-center justify-center',
              'rounded-xl border-2 p-6',
              'transition-all duration-200 ease-out',
              'border-dashed',
              borderClass,
              isDragActive
                ? 'bg-[color-mix(in_srgb,var(--accent-primary)_6%,var(--bg-secondary))]'
                : 'bg-[var(--bg-secondary)]',
              !hasError && !isDragActive && 'hover:border-[var(--border-hover)]',
            )}
          >
            <input {...getInputProps()} />
            <div className="flex items-center gap-3">
              <Upload
                className={clsx(
                  'h-5 w-5',
                  isDragActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]',
                )}
                aria-hidden="true"
              />
              <span className="text-sm text-[var(--text-secondary)]">
                {isDragActive
                  ? 'Drop here'
                  : `Add document (${selectedFiles.length}/${maxFiles})`}
              </span>
            </div>
          </div>
        )}

        {/* Error message */}
        {hasError && (
          <div className="flex items-center gap-2 px-1" role="alert">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
            <p className="text-xs text-[var(--danger)]">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ---- Render: single file preview ----------------------------------------
  if (hasFile && selectedFile) {
    return (
      <div className={clsx('space-y-2', className)}>
        {/* Instructions */}
        <p className="text-xs text-[var(--text-muted)] px-1 mb-3">{instructions}</p>

        <div
          className={clsx(
            'relative rounded-xl border-2 overflow-hidden transition-colors duration-200',
            borderStyle,
            borderClass,
            'bg-[var(--bg-secondary)]',
          )}
        >
          {/* Upload progress bar */}
          {isProcessing && (
            <div
              className="absolute inset-x-0 top-0 h-1 bg-[var(--bg-tertiary)]"
              role="progressbar"
              aria-valuenow={uploadProgress ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="File upload progress"
            >
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300 ease-out rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          <div className="flex items-center gap-4 p-4">
            {/* Thumbnail / file icon */}
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center">
              {isProcessing ? (
                <Loader2
                  className="h-6 w-6 text-[var(--accent-primary)] animate-spin"
                  aria-hidden="true"
                />
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt={`Preview of ${selectedFile.name}`}
                  className="h-full w-full object-cover"
                  width={64}
                  height={64}
                />
              ) : (
                <FileText
                  className="h-7 w-7 text-[var(--text-muted)]"
                  aria-hidden="true"
                />
              )}
            </div>

            {/* File details */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {selectedFile.name}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {fileSizeLabel}
              </p>
              {isProcessing && (
                <p
                  className="mt-1 text-xs text-[var(--accent-primary)]"
                  aria-live="polite"
                >
                  Processing file...
                </p>
              )}
              {!isProcessing && uploadProgress === 100 && (
                <div className="mt-1 flex items-center gap-1">
                  <CheckCircle2
                    className="h-3.5 w-3.5 text-emerald-400"
                    aria-hidden="true"
                  />
                  <span className="text-xs text-emerald-400">Ready</span>
                </div>
              )}
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={handleRemove}
              className={clsx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                'text-[var(--text-muted)] transition-colors duration-150',
                'hover:bg-[var(--bg-tertiary)] hover:text-[var(--danger)]',
              )}
              aria-label="Remove file"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Error message */}
        {hasError && (
          <div className="flex items-center gap-2 px-1" role="alert">
            <AlertCircle
              className="h-3.5 w-3.5 shrink-0 text-[var(--danger)]"
              aria-hidden="true"
            />
            <p className="text-xs text-[var(--danger)]">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ---- Render: empty drop zone --------------------------------------------
  return (
    <div className={clsx('space-y-2', className)}>
      {/* Instructions */}
      <p className="text-xs text-[var(--text-muted)] px-1 mb-3">{instructions}</p>

      <div
        {...getRootProps()}
        className={clsx(
          'group relative flex cursor-pointer flex-col items-center justify-center',
          'rounded-xl border-2 p-8 sm:p-10',
          'transition-all duration-200 ease-out',
          borderStyle,
          borderClass,
          isDragActive
            ? 'bg-[color-mix(in_srgb,var(--accent-primary)_6%,var(--bg-secondary))]'
            : 'bg-[var(--bg-secondary)]',
          !hasError && !isDragActive && 'hover:border-[var(--border-hover)]',
        )}
      >
        <input {...getInputProps()} />

        {/* Upload icon */}
        <div
          className={clsx(
            'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-200',
            isDragActive
              ? 'bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] text-[var(--accent-primary)]'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]',
          )}
        >
          {isDragActive ? (
            <Upload className="h-6 w-6 animate-bounce" aria-hidden="true" />
          ) : (
            <Upload className="h-6 w-6" aria-hidden="true" />
          )}
        </div>

        {/* Instructional text */}
        {isDragActive ? (
          <>
            <p className="text-sm font-medium text-[var(--accent-primary)]">
              Drop your file here
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Release to upload
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Drag & drop your {documentLabel} here
            </p>
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              or{' '}
              <span className="text-[var(--accent-primary)] underline underline-offset-2">
                click to browse
              </span>
            </p>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              JPG, PNG, or PDF &middot; {formatFileSize(MAX_FILE_SIZE)} max
            </p>
          </>
        )}
      </div>

      {/* Error message */}
      {hasError && (
        <div className="flex items-center gap-2 px-1" role="alert">
          <AlertCircle
            className="h-3.5 w-3.5 shrink-0 text-[var(--danger)]"
            aria-hidden="true"
          />
          <p className="text-xs text-[var(--danger)]">{error}</p>
        </div>
      )}
    </div>
  );
}

export type { DocumentUploadProps, DocumentCategory, UploadedFile };
