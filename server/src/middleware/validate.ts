import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from '../errors';

// Validates req.body and replaces it with the parsed, typed object.
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(422, 'INVALID_INPUT', 'Invalid input', result.error.flatten()));
    }
    req.body = result.data;
    next();
  };
}
