import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  documentType: 'drivers_license' | 'passport';
  error?: string;
  className?: string;
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

const DOCUMENT_LABELS: Record<DocumentUploadProps['documentType'], string> = {
  drivers_license: "driver's license",
  passport: 'passport',
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DocumentUpload({
  onFileSelect,
  selectedFile,
  documentType,
  error,
  className,
}: DocumentUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const documentLabel = DOCUMENT_LABELS[documentType];

  // ---- Object URL lifecycle -----------------------------------------------
  // Create a preview URL when an image file is selected; revoke it on change
  // or unmount to prevent memory leaks.

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

  // ---- Drop handler -------------------------------------------------------

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      onFileSelect(acceptedFiles[0]);
    },
    [onFileSelect],
  );

  const onDropRejected = useCallback(
    (rejections: FileRejection[]) => {
      const errorCode = rejections[0]?.errors[0]?.code;

      if (errorCode === 'file-too-large') {
        toast.error('File exceeds the 10 MB size limit. Please upload a smaller file.');
      } else if (errorCode === 'file-invalid-type') {
        toast.error('Unsupported file type. Please upload a JPG, PNG, or PDF file.');
      } else {
        const message = rejections[0]?.errors[0]?.message ?? 'File could not be uploaded.';
        toast.error(message);
      }
    },
    [],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    multiple: false,
    maxSize: MAX_FILE_SIZE,
    disabled: false,
  });

  // ---- Remove handler -----------------------------------------------------

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFileSelect(null);
    },
    [onFileSelect],
  );

  // ---- Derived state ------------------------------------------------------

  const hasFile = selectedFile !== null;
  const hasError = !!error;

  const borderClass = useMemo(() => {
    if (hasError) return 'border-[var(--danger)]';
    if (isDragActive) return 'border-[var(--accent-primary)]';
    if (hasFile) return 'border-[var(--border-primary)]';
    return 'border-[var(--border-primary)]';
  }, [hasError, isDragActive, hasFile]);

  const borderStyle = hasFile ? 'border-solid' : 'border-dashed';

  // ---- Render: file preview -----------------------------------------------

  if (hasFile && selectedFile) {
    return (
      <div className={clsx('space-y-2', className)}>
        <div
          className={clsx(
            'relative rounded-xl border-2 overflow-hidden transition-colors duration-200',
            borderStyle,
            borderClass,
            'bg-[var(--bg-secondary)]',
          )}
        >
          <div className="flex items-center gap-4 p-4">
            {/* Thumbnail / file icon */}
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={`Preview of ${selectedFile.name}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <FileText className="h-7 w-7 text-[var(--text-muted)]" />
              )}
            </div>

            {/* File details */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {selectedFile.name}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {formatFileSize(selectedFile.size)}
              </p>
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
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Error message */}
        {hasError && (
          <div className="flex items-center gap-2 px-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[var(--danger)]" />
            <p className="text-xs text-[var(--danger)]">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ---- Render: empty drop zone --------------------------------------------

  return (
    <div className={clsx('space-y-2', className)}>
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
            <Upload className="h-6 w-6 animate-bounce" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
        </div>

        {/* Instructional text */}
        {isDragActive ? (
          <>
            <p className="text-sm font-medium text-[var(--accent-primary)]">
              Drop your file here
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Release to upload</p>
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
              JPG, PNG, or PDF up to 10MB
            </p>
          </>
        )}
      </div>

      {/* Error message */}
      {hasError && (
        <div className="flex items-center gap-2 px-1">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[var(--danger)]" />
          <p className="text-xs text-[var(--danger)]">{error}</p>
        </div>
      )}
    </div>
  );
}

export type { DocumentUploadProps };
