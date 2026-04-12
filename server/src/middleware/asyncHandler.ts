import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ValidationError } from '../validation.js';

/**
 * Wraps an Express route handler so that thrown errors are forwarded to the
 * global error handler instead of crashing the process.  ValidationError
 * instances are returned as 400 Bad Request.
 */
export function asyncHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (req: Request, res: Response, next: NextFunction) => any,
): RequestHandler {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      // Handle async handlers that return a promise
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((err) => handleError(err, res, next));
      }
    } catch (err) {
      handleError(err, res, next);
    }
  };
}

function handleError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
  } else {
    next(err);
  }
}
