import type express from 'express';

type Headers = Record<string, string | string[]>;

interface DispatchOptions {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  extras?: Record<string, unknown>;
}

interface DispatchResult {
  status: number;
  text: string;
  body: unknown;
  headers: Headers;
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    path?: string;
    maxAge?: number;
  } = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.secure) {
    parts.push('Secure');
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  return parts.join('; ');
}

export async function dispatchExpressRouter(
  router: express.Router,
  { method, url, body = {}, headers = {}, extras = {} }: DispatchOptions,
): Promise<DispatchResult> {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    let resolved = false;
    const responseHeaders: Headers = {};
    let responseBody: unknown = undefined;
    let responseText = '';

    const req = {
      method,
      url,
      originalUrl: url,
      path: url,
      body,
      params: {},
      query: {},
      headers: Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
      ),
      get(name: string) {
        return this.headers[name.toLowerCase()];
      },
      header(name: string) {
        return this.get(name);
      },
      ...extras,
    };

    const res = {
      locals: {},
      status(code: number) {
        statusCode = code;
        return this;
      },
      set(field: string | Record<string, string | string[]>, value?: string | string[]) {
        if (typeof field === 'string') {
          responseHeaders[field.toLowerCase()] = value ?? '';
          return this;
        }

        for (const [key, headerValue] of Object.entries(field)) {
          responseHeaders[key.toLowerCase()] = headerValue;
        }
        return this;
      },
      setHeader(name: string, value: string | string[]) {
        responseHeaders[name.toLowerCase()] = value;
      },
      getHeader(name: string) {
        return responseHeaders[name.toLowerCase()];
      },
      type(value: string) {
        responseHeaders['content-type'] = value;
        return this;
      },
      cookie(
        name: string,
        value: string,
        options?: {
          httpOnly?: boolean;
          secure?: boolean;
          sameSite?: 'strict' | 'lax' | 'none';
          path?: string;
          maxAge?: number;
        },
      ) {
        const serialized = serializeCookie(name, value, options);
        const existing = responseHeaders['set-cookie'];
        if (!existing) {
          responseHeaders['set-cookie'] = [serialized];
        } else if (Array.isArray(existing)) {
          existing.push(serialized);
        } else {
          responseHeaders['set-cookie'] = [existing, serialized];
        }
        return this;
      },
      json(payload: unknown) {
        responseHeaders['content-type'] ??= 'application/json';
        responseBody = payload;
        responseText = JSON.stringify(payload);
        if (!resolved) {
          resolved = true;
          resolve({
            status: statusCode,
            text: responseText,
            body: responseBody,
            headers: responseHeaders,
          });
        }
        return this;
      },
      send(payload: unknown) {
        responseBody = payload;
        responseText = typeof payload === 'string' ? payload : JSON.stringify(payload);
        if (!resolved) {
          resolved = true;
          resolve({
            status: statusCode,
            text: responseText,
            body: responseBody,
            headers: responseHeaders,
          });
        }
        return this;
      },
    };

    router.handle(req as never, res as never, (err?: unknown) => {
      if (resolved) {
        return;
      }
      if (err) {
        reject(err);
        return;
      }
      resolved = true;
      resolve({
        status: statusCode,
        text: responseText,
        body: responseBody,
        headers: responseHeaders,
      });
    });
  });
}
