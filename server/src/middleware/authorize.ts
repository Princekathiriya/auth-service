import type { RequestHandler } from 'express';
import { UserModel, type Role } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

/*
 * 401 vs 403:
 *   401 Unauthenticated = "I don't know who you are" (no/invalid token). Logging in can fix it.
 *   403 Forbidden       = "I know who you are, and you're not allowed." Logging in again won't help.
 */

/**
 * Loads the user from the DB. Use it after requireAuth on routes that make a permission decision.
 * Why not trust the role inside the JWT? It was true when the token was issued, up to 15 min
 * ago. If an admin is demoted, their old token still says "admin". For permission checks we
 * want the truth NOW, and one indexed lookup by _id is cheap.
 */
export const loadCurrentUser: RequestHandler = async (req, _res, next) => {
  if (!req.user) throw new Error('loadCurrentUser must come after requireAuth'); // developer mistake → 500
  const user = await UserModel.findById(req.user.id);
  if (!user) throw new AppError(401, 'Account no longer exists', 'UNAUTHENTICATED'); // deleted while token still valid
  req.currentUser = user;
  next();
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.currentUser) throw new Error('requireRole must come after loadCurrentUser');
    if (!roles.includes(req.currentUser.role)) {
      throw new AppError(403, 'You do not have permission to do this', 'FORBIDDEN');
    }
    next();
  };

/** For features that need a confirmed email (e.g. anything that sends email to others, payments, admin). */
export const requireVerified: RequestHandler = (req, _res, next) => {
  if (!req.currentUser) throw new Error('requireVerified must come after loadCurrentUser');
  if (!req.currentUser.emailVerified) {
    throw new AppError(403, 'Please verify your email address first', 'EMAIL_NOT_VERIFIED');
  }
  next();
};
