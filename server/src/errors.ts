export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Unauthorized = (msg = 'Not authenticated') =>
  new AppError(401, 'UNAUTHORIZED', msg);

export const Forbidden = (msg = 'Not allowed') =>
  new AppError(403, 'FORBIDDEN', msg);

export const NotFound = (msg = 'Not found') =>
  new AppError(404, 'NOT_FOUND', msg);

export const Conflict = (msg = 'Conflict') =>
  new AppError(409, 'CONFLICT', msg);

export const BadRequest = (msg = 'Bad request', details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', msg, details);
