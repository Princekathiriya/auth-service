import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, z } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';
import { isProd } from '../config/env.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route ${req.method} ${req.path} not found`, 'NOT_FOUND'));
};

// Express recognises an error handler by its 4 arguments, so `_next` must stay.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: z.flattenError(err).fieldErrors },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  // Safety net: a malformed id that slipped past validation is the client's fault, not a 500.
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: `Invalid ${err.path}` } });
    return;
  }

  // Errors from Express's own body parser (malformed JSON = 400, too large = 413)
  // carry a 4xx `status`. They're the client's fault, not a bug, so pass them through.
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: { code: err.type ?? 'BAD_REQUEST', message: err.message } });
    return;
  }

  // Unexpected error = bug. Log the full thing, but never leak stack traces to clients in production.
  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: isProd ? 'Something went wrong' : String(err?.message ?? err) },
  });
};
