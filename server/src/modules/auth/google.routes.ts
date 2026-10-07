import { Router, type Request } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { safeEqual } from '../../utils/crypto.js';
import { OAUTH_COOKIE, clearOAuthCookie, setOAuthCookie, setRefreshCookie } from './cookies.js';
import { createGoogleAuthRequest, exchangeCodeForProfile, isGoogleConfigured } from './google.js';
import { findOrCreateGoogleUser } from './oauth.service.js';
import { clientMeta, createRefreshToken } from './session.service.js';

export const googleRouter = Router();

const savedRequestSchema = z.object({ state: z.string(), codeVerifier: z.string(), nonce: z.string() });

function readSavedRequest(req: Request) {
  const raw: unknown = req.cookies?.[OAUTH_COOKIE];
  if (typeof raw !== 'string') return null;
  try {
    return savedRequestSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

// The frontend's "Sign in with Google" button is a plain link to this URL (not fetch),
// because the browser must actually navigate to Google.
googleRouter.get('/', (_req, res) => {
  if (!isGoogleConfigured()) throw new AppError(503, 'Google login is not configured', 'OAUTH_NOT_CONFIGURED');
  const { url, state, codeVerifier, nonce } = createGoogleAuthRequest();
  setOAuthCookie(res, JSON.stringify({ state, codeVerifier, nonce }));
  res.redirect(url);
});

// Google sends the browser back here. Everything ends in a redirect to the frontend,
// because the user is looking at a full page, not waiting on a JSON fetch.
googleRouter.get('/callback', async (req, res) => {
  const saved = readSavedRequest(req);
  clearOAuthCookie(res); // single use, success or not
  const { code, state, error } = req.query;

  try {
    if (typeof error === 'string') throw new AppError(400, `Google returned "${error}"`, 'OAUTH_DENIED'); // e.g. user pressed Cancel
    if (!saved || typeof state !== 'string' || typeof code !== 'string' || !safeEqual(state, saved.state)) {
      throw new AppError(400, 'OAuth state mismatch', 'OAUTH_STATE_MISMATCH');
    }

    const profile = await exchangeCodeForProfile(code, saved.codeVerifier, saved.nonce);
    const user = await findOrCreateGoogleUser(profile);

    // Only the refresh cookie is set. Tokens NEVER go in the redirect URL: URLs end up in
    // browser history, server logs and Referer headers. The frontend's /auth/callback page
    // calls POST /auth/refresh to get an access token, exactly like on a page reload.
    const refresh = await createRefreshToken(user.id, clientMeta(req));
    setRefreshCookie(res, refresh.raw, refresh.expiresAt);
    res.redirect(`${env.CLIENT_ORIGIN}/auth/callback`);
  } catch (err) {
    req.log.warn({ err }, 'Google login failed');
    const reason = err instanceof AppError ? err.code : 'OAUTH_FAILED'; // never put raw error text in a URL
    res.redirect(`${env.CLIENT_ORIGIN}/login?error=${encodeURIComponent(reason)}`);
  }
});
