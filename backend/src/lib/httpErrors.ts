export class HttpError extends Error {
  statusCode: number;
  code: string;
  issues?: unknown;

  constructor(statusCode: number, code: string, message: string, issues?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.issues = issues;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

