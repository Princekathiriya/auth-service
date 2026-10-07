import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/**
 * Extra CSRF defence for endpoints that act on the refresh cookie.
 * Browsers always send an Origin header on cross-site POSTs and pages can't fake it,
 * so a mismatch means another website is trying to use our cookie.
 * No Origin at all = not a browser (curl, server, tests), and those don't have a victim's cookies.
 */
export const checkOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.headers.origin;
  if (origin && origin !== env.CLIENT_ORIGIN) {
    throw new AppError(403, 'Origin not allowed', 'FORBIDDEN_ORIGIN');
  }
  next();
};
