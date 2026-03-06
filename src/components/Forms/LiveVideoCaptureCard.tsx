import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Trash2,
  Video,
} from 'lucide-react';
import { parseMediaError, pickSupportedVideoMimeType } from './captureUtils';

const LIVE_SCAN_SECONDS = 10;
const LIVE_SCAN_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const LIVE_SCAN_MAX_SIZE_MB = LIVE_SCAN_MAX_SIZE_BYTES / (1024 * 1024);
const LIVE_SCAN_VIDEO_BITS_PER_SECOND = 900_000;

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface LiveVideoCaptureCardProps {
  title: string;
  description: string;
  file: File | null;
  previewUrl: string | null;
  onCapture: (file: File | null, previewUrl: string | null) => void;
  disabled: boolean;
}

export default function LiveVideoCaptureCard({
  title,
  description,
  file,
  previewUrl,
  onCapture,
  disabled,
}: LiveVideoCaptureCardProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const shouldPersistRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => {
    shouldPersistRef.current = false;
    clearTimers();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    stopStream();
  }, [clearTimers, stopStream]);

  useEffect(() => {
    if (isRecording && streamRef.current && previewVideoRef.current) {
      previewVideoRef.current.srcObject = streamRef.current;
      previewVideoRef.current.play().catch(() => {});
    }
  }, [isRecording]);

  const resetRecordingState = useCallback(() => {
    clearTimers();
    setIsRecording(false);
    setRemainingSeconds(0);
    recorderRef.current = null;
    chunksRef.current = [];
    stopStream();
  }, [clearTimers, stopStream]);

  const startRecording = useCallback(async () => {
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser does not support live camera recording.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setCameraError('This browser does not support live video recording.');
      return;
    }

    setIsStarting(true);
    shouldPersistRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 960, max: 1280 },
          height: { ideal: 540, max: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;

      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        await previewVideoRef.current.play().catch(() => {});
      }

      const mimeType = pickSupportedVideoMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: LIVE_SCAN_VIDEO_BITS_PER_SECOND })
          : new MediaRecorder(stream, { videoBitsPerSecond: LIVE_SCAN_VIDEO_BITS_PER_SECOND });
      } catch {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      }

      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setCameraError('Live video capture failed. Please try again.');
      };

      recorder.onstop = () => {
        const shouldPersist = shouldPersistRef.current;
        const blob = shouldPersist
          ? new Blob(chunksRef.current, {
            type: recorder.mimeType || mimeType || 'video/webm',
          })
          : null;

        if (shouldPersist && blob && blob.size > LIVE_SCAN_MAX_SIZE_BYTES) {
          setCameraError(
            `Recorded clip is ${formatMegabytes(blob.size)}, which exceeds the ${LIVE_SCAN_MAX_SIZE_MB} MB limit. Record again with steadier framing and good lighting.`,
          );
        } else if (shouldPersist && blob && blob.size > 0) {
          const extension = blob.type.includes('mp4')
            ? 'mp4'
            : blob.type.includes('quicktime')
              ? 'mov'
              : 'webm';
          const fileName = `kyc-live-scan-${Date.now()}.${extension}`;
          const liveVideoFile = new File([blob], fileName, { type: blob.type || 'video/webm' });
          const liveVideoPreview = URL.createObjectURL(blob);
          onCapture(liveVideoFile, liveVideoPreview);
        } else if (shouldPersist) {
          setCameraError('Recorded clip was empty. Please record again.');
        }

        resetRecordingState();
      };

      recorder.start(250);
      setIsRecording(true);
      setRemainingSeconds(LIVE_SCAN_SECONDS);

      intervalRef.current = window.setInterval(() => {
        setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
      }, 1000);

      timeoutRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === 'recording') {
          recorderRef.current.stop();
        }
      }, LIVE_SCAN_SECONDS * 1000);
    } catch (error) {
      setCameraError(parseMediaError(error));
      resetRecordingState();
    } finally {
      setIsStarting(false);
    }
  }, [onCapture, resetRecordingState]);

  const cancelRecording = useCallback(() => {
    shouldPersistRef.current = false;
    clearTimers();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      return;
    }
    resetRecordingState();
  }, [clearTimers, resetRecordingState]);

  const progress = useMemo(() => {
    if (!isRecording) return 0;
    return ((LIVE_SCAN_SECONDS - remainingSeconds) / LIVE_SCAN_SECONDS) * 100;
  }, [isRecording, remainingSeconds]);

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
          <video
            src={previewUrl}
            controls
            playsInline
            className="max-h-56 w-full rounded-lg bg-black/40 object-contain"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled || isStarting || isRecording}
              className={clsx(
                'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium',
                'border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
                'hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Record again
            </button>
            <button
              type="button"
              onClick={() => onCapture(null, null)}
              disabled={disabled || isRecording}
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
          onClick={startRecording}
          disabled={disabled || isStarting || isRecording}
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
              <Video className="h-4 w-4" aria-hidden="true" />
              Start 10-second live scan
            </>
          )}
        </button>
      )}

      {isRecording && (
        <div className="mt-3 space-y-3 rounded-lg border border-[var(--border-primary)] bg-black/30 p-3">
          <video
            ref={previewVideoRef}
            autoPlay
            playsInline
            muted
            className="max-h-56 w-full rounded-lg object-cover"
          />
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1 text-rose-300">
                <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
                Recording in progress
              </span>
              <span>{remainingSeconds}s remaining</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={cancelRecording}
            disabled={disabled}
            className={clsx(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium',
              'border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
              'hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            Cancel recording
          </button>
        </div>
      )}

      <p className="mt-3 flex items-start gap-2 text-xs text-[var(--text-muted)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
        <span>
          Hold your government ID next to your face and remain clearly visible for the full{' '}
          {`${LIVE_SCAN_SECONDS}-second`} scan. Keep the clip under {LIVE_SCAN_MAX_SIZE_MB} MB.
        </span>
      </p>

      {cameraError && (
        <p className="mt-2 text-xs text-amber-300">{cameraError}</p>
      )}
    </div>
  );
}
