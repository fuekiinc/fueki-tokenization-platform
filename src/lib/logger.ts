/**
 * Structured Logger for the Fueki Tokenization Platform.
 *
 * - Development: colorized console output with component names and timestamps.
 * - Production: structured JSON output for log aggregation services.
 * - Integrates with Datadog Browser Logs when available.
 * - Log level is controlled by the VITE_LOG_LEVEL environment variable.
 * - Debug-level logging is a compile-time no-op in production builds.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  component?: string;
}

// ---------------------------------------------------------------------------
// Level hierarchy (lower number = more verbose)
// ---------------------------------------------------------------------------

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

const IS_DEV = import.meta.env.DEV;

const CONFIGURED_LEVEL: LogLevel = (() => {
  const envLevel = (import.meta.env.VITE_LOG_LEVEL ?? '').toLowerCase();
  if (envLevel in LOG_LEVEL_ORDER) {
    return envLevel as LogLevel;
  }
  return IS_DEV ? 'debug' : 'warn';
})();

const CONFIGURED_LEVEL_VALUE = LOG_LEVEL_ORDER[CONFIGURED_LEVEL];

// ---------------------------------------------------------------------------
// Console color presets for development
// ---------------------------------------------------------------------------

const DEV_COLORS: Record<LogLevel, string> = {
  debug: 'color: #94A3B8',
  info: 'color: #60A5FA',
  warn: 'color: #FBBF24',
  error: 'color: #F87171',
};

const COMPONENT_COLOR = 'color: #A78BFA; font-weight: bold';

// ---------------------------------------------------------------------------
// Error serialization
// ---------------------------------------------------------------------------

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
    if ('cause' in err && err.cause !== undefined) {
      serialized.cause = serializeError(err.cause);
    }
    if ('code' in err) {
      serialized.code = (err as Record<string, unknown>).code;
    }
    return serialized;
  }
  if (typeof err === 'string') {
    return { message: err };
  }
  return { value: err };
}

/**
 * Normalize the second argument of a log call. If it looks like a plain
 * context object (Record<string, unknown>) it is returned as-is. Otherwise
 * it is wrapped in an `{ error: ... }` envelope after serialization.
 */
function normalizeContext(arg: unknown): Record<string, unknown> {
  if (arg === null || arg === undefined) return {};
  if (
    typeof arg === 'object' &&
    !Array.isArray(arg) &&
    !(arg instanceof Error) &&
    Object.getPrototypeOf(arg) === Object.prototype
  ) {
    return arg as Record<string, unknown>;
  }
  return { error: serializeError(arg) };
}

// ---------------------------------------------------------------------------
// Datadog integration
// ---------------------------------------------------------------------------

let _datadogLogger: DatadogLoggerLike | null = null;

