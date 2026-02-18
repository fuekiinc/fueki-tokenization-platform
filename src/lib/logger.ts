// ---------------------------------------------------------------------------
// Centralized logger
// ---------------------------------------------------------------------------
// Wraps console methods so they can be silenced in production builds.
// In development (import.meta.env.DEV === true) all messages are forwarded
// to the browser console. In production builds the warn/info/debug calls
// are no-ops to keep the console clean, while errors are still emitted so
// critical failures remain visible in monitoring tools and browser devtools.
//
// If an external error-tracking service (Sentry, Datadog, etc.) is
// integrated, call `logger.error()` -- it will both log to the console
// and forward the error to the tracking service.
// ---------------------------------------------------------------------------

const IS_DEV = import.meta.env.DEV;

function noop(..._args: unknown[]): void {
  // intentionally empty -- suppresses output in production
}

/** Send an error to an external tracking service if configured. */
function reportToService(_message: string, ..._args: unknown[]): void {
  // Integration point: replace this body with e.g.
  //   Sentry.captureException(args[0] instanceof Error ? args[0] : new Error(message));
  // when an error-tracking service is wired up.
}

const logger = {
  /** Always emitted -- critical failures that need visibility. */
  error(message: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.error(message, ...args);
    reportToService(message, ...args);
  },

  /** Emitted only in development. */
  warn(message: string, ...args: unknown[]): void {
    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.warn(message, ...args);
    }
  },

  /** Emitted only in development. */
  info(message: string, ...args: unknown[]): void {
    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.info(message, ...args);
    }
  },

  /** Emitted only in development. */
  debug: IS_DEV
    ? (message: string, ...args: unknown[]): void => {
        // eslint-disable-next-line no-console
        console.debug(message, ...args);
      }
    : noop,
};

export default logger;
