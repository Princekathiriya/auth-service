import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { googleRouter } from './modules/auth/google.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { applyRateLimits } from './middleware/rateLimits.js';
import { serializeRequest } from './utils/redact.js';

export interface AppOptions {
  /** On everywhere except tests, where hundreds of logins from one IP would trip them. Rate-limit tests turn it back on. */
  rateLimits?: boolean;
}

// Build the app WITHOUT calling listen(), so tests can import it and send
// requests with supertest without opening a real port.
export function createApp({ rateLimits = env.NODE_ENV !== 'test' }: AppOptions = {}) {
  const app = express();

  app.disable('x-powered-by'); // don't advertise "Express" to attackers
  // Exactly ONE proxy (Render / Docker's nginx) sits in front of us. req.ip is then the real client
  // IP, which rate limiting relies on. Set it to `true` and anyone could fake their IP via X-Forwarded-For.
  app.set('trust proxy', 1);

  app.use(helmet()); // sensible security headers
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true })); // only our frontend, cookies allowed
  app.use(express.json({ limit: '10kb' })); // small body limit: auth payloads are tiny
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      // The Google callback URL contains the one-time ?code= and ?state=. Keep them out of logs.
      serializers: { req: serializeRequest },
    }),
  );

  if (rateLimits) applyRateLimits(app); // after the body parser: some limits key on req.body.email

  app.use('/health', healthRouter);
  app.use('/auth/google', googleRouter);
  app.use('/auth', authRouter);
  app.use('/admin', adminRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