interface DatadogLoggerLike {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Register a Datadog Browser Logs logger instance for production forwarding.
 * Call this once during application bootstrap after initializing Datadog:
 *
 * ```ts
 * import { datadogLogs } from '@datadog/browser-logs';
 * import { logger, setDatadogLogger } from '@/lib/logger';
 * datadogLogs.init({ ... });
 * setDatadogLogger(datadogLogs.logger);
 * ```
 */
function setDatadogLogger(ddLogger: DatadogLoggerLike): void {
  _datadogLogger = ddLogger;
}

// ---------------------------------------------------------------------------
// Core emit function
// ---------------------------------------------------------------------------

function emit(entry: LogEntry): void {
  // Forward to Datadog if available
  if (_datadogLogger) {
    const ddContext = {
      ...entry.context,
      ...(entry.component ? { component: entry.component } : {}),
    };
    _datadogLogger[entry.level](entry.message, ddContext);
  }

  // Development: colorized console output
  if (IS_DEV) {
    const prefix = entry.component
      ? `%c[${entry.component}]%c `
      : '';
    const styles = entry.component
      ? [COMPONENT_COLOR, DEV_COLORS[entry.level]]
      : [];
    const args: unknown[] = [
      `${prefix}%c${entry.message}`,
      ...styles,
      DEV_COLORS[entry.level],
    ];
    if (entry.context && Object.keys(entry.context).length > 0) {
      args.push(entry.context);
    }

    switch (entry.level) {
      case 'debug':
        // eslint-disable-next-line no-console
        console.debug(...args);
        break;
      case 'info':
        // eslint-disable-next-line no-console
        console.info(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'error':
        console.error(...args);
        break;
    }
    return;
  }

  // Production: structured JSON output
  const json = JSON.stringify(entry);
  switch (entry.level) {
    case 'warn':
      console.warn(json);
      break;
    case 'error':
      console.error(json);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// No-op function for suppressed log levels
// ---------------------------------------------------------------------------

function noop(): void {
  // Intentionally empty -- suppresses output below configured level
}

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= CONFIGURED_LEVEL_VALUE;
}

/**
 * Create a child logger scoped to a specific component.
 *
 * ```ts
 * const log = logger.child('WalletConnect');
 * log.info('User connected', { address });
 * ```
 */
function child(component: string) {
  return {
    debug: IS_DEV && shouldLog('debug')
      ? (message: string, context?: unknown): void => {
          emit({
            level: 'debug',
            message,
            context: context !== undefined ? normalizeContext(context) : undefined,
            timestamp: new Date().toISOString(),
            component,
          });
        }
      : noop,

    info(message: string, context?: unknown): void {
      if (!shouldLog('info')) return;
      emit({
        level: 'info',
        message,
        context: context !== undefined ? normalizeContext(context) : undefined,
        timestamp: new Date().toISOString(),
        component,
      });
    },

    warn(message: string, context?: unknown): void {
      if (!shouldLog('warn')) return;
      emit({
        level: 'warn',
        message,
        context: context !== undefined ? normalizeContext(context) : undefined,
        timestamp: new Date().toISOString(),
        component,
      });
    },

    error(message: string, error?: unknown, context?: unknown): void {
      if (!shouldLog('error')) return;
      const enrichedContext: Record<string, unknown> = {
        ...(context !== undefined ? normalizeContext(context) : {}),
        ...(error !== undefined ? { error: serializeError(error) } : {}),
      };
      emit({
        level: 'error',
        message,
        context: enrichedContext,
        timestamp: new Date().toISOString(),
        component,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Root logger instance
// ---------------------------------------------------------------------------

const logger = {
  /**
   * Debug-level log. No-op in production builds regardless of configuration
   * to eliminate any runtime cost.
   */
  debug: IS_DEV && shouldLog('debug')
    ? (message: string, context?: unknown): void => {
        emit({
          level: 'debug',
          message,
          context: context !== undefined ? normalizeContext(context) : undefined,
          timestamp: new Date().toISOString(),
        });
      }
    : noop,

  /** Info-level log. Emitted when VITE_LOG_LEVEL is 'info' or lower. */
  info(message: string, context?: unknown): void {
    if (!shouldLog('info')) return;
    emit({
      level: 'info',
      message,
      context: context !== undefined ? normalizeContext(context) : undefined,
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Warn-level log. Accepts either a context object or any value as the
   * second argument (errors, strings, etc. are auto-serialized).
   */
  warn(message: string, context?: unknown): void {
    if (!shouldLog('warn')) return;
    emit({
      level: 'warn',
      message,
      context: context !== undefined ? normalizeContext(context) : undefined,
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Error-level log. Always emitted. Serializes error objects including
   * stack traces and nested causes.
   */
  error(message: string, error?: unknown, context?: unknown): void {
    if (!shouldLog('error')) return;
    const enrichedContext: Record<string, unknown> = {
      ...(context !== undefined ? normalizeContext(context) : {}),
      ...(error !== undefined ? { error: serializeError(error) } : {}),
    };
    emit({
      level: 'error',
      message,
      context: enrichedContext,
      timestamp: new Date().toISOString(),
    });
  },

  /** Create a child logger scoped to a component name. */
  child,
};

export default logger;
export { setDatadogLogger };
export type { LogLevel, LogEntry, DatadogLoggerLike };
