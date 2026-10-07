import { Router, type Request, type Response } from 'express';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, verifyEmailSchema } from './auth.schemas.js';
import * as account from './account.service.js';
import * as authService from './auth.service.js';
import * as sessions from './session.service.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { checkOrigin } from '../../middleware/checkOrigin.js';
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from './cookies.js';
import { AppError } from '../../utils/AppError.js';

export const authRouter = Router();

// The refresh token goes ONLY into the httpOnly cookie, never into the JSON body,
// so frontend JavaScript (and any XSS) never sees it. The access token goes in the
// body; the frontend keeps it in memory (not localStorage) and sends it as a Bearer header.
function sendAuth(res: Response, status: number, result: Awaited<ReturnType<typeof authService.issueTokens>>) {
  setRefreshCookie(res, result.refreshToken.raw, result.refreshToken.expiresAt);
  res.status(status).json({ user: result.user, accessToken: result.accessToken });
}

const readRefreshCookie = (req: Request): string | undefined => {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

// .parse() throws a ZodError on bad input; the error handler turns it into a 400.
authRouter.post('/register', checkOrigin, async (req, res) => {
  sendAuth(res, 201, await authService.register(registerSchema.parse(req.body), sessions.clientMeta(req)));
});

authRouter.post('/login', checkOrigin, async (req, res) => {
  sendAuth(res, 200, await authService.login(loginSchema.parse(req.body), sessions.clientMeta(req)));
});

authRouter.post('/refresh', checkOrigin, async (req, res) => {
  const raw = readRefreshCookie(req);
  if (!raw) throw new AppError(401, 'Missing refresh token', 'INVALID_REFRESH_TOKEN');
  try {
    const { user, refreshToken } = await sessions.rotateRefreshToken(raw, sessions.clientMeta(req));
    sendAuth(res, 200, await authService.issueTokens(user, sessions.clientMeta(req), refreshToken));
  } catch (err) {
    clearRefreshCookie(res); // a dead cookie is useless; remove it so the client stops retrying
    throw err;
  }
});

// Logout is idempotent: it succeeds even if the cookie is missing or already revoked.
authRouter.post('/logout', checkOrigin, async (req, res) => {
  const raw = readRefreshCookie(req);
  if (raw) await sessions.revokeSessionByToken(raw);
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.post('/logout-all', checkOrigin, requireAuth, async (req, res) => {
  await sessions.revokeAllForUser(req.user!.id);
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.post('/verify-email', checkOrigin, async (req, res) => {
  const { token } = verifyEmailSchema.parse(req.body);
  res.json({ user: await account.verifyEmail(token) });
});

authRouter.post('/resend-verification', checkOrigin, requireAuth, async (req, res) => {
  await account.resendVerification(req.user!.id);
  res.status(204).end();
});

// Always the same answer, sent immediately. The real work happens in the background.
authRouter.post('/forgot-password', checkOrigin, async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  account.requestPasswordResetInBackground(email);
  res.status(202).json({ message: 'If an account exists for that email, a reset link has been sent.' });
});

authRouter.post('/reset-password', checkOrigin, async (req, res) => {
  await account.resetPassword(resetPasswordSchema.parse(req.body));
  clearRefreshCookie(res); // all sessions were revoked; this browser must log in again too
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await authService.getUserById(req.user!.id) });
});
