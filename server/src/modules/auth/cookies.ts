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

export const OAUTH_COOKIE = 'oauth_google';

// Holds state, PKCE verifier and nonce between "redirect to Google" and "Google redirects back".
const oauthOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  // MUST be 'lax', not 'strict': the callback is a navigation coming FROM accounts.google.com,
  // i.e. cross-site. A Strict cookie would not be sent, and every login would fail.
  sameSite: 'lax',
  path: '/auth/google',
  maxAge: 10 * 60 * 1000, // the user has 10 minutes to finish on Google's page
};

export function setOAuthCookie(res: Response, value: string) {
  res.cookie(OAUTH_COOKIE, value, oauthOptions);
}

export function clearOAuthCookie(res: Response) {
  const { maxAge: _maxAge, ...options } = oauthOptions;
  res.clearCookie(OAUTH_COOKIE, options);
}
