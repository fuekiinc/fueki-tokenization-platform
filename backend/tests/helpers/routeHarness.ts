import type { Router } from 'express';

type ExpressHandler = (
  req: Record<string, unknown>,
  res: Record<string, unknown>,
  next: (err?: unknown) => void,
) => unknown;

export interface MockResponse {
  body: unknown;
  cookies: Array<{ name: string; value: string; options: unknown }>;
  headers: Record<string, string | string[]>;
  sentType?: 'json' | 'send';
  statusCode: number;
  cookie: (name: string, value: string, options?: unknown) => MockResponse;
  end: (payload?: unknown) => MockResponse;
  getHeader: (name: string) => string | string[] | undefined;
  json: (payload: unknown) => MockResponse;
  send: (payload: unknown) => MockResponse;
  setHeader: (name: string, value: string | string[]) => MockResponse;
  status: (code: number) => MockResponse;
  type: (value: string) => MockResponse;
}

export function getRouteHandlers(
  router: Router,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
): ExpressHandler[] {
  const layer = (router as unknown as {
    stack?: Array<{
      route?: {
        path?: string;
        methods?: Record<string, boolean>;
        stack?: Array<{ handle: ExpressHandler }>;
      };
    }>;
  }).stack?.find((entry) => (
    entry.route?.path === path && entry.route.methods?.[method] === true
  ));

  if (!layer?.route?.stack) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  return layer.route.stack.map((entry) => entry.handle);
}

export function createMockReq(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    cookies: {},
    files: undefined,
    headers: {},
    method: 'GET',
    params: {},
    query: {},
    userId: undefined,
    ...overrides,
  };
}

export function createMockRes(): MockResponse {
  const headers: Record<string, string | string[]> = {};
  const cookies: Array<{ name: string; value: string; options: unknown }> = [];

  const res: MockResponse = {
    body: undefined,
    cookies,
    headers,
    statusCode: 200,
    cookie(name: string, value: string, options?: unknown) {
      cookies.push({ name, value, options });
      const serialized = `${name}=${value}`;
      const existing = headers['set-cookie'];
      headers['set-cookie'] = Array.isArray(existing)
        ? [...existing, serialized]
        : [serialized];
      return res;
    },
    end(payload?: unknown) {
      if (payload !== undefined) {
        res.body = payload;
      }
      return res;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    json(payload: unknown) {
      res.body = payload;
      res.sentType = 'json';
      return res;
    },
    send(payload: unknown) {
      res.body = payload;
      res.sentType = 'send';
      return res;
    },
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    type(value: string) {
      headers['content-type'] = value;
      return res;
    },
  };

  return res;
}

export async function invokeHandler(
  handler: ExpressHandler,
  req: Record<string, unknown>,
  res: MockResponse,
) {
  let nextError: unknown;

  await Promise.resolve(
    handler(req, res as unknown as Record<string, unknown>, (err?: unknown) => {
      nextError = err;
    }),
  );

  if (nextError !== undefined) {
    throw nextError;
  }

  return res;
}
