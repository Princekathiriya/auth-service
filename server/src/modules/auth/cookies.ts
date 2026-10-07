import type { CookieOptions, Response } from 'express';
import { env, isProd } from '../../config/env.js';

export const REFRESH_COOKIE = 'refresh_token';

const baseOptions: CookieOptions = {
  httpOnly: true, // JavaScript can't read it, so an XSS bug can't steal it
  secure: isProd || env.COOKIE_SAMESITE === 'none', // HTTPS only (browsers require this for SameSite=None)
  sameSite: env.COOKIE_SAMESITE, // browser won't attach it to requests started by other sites (CSRF defence)
  path: '/auth', // only sent to /auth/*, not to every API call
};

export function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions, expires: expiresAt });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, baseOptions); // options must match or the browser keeps the cookie
}
