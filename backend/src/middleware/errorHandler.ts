import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError, isHttpError } from '../lib/httpErrors';

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://backend.local');
    for (const [key] of parsed.searchParams.entries()) {
      if (/token|password|secret|key|ssn/i.test(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const httpError = isHttpError(err)
    ? err
    : err instanceof ZodError
      ? new HttpError(
          400,
          'VALIDATION_ERROR',
          err.errors[0]?.message ?? 'Invalid request payload',
          err.flatten(),
        )
      : new HttpError(500, 'INTERNAL_ERROR', 'Internal server error');

  console.error(
    JSON.stringify({
      event: 'UNHANDLED_API_ERROR',
      timestamp: new Date().toISOString(),
      method: req.method,
      url: redactUrl(req.originalUrl || req.url),
      ip: req.ip,
      userId: req.userId ?? null,
      statusCode: httpError.statusCode,
      code: httpError.code,
      message: err instanceof Error ? err.message : httpError.message,
      stack: err instanceof Error ? err.stack : undefined,
      params: req.params,
      queryKeys: Object.keys(req.query ?? {}),
      bodyKeys:
        req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? Object.keys(req.body as Record<string, unknown>)
          : [],
    }),
  );

  res.status(httpError.statusCode).json({
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.issues !== undefined ? { issues: httpError.issues } : {}),
    },
  });
}

