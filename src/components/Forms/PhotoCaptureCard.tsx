import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { parseMediaError, sanitizeFilePrefix } from './captureUtils';

const PHOTO_MIME_TYPE = 'image/jpeg';

interface PhotoCaptureCardProps {
  title: string;
  description: string;
  file: File | null;
  previewUrl: string | null;
  onCapture: (file: File | null, previewUrl: string | null) => void;
  disabled: boolean;
  filePrefix: string;
  facingMode?: 'environment' | 'user';
}

export default function PhotoCaptureCard({
  title,
  description,
  file,
  previewUrl,
  onCapture,
  disabled,
  filePrefix,
  facingMode = 'environment',
}: PhotoCaptureCardProps) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => {
    stopStream();
  }, [stopStream]);

  useEffect(() => {
    if (cameraOpen && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);

  const startCamera = useCallback(async () => {
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser does not support direct camera capture.');
      return;
    }

    setIsStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraOpen(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (error) {
      setCameraError(parseMediaError(error));
      stopStream();
      setCameraOpen(false);
    } finally {
      setIsStarting(false);
    }
  }, [facingMode, stopStream]);

  const cancelCamera = useCallback(() => {
    stopStream();
    setCameraOpen(false);
    setCameraError(null);
  }, [stopStream]);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsCapturing(true);
    try {
      const width = videoRef.current.videoWidth || 1280;
      const height = videoRef.current.videoHeight || 720;
      canvasRef.current.width = width;
      canvasRef.current.height = height;

      const context = canvasRef.current.getContext('2d');
      if (!context) {
        throw new Error('Unable to access camera frame buffer.');
      }

      context.drawImage(videoRef.current, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvasRef.current?.toBlob(resolve, PHOTO_MIME_TYPE, 0.92);
      });

      if (!blob) {
        throw new Error('Failed to capture image from camera.');
      }

      const fileName = `${sanitizeFilePrefix(filePrefix)}-${Date.now()}.jpg`;
      const photoFile = new File([blob], fileName, { type: PHOTO_MIME_TYPE });
      const preview = URL.createObjectURL(blob);

      onCapture(photoFile, preview);
      cancelCamera();
    } catch (error) {
      setCameraError(parseMediaError(error));
    } finally {
      setIsCapturing(false);
    }
  }, [cancelCamera, filePrefix, onCapture]);

  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
        </div>
        {file && (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
        )}
      </div>

      {previewUrl ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg bg-black/20">
            <img
              src={previewUrl}
              alt={`${title} preview`}
              className="max-h-56 w-full object-contain"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startCamera}
              disabled={disabled}
              className={clsx(
                'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium',
                'border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
                'hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retake photo
            </button>
            <button
              type="button"
              onClick={() => onCapture(null, null)}
              disabled={disabled}
              className={clsx(
                'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium',
                'border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-muted)]',
                'hover:text-[var(--danger)] transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startCamera}
          disabled={disabled || isStarting || cameraOpen}
          className={clsx(
            'inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium',
            'border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
            'hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {isStarting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Opening camera...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" aria-hidden="true" />
              Take photo
            </>
          )}
        </button>
      )}

      {cameraOpen && (
        <div className="mt-3 space-y-3 rounded-lg border border-[var(--border-primary)] bg-black/30 p-3">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-h-56 w-full rounded-lg object-cover"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={capturePhoto}
              disabled={disabled || isCapturing}
              className={clsx(
                'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white',
                'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {isCapturing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Capturing...
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  Capture photo
                </>
              )}
            </button>
            <button
              type="button"
              onClick={cancelCamera}
              disabled={disabled || isCapturing}
              className={clsx(
                'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium',
                'border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
                'hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {cameraError && (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{cameraError}</span>
        </p>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
