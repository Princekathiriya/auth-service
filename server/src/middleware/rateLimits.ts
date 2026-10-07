import type { Express, Request } from 'express';
import { rateLimit, ipKeyGenerator, type Options } from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

const MINUTE = 60_000;

function limiter(options: Partial<Options>) {
  return rateLimit({
    standardHeaders: 'draft-8', // RateLimit + RateLimit-Policy headers, and Retry-After when blocked
    legacyHeaders: false,
    // Go through our error handler so a 429 looks like every other API error.
    handler: (_req, _res, next) => next(new AppError(429, 'Too many requests. Please try again later.', 'RATE_LIMITED')),
    ...options,
  });
}

/**
 * Key by the email in the body, so an attacker can't dodge the limit by switching IPs.
 * Normalised exactly like our schemas (trim + lowercase), otherwise "ALICE@x.com" and
 * "alice@x.com" would be counted separately. The limit applies the same way whether or
 * not the account exists, so a 429 reveals nothing about which emails are registered.
 */
function byEmail(req: Request) {
  const email: unknown = req.body?.email;
  if (typeof email === 'string' && email.trim()) return `email:${email.trim().toLowerCase()}`;
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

/*
 * Storage: these counters live in this process's memory. That's fine for ONE server, but:
 *  - a restart resets them, and
 *  - with 3 servers behind a load balancer, an attacker gets 3x the attempts.
 * The fix is a shared store (Redis), which is exactly what Projects 4 and 9 introduce.
 *
 * Correctness depends on req.ip being the REAL client IP. That's why app.ts sets
 * `trust proxy` to the exact number of proxies in front of us. Trusting too many would
 * let attackers send a fake X-Forwarded-For header and get a fresh IP on every request.
 */
export function applyRateLimits(app: Express) {
  // Everything: generous, just stops floods. Health checks are exempt (monitors poll them).
  app.use(limiter({ windowMs: MINUTE, limit: 100, skip: (req) => req.path === '/health' }));

  // Login: two layers, only FAILED attempts count (skipSuccessfulRequests).
  //  - per IP:    one machine trying many accounts (credential stuffing)
  //  - per email: many machines (a botnet) guessing one account's password
  app.post(
    '/auth/login',
    limiter({ windowMs: 15 * MINUTE, limit: 20, skipSuccessfulRequests: true }),
    limiter({ windowMs: 15 * MINUTE, limit: 10, skipSuccessfulRequests: true, keyGenerator: byEmail }),
  );

  // Signups: argon2 is deliberately CPU-heavy, so mass signups are also a CPU attack.
  app.post('/auth/register', limiter({ windowMs: 60 * MINUTE, limit: 5 }));

  // Email bombing: without the per-email limit, anyone could flood a victim's inbox with reset emails.
  app.post(
    '/auth/forgot-password',
    limiter({ windowMs: 60 * MINUTE, limit: 10 }),
    limiter({ windowMs: 60 * MINUTE, limit: 3, keyGenerator: byEmail }),
  );
  app.post('/auth/resend-verification', limiter({ windowMs: 60 * MINUTE, limit: 3 }));

  // 256-bit tokens can't be brute-forced, but there's no reason to allow unlimited tries either.
  app.post(['/auth/verify-email', '/auth/reset-password'], limiter({ windowMs: 15 * MINUTE, limit: 20 }));
  app.post('/auth/refresh', limiter({ windowMs: 15 * MINUTE, limit: 60 }));
  app.get('/auth/google', limiter({ windowMs: 15 * MINUTE, limit: 20 }));
}
