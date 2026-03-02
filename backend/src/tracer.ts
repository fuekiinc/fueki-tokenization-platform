let tracer: unknown;
try {
  // dd-trace is optional — it may not be installed in all environments.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dd = require('dd-trace');
  dd.init({
    service: 'fueki-backend',
    env: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    logInjection: true,
  });
  tracer = dd;
} catch {
  // dd-trace is not available; continue without APM instrumentation.
  console.warn('[tracer] dd-trace not available, running without APM');
}
export default tracer;
