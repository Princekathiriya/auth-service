import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../utils/tokens.js';
import { AppError } from '../utils/AppError.js';

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing access token', 'UNAUTHENTICATED');
  }
  try {
    const payload = await verifyAccessToken(header.slice('Bearer '.length));
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    // Expired, tampered, wrong signature: all the same to the client.
    throw new AppError(401, 'Invalid or expired access token', 'UNAUTHENTICATED');
  }
  next();
};
