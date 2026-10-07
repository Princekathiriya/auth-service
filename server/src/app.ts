import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

// Build the app WITHOUT calling listen(), so tests can import it and send
// requests with supertest without opening a real port.
export function createApp() {
  const app = express();

  app.disable('x-powered-by'); // don't advertise "Express" to attackers
  app.set('trust proxy', 1); // behind Render/Docker proxy: needed for correct req.ip (rate limiting later)

  app.use(helmet()); // sensible security headers
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true })); // only our frontend, cookies allowed
  app.use(express.json({ limit: '10kb' })); // small body limit: auth payloads are tiny
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.use('/health', healthRouter);
  app.use('/auth', authRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
