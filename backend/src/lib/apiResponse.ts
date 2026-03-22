import type { NextFunction, Request, Response } from 'express';

export interface ApiErrorPayload {
  code: string;
  message: string;
  issues?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeErrorPayload(error: unknown): ApiErrorPayload {
  if (isRecord(error)) {
    return {
      code: typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR',
      message: typeof error.message === 'string' ? error.message : 'Internal server error',
      ...(error.issues !== undefined ? { issues: error.issues } : {}),
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
  };
}

function normalizeSuccessPayload(body: unknown): unknown {
  if (isRecord(body)) {
    if (body.success === false && 'error' in body) {
      return {
        success: false,
        error: normalizeErrorPayload(body.error),
      };
    }

    if (body.success === true) {
      if ('data' in body) {
        return body;
      }

      const { success: _success, ...rest } = body;
      return {
        success: true,
        data: rest,
        ...rest,
      };
    }

    if ('error' in body) {
      return {
        success: false,
        error: normalizeErrorPayload(body.error),
      };
    }

    return {
      success: true,
      data: body,
      ...body,
    };
  }

  return {
    success: true,
    data: body,
  };
}

export function apiEnvelope(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = ((body: unknown) => originalJson(normalizeSuccessPayload(body))) as Response['json'];

  next();
}

